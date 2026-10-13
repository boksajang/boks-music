import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {lstat, readdir, unlink, rmdir} from 'node:fs/promises';
import {realpath as resolvePath} from 'node:fs';
import {promisify} from 'node:util';
import {assertTracksIdle,busyProjectIds} from './job-tracks.mjs';

const realpath=promisify(resolvePath);

const key = file => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);
const within = (root, file) => { const relative = path.relative(key(root), key(file)); return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); };
const same = (a,b) => key(a) === key(b);
const references = row => [row.audioPath,row.artPath].filter(value => typeof value === 'string' && value);
function select(data, ids, trashed) {
  if (!Array.isArray(ids) || !ids.length || ids.some(id=>typeof id!=='string') || new Set(ids).size!==ids.length) throw new Error('곡을 선택하세요.');
  return ids.map(id=>{
    const row=data.tracks.find(t=>t.id===id);
    if (!row || Boolean(row.trashedAt)!==trashed) throw new Error(trashed?'휴지통에 있는 곡만 선택하세요.':'보관 중인 곡만 선택하세요.');
    return row;
  });
}
function expand(data, selected) {
  return [...new Set([...selected,...data.tracks.filter(row=>row.kind==='stem' && row.trashedAt && selected.some(parent=>parent.kind!=='stem' && row.parentId===parent.id && parent.trashBatchId && parent.trashBatchId===row.trashBatchId))])];
}
async function persist(store, change) {
  const previous=structuredClone(store.data.tracks);
  const playlists=structuredClone(store.data.playlists||[]);
  const jobs=structuredClone(store.data.jobs||[]);
  try { change(); await store.save(); }
  catch(error) { store.data.tracks=previous;store.data.playlists=playlists;store.data.jobs=jobs; throw error; }
}
export async function moveToTrash(store, ids) {
  const selected=select(store.data,ids,false);
  if(selected.some(row=>row.kind==='stem')) throw new Error('Stem은 원곡과 함께 휴지통으로 이동하세요.');
  const rows=[...new Set([...selected,...store.data.tracks.filter(row=>row.kind==='stem' && !row.trashedAt && selected.some(parent=>parent.id===row.parentId))])];
  assertTracksIdle(store.data,rows,'휴지통으로 이동하세요');
  const trashedAt=new Date().toISOString(), trashBatchId=randomUUID();
  await persist(store,()=>{for(const row of rows) Object.assign(row,{trashedAt,trashBatchId});});
  return {movedIds:rows.map(row=>row.id)};
}
const visibleProject=(data,id)=>data.projects.some(item=>item.id===id&&!item.deletedAt);
// Tracks whose project still exists (renamed or not) return to it. Tracks of a deleted project
// need a target: they join it like a project move, keeping the deleted project as storage owner.
export async function restoreFromTrash(store, ids, targetProjectId) {
  const rows=expand(store.data,select(store.data,ids,true));
  const orphaned=rows.filter(row=>!visibleProject(store.data,row.projectId));
  if(orphaned.length&&!targetProjectId)throw new Error('원래 프로젝트가 삭제되었습니다. 복원할 프로젝트를 선택하세요.');
  if(orphaned.length&&!visibleProject(store.data,targetProjectId))throw new Error('복원할 프로젝트를 선택하세요.');
  await persist(store,()=>{
    for(const row of rows) {delete row.trashedAt;delete row.trashBatchId;}
    for(const row of orphaned) {row.storageProjectId=row.storageProjectId||row.projectId;row.projectId=targetProjectId;}
  });
  return {restoredIds:rows.map(row=>row.id),movedIds:orphaned.map(row=>row.id),...(orphaned.length?{projectId:targetProjectId}:{})};
}
// The project record stays (hidden by deletedAt): its folder still owns the files of the tracks
// moved to the trash, and restore and purge resolve file ownership through it.
export async function deleteProject(store, id) {
  const item=store.data.projects.find(row=>row.id===id&&!row.deletedAt);
  if(!item) throw new Error('프로젝트를 찾을 수 없습니다.');
  if(busyProjectIds(store.data).has(id)) throw new Error('이 프로젝트의 작업이 끝나거나 취소된 뒤 프로젝트를 삭제하세요.');
  const rows=store.data.tracks.filter(row=>row.projectId===id&&!row.trashedAt);
  assertTracksIdle(store.data,rows,'프로젝트를 삭제하세요');
  const trashedAt=new Date().toISOString(), trashBatchId=randomUUID();
  try { await persist(store,()=>{for(const row of rows) Object.assign(row,{trashedAt,trashBatchId});item.deletedAt=trashedAt;}); }
  catch(error) { delete item.deletedAt; throw error; }
  return {deletedProjectId:id,movedIds:rows.map(row=>row.id)};
}
async function inspect(file) {
  try {return await lstat(file);} catch(error) {if(error.code==='ENOENT')return null;throw error;}
}
// Check every existing ancestor, including the project directory itself. A lexical
// project prefix alone is insufficient when a junction redirects into other data.
async function checkPath(file) {
  if(!path.isAbsolute(file)) throw new Error('절대 파일 경로만 삭제할 수 있습니다.');
  const resolved=path.resolve(file), base=path.parse(resolved).root;
  let current=base;
  for(const part of resolved.slice(base.length).split(path.sep).filter(Boolean)) {
    current=path.join(current,part);
    const stat=await inspect(current);
    if(stat?.isSymbolicLink()) throw new Error('심볼릭 링크 또는 연결 폴더가 있는 경로는 삭제하지 않습니다.');
    if(stat && !same(current,resolved) && !stat.isDirectory()) throw new Error('파일 경로의 상위 폴더가 올바르지 않습니다.');
  }
  return inspect(resolved);
}
function ownedLocation(data,row,file) {
  const storageProjectId=row.storageProjectId||row.projectId;
  const project=data.projects.find(item=>item.id===storageProjectId);
  if(!project || !path.isAbsolute(project.directory||'') || !path.isAbsolute(file)) throw new Error('관리되는 프로젝트 파일 경로가 아닙니다.');
  const root=path.resolve(project.directory), resolved=path.resolve(file);
  if(!within(root,resolved)) throw new Error('프로젝트 밖의 파일은 삭제할 수 없습니다.');
  if(resolved.split(path.sep).some(part=>part.toLowerCase()==='engine-packages')) throw new Error('엔진 패키지 경로는 삭제할 수 없습니다.');
  if(data.settings?.modelPath && path.isAbsolute(data.settings.modelPath) && (same(data.settings.modelPath,resolved)||within(data.settings.modelPath,resolved))) throw new Error('모델 경로는 삭제할 수 없습니다.');
  const relative=path.relative(root,resolved).split(path.sep);
  if(relative[0]==='imports' && relative.length===2) return {file:resolved,root:null};
  if(relative[0]==='jobs' && relative.length>=3 && data.jobs.some(job=>job.id===relative[1] && (!job.request?.projectId || (job.request.storageProjectId||job.request.projectId)===storageProjectId))) return {file:resolved,root:path.join(root,'jobs',relative[1])};
  throw new Error('알려진 작업 폴더 또는 가져온 파일만 삭제할 수 있습니다.');
}
function checkProtected(data,file) {
  if(file.split(path.sep).some(part=>part.toLowerCase()==='engine-packages'))throw new Error('엔진 패키지 경로는 삭제할 수 없습니다.');
  const model=data.settings?.modelPath;
  if(model && path.isAbsolute(model) && (same(model,file)||within(model,file)||within(file,model)))throw new Error('모델 폴더와 겹치는 경로는 삭제할 수 없습니다.');
}
// Enumerate the entire tree before deleting any file, rejecting redirected paths.
// Delete explicit files and empty directories instead of following recursive rm.
async function treePlan(root, data) {
  const files=[],directories=[];
  async function visit(directory) {
    checkProtected(data,directory);
    const stat=await checkPath(directory);
    if(!stat)return;
    if(!stat.isDirectory())throw new Error('작업 폴더가 올바르지 않습니다.');
    for(const entry of await readdir(directory,{withFileTypes:true})) {
      const file=path.join(directory,entry.name);
      checkProtected(data,file);
      if(!within(root,file))throw new Error('작업 폴더 경계 오류');
      const item=await checkPath(file);
      if(!item)continue;
      if(item.isDirectory())await visit(file);
      else if(item.isFile())files.push(file);
      else throw new Error('일반 파일이 아닌 항목은 삭제하지 않습니다.');
    }
    directories.push(directory);
  }
  await visit(root);
  return {files,directories};
}
export async function purgeTrash(store, ids) {
  const data=store.data;
  const rows=expand(data,select(data,ids,true)), removing=new Set(rows.map(row=>row.id));
  assertTracksIdle(data,rows,'영구 삭제하세요');
  const survivors=data.tracks.filter(row=>!removing.has(row.id));
  const retained=survivors.flatMap(references);
  for(const file of [...retained]) {
    if(!path.isAbsolute(file))throw new Error('보존할 파일 경로를 확인할 수 없어 삭제를 중단했습니다.');
    try {retained.push(await realpath(file));}
    catch(error) {if(error.code!=='ENOENT')throw new Error('보존할 파일 참조를 확인할 수 없어 삭제를 중단했습니다.',{cause:error});}
  }
  const locations=rows.flatMap(row=>references(row).map(file=>ownedLocation(data,row,file)));
  const historical=[];
  for(const job of data.jobs) {
    const operation=job.type||job.request?.operation;
    if(!['generate','cover','stems','albumArt','youtubeImport','mastering','lyricsAlign'].includes(operation))continue;
    const resultIds=[job.result?.trackId,...(Array.isArray(job.result?.trackIds)?job.result.trackIds:[])];
    // A mastered track has its own storage owner. Its input track does not own
    // this new job directory (in particular after moving the input project).
    const associated=rows.filter(row=>resultIds.includes(row.id)||(operation!=='mastering'&&job.request?.trackId===row.id));
    if(!associated.length)continue;
    const projectId=job.request?.storageProjectId||job.request?.projectId;
    if(!projectId || associated.some(row=>(row.storageProjectId||row.projectId)!==projectId))throw new Error('이전 작업의 프로젝트 소유 관계를 확인할 수 없습니다.');
    const project=data.projects.find(item=>item.id===projectId);
    if(!project || !path.isAbsolute(project.directory||'') || typeof job.id!=='string' || !job.id || job.id==='.' || job.id==='..' || /[\\/]/.test(job.id))throw new Error('이전 작업 폴더 경로가 올바르지 않습니다.');
    const candidate=path.join(project.directory,'jobs',job.id,'ownership-check');
    historical.push(ownedLocation(data,associated[0],candidate).root);
  }
  const jobRoots=[...new Set([...locations.map(item=>item.root),...historical].filter(Boolean))];
  const clearRoots=jobRoots.filter(root=>!retained.some(file=>same(root,file)||within(root,file)));
  const files=new Map(), directories=new Map();
  // Preflight all selected paths even if a shared reference will preserve them.
  for(const location of locations) {
    const stat=await checkPath(location.file);
    if(stat && !stat.isFile()) throw new Error('곡 파일 경로가 일반 파일이 아닙니다.');
    if(!clearRoots.some(root=>within(root,location.file)) && !retained.some(file=>same(file,location.file))) files.set(key(location.file),location.file);
  }
  for(const root of clearRoots) {
    const plan=await treePlan(root,data);
    for(const file of plan.files) files.set(key(file),file);
    for(const directory of plan.directories) directories.set(key(directory),directory);
  }
  try {
    for(const file of files.values()) {
      const stat=await checkPath(file);
      if(stat && !stat.isFile())throw new Error('삭제 직전 파일 경로가 변경되었습니다.');
      if(stat)await unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});
    }
    for(const directory of [...directories.values()].sort((a,b)=>b.length-a.length)) {
      const stat=await checkPath(directory);
      if(stat && !stat.isDirectory())throw new Error('삭제 직전 폴더 경로가 변경되었습니다.');
      if(stat)await rmdir(directory).catch(error=>{if(error.code!=='ENOENT')throw error;});
    }
    // Finished job records that only produced or used the deleted songs go with them (video jobs stay with their videos).
    const orphanJob=job=>{if(['queued','running'].includes(job.status)||(job.type||job.request?.operation)==='video')return false;const ids=[job.result?.trackId,...(Array.isArray(job.result?.trackIds)?job.result.trackIds:[]),job.request?.trackId].filter(Boolean);return ids.length>0&&ids.every(id=>removing.has(id));};
    await persist(store,()=>{data.jobs=(data.jobs||[]).filter(job=>!orphanJob(job));data.tracks=data.tracks.filter(row=>!removing.has(row.id));for(const playlist of data.playlists||[]){const filtered=playlist.trackIds.filter(id=>!removing.has(id));if(filtered.length!==playlist.trackIds.length){playlist.trackIds=filtered;playlist.updatedAt=new Date().toISOString();}}});
  } catch(cause) {
    throw new Error('영구 삭제가 완료되지 않았습니다. 휴지통 항목은 보존되었습니다. 원인을 해결한 후 다시 시도하세요.',{cause});
  }
  return {deletedIds:rows.map(row=>row.id)};
}

/**
 * Removes a file a song no longer uses (its replaced album art) when it is a managed project file and
 * no song refers to it. Call after the song points at its new file.
 */
export async function releaseFile(store,row,file) {
  const data=store.data;
  if(typeof file!=='string'||!file||data.tracks.some(other=>references(other).some(reference=>same(reference,file))))return false;
  let location;try{location=ownedLocation(data,row,file);}catch{return false;}
  const stat=await checkPath(location.file);if(!stat||!stat.isFile())return false;
  await unlink(location.file).catch(error=>{if(error.code!=='ENOENT')throw error;});
  return true;
}

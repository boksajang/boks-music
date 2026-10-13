import path from 'node:path';
import {lstat} from 'node:fs/promises';
import {assertTracksIdle} from './job-tracks.mjs';

async function checkStorage(data,row) {
  if(typeof row.audioPath!=='string'||!row.audioPath)throw new Error('곡 파일 경로가 없습니다.');
  const ownerId=row.storageProjectId||row.projectId;
  const owner=data.projects.find(project=>project.id===ownerId);
  if(!owner||!path.isAbsolute(owner.directory||''))throw new Error('곡의 기존 저장 프로젝트를 찾을 수 없습니다.');
  for(const file of [row.audioPath,row.artPath].filter(Boolean)){
    if(typeof file!=='string'||!path.isAbsolute(file))throw new Error('곡 파일의 저장 경로가 올바르지 않습니다.');
    const relative=path.relative(owner.directory,file),parts=relative.split(path.sep);
    if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('곡 파일이 기존 저장 프로젝트 밖에 있습니다.');
    const imported=parts[0]==='imports'&&parts.length===2;
    const knownJob=parts[0]==='jobs'&&parts.length>=3&&data.jobs.some(job=>job.id===parts[1]&&(!job.request?.projectId||(job.request.storageProjectId||job.request.projectId)===ownerId));
    if(!imported&&!knownJob)throw new Error('관리되는 가져오기 또는 작업 파일만 이동할 수 있습니다.');
    const resolved=path.resolve(file),root=path.parse(resolved).root;
    let current=root;
    for(const part of resolved.slice(root.length).split(path.sep).filter(Boolean)){
      current=path.join(current,part);
      let stat;try{stat=await lstat(current);}catch(error){if(error.code==='ENOENT')continue;throw error;}
      if(stat.isSymbolicLink())throw new Error('연결 폴더 또는 심볼릭 링크가 있는 곡은 이동할 수 없습니다.');
      if(current===resolved?!stat.isFile():!stat.isDirectory())throw new Error('곡 파일의 저장 경로가 올바르지 않습니다.');
    }
  }
}

// Logical project membership changes; original files and job history do not move.
// The persistent storage owner keeps playback, later processing and purge safe.
export async function moveTracks(store,ids,targetProjectId){
  const data=store.data;
  if(typeof targetProjectId!=='string'||!data.projects.some(project=>project.id===targetProjectId&&!project.deletedAt))throw new Error('이동할 프로젝트를 선택하세요.');
  if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw new Error('이동할 곡을 선택하세요.');
  const selected=ids.map(id=>data.tracks.find(row=>row.id===id));
  if(selected.some(row=>!row||row.trashedAt||row.kind==='stem'))throw new Error('휴지통에 없는 원곡 또는 Cover를 선택하세요. Stem은 원곡과 함께 이동합니다.');
  assertTracksIdle(data,selected,'곡을 이동하세요');
  const selectedIds=new Set(ids);
  const rows=[...new Set([...selected,...data.tracks.filter(row=>row.kind==='stem'&&selectedIds.has(row.parentId))])].filter(row=>row.projectId!==targetProjectId);
  for(const row of rows)await checkStorage(data,row);
  if(!rows.length)return {movedIds:[],targetProjectId};
  const previous=structuredClone(data.tracks);
  try{
    for(const row of rows){row.storageProjectId=row.storageProjectId||row.projectId;row.projectId=targetProjectId;}
    await store.save();
  }catch(error){data.tracks=previous;throw error;}
  return {movedIds:rows.map(row=>row.id),targetProjectId};
}

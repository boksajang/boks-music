import { mkdir, readFile, writeFile, rename, copyFile, statfs } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import {defaultEngineSelection} from './engine-registry.mjs';
import {runtimeDefaults,migrateRuntimeSettings} from './runtime-state.mjs';
import {claudeModels,claudeEfforts,agentProviders} from './claude.mjs';

export function initialState(root) {
  return { version: 1, projects: [], tracks: [], playlists: [], videos: [], customPresets: [], jobs: [], settings: {
    defaultCount: 1, autoAlbumArt: false, textModel: '', imageModel: '', textReasoning: 'medium', imageReasoning: 'medium', imageEngine: 'agent', localImageModel: '', videoBrand: 'BOKS MUSIC', videoDirectory: '', videoOptions: {}, videoPresets: [],
    agentProvider: '', agentChoiceConfirmed: false, claudeModel: '', claudeReasoning: 'medium',
    projectPath: path.join(root,'projects'), modelPath: path.join(root,'models'),
    engineSelection:{...defaultEngineSelection}, musicBackend: 'yue2-cpp', nativeBackend: 'cuda', nativeExecutable: '', backbonePath: '', vaePath: '', transcriberPath: '',
    ffmpegPath: '', stemPython: '', stemDevice: 'cuda', ...runtimeDefaults()
  } };
}
export class Store {
  constructor(root) { this.root = root; this.file = path.join(root,'library.json'); this.pending = Promise.resolve(); }
  async init() {
    await mkdir(this.root,{recursive:true});
    const load = async file => {
      const data=JSON.parse(await readFile(file,'utf8'));
      if(data?.version!==1||!['projects','tracks','customPresets','jobs'].every(key=>Array.isArray(data[key]))||!data.settings||typeof data.settings!=='object'||Array.isArray(data.settings)) throw new Error('지원하지 않는 프로젝트 데이터 형식입니다.');
      for(const items of [data.projects,data.tracks,data.customPresets,data.jobs])if(items.some(item=>!item||typeof item!=='object'||typeof item.id!=='string'))throw new Error('프로젝트 항목 데이터가 손상되었습니다.');
      if(data.playlists===undefined)data.playlists=[];
      if(data.videos===undefined)data.videos=[];
      if(!Array.isArray(data.videos)||data.videos.some(row=>!row||typeof row.id!=='string'||!row.id||typeof row.videoPath!=='string'||!path.isAbsolute(row.videoPath)||typeof row.playlistId!=='string')||new Set(data.videos.map(row=>row.id)).size!==data.videos.length)throw new Error('영상 데이터가 손상되었습니다.');
      if(!Array.isArray(data.playlists)||data.playlists.some(row=>!row||typeof row.id!=='string'||!row.id||typeof row.name!=='string'||!row.name.trim()||row.name.length>100||!Array.isArray(row.trackIds)||row.trackIds.some(id=>typeof id!=='string'||!id)||typeof row.createdAt!=='string'||typeof row.updatedAt!=='string')||new Set(data.playlists.map(row=>row.id)).size!==data.playlists.length)throw new Error('재생목록 데이터가 손상되었습니다.');
      for(const row of data.playlists)row.trackIds=[...new Set(row.trackIds)];
      // The voice feature, its runtime and its recordings were removed (2026-10-12): drop its records and
      // every saved setting that still names it or points into the deleted voice runtime.
      delete data.voices;delete data.retainedAssets;
      const voiceRuntime=/[\\/]runtimes[\\/]voice-cuda[\\/]|seed-vc/i;
      const cleanSettings=settings=>{if(!settings||typeof settings!=='object')return;for(const key of Object.keys(settings))if(/voice/i.test(key)||(typeof settings[key]==='string'&&voiceRuntime.test(settings[key])))delete settings[key];if(settings.engineSelection)delete settings.engineSelection.voice;};
      cleanSettings(data.settings);
      for(const row of data.tracks){if(row.kind==='voice'){row.kind='song';delete row.parentId;}delete row.voiceId;delete row.voiceName;cleanSettings(row.settings);}
      for(const row of data.projects)if(row.draft)delete row.draft.voiceId;
      for(const job of data.jobs){cleanSettings(job.request?.settings);cleanSettings(job.result);}
      for(const job of data.jobs){if(job.request){delete job.request.voiceId;delete job.request.voicePath;cleanSettings(job.request.settings);}}
      data.settings=migrateRuntimeSettings(data.settings,initialState(this.root).settings);
      for(const key of ['textReasoning','imageReasoning'])if(!['medium','high','xhigh'].includes(data.settings[key]))data.settings[key]='medium';
      if(!agentProviders.includes(data.settings.agentProvider))data.settings.agentProvider='';
      if(typeof data.settings.agentChoiceConfirmed!=='boolean')data.settings.agentChoiceConfirmed=false;
      if(!['agent','local'].includes(data.settings.imageEngine))data.settings.imageEngine='agent';
      if(typeof data.settings.localImageModel!=='string')data.settings.localImageModel='';
      if(typeof data.settings.videoBrand!=='string'||data.settings.videoBrand.length>40)data.settings.videoBrand='BOKS MUSIC';
      if(typeof data.settings.videoDirectory!=='string')data.settings.videoDirectory='';
      if(!data.settings.videoOptions||typeof data.settings.videoOptions!=='object'||Array.isArray(data.settings.videoOptions))data.settings.videoOptions={};
      if(!Array.isArray(data.settings.videoPresets)||data.settings.videoPresets.some(item=>!item||typeof item.name!=='string'||!item.options||typeof item.options!=='object'))data.settings.videoPresets=[];
      if(!claudeModels.some(model=>model.id===data.settings.claudeModel))data.settings.claudeModel='';
      if(!claudeEfforts.includes(data.settings.claudeReasoning))data.settings.claudeReasoning='medium';
      if(data.claudeUsage!==undefined&&(!data.claudeUsage||typeof data.claudeUsage!=='object'||data.claudeUsage.state!=='ready'))delete data.claudeUsage;
      for(const key of ['pythonPath','engineRoot','sheetSagePython','sheetSageRoot','device','experimentalLowVram'])delete data.settings[key];
      data.settings.musicBackend=process.platform==='darwin'?'audio-cpp':'yue2-cpp';
      return data;
    };
    try { this.data = await load(this.file); }
    catch(e) {
      try { this.data = await load(this.file+'.bak'); this.recovered = true; }
      catch(backupError) {
        if(e.code==='ENOENT'&&backupError.code==='ENOENT')this.data=initialState(this.root);
        else throw new Error('프로젝트 데이터가 손상되었습니다. library.json과 백업 파일을 보존하고 복구가 필요합니다.',{cause:e});
      }
    }
    for(const job of this.data.jobs) if(['queued','running'].includes(job.status)) Object.assign(job,{status:'interrupted',stage:'앱 종료로 중단됨',error:'앱이 종료되어 중단되었습니다. 다시 실행하세요.',finishedAt:new Date().toISOString()});
    // Their work folders are removed by the app once it knows the project folders are idle.
    this.prunedJobs=pruneJobs(this.data);
    await this.save(); return this;
  }
  save() {
    // Compact: the library is rewritten on every change.
    const json = JSON.stringify(this.data);
    const op = this.pending.then(async()=>{
      const temp=this.file+'.tmp';
      await writeFile(temp,json,'utf8');
      if(!this.recovered) await copyFile(this.file,this.file+'.bak').catch(e=>{if(e.code!=='ENOENT')throw e;});
      await rename(temp,this.file); this.recovered=false;
    });
    this.pending=op.catch(()=>{}); return op;
  }
  async mutate(fn) { const result=fn(this.data); await this.save(); return result; }
}
/**
 * Job records are history once finished. A non-video job finished more than 30 days ago goes unless a
 * song still uses it: songs inside a job folder are owned through that job's record (moving and deleting
 * them check it), and results that name songs stay. Video jobs stay (the video studio finds each
 * playlist's latest attempt among them). Finished jobs drop their copy of the settings, which only jobs
 * that can run again (waiting, interrupted, failed) need. Returns the removed jobs.
 */
export function pruneJobs(data,now=Date.now()){
  const old=job=>Date.parse(job.finishedAt||job.createdAt)<now-30*24*3600*1000;
  const usedFolders=new Set(),songs=new Set(data.tracks.map(row=>row.id));
  for(const row of data.tracks)for(const file of [row.audioPath,row.artPath])if(typeof file==='string'){const parts=path.resolve(file).split(path.sep);const at=parts.lastIndexOf('jobs');if(at>=0&&parts[at+1])usedFolders.add(parts[at+1]);}
  const inUse=job=>usedFolders.has(job.id)||[job.result?.trackId,...(Array.isArray(job.result?.trackIds)?job.result.trackIds:[])].some(id=>songs.has(id));
  const removed=data.jobs.filter(job=>job.type!=='video'&&['completed','cancelled','resumed','failed'].includes(job.status)&&old(job)&&!inUse(job));
  const gone=new Set(removed);data.jobs=data.jobs.filter(job=>!gone.has(job));
  for(const job of data.jobs)if(['completed','cancelled','resumed'].includes(job.status)&&job.request?.settings)delete job.request.settings;
  return removed;
}
export function requiredString(value,label,max=20000) {
  if(typeof value!=='string'||!value.trim()||value.length>max) throw new Error(`${label}을(를) 확인하세요.`);
  return value.trim();
}
export function findById(items,id,label) { const item=items.find(x=>x.id===id); if(!item) throw new Error(`${label}을(를) 찾을 수 없습니다.`); return item; }
export async function ensureSpace(directory,bytes) {
  await mkdir(directory,{recursive:true});
  const s=await statfs(directory);
  if(s.bavail*s.bsize < bytes + 64*1024*1024) throw new Error('저장 공간이 부족합니다. 디스크 공간을 확보하세요.');
}
export function inside(root,file) { const relative=path.relative(path.resolve(root),path.resolve(file)); return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative); }
export const id = () => randomUUID();

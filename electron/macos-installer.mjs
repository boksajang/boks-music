import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline';
import {mkdir,writeFile,chmod,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {macosCatalog,macModelChoices} from './macos-model-catalog.mjs';
import {downloadVerified} from './download.mjs';
import {ensureSpace} from './store.mjs';
import {inspectAudioCpp} from './audio-cpp-engine.mjs';
const exec=promisify(execFile);

export function validateArchiveEntries(list){
  const entries=list.split(/\r?\n/).filter(Boolean);
  if(!entries.length||entries.some(item=>item.startsWith('/')||item.includes('\\')||item.split('/').includes('..')))throw new Error('배포 압축 파일의 경로가 올바르지 않습니다.');
  return entries;
}
async function extract(asset,archive,destination,context){
  await downloadVerified(asset,archive,context);
  const {stdout}=await exec('/usr/bin/tar',['-tzf',archive],{signal:context.signal,maxBuffer:4*1024*1024});
  validateArchiveEntries(stdout);
  await mkdir(destination,{recursive:true});
  await exec('/usr/bin/tar',['-xzf',archive,'-C',destination],{signal:context.signal,maxBuffer:4*1024*1024});
}
function setup(script,args,{signal,onProgress,log}){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new Error('설치가 취소되었습니다.'));
    const child=spawn(process.execPath,[script,...args],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},detached:true,stdio:['ignore','pipe','pipe']});
    let result,failure='';const abort=()=>{if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch{child.kill();}};
    signal?.addEventListener('abort',abort,{once:true});
    const lines=createInterface({input:child.stdout});
    lines.on('line',line=>{try{const event=JSON.parse(line);if(event.type==='result')result=event;if(event.type==='progress')onProgress(event);if(event.type==='error')failure=event.message;}catch{log(line);}});
    child.stderr.on('data',data=>log(data.toString()));
    child.on('error',error=>{signal?.removeEventListener('abort',abort);lines.close();reject(error);});
    child.on('close',code=>{signal?.removeEventListener('abort',abort);lines.close();if(signal?.aborted)reject(new Error('설치가 취소되었습니다.'));else if(code||failure||!result)reject(new Error(failure||'macOS 필수 구성 설치에 실패했습니다. 상세 로그를 확인하세요.'));else resolve(result);});
  });
}
export async function installMacRuntime({option,settings,engineDirectory,signal,onProgress=()=>{},log=()=>{}}){
  if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('이 설치 구성은 Apple Silicon 네이티브 arm64용입니다.');
  if(!option?.supported)throw new Error(option?.reason||'지원되지 않는 Mac 구성입니다.');
  const choice=macModelChoices.find(item=>item.id===option.id);if(!choice)throw new Error('등록되지 않은 Mac 모델입니다.');
  const root=path.join(settings.modelPath,'runtimes','darwin-arm64'),bundle=path.join(root,choice.id),downloads=path.join(settings.modelPath,'downloads');
  await ensureSpace(bundle,option.requiredDiskGB*2**30);await mkdir(bundle,{recursive:true});
  const receipt=path.join(bundle,'install-state.json');
  const record=value=>writeFile(receipt,JSON.stringify({id:choice.id,platform:'darwin',arch:'arm64',...value},null,2));
  const context={signal,onProgress,log};await record({status:'installing',startedAt:new Date().toISOString()});
  try{
    const runtime=path.join(root,'audio-cpp-'+macosCatalog.runtime.version);
    await extract(macosCatalog.runtime,path.join(downloads,macosCatalog.runtime.sha256+'.tar.gz'),runtime,context);
    const executable=path.join(runtime,macosCatalog.runtime.executable);
    await chmod(executable,0o755);
    const modelRoot=path.join(settings.modelPath,'gguf','audio-cpp',choice.id);await mkdir(modelRoot,{recursive:true});
    const selected=macosCatalog.models.filter(item=>item.filename===choice.backbone||item.filename==='yue2-vae-f32.gguf'||item.role==='transcriber');
    const resolved={};
    for(const asset of [...selected,...macosCatalog.sidecars]){
      const cache=path.join(downloads,asset.sha256+'-'+asset.filename);await downloadVerified(asset,cache,context);
      const target=path.join(modelRoot,asset.filename);await mkdir(path.dirname(target),{recursive:true});await copyFile(cache,target,constants.COPYFILE_FICLONE);resolved[asset.filename]=target;
    }
    const deps=await setup(path.join(engineDirectory,'setup-macos.mjs'),['--runtime-root',root,'--model-root',settings.modelPath,'--download-models'],context);
    const installed={...deps.settings,musicBackend:'audio-cpp',nativeBackend:'metal',nativeExecutable:executable,audioCppModelRoot:modelRoot,backbonePath:resolved[choice.backbone],vaePath:resolved['yue2-vae-f32.gguf'],transcriberPath:resolved[macosCatalog.models.find(item=>item.role==='transcriber').filename],runtimePlatform:'darwin',runtimeArch:'arm64',engineSelection:{music:'audio-cpp-yue2',cover:'audio-cpp-sheetsage2',stems:'bs-roformer'}};
    const state=await inspectAudioCpp(installed);if(!state.music.available||!state.cover.available)throw new Error('macOS Native 구성 파일 검증에 실패했습니다.');
    if(signal?.aborted)throw new Error('설치가 취소되었습니다.');
    await record({status:'installed',installedAt:new Date().toISOString(),result:installed});return installed;
  }catch(error){await record({status:signal?.aborted?'cancelled':'failed',error:error.message});throw error;}
}

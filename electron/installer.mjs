import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {ensureSpace} from './store.mjs';
import {nativeCatalog,modelChoices} from './model-catalog.mjs';
import {downloadVerified} from './download.mjs';
import {inspectNative} from './native-engine.mjs';
import {installMacRuntime} from './macos-installer.mjs';
import {macModelChoices} from './macos-model-catalog.mjs';
import {receiptMatchesHost,withoutVoiceRuntime} from './runtime-state.mjs';

function powershell(args,{signal,onProgress,log},expectResult=false){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new Error('설치가 취소되었습니다.'));
    const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass',...args],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let result,failure,details='';
    const abort=()=>{if(child.pid){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());}};
    signal?.addEventListener('abort',abort,{once:true});
    const lines=createInterface({input:child.stdout});
    lines.on('line',line=>{try{const event=JSON.parse(line.replace(/^\uFEFF/,''));if(event.type==='progress')onProgress(event);if(event.type==='result')result=event;if(event.type==='error')failure=event.message;}catch{log(line);}});
    child.stderr.on('data',d=>{details=(details+d).slice(-3000);log(String(d));});
    child.on('error',e=>{signal?.removeEventListener('abort',abort);reject(e);});
    child.on('close',code=>{signal?.removeEventListener('abort',abort);lines.close();if(signal?.aborted)reject(new Error('설치가 취소되었습니다. 검증된 다운로드는 재사용됩니다.'));else if(code||failure||(expectResult&&!result))reject(new Error(failure||'필수 구성 설치에 실패했습니다. 상세 로그에서 원인을 확인하세요.',{cause:new Error(details)}));else resolve(result);});
  });
}
export async function installRuntime({option,settings,engineDirectory,signal,onProgress=()=>{},log=()=>{}}){
  if(!option?.supported)throw new Error(option?.reason||'알 수 없는 모델 구성입니다.');
  if(process.platform==='darwin')return installMacRuntime({option,settings,engineDirectory,signal,onProgress,log});
  if(process.platform!=='win32'||process.arch!=='x64')throw new Error('현재 OS/아키텍처용 설치 구성이 없습니다.');
  const choice=modelChoices.find(m=>m.id===option.id);if(!choice)throw new Error('등록되지 않은 모델입니다.');
  const root=path.join(settings.modelPath,'runtimes'),bundle=path.join(root,choice.id),native=path.join(root,'yue2-cpp-3.4.0'),downloads=path.join(settings.modelPath,'downloads');
  await ensureSpace(bundle,option.requiredDiskGB*2**30);await mkdir(bundle,{recursive:true});
  const receipt=path.join(bundle,'install-state.json'),context={signal,onProgress,log};
  const record=data=>writeFile(receipt,JSON.stringify({id:choice.id,platform:'win32',arch:'x64',...data},null,2));
  await record({status:'installing',startedAt:new Date().toISOString()});
  try{
    for(const [kind,asset] of [['runtime',nativeCatalog.runtime],['cuda',nativeCatalog.cuda]]){
      const archive=path.join(downloads,`${kind}-${asset.sha256.slice(0,16)}.zip`);
      await downloadVerified(asset,archive,{signal,onProgress:event=>onProgress({...event,stage:`${kind==='runtime'?'Windows Native 런타임':'CUDA 라이브러리'} ${event.downloadedBytes!==undefined?'다운로드':event.progress===100?'다운로드·검증 완료':'무결성 확인 중'}`})});
      onProgress({stage:'검증된 Windows 실행 구성 압축 해제 중'});
      await powershell(['-File',path.join(engineDirectory,'extract-native.ps1'),'-Archive',archive,'-Destination',native,'-Kind',kind],context);
    }
    const installed={runtimePlatform:'win32',runtimeArch:'x64',musicBackend:'yue2-cpp',nativeBackend:'cuda',nativeExecutable:path.join(native,nativeCatalog.runtime.executable),engineSelection:{music:'yue2-cpp',cover:'yue2-cpp-transcriber',stems:'bs-roformer'}};
    for(const [key,filename] of [['backbonePath',choice.backbone],['vaePath','YuE2-Vae-F32.gguf'],['transcriberPath','SheetSage2-Q8_0.gguf']]){
      const asset=nativeCatalog.models.find(m=>m.filename===filename);if(!asset)throw new Error('모델 배포 정보가 없습니다.');
      const target=path.join(settings.modelPath,'gguf',filename);
      await downloadVerified(asset,target,{signal,onProgress});installed[key]=target;
    }
    for(const profile of ['stems-cuda']){
      const runtimeRoot=path.join(root,profile),manifest=path.join(runtimeRoot,'install-state.json');await mkdir(runtimeRoot,{recursive:true});
      let prior;try{
        prior=JSON.parse(await readFile(manifest,'utf8'));
        if(prior.status!=='installed'||prior.result?.profile!==profile)prior=null;
        else {
          const previous=prior.result;
          const files=[previous.stemPython,previous.ffmpegPath];
          if(!previous.modelDownloaded)throw new Error('Stem model installation receipt missing');
          files.push(path.join(settings.modelPath,'stems',previous.stemModel),path.join(settings.modelPath,'stems','BS-Rofo-SW-Fixed.ckpt'),path.join(settings.modelPath,'stems','BS-Rofo-SW-Fixed.yaml'));
          for(const file of files)await access(file);
        }
      }catch{prior=null;}
      onProgress({stage:'필수 Stem 구성 설치·검사 중'});
      const result=prior?.result||await powershell(['-File',path.join(engineDirectory,'setup-runtime.ps1'),'-RuntimeRoot',runtimeRoot,'-ModelRoot',settings.modelPath,'-Profile',profile,'-DownloadModels'],context,true);
      if(signal?.aborted)throw new Error('설치가 취소되었습니다.');
      await writeFile(manifest,JSON.stringify({status:'installed',result},null,2));Object.assign(installed,result.settings);
    }
    const state=await inspectNative(installed);if(!state.music.available||!state.cover.available)throw new Error('Native 런타임 파일 검증에 실패했습니다. 모델 구성을 다시 설치하세요.');
    if(signal?.aborted)throw new Error('설치가 취소되었습니다.');
    await record({status:'installed',installedAt:new Date().toISOString(),result:installed});return installed;
  }catch(e){await record({status:signal?.aborted?'cancelled':'failed',error:e.message});throw e;}
}
export async function readInstalls(modelPath,platform=process.platform,arch=process.arch){
  const result={},choices=platform==='darwin'?macModelChoices:modelChoices;
  if(!['win32','darwin'].includes(platform))return result;
  for(const choice of choices)try{
    const base=platform==='darwin'?path.join(modelPath,'runtimes',`${platform}-${arch}`):path.join(modelPath,'runtimes');
    const receipt=JSON.parse(await readFile(path.join(base,choice.id,'install-state.json'),'utf8'));
    if(receipt.status==='installed'?!receiptMatchesHost(receipt,platform,arch):receipt.platform&& (receipt.platform!==platform||receipt.arch!==arch))continue;
    if(receipt.result)receipt.result=withoutVoiceRuntime(receipt.result,platform);
    result[choice.id]=receipt;
  }catch{}return result;
}

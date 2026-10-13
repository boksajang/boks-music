import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { writeFile, stat, access, realpath, mkdir } from 'node:fs/promises';
import { inside } from './store.mjs';
import path from 'node:path';
import {hostProfile} from './host-profile.mjs';
import {executableMatchesHost} from './runtime-state.mjs';
import {inspectAudioCpp,runAudioCpp} from './audio-cpp-engine.mjs';
import {enginesForPlatform,selectedEngine,defaultEngineSelection} from './engine-registry.mjs';
import {inspectNative,runNative} from './native-engine.mjs';
const exec=promisify(execFile);
export {inspectHostSystem as inspectSystem} from './host-profile.mjs';
async function pythonEnvironment(settings){
  const root=settings.modelPath,cache=path.join(root,'cache');
  const locations={HF_HOME:path.join(root,'huggingface'),HF_HUB_CACHE:path.join(root,'huggingface','hub'),TORCH_HOME:path.join(root,'torch'),XDG_CACHE_HOME:cache,NUMBA_CACHE_DIR:path.join(cache,'numba'),MPLCONFIGDIR:path.join(cache,'matplotlib'),CUDA_CACHE_PATH:path.join(cache,'cuda'),TORCH_EXTENSIONS_DIR:path.join(cache,'torch-extensions'),TEMP:path.join(root,'temp'),TMP:path.join(root,'temp')};
  await Promise.all(Object.values(locations).map(folder=>mkdir(folder,{recursive:true})));
  return {...process.env,...locations,...(process.platform==='darwin'?{TMPDIR:locations.TEMP}:{}),PYTHONIOENCODING:'utf-8'};
}
// The Stem runtime check imports torch and initialises CUDA in a fresh Python. Right after the PC
// starts this can take far longer than when warm, so it gets a generous limit; a result is reused while
// the runtime's Python executable is unchanged, and concurrent checks share one process.
const PROBE_TIMEOUT_MS=180000,probes=new Map();
async function probeStemRuntime(settings,runner){
  let stamp;try{stamp=(await stat(settings.stemPython)).mtimeMs;}catch{return {missing:true};}
  const key=[settings.stemPython,stamp,runner,settings.modelPath].join('|');
  if(!probes.has(key))probes.set(key,(async()=>{
    try{const {stdout}=await exec(settings.stemPython,[runner,'--probe'],{windowsHide:true,timeout:PROBE_TIMEOUT_MS,env:await pythonEnvironment(settings)});return {result:JSON.parse(stdout.trim().split('\n').at(-1))};}
    catch(error){probes.delete(key);return {error:error.killed||error.signal?'실행 환경 확인 시간이 초과되었습니다':'실행 환경 확인에 실패했습니다'};}
  })());
  return probes.get(key);
}
/** 시스템 재검사: checks the runtimes again instead of reusing earlier results. */
export function clearEngineProbes(){probes.clear();}
export async function engineStates(settings,runner) {
  const profile=hostProfile();
  const native=process.platform==='darwin'?await inspectAudioCpp(settings):await inspectNative(settings);
  const checked=profile.supported&&executableMatchesHost(settings.stemPython)?await probeStemRuntime(settings,runner):{missing:true},probe=checked.result||{};
  const exists=async file=>{try{if(!file)return false;await access(file);return true;}catch{return false;}};
  const device=settings.stemDevice||profile.stemDevice;
  const deviceReady=device==='cuda'?!!probe.cuda:device==='mps'?!!probe.mps:device==='cpu'&&!!probe.modules?.torch;
  const stems=profile.supported&&!!probe.audio_separator&&deviceReady&&await exists(path.join(settings.modelPath,'stems',settings.stemModel||'model_bs_roformer_ep_317_sdr_12.9755.ckpt'));
  const missing=process.platform==='darwin'?'macOS용 모델과 Metal/MPS 실행 구성을 설치하세요.':'YuE2 모델 통합 설치가 필요합니다.';
  return [
    {id:'music',name:process.platform==='darwin'?'YuE2 / audio.cpp':'YuE2 / yue2.cpp',...native.music,capabilities:native.capabilities},
    {id:'cover',name:process.platform==='darwin'?'SheetSage2 / audio.cpp':'SheetSage2 / yue2.cpp',...native.cover},
    // A check that failed or timed out is not a missing installation: it asks for a rescan, not a reinstall.
    checked.error?{id:'stems',name:'BS-RoFormer',available:false,status:'check-failed',message:`${checked.error}. 시스템 재검사로 다시 확인하세요.`}
    :{id:'stems',name:'BS-RoFormer',available:stems,message:stems?`${device.toUpperCase()} 런타임과 모델 확인됨 · 청취 검증 별도`:missing}
  ].map(e=>({...e,engineId:defaultEngineSelection[e.id],status:e.status||(e.available?'ready':'not-installed')}));
}
export function installedEngineChoices(states){
  return enginesForPlatform().map(entry=>{const state=states.find(e=>e.engineId===entry.id);return {...entry,available:!!state?.available,reason:state?.message||'설치가 필요합니다.'};});
}
export async function runEngine(request,{runner,signal,onProgress,log}) {
  const adapter=selectedEngine(request.settings,request.operation);
  if(adapter.adapter==='native')return runNative(request,{signal,onProgress,log});
  if(adapter.adapter==='audio-cpp')return runAudioCpp(request,{signal,onProgress,log});
  if(request.operation!=='stems')throw new Error('지원하지 않는 엔진 작업입니다.');
  const python=request.settings.stemPython;
  if(!hostProfile().supported||!executableMatchesHost(python)) throw new Error('현재 OS용 YuE2 모델 통합 설치를 먼저 실행하세요.');
  const env=await pythonEnvironment(request.settings);
  const requestPath=path.join(request.outputDir,'request.json'); await writeFile(requestPath,JSON.stringify(request,null,2),'utf8');
  return new Promise((resolve,reject)=>{
    if(signal.aborted)return reject(new Error('작업이 취소되었습니다.'));
    const child=spawn(python,[runner,'--request',requestPath],{shell:false,windowsHide:true,detached:process.platform!=='win32',env,stdio:['ignore','pipe','pipe']});
    let result,failure,stderr='';
    const abort=()=>{if(child.pid){if(process.platform==='win32'){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,shell:false,stdio:'ignore'});killer.on('error',()=>child.kill());}else {try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}}};
    signal.addEventListener('abort',abort,{once:true});
    const lines=createInterface({input:child.stdout});
    lines.on('line',line=>{try{const event=JSON.parse(line);if(event.type==='progress')onProgress(event);if(event.type==='result')result=event;if(event.type==='error')failure=event.message;}catch{log(line);}});
    child.stderr.on('data',data=>{stderr=(stderr+data).slice(-20000);log(String(data));});
    child.on('error',error=>{signal.removeEventListener('abort',abort);reject(new Error('엔진을 실행하지 못했습니다. 모델 통합 설치 상태를 확인하세요.',{cause:error}));});
    child.on('close',async code=>{
      signal.removeEventListener('abort',abort);lines.close();
      if(signal.aborted)return reject(new Error('작업이 취소되었습니다.'));
      if(code!==0||!result||failure)return reject(new Error(failure||'엔진 작업에 실패했습니다. 상세 로그를 확인하세요.',{cause:new Error(stderr)}));
      try {
        const files=result.stems;
        if(!Array.isArray(files)||files.length<(request.singleStem?1:2)||files.some(file=>typeof file!=='string'||!path.isAbsolute(file)))throw new Error('엔진 결과 파일 목록이 올바르지 않습니다.');
        const outputRoot=await realpath(request.outputDir);
        for(const file of files){if(!inside(outputRoot,await realpath(file)))throw new Error('엔진이 작업 폴더 밖의 결과를 반환했습니다.');const s=await stat(file);if(!s.isFile()||s.size<44)throw new Error('오디오 결과 파일이 없거나 손상되었습니다.');}
        resolve(result);
      }catch(e){reject(e);}
    });
  });
}

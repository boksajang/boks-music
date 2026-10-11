// Local album art engine: installs stable-diffusion.cpp (prebuilt) and model files under the
// project's engine-packages folder, and renders one square PNG from a prompt. Files are pinned in
// image-catalog.mjs; downloads are size/SHA-256 verified and re-verified (cached) before each run.
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,readdir,stat,mkdir,rm,rename,chmod,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {downloadVerified} from './download.mjs';
import {verifyFile,verifiedModelsFile} from './verified-files.mjs';
import {validateArchiveEntries} from './macos-installer.mjs';
import {validatePng} from './codex.mjs';
import {IMAGE_ENGINE_RELEASE,imageEngineBuild,imageVariants,findImageVariant,localImageChoices} from './image-catalog.mjs';
const exec=promisify(execFile);

export const imagePaths=root=>({runtime:path.join(root,'runtimes','image-sdcpp'),receipt:path.join(root,'runtimes','image-sdcpp','install-state.json'),models:path.join(root,'models','image'),downloads:path.join(root,'downloads','image-sdcpp')});
const modelFile=(root,file)=>path.join(imagePaths(root).models,file.folder,file.filename);
async function exists(file){try{return (await stat(file)).isFile();}catch{return false;}}
async function readReceipt(root){try{const data=JSON.parse(await readFile(imagePaths(root).receipt,'utf8'));return data&&typeof data==='object'?data:null;}catch{return null;}}
async function writeReceipt(root,data){const file=imagePaths(root).receipt,temp=`${file}.${randomUUID()}.partial`;await mkdir(path.dirname(file),{recursive:true});await writeFile(temp,JSON.stringify(data,null,2));await rename(temp,file);}

/** Installed engine and variants (files present with the pinned sizes; hashes are checked at use). */
export async function inspectImageInstallation(root,system){
  const receipt=await readReceipt(root),build=imageEngineBuild(system);
  const engineInstalled=!!(receipt?.engine&&receipt.engine.release===IMAGE_ENGINE_RELEASE&&receipt.engine.build===build.id&&receipt.engine.executable&&await exists(receipt.engine.executable));
  const presentFiles=[],installed=[];
  const seen=new Map();
  for(const variant of imageVariants()){
   let complete=true;
   for(const file of variant.files){const key=`${file.folder}/${file.filename}`;if(!seen.has(key)){let ok=false;try{ok=(await stat(modelFile(root,file))).size===file.bytes;}catch{}seen.set(key,ok);if(ok)presentFiles.push(key);}if(!seen.get(key))complete=false;}
   if(complete&&engineInstalled&&receipt.variants?.includes(variant.id))installed.push(variant.id);
  }
  return {engineInstalled,installed,presentFiles,receipt};
}
export async function localImageState(root,system){
  const state=await inspectImageInstallation(root,system);
  return {...localImageChoices(system,state),engineInstalled:state.engineInstalled,installed:state.installed,presentFiles:state.presentFiles};
}

const tarPath=()=>process.platform==='win32'?path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'):'/usr/bin/tar';
async function extractZip(archive,destination,signal){
  const {stdout}=await exec(tarPath(),['-tf',archive],{signal,maxBuffer:8*1024*1024,windowsHide:true});
  validateArchiveEntries(stdout);
  await mkdir(destination,{recursive:true});
  await exec(tarPath(),['-xf',archive,'-C',destination],{signal,maxBuffer:8*1024*1024,windowsHide:true});
}
async function findExecutable(directory){
  const names=process.platform==='win32'?['sd-cli.exe','sd.exe']:['sd-cli','sd'];
  const queue=[directory];
  while(queue.length){const current=queue.shift();for(const entry of await readdir(current,{withFileTypes:true})){const full=path.join(current,entry.name);if(entry.isDirectory())queue.push(full);else if(names.includes(entry.name))return full;}}
  return null;
}
/** Installs the engine for this host (once) and one variant's files, with overall byte progress. */
export async function installImageVariant({root,system,variantId,signal,onProgress=()=>{},log=()=>{}}){
  const state=await localImageState(root,system),row=state.families.flatMap(family=>family.variants).find(item=>item.id===variantId),variant=findImageVariant(variantId);
  if(!row||!variant)throw new Error('설치할 이미지 모델을 목록에서 선택하세요.');
  if(row.status==='unavailable')throw new Error(row.reason||'이 PC에는 설치할 수 없는 모델입니다.');
  const build=imageEngineBuild(system),paths=imagePaths(root),receipt=await readReceipt(root)||{};
  const engineAssets=state.engineInstalled?[]:build.assets,files=variant.files.filter(file=>!state.presentFiles.includes(`${file.folder}/${file.filename}`));
  const total=[...engineAssets,...files].reduce((sum,item)=>sum+item.bytes,0)||1;let done=0;
  // Overall progress across files; a file's completion event carries no byte count.
  const step=(label,bytes)=>event=>onProgress({stage:`${label} · ${event.stage||''}`,progress:Math.min(99,(done+(event.downloadedBytes??(event.progress===100?bytes:0)))/total*100)});
  let engine=receipt.engine;
  if(engineAssets.length){
   const target=path.join(paths.runtime,IMAGE_ENGINE_RELEASE,build.id);
   await rm(target,{recursive:true,force:true});
   for(const item of engineAssets){
    const archive=path.join(paths.downloads,item.filename);
    await downloadVerified(item,archive,{signal,onProgress:step('이미지 엔진',item.bytes)});done+=item.bytes;
    onProgress({stage:`이미지 엔진 압축 해제 중 · ${item.filename}`,progress:done/total*100});
    await extractZip(archive,target,signal);await rm(archive,{force:true});
   }
   const executable=await findExecutable(target);
   if(!executable)throw new Error('이미지 엔진 실행 파일을 찾지 못했습니다. 설치를 다시 시도하세요.');
   if(process.platform!=='win32')await chmod(executable,0o755);
   // The engine must start on this PC (runtime libraries, driver) before it counts as installed; it is
   // recorded right away so a failed model download does not fetch the engine again.
   onProgress({stage:'이미지 엔진 실행 확인 중',progress:done/total*100});
   await probeEngine(executable,signal);
   engine={release:IMAGE_ENGINE_RELEASE,build:build.id,executable,installedAt:new Date().toISOString()};
   await writeReceipt(root,{...receipt,engine,variants:receipt.variants||[]});
   log(`이미지 엔진 설치: ${build.label} ${IMAGE_ENGINE_RELEASE} → ${executable}`);
  }
  for(const file of files){await downloadVerified(file,modelFile(root,file),{signal,onProgress:step(variant.familyName+' '+variant.quant,file.bytes)});done+=file.bytes;}
  const current=await readReceipt(root)||{};
  await writeReceipt(root,{...current,engine,variants:[...new Set([...(current.variants||[]),variant.id])]});
  onProgress({stage:'이미지 모델 설치 완료',progress:100});
  return {variantId:variant.id,engine:engine.build};
}
// sd-cli prints its usage and exits with 255 for --help: the usage text with the options this app
// passes proves the binary and its libraries load.
async function probeEngine(executable,signal){
  let output='';
  try{const {stdout,stderr}=await exec(executable,['--help'],{cwd:path.dirname(executable),signal,timeout:60000,windowsHide:true,maxBuffer:4*1024*1024});output=stdout+stderr;}
  catch(error){if(signal?.aborted)throw error;output=String(error.stdout||'')+String(error.stderr||'');}
  if(!/Usage:/.test(output)||!['--diffusion-model','--llm','--offload-to-cpu','--diffusion-fa'].every(flag=>output.includes(flag)))throw new Error('이미지 엔진을 실행하지 못했습니다. 그래픽 드라이버와 설치 상태를 확인하세요.');
}

const abortChild=child=>{if(!child.pid)return;if(process.platform==='win32'){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,shell:false,stdio:'ignore'});killer.on('error',()=>child.kill());}else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}};
/** Renders one PNG with an installed variant. Returns {output, seconds, peakNote}. */
export async function generateLocalImage({root,system,variantId,prompt,output,size=1024,seed,signal,onProgress=()=>{},log=()=>{}}){
  const variant=findImageVariant(variantId),state=await inspectImageInstallation(root,system);
  if(!variant||!state.installed.includes(variantId))throw new Error('선택한 로컬 이미지 모델이 설치되어 있지 않습니다. 환경설정에서 모델을 설치하세요.');
  if(typeof prompt!=='string'||!prompt.trim())throw new Error('이미지 설명문이 비어 있습니다.');
  onProgress({stage:'이미지 모델 무결성 확인 중'});
  for(const file of variant.files)if(!await verifyFile(modelFile(root,file),file,{cacheFile:verifiedModelsFile(root),signal})){
   // A corrupt file is removed so the model shows as not installed and can be installed again.
   await rm(modelFile(root,file),{force:true});
   throw new Error(`이미지 모델 파일이 손상되어 지웠습니다(${file.filename}). 환경설정의 앨범아트 이미지에서 모델을 다시 설치하세요.`);
  }
  // sd-cli reads paths in the Windows ANSI code page: a Korean user or project folder crashes it
  // (0xC0000409, measured). It runs inside the models folder with ASCII relative paths, and the
  // result is moved to `output` here.
  const models=imagePaths(root).models,scratch=path.join(models,'.render'),name=`${randomUUID()}.png`;
  const relative=file=>`${file.folder}/${file.filename}`,[diffusion,vae,llm]=variant.files.map(relative);
  const args=['--diffusion-model',diffusion,'--vae',vae,'--llm',llm,'-p',prompt.trim(),'--cfg-scale',String(variant.cfgScale),'--steps',String(variant.steps),'-W',String(size),'-H',String(size),'--offload-to-cpu','--diffusion-fa','-s',String(Number.isInteger(seed)?seed:Math.floor(Math.random()*2147483647)),'-o',`.render/${name}`];
  await mkdir(path.dirname(output),{recursive:true});await mkdir(scratch,{recursive:true});
  const family=variant.family,executable=state.receipt.engine.executable,started=Date.now(),cpu=state.receipt.engine.build==='win-cpu';
  // A hung run must not block the GPU lane: no output for this long ends it (CPU steps are slow).
  const quietLimit=cpu?30*60000:5*60000;
  log(`로컬 이미지 생성: ${variant.familyName} ${variant.quant} (${family}) ${size}x${size}`);
  await new Promise((resolve,reject)=>{
   if(signal?.aborted)return reject(new Error('작업이 취소되었습니다.'));
   const child=spawn(executable,args,{cwd:models,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe'],env:{...process.env,PATH:`${path.dirname(executable)}${path.delimiter}${process.env.PATH||''}`}});
   let tail='',last=0,hung=false,quiet;const abort=()=>abortChild(child);signal?.addEventListener('abort',abort,{once:true});
   const watch=()=>{clearTimeout(quiet);quiet=setTimeout(()=>{hung=true;abortChild(child);},quietLimit);};watch();
   const read=data=>{watch();const text=String(data);tail=(tail+text).slice(-6000);
    for(const part of text.split(/[\r\n]+/)){const m=/(\d+)\/(\d+)\s*-\s*[\d.]+\s*(?:s\/it|it\/s)/.exec(part);if(m&&Date.now()-last>300){const [current,count]=[Number(m[1]),Number(m[2])];onProgress({stage:`이미지 그리는 중 ${current}/${count}`,progress:Math.min(95,current/count*90+5)});last=Date.now();}
     else if(/loading|load/i.test(part)&&Date.now()-last>1000){onProgress({stage:'이미지 모델 불러오는 중'});last=Date.now();}}};
   child.stdout.on('data',read);child.stderr.on('data',read);
   child.on('error',error=>{clearTimeout(quiet);signal?.removeEventListener('abort',abort);reject(error);});
   child.on('close',code=>{clearTimeout(quiet);signal?.removeEventListener('abort',abort);if(signal?.aborted)return reject(new Error('작업이 취소되었습니다.'));if(hung)return reject(new Error(`로컬 이미지 엔진이 ${quietLimit/60000}분 동안 응답하지 않아 중단했습니다. 그래픽 드라이버를 확인하거나 더 작은 모델을 사용하세요.`));if(code===0)return resolve();log(tail);reject(new Error(`로컬 이미지 생성에 실패했습니다(종료 코드 ${code}). ${tail.split(/\r?\n/).filter(line=>/error|fail|out of memory/i.test(line)).slice(-2).join(' ')}`.trim()));});
  });
  const rendered=path.join(scratch,name);
  try{await validatePng(rendered);try{await rename(rendered,output);}catch(error){if(error.code!=='EXDEV')throw error;await copyFile(rendered,output);}}
  finally{await rm(rendered,{force:true}).catch(()=>{});}
  return {output,seconds:Math.round((Date.now()-started)/100)/10};
}

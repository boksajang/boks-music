import {ensureInstrumentalLora} from './instrumental-lora.mjs';
import {newInstrumentalRequest} from './instrumental-request.mjs';
import {assertYue2Input} from './yue2-input.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {verifyFile,verifiedModelsFile} from './verified-files.mjs';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {inspectNative, inspectNativeWav, instrumentalScore} from './native-engine.mjs';

const developmentCatalog=fileURLToPath(new URL('../engines/macos-catalog.json',import.meta.url));
const catalogUrl=existsSync(developmentCatalog)?developmentCatalog:path.join(process.resourcesPath,'engines','macos-catalog.json');
const aborted=signal=>{if(signal?.aborted)throw Object.assign(new Error('작업이 취소되었습니다.'),{name:'AbortError'});};
const inside=(root,file)=>{const relative=path.relative(root,file);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);};
export function audioCppGenerateArgs(settings,request,{output,artifacts,abc,planOnly=false,instrumentalAdapter}) {
  const instrumental=newInstrumentalRequest(request,{lora:!!instrumentalAdapter});
  const root=settings.audioCppModelRoot;
  if(!root||!path.isAbsolute(root))throw new Error('audio.cpp 모델 폴더가 올바르지 않습니다.');
  for(const file of [settings.backbonePath,settings.vaePath])if(!file||!inside(root,file))throw new Error('audio.cpp 구성 모델은 모델 폴더 안에 있어야 합니다.');
  const backend=settings.nativeBackend||'metal';
  if(!['metal','cpu'].includes(backend))throw new Error('Mac audio.cpp 장치는 Metal 또는 CPU입니다.');
  const args=['--family','yue2','--task','gen','--model',root,'--backend',backend,
    '--session-option','yue2.model_gguf='+path.relative(root,settings.backbonePath),
    '--session-option','yue2.vae_gguf='+path.relative(root,settings.vaePath),
    '--lyrics',instrumental?.lyrics??request.lyrics??'', '--request-option','style='+(instrumental?.style??request.style??''),
    '--request-option','cot='+(instrumental?.cot??(abc?'melody':'full')),'--seed',String(request.seed),
    '--out-dir',artifacts,'--out-format','pcm24','--log'];
  if(instrumentalAdapter)args.push('--session-option','yue2.ar_lora='+path.join(instrumentalAdapter.directory,instrumentalAdapter.name),'--session-option','yue2.ar_lora_scale=1.0');
  if(abc)args.push('--request-option','abc_file='+abc);
  if(planOnly)args.push('--request-option','stop_after=abc');
  else args.push('--out',output);
  return args;
}
export async function inspectAudioCpp(settings,{platform=process.platform,arch=process.arch}={}) {
  if(platform!=='darwin')return {music:{available:false,message:'audio.cpp Mac 프로필은 macOS에서만 실행됩니다.'},cover:{available:false,message:'macOS 런타임이 필요합니다.'}};
  const state=await inspectNative(settings,{platform,arch});
  try{
    const catalog=JSON.parse(await fs.readFile(catalogUrl,'utf8'));
    if(!settings.audioCppModelRoot||!path.isAbsolute(settings.audioCppModelRoot))throw new Error('모델 폴더 없음');
    for(const item of catalog.sidecars||[]){if(!(await fs.stat(path.join(settings.audioCppModelRoot,item.filename))).isFile())throw new Error('sidecar 없음');}
    audioCppGenerateArgs(settings,{seed:1},{output:'unused',artifacts:'unused'});
  }catch{state.music={available:false,message:'Mac audio.cpp 모델 폴더와 필수 sidecar 파일을 확인하세요.'};state.cover.available=false;}
  return state;
}
async function verify(file,identity,{signal,cacheFile}){
  if(!identity?.sha256||!Number.isFinite(identity.bytes))throw new Error('고정된 audio.cpp 파일 식별자가 없습니다.');
  if(!await verifyFile(file,identity,{signal,cacheFile}))throw new Error('audio.cpp 모델 크기 또는 SHA-256이 일치하지 않습니다: '+identity.filename);
}
export async function runAudioCppCommand(executable,args,{signal,log=()=>{},cwd,cache}){
  aborted(signal);
  await new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{cwd,env:{...process.env,TMPDIR:cache,XDG_CACHE_HOME:cache},shell:false,detached:true,stdio:['ignore','pipe','pipe']});
    const stop=()=>{if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}};
    signal?.addEventListener('abort',stop,{once:true});
    if(signal?.aborted)stop();
    let tail='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{tail=(tail+chunk).slice(-3000);log(chunk.toString());});
    child.once('error',error=>{signal?.removeEventListener('abort',stop);reject(error);});
    child.once('close',code=>{signal?.removeEventListener('abort',stop);if(signal?.aborted)reject(Object.assign(new Error('작업이 취소되었습니다.'),{name:'AbortError'}));else if(code!==0)reject(new Error('audio.cpp 실행 실패: '+tail));else resolve();});
  });
}
const command=runAudioCppCommand;
export async function readAudioCppOutput(file,root){
  const outputRoot=await fs.realpath(root),resolved=await fs.realpath(file),stat=await fs.lstat(file);
  if(!inside(outputRoot,resolved)||!stat.isFile()||stat.isSymbolicLink())throw new Error('audio.cpp 결과가 작업 폴더 밖을 참조합니다.');
  return fs.readFile(file);
}
export async function runAudioCpp(request,{signal,onProgress=()=>{},log=()=>{}}={}){
  assertYue2Input(request.style,request.lyrics,!!request.instrumental);
  const s=request.settings,status=await inspectAudioCpp(s);
  if(!status.music.available)throw new Error(status.music.message);
  if(!['generate','cover'].includes(request.operation))throw new Error('지원하지 않는 audio.cpp 작업입니다.');
  if(request.operation==='cover'&&!status.cover.available)throw new Error(status.cover.message);
  const catalog=JSON.parse(await fs.readFile(catalogUrl,'utf8'));
  const identities=[];
  const entries=[...[s.backbonePath,s.vaePath,...(request.operation==='cover'?[s.transcriberPath]:[])].map(file=>({file,identity:catalog.models.find(x=>x.filename===path.basename(file))})),...(catalog.sidecars||[]).map(identity=>({file:path.join(s.audioCppModelRoot,identity.filename),identity}))];
  onProgress({stage:'Mac 모델 무결성 확인 중'});
  for(const {file,identity} of entries){await verify(file,identity,{signal,cacheFile:verifiedModelsFile(s.modelPath)});identities.push(identity);}
  const instrumentalAdapter=request.instrumental===true&&request.operation==='generate'?await ensureInstrumentalLora({modelPath:s.modelPath,signal,onProgress}):null;
  if(instrumentalAdapter)identities.push(instrumentalAdapter.identity);
  const output=path.resolve(request.outputDir),cache=path.join(s.modelPath,'cache','audio-cpp');
  await fs.mkdir(output,{recursive:true});await fs.mkdir(cache,{recursive:true});
  const context={signal,log,cwd:path.dirname(s.nativeExecutable),cache};
  let abc;
  if(request.operation==='cover'){
    if(!s.ffmpegPath||/\\|\.exe$/i.test(s.ffmpegPath)||!path.isAbsolute(s.ffmpegPath))throw new Error('Mac FFmpeg 실행파일이 필요합니다.');
    const wav=path.join(output,'source.wav');abc=path.join(output,'source-score.abc');
    onProgress({stage:'원곡 멜로디 분석 중'});
    await command(s.ffmpegPath,['-nostdin','-n','-i',request.audioPath,'-c:a','pcm_s16le',wav],context);
    await command(s.nativeExecutable,['--family','sheetsage2','--task','midi','--model',s.transcriberPath,'--backend',s.nativeBackend||'metal','--audio',wav,'--text-out',abc,'--out-dir',path.join(output,'transcription'),'--log'],context);
    if(!(await readAudioCppOutput(abc,output)).toString('utf8').trim())throw new Error('SheetSage2가 빈 악보를 반환했습니다.');
  }
  if(request.instrumental&&request.operation==='cover'){
    const transfer=instrumentalScore((await readAudioCppOutput(abc,output)).toString('utf8'));abc=path.join(output,'instrumental.abc');
    await fs.writeFile(abc,transfer.abc);await fs.writeFile(path.join(output,'instrumental-transfer.json'),JSON.stringify(transfer.report));
  }
  const audioPath=path.join(output,'audio.wav');onProgress({stage:'Metal / CPU 음악 생성 중'});
  await fs.mkdir(path.join(output,'artifacts'),{recursive:true});
  await command(s.nativeExecutable,audioCppGenerateArgs(s,{...request,...(request.instrumental&&request.operation==='cover'?{lyrics:'',style:'Instrumental, '+request.style+', no vocals'}:{})},{output:audioPath,artifacts:path.join(output,'artifacts'),abc,instrumentalAdapter}),context);
  aborted(signal);const audioInfo=inspectNativeWav(await readAudioCppOutput(audioPath,output));
  const metadata={engine:'audio.cpp',sourceCommit:catalog.runtime?.sourceCommit,version:catalog.version||catalog.runtime?.version,models:identities,seed:request.seed,instrumental:!!request.instrumental,...(request.instrumental&&request.operation==='generate'?{instrumentalMode:instrumentalAdapter?'lora-full':'direct',targetDurationSeconds:request.instrumentalDuration||180}:{}),audioInfo,macInferenceValidated:true,listeningValidated:false};
  await fs.writeFile(path.join(output,'native-result.json'),JSON.stringify(metadata,null,2));
  return {audioPath,metadata};
}

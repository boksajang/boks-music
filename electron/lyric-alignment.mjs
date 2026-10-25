import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {access,readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {normalizeLyrics,finalizeAutomaticTiming,sameTimingSource,ONSET_POLICY} from './lyric-timing.mjs';

function processJson(executable,args,{input,signal,onProgress=()=>{},log=()=>{},env={}}={}){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new Error('작업이 취소되었습니다.'));
    const child=spawn(executable,args,{windowsHide:true,shell:false,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',...env}});
    let result,failure,stderr='';
    const abort=()=>{if(!child.pid)return;if(process.platform==='win32'){const kill=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});kill.on('error',()=>child.kill());}else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}};
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    const lines=createInterface({input:child.stdout});lines.on('line',line=>{try{const row=JSON.parse(line.replace(/^\uFEFF/,''));if(row.type==='progress')onProgress(row);else if(row.type==='result')result=row;else if(row.type==='error')failure=row.message;else log(line);}catch{log(line);}});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-5000);log(String(chunk));});child.stdin.on('error',()=>{});child.stdin.end(input?JSON.stringify(input):undefined);
    child.on('error',error=>{signal?.removeEventListener('abort',abort);reject(error);});
    child.on('close',code=>{signal?.removeEventListener('abort',abort);lines.close();if(signal?.aborted)reject(new Error('작업이 취소되었습니다.'));else if(code||failure||!result)reject(new Error(failure||'가사 시간 분석에 실패했습니다. '+stderr.slice(-1000)));else resolve(result);});
  });
}
// The only place that names lyric engines. `stage` decides the worker role: the aligner places
// the known lyrics (lyrics-first estimate) and the recognizer's words (independent ASR estimate);
// the worker keeps a start automatic only when the two agree (engines/lyric_onset_alignment.py).
// `kind` selects the worker adapter; `role` is the Korean UI description.
// Revisions must match engines/setup-lyrics-models.py, which installs these folders.
export const LYRIC_ENGINES=Object.freeze([
  {id:'qwen',kind:'qwen3-forced-aligner',stage:'aligner',name:'Qwen ForcedAligner',role:'가사 시작점 정렬',version:'c07281df297b9905d24a508279258cccf987a064'},
  {id:'asr-1.7b',kind:'qwen3-asr',stage:'recognizer',name:'Qwen3-ASR 1.7B',role:'가사 인식 교차 확인',version:'bcd2b5b7f32b480ab5790554cfa8347f246a14f3'}
]);
const lyricModels=LYRIC_ENGINES;
// Languages whose full chain (lyrics-first alignment and recognition) was validated on real songs.
// The models accept more languages, but a language is added here only after a real-song audit.
// `engineNames` are the language names each engine API expects.
export const LYRIC_LANGUAGES=Object.freeze([
  {code:'ko',name:'Korean',label:'한국어',script:/\p{Script=Hangul}/u,engineNames:{asr:'Korean',aligner:'Korean'}},
  // Lyrics with no Hangul and Latin letters (2026-10-25: English is supported by default; mixed lyrics stay Korean).
  {code:'en',name:'English',label:'영어',script:/\p{Script=Latin}/u,engineNames:{asr:'English',aligner:'English'}}
]);
// Whole-file decode memory and runtime grow linearly; every model call works on bounded
// windows (<=32 s recognition chunks, line-local alignment). Real-song audit covered 392 s;
// 10 minutes covers ordinary songs. Raise only after auditing longer audio.
export const LYRIC_ALIGNMENT_LIMITS=Object.freeze({maxDurationSeconds:600});
export function detectLyricLanguage(lines){
  const text=lines.map(line=>line.text).join('\n');
  return LYRIC_LANGUAGES.find(language=>language.script.test(text))||null;
}
// Shared gate for the worker call and the app's pre-check (no separation work for unsupported songs).
export function lyricAlignmentSupport({lines,duration}){
  const minutes=LYRIC_ALIGNMENT_LIMITS.maxDurationSeconds/60;
  if(Number.isFinite(duration)&&duration>LYRIC_ALIGNMENT_LIMITS.maxDurationSeconds)return {supported:false,language:null,reason:`${minutes}분을 넘는 곡은 현재 자동 동기화 범위를 벗어납니다.`};
  const language=detectLyricLanguage(lines);
  if(!language)return {supported:false,language:null,reason:`현재 자동 동기화는 ${LYRIC_LANGUAGES.map(row=>row.label).join('·')} 가사를 지원합니다. 다른 언어는 시작점을 직접 맞출 수 있습니다.`};
  return {supported:true,language,reason:''};
}
function engineRequest(){
  const pick=stage=>LYRIC_ENGINES.filter(engine=>engine.stage===stage).map(engine=>({folder:engine.id,kind:engine.kind}));
  return {aligner:pick('aligner')[0],asr:pick('recognizer')[0]};
}
async function verifyModelFiles(modelRoot,names=lyricModels.map(model=>model.id)){
  for(const name of names){
    const folder=path.join(modelRoot,name),manifest=JSON.parse(await readFile(path.join(folder,'boks-model-manifest.json'),'utf8'));
    if(!Array.isArray(manifest.files)||!manifest.files.some(file=>file.filename.endsWith('.safetensors')))throw new Error('가사 분석 모델 파일이 없습니다.');
    if(manifest.revision!==lyricModels.find(model=>model.id===name)?.version)throw new Error('가사 분석 모델 버전이 다릅니다.');
    for(const file of manifest.files){
      const target=path.resolve(folder,file.filename),relative=path.relative(folder,target);
      if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('가사 분석 모델 경로가 올바르지 않습니다.');
      const info=await stat(target);if(!info.isFile()||(file.bytes&&info.size!==file.bytes))throw new Error('가사 분석 모델 파일이 불완전합니다.');
    }
  }
}
export async function inspectLyricRuntime({packageRoot,platform=process.platform}){
  const modelRoot=path.join(packageRoot,'models','lyrics-alignment'),python=path.join(packageRoot,'runtimes','lyrics-alignment',platform==='win32'?'venv/Scripts/python.exe':'venv/bin/python');
  let runtimeReady=false;try{runtimeReady=['win32','darwin'].includes(platform)&&(await stat(python)).isFile();}catch{}
  const models=await Promise.all(lyricModels.map(async model=>{try{await verifyModelFiles(modelRoot,[model.id]);return {...model,installed:true,message:'설치됨'};}catch(error){return {...model,installed:false,message:error.code==='ENOENT'?'설치 필요':error.message};}}));
  return {ready:runtimeReady&&models.every(model=>model.installed),runtimeReady,models};
}
export async function ensureLyricRuntime({packageRoot,engineDirectory},context={}){
  const runtimeRoot=path.join(packageRoot,'runtimes','lyrics-alignment'),modelRoot=path.join(packageRoot,'models','lyrics-alignment');
  const pythonPath=path.join(runtimeRoot,process.platform==='win32'?'venv/Scripts/python.exe':'venv/bin/python');
  const receipt=path.join(runtimeRoot,'ready.json');
  try{const info=JSON.parse(await readFile(receipt,'utf8'));if(info.platform===process.platform&&info.pythonPath===pythonPath){await access(pythonPath);await verifyModelFiles(modelRoot);return {pythonPath,modelRoot};}}catch{}
  context.onProgress?.({stage:'가사 분석 모델과 실행 환경 준비 중'});
  let result;
  if(process.platform==='win32')result=await processJson('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(engineDirectory,'setup-lyrics.ps1'),'-RuntimeRoot',runtimeRoot,'-ModelRoot',modelRoot],context);
  else if(process.platform==='darwin')result=await processJson(process.execPath,[path.join(engineDirectory,'setup-lyrics-macos.mjs'),'--runtime-root',runtimeRoot,'--model-root',modelRoot],{...context,env:{ELECTRON_RUN_AS_NODE:'1'}});
  else throw new Error('가사 분석은 Windows와 macOS에서 지원합니다.');
  if(path.resolve(result.pythonPath)!==path.resolve(pythonPath))throw new Error('가사 분석 런타임 경로가 올바르지 않습니다.');
  await access(pythonPath);await verifyModelFiles(modelRoot);await mkdir(runtimeRoot,{recursive:true});await writeFile(receipt,JSON.stringify({platform:process.platform,pythonPath,modelRoot}));return {pythonPath,modelRoot};
}
export async function alignTrackLyrics({audioPath,lyrics,duration,outputDir,packageRoot,engineDirectory,previousTiming},context={}){
  const {lines,lyricsHash}=normalizeLyrics(lyrics);
  if(!lines.length)throw new Error('대괄호 태그를 제외한 가사를 먼저 입력하세요.');
  if(!Number.isFinite(duration)||duration<=0)throw new Error('음악의 재생시간을 확인할 수 없습니다.');
  const support=lyricAlignmentSupport({lines,duration});
  if(!support.supported)throw new Error(support.reason);
  const runtime=await ensureLyricRuntime({packageRoot,engineDirectory},context);
  const preservedCues=sameTimingSource(previousTiming,lyricsHash,duration)?previousTiming.cues?.filter(cue=>['automatic','manual'].includes(cue.status))||[]:[];
  const language={code:support.language.code,...support.language.engineNames};
  const result=await processJson(runtime.pythonPath,[path.join(engineDirectory,'lyric_alignment.py')],{...context,input:{audioPath,lines,language,engines:engineRequest(),onsetPolicy:ONSET_POLICY,maxDurationSeconds:LYRIC_ALIGNMENT_LIMITS.maxDurationSeconds,preservedCues,modelRoot:runtime.modelRoot,outputPath:path.join(outputDir,'lyric-timing.raw.json')}});
  const cues=finalizeAutomaticTiming({lines,result,duration});
  return {lyricsHash,duration,cues,models:result.models,automation:{...result.automation,timingMode:'line-starts',needsConfirmation:cues.filter(cue=>!['automatic','manual'].includes(cue.status)).map(cue=>cue.lineId)},analyzedAt:new Date().toISOString(),language:support.language.name};
}

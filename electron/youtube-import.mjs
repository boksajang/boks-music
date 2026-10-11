import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdir,mkdtemp,readFile,readdir,realpath,rm,stat,chmod} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {downloadVerified} from './download.mjs';

export const youtubeRelease='2026.08.19';
export const youtubeAssets={
 win32:{filename:'yt-dlp.exe',bytes:17840399,sha256:'66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a'},
 darwin:{filename:'yt-dlp_macos',bytes:37146048,sha256:'0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202'}
};
export function validateYoutubeUrl(value){
 let u;try{u=new URL(value);}catch{throw new Error('올바른 YouTube 영상 주소를 입력하세요.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','www.youtu.be'].includes(u.hostname)||u.searchParams.has('list'))throw new Error('HTTPS YouTube 단일 영상 주소만 지원합니다. 재생목록은 사용할 수 없습니다.');
 const id=u.hostname.endsWith('youtu.be')?u.pathname.slice(1):u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)\/?$/)?.[1];
 if(!/^[A-Za-z0-9_-]{11}$/.test(id||''))throw new Error('YouTube 영상 ID를 확인하세요.');
 return `https://www.youtube.com/watch?v=${id}`;
}
export function downloadProgress(line){
 if(!line.startsWith('BOKS_PROGRESS:'))return null;
 try{const p=JSON.parse(line.slice(14));const downloadedBytes=Number(p.downloaded_bytes)||0,totalBytes=Number(p.total_bytes)||Number(p.total_bytes_estimate)||0;return {stage:'YouTube 오디오 다운로드 중',downloadedBytes,...(totalBytes>0?{totalBytes,progress:Math.min(100,downloadedBytes/totalBytes*100)}:{})};}catch{return null;}
}
export function runYoutubeProcess(executable,args,{signal,onLine=()=>{},log=()=>{}}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(new Error('작업이 취소되었습니다.'));
  const child=spawn(executable,args,{shell:false,windowsHide:true,detached:process.platform!=='win32',env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','pipe','pipe']});let errorText='';
  const abort=()=>{if(!child.pid)return;if(process.platform==='win32'){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{shell:false,windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());}else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}};
  signal?.addEventListener('abort',abort,{once:true});
  const streams=[child.stdout,child.stderr].map(stream=>createInterface({input:stream}));
  streams.forEach(lines=>lines.on('line',line=>{onLine(line);if(line.startsWith('BOKS_PROGRESS:')||/^(?:out_time|total_size|bitrate|speed|progress|dup_frames|drop_frames|fps|frame)=/.test(line))return;const safe=line.replace(/https:\/\/[^\s]+googlevideo\.com[^\s]*/g,'[YouTube audio URL]');errorText=(errorText+'\n'+safe).slice(-6000);log(safe);}));
  child.on('error',error=>{signal?.removeEventListener('abort',abort);streams.forEach(s=>s.close());reject(error);});
  child.on('close',code=>{signal?.removeEventListener('abort',abort);streams.forEach(s=>s.close());if(signal?.aborted)reject(new Error('작업이 취소되었습니다.'));else if(code!==0)reject(new Error(`YouTube 오디오 처리 실패: ${errorText.slice(-1800)}`));else resolve();});
 });
}
export function createYoutubeImporter({packageRoot,sessionRoot,ffmpegPath,nodePath=process.execPath,platform=process.platform,arch=process.arch,download=downloadVerified,run=runYoutubeProcess}){
 const sessions=new Map();let installing;
 async function ensureTool(options){
  const asset=youtubeAssets[platform];if(!asset||platform==='win32'&&arch!=='x64')throw new Error('YouTube 가져오기는 Windows x64와 macOS에서 지원합니다.');
  const target=path.join(packageRoot,'tools','yt-dlp',youtubeRelease,asset.filename);
  // Each invocation verifies the pinned binary; concurrent callers share one installation.
  if(!installing)installing=download({...asset,url:`https://github.com/yt-dlp/yt-dlp/releases/download/${youtubeRelease}/${asset.filename}`},target,options).then(async()=>{if(platform==='darwin')await chmod(target,0o755);return target;}).finally(()=>{installing=null;});
  return installing;
 }
 async function remove(session){
  const root=await realpath(sessionRoot),target=await realpath(session.dir);
  if(path.dirname(target)!==root||!/^youtube-[A-Za-z0-9]{6}$/.test(path.basename(target)))throw new Error('임시 오디오 정리 경로가 올바르지 않습니다.');
  await rm(target,{recursive:true,force:true});
 }
 async function discard(id){const s=sessions.get(id);if(!s)return;if(s.busy)throw new Error('현재 저장 중인 오디오입니다. 작업을 취소한 뒤 닫으세요.');sessions.delete(id);await remove(s);}
 async function extractOnce(value,{signal,onProgress=()=>{},log=()=>{}}={}){
  const sourceUrl=validateYoutubeUrl(value);const tool=await ensureTool({signal,onProgress});signal?.throwIfAborted();
  await mkdir(sessionRoot,{recursive:true});const dir=await mkdtemp(path.join(sessionRoot,'youtube-'));const sessionId=randomUUID();
  try{
   onProgress({stage:'YouTube 영상 정보 확인 및 오디오 추출 중'});
   await run(tool,['--ignore-config','--no-plugin-dirs','--no-update','--no-playlist','--no-cache-dir','--no-js-runtimes','--js-runtimes',`node:${nodePath}`,'--socket-timeout','30','--retries','3','--match-filter','!is_live & !is_upcoming','--check-formats','--format','bestaudio','--write-info-json','--no-clean-info-json','--newline','--progress','--progress-template','download:BOKS_PROGRESS:%(progress)j','--output',path.join(dir,'source.%(ext)s'),'--',sourceUrl],{signal,log,onLine:line=>{const event=downloadProgress(line);if(event)onProgress(event);}});
   const info=JSON.parse(await readFile(path.join(dir,'source.info.json'),'utf8'));
   if(info._type==='playlist'||info.entries||info.is_live||info.live_status==='is_upcoming')throw new Error('단일 완료된 영상만 가져올 수 있습니다.');
   const files=(await readdir(dir)).filter(f=>/^source\.(m4a|webm|opus|ogg|mp3|aac|wav|mp4|flac)$/.test(f));
   if(files.length!==1)throw new Error('추출된 오디오 파일을 확인할 수 없습니다.');
   const audioPath=await realpath(path.join(dir,files[0]));if(path.dirname(audioPath)!==await realpath(dir)||(await stat(audioPath)).size<1)throw new Error('오디오 결과 경로가 올바르지 않습니다.');
   signal?.throwIfAborted();
   const result={sessionId,title:String(info.title||'YouTube 오디오').slice(0,500),duration:Number(info.duration)||0,sourceUrl};sessions.set(sessionId,{...result,dir,audioPath,busy:false});return result;
  }catch(error){await remove({dir});throw error;}
 }
 async function extract(value,options={}){
  for(let attempt=0;attempt<3;attempt++){
   options.signal?.throwIfAborted();
   try{return await extractOnce(value,options);}
   catch(error){
    if(options.signal?.aborted||!/HTTP (?:Error )?403|HTTP Error 410/i.test(error.message||''))throw error;
    if(attempt===2)throw new Error('YouTube에서 오디오 다운로드를 거부했습니다(HTTP 403/410). 새 주소로 다시 요청했지만 실패했습니다. 잠시 후 다시 시도해 주세요.',{cause:error});
    options.log?.(`YouTube audio URL refresh retry ${attempt+1}/2: ${error.message}`);
    options.onProgress?.({stage:`오디오 주소 다시 확인 중 · 재시도 ${attempt+1}/2`});
   }
  }
 }
 async function finalize(id,format,outputDir,{signal,onProgress=()=>{},log=()=>{}}={}){
  if(!['wav','mp3'].includes(format))throw new Error('WAV 또는 MP3 형식을 선택하세요.');
  const s=sessions.get(id);if(!s||s.busy)throw new Error('추출 세션이 없거나 이미 저장 중입니다. 다시 추출하세요.');
  let ffmpeg=typeof ffmpegPath==='function'?await ffmpegPath():ffmpegPath;
  if(!ffmpeg&&platform==='win32')for(const profile of ['stems-cuda','stems-cpu']){const candidate=path.join(packageRoot,'runtimes',profile,profile,'Scripts','ffmpeg.exe');try{if((await stat(candidate)).isFile()){ffmpeg=candidate;break;}}catch{}}
  if(!ffmpeg)throw new Error('FFmpeg 오디오 도구 설치가 필요합니다.');
  s.busy=true;const audioPath=path.join(outputDir,`youtube-${randomUUID()}.${format}`);
  try{await mkdir(outputDir,{recursive:true});onProgress({stage:`${format.toUpperCase()} 오디오 저장 중`});
   await run(ffmpeg,['-hide_banner','-nostdin','-n','-i',s.audioPath,'-vn','-map','0:a:0',...(format==='wav'?['-c:a','pcm_s16le']:['-c:a','libmp3lame','-b:a','320k']),'-progress','pipe:1','-nostats',audioPath],{signal,log,onLine:line=>{const match=line.match(/^out_time_us=(\d+)$/);if(match)onProgress({stage:`${format.toUpperCase()} 오디오 저장 중`,...(s.duration>0?{progress:Math.min(99,Number(match[1])/1e6/s.duration*100)}:{})});}});
   if((await stat(audioPath)).size<44)throw new Error('변환된 오디오가 비어 있습니다.');
   return {audioPath,title:s.title,metadata:{source:'youtube',sourceUrl:s.sourceUrl,format,ytDlpVersion:youtubeRelease,...(format==='mp3'?{bitrateKbps:320}:{})}};
  }catch(error){await rm(audioPath,{force:true});if(signal?.aborted){sessions.delete(id);await remove(s);}throw error;}finally{s.busy=false;}
 }
 async function cleanupExpired(){
  // Call only at startup before accepting new work; never traverse external paths.
  await mkdir(sessionRoot,{recursive:true});
  for(const entry of await readdir(sessionRoot,{withFileTypes:true}))if(entry.isDirectory()&&/^youtube-[A-Za-z0-9]{6}$/.test(entry.name)&&![...sessions.values()].some(s=>path.basename(s.dir)===entry.name))await remove({dir:path.join(sessionRoot,entry.name)});
 }
 return {extract,finalize,discard,ensureTool,cleanupExpired};
}

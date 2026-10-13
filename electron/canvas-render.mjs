import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createWriteStream} from 'node:fs';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {runVideoProcess} from './video-process.mjs';

/** Output bitrate for H.264 text-heavy motion graphics (≈0.15 bit per pixel per frame). */
export const canvasBitrate=({width,height,fps})=>Math.round(Math.min(80e6,Math.max(2.5e6,width*height*fps*.15)));

/**
 * Renders in a separate Electron process with its own GPU process. Sharing the app's GPU process tied
 * the render to the main window's 60 Hz repaint (spinner, progress bar): measured 55 fps vs 182 fps at 1080p.
 * The child runs `renderCanvasInWindow` and reports progress as JSON lines.
 */
export async function renderCanvasVideo(input,{signal,onProgress=()=>{},log=()=>{}}={}){
 const {app}=await import('electron');
 const requestFile=input.streamPath+'.request.json',profile=await mkdtemp(path.join(os.tmpdir(),'boks-canvas-'));
 await writeFile(requestFile,JSON.stringify(input));
 // In development the executable is plain Electron and needs the app folder (the one holding package.json).
 const args=[...(app.isPackaged?[]:[fileURLToPath(new URL('..',import.meta.url))]),'--boks-canvas-render',requestFile,'--boks-canvas-profile',profile];
 let report,failure;
 try{
  await runVideoProcess(process.execPath,args,{signal,log:()=>{},onLine:line=>{
   let event;try{event=JSON.parse(line);}catch{return;}
   if(event.type==='progress')onProgress(event);else if(event.type==='log')log(event.message);else if(event.type==='result')report=event.report;else if(event.type==='error')failure=event.message;
  }});
 }catch(error){signal?.throwIfAborted();throw Error(failure||error.message);}
 finally{await rm(requestFile,{force:true});await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200}).catch(()=>{});}
 if(!report)throw Error(failure||'GPU 영상 렌더링 결과를 받지 못했습니다.');
 return report;
}

/**
 * Renders a canvas scene in a hidden, sandboxed window and encodes it with WebCodecs (hardware H.264
 * when available). Writes an Annex-B H.264 stream to `streamPath`. Runs in the render child process.
 */
export async function renderCanvasInWindow({scene,width,height,fps,frames,tracks,options,analysisFiles,artFiles,backgroundFile,streamPath},{signal,onProgress=()=>{},log=()=>{}}={}){
 const {BrowserWindow}=await import('electron');
 const read=file=>file?readFile(file):null;
 const job={scene,width,height,fps,frames,bitrate:canvasBitrate({width,height,fps}),options,tracks:tracks.map(t=>({title:t.title||'',duration:t.duration,cues:t.cues||[]})),
  analyses:await Promise.all(analysisFiles.map(async file=>file?JSON.parse(await readFile(file,'utf8')):null)),arts:await Promise.all(artFiles.map(read)),background:await read(backgroundFile)};
 const here=path.dirname(fileURLToPath(import.meta.url));
 const window=new BrowserWindow({show:false,width:320,height:200,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,preload:path.join(here,'canvas-render','preload.cjs')}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
 const out=createWriteStream(streamPath);let written=0;
 try{
  return await new Promise((resolve,reject)=>{
   const ipc=window.webContents.ipc;let settled=false;
   const finish=(error,value)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
   const abort=()=>finish(Object.assign(Error('작업이 취소되었습니다.'),{name:'AbortError'}));
   signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)return abort();
   ipc.on('canvas-render:chunk',(_event,bytes)=>{written+=bytes.byteLength;out.write(Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength));});
   ipc.on('canvas-render:progress',(_event,value)=>onProgress(value));
   ipc.on('canvas-render:fail',(_event,message)=>finish(Error('GPU 영상 렌더링 실패: '+message)));
   ipc.on('canvas-render:done',(_event,report)=>{log(`GPU 렌더링 완료 · ${report.frames}프레임 · ${report.seconds.toFixed(1)}초 · ${report.hardware?'하드웨어':'소프트웨어'} 인코딩 ${report.codec} · ${(written/1048576).toFixed(1)}MB`);finish(null,report);});
   window.webContents.on('render-process-gone',(_event,details)=>finish(Error('GPU 렌더링 창이 종료되었습니다: '+details.reason)));
   window.webContents.once('did-finish-load',()=>window.webContents.send('canvas-render:job',job));
   window.loadFile(path.join(here,'canvas-render','page.html')).catch(error=>finish(error));
  });
 }finally{
  if(!window.isDestroyed())window.destroy();
  await new Promise(resolve=>out.end(resolve));
 }
}

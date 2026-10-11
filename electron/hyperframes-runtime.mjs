import {spawn} from 'node:child_process';
import {readFile,mkdir,stat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const HYPERFRAMES_VERSION='0.8.140';
const defaultRoot=fileURLToPath(new URL('../engine-packages/',import.meta.url));
export function runtimeDirectory(packageRoot=defaultRoot){return path.resolve(packageRoot,'runtimes','hyperframes');}
export async function inspectVideoRuntime(packageRoot){
 const directory=runtimeDirectory(packageRoot);
 try{const receipt=JSON.parse(await readFile(path.join(directory,'ready.json'),'utf8'));if(receipt.version!==HYPERFRAMES_VERSION||receipt.platform!==process.platform||receipt.arch!==process.arch)throw Error('이 PC용 영상 실행 환경이 필요합니다.');for(const file of [receipt.chromePath,receipt.ffprobePath,path.join(directory,'node_modules/@hyperframes/producer/dist/index.js'),path.join(directory,'node_modules/gsap/dist/gsap.min.js')]){const relative=path.relative(await realpath(directory),await realpath(file));if(relative.startsWith('..')||path.isAbsolute(relative)||!(await stat(file)).isFile())throw Error('영상 실행 파일이 불완전합니다.');}return {...receipt,directory,available:true};}catch(error){return {available:false,version:HYPERFRAMES_VERSION,directory,reason:'영상 실행 환경 준비가 필요합니다. '+error.message};}
}
export function runVideoProcess(executable,args,{signal,env={},onLine=()=>{},log=()=>{}}={}){
 return new Promise((resolve,reject)=>{signal?.throwIfAborted();const child=spawn(executable,args,{shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe'],env:{...process.env,...env}});let pending='',tail='';
 const abort=()=>{if(!child.pid)return;if(process.platform==='win32'){const kill=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});kill.on('error',()=>child.kill());}else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}};
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();child.stdout.on('data',chunk=>{pending+=chunk;const lines=pending.split(/\r?\n/);pending=lines.pop();for(const line of lines)onLine(line);});child.stderr.on('data',chunk=>{tail=(tail+chunk).slice(-12000);log(String(chunk));});child.on('error',error=>{signal?.removeEventListener('abort',abort);reject(error);});child.on('close',code=>{signal?.removeEventListener('abort',abort);if(pending)onLine(pending);if(signal?.aborted)reject(Error('영상 작업이 취소되었습니다.'));else if(code)reject(Error(tail||`영상 프로세스 실패 (${code})`));else resolve();});
 });
}
let installing;
export async function ensureVideoRuntime(packageRoot,context={}){
 const state=await inspectVideoRuntime(packageRoot);if(state.available)return state;if(installing)return installing;
 installing=(async()=>{if(!['win32','darwin'].includes(process.platform))throw Error('영상 제작은 Windows와 macOS에서 지원합니다.');await mkdir(state.directory,{recursive:true});context.onProgress?.({stage:'영상 실행 환경 준비 중'});await runVideoProcess(process.execPath,[fileURLToPath(new URL('../engines/setup-hyperframes.mjs',import.meta.url)),state.directory],{...context,env:{ELECTRON_RUN_AS_NODE:'1'},onLine:line=>{context.log?.(line);try{const event=JSON.parse(line);if(event.type==='progress')context.onProgress?.(event);}catch{}}});const ready=await inspectVideoRuntime(packageRoot);if(!ready.available)throw Error(ready.reason);return ready;})();try{return await installing;}finally{installing=undefined;}
}

import {spawn} from 'node:child_process';

/** Runs FFmpeg or a renderer process: lines of stdout to onLine, stderr to the log; abort kills the process tree. */
export function runVideoProcess(executable,args,{signal,env={},onLine=()=>{},log=()=>{}}={}){
 return new Promise((resolve,reject)=>{signal?.throwIfAborted();const child=spawn(executable,args,{shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe'],env:{...process.env,...env}});let pending='',tail='';
 const abort=()=>{if(!child.pid)return;if(process.platform==='win32'){const kill=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});kill.on('error',()=>child.kill());}else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}};
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();child.stdout.on('data',chunk=>{pending+=chunk;const lines=pending.split(/\r?\n/);pending=lines.pop();for(const line of lines)onLine(line);});child.stderr.on('data',chunk=>{tail=(tail+chunk).slice(-12000);log(String(chunk));});child.on('error',error=>{signal?.removeEventListener('abort',abort);reject(error);});child.on('close',code=>{signal?.removeEventListener('abort',abort);if(pending)onLine(pending);if(signal?.aborted)reject(Error('영상 작업이 취소되었습니다.'));else if(code)reject(Error(tail||`영상 프로세스 실패 (${code})`));else resolve();});
 });
}

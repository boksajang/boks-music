import {createHash} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,stat,rename,rm} from 'node:fs/promises';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {ensureSpace} from './store.mjs';
export async function hashFile(file,signal){signal?.throwIfAborted();const hash=createHash('sha256');for await(const chunk of createReadStream(file)){signal?.throwIfAborted();hash.update(chunk);}signal?.throwIfAborted();return hash.digest('hex');}
const permanent=message=>Object.assign(new Error(message),{permanent:true});
const pause=(ms,signal)=>new Promise((resolve,reject)=>{const timer=setTimeout(resolve,ms);signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});});
/**
 * Downloads a pinned asset (size + SHA-256) to `destination`, publishing it only when verified.
 * Large model files (up to 12 GB) are resumed: a connection that stops delivering data for
 * `stallMs` or drops is retried from the received bytes with an HTTP Range request (up to
 * `attempts`). Cancellation, a size or hash mismatch and client errors remove the partial file;
 * after repeated network failures it is kept so the next attempt continues from it.
 */
export async function downloadVerified(asset,destination,{signal,onProgress=()=>{},fetchImpl=fetch,stallMs=60000,attempts=5,retryDelayMs=2000}={}){
  if(!/^[a-f\d]{64}$/i.test(asset.sha256)||!Number.isSafeInteger(asset.bytes)||asset.bytes<=0)throw new Error('다운로드 파일의 검증 정보가 없습니다.');
  const expectedHash=asset.sha256.toLowerCase(),name=asset.filename||path.basename(destination);
  signal?.throwIfAborted();await mkdir(path.dirname(destination),{recursive:true});
  try{if((await stat(destination)).size===asset.bytes){onProgress({stage:`${path.basename(destination)} 무결성 확인 중`});if(await hashFile(destination,signal)===expectedHash)return destination;}}catch(e){if(signal?.aborted)throw e;if(e.code&&e.code!=='ENOENT')throw e;}
  const temp=destination+'.partial';
  let offset=0;try{offset=(await stat(temp)).size;}catch{}
  if(offset>asset.bytes){await rm(temp,{force:true});offset=0;}
  await ensureSpace(path.dirname(destination),asset.bytes-offset);
  let lastError;
  for(let attempt=1;attempt<=attempts;attempt++){
    const attemptControl=new AbortController(),forward=()=>attemptControl.abort(signal.reason);
    signal?.addEventListener('abort',forward,{once:true});
    let stall;const arm=()=>{clearTimeout(stall);stall=setTimeout(()=>attemptControl.abort(new Error('stalled')),stallMs);};
    try{
      signal?.throwIfAborted();
      try{offset=(await stat(temp)).size;}catch{offset=0;}
      // Everything was received before (stall after the last byte, or quit before publishing): verify it.
      if(offset===asset.bytes){
        onProgress({stage:`${name} 무결성 확인 중`,progress:100});
        if(await hashFile(temp,signal)===expectedHash){await rename(temp,destination);onProgress({stage:`${name} 다운로드·무결성 확인 완료`,progress:100});return destination;}
        await rm(temp,{force:true});offset=0;
      }
      let hash=createHash('sha256');
      if(offset>0){
        onProgress({stage:`${name} 이어받기 준비 중`,progress:offset/asset.bytes*100,downloadedBytes:offset,totalBytes:asset.bytes});
        for await(const chunk of createReadStream(temp)){signal?.throwIfAborted();hash.update(chunk);}
      }
      arm();
      const response=await fetchImpl(asset.url,{signal:attemptControl.signal,redirect:'follow',...(offset?{headers:{Range:`bytes=${offset}-`}}:{})});
      if(!response.ok||!response.body){
        const error=new Error(`다운로드에 실패했습니다 (HTTP ${response.status}). 인터넷 연결을 확인하고 다시 시도하세요.`);
        if(response.status>=400&&response.status<500&&![408,429].includes(response.status))error.permanent=true;
        throw error;
      }
      // A server that ignores the range sends the whole file again.
      if(offset&&response.status!==206){offset=0;hash=createHash('sha256');}
      let received=offset,last=0;
      const verify=new Transform({transform(chunk,_encoding,callback){arm();received+=chunk.length;if(received>asset.bytes)return callback(permanent('다운로드 크기가 카탈로그와 일치하지 않습니다.'));hash.update(chunk);if(Date.now()-last>250){onProgress({stage:`${name} 다운로드 중`,progress:received/asset.bytes*100,downloadedBytes:received,totalBytes:asset.bytes});last=Date.now();}callback(null,chunk);}});
      await pipeline(Readable.fromWeb(response.body),verify,createWriteStream(temp,{flags:offset?'a':'w'}),{signal:attemptControl.signal});
      clearTimeout(stall);signal?.throwIfAborted();
      if(received!==asset.bytes||hash.digest('hex')!==expectedHash)throw permanent('다운로드 파일의 크기 또는 SHA-256이 일치하지 않습니다. 완료로 처리하지 않았습니다.');
      await rename(temp,destination);onProgress({stage:`${name} 다운로드·무결성 확인 완료`,progress:100});return destination;
    }catch(error){
      clearTimeout(stall);
      if(signal?.aborted||error.permanent){await rm(temp,{force:true}).catch(()=>{});throw error;}
      lastError=error;
      if(attempt<attempts){onProgress({stage:`${name} 연결이 끊겨 받은 부분부터 다시 시도하는 중 (${attempt}/${attempts-1})`});await pause(Math.min(retryDelayMs*attempt,10000),signal).catch(async reason=>{await rm(temp,{force:true}).catch(()=>{});throw reason;});}
    }finally{signal?.removeEventListener('abort',forward);}
  }
  throw new Error(`${name} 다운로드가 반복해서 중단되었습니다. 인터넷 연결을 확인하고 다시 시도하세요. 받은 부분은 남겨 두어 다음 시도에서 이어받습니다.`,{cause:lastError});
}

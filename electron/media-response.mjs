import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {Readable} from 'node:stream';
import path from 'node:path';

// file:// fetch strips range metadata in Electron's custom protocol response.
// Serve explicit byte ranges so Chromium knows duration and can seek reliably.
export async function mediaResponse(file,request) {
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  const info=await stat(file);if(!info.isFile())return new Response(null,{status:404});
  const total=info.size;
  const mime={'.mp4':'video/mp4','.mov':'video/quicktime','.jpeg':'image/jpeg','.wav':'audio/wav','.flac':'audio/flac','.mp3':'audio/mpeg','.m4a':'audio/mp4','.ogg':'audio/ogg','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'}[path.extname(file).toLowerCase()]||'application/octet-stream';
  // Readable by the app's own pages (video preview: album color and spectrum); the scheme exists only inside the app.
  const headers={'Content-Type':mime,'Accept-Ranges':'bytes','Content-Length':String(total),'Access-Control-Allow-Origin':'*'};
  let start=0,end=total-1,status=200;
  const range=request.headers.get('range');
  if(range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range.trim());
    const unsatisfied=()=>new Response(null,{status:416,headers:{'Content-Range':`bytes */${total}`,'Accept-Ranges':'bytes','Content-Length':'0'}});
    if(!match||(!match[1]&&!match[2])||total===0)return unsatisfied();
    if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return unsatisfied();start=Math.max(0,total-suffix);}
    else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),total-1):total-1;}
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=total||end<start)return unsatisfied();
    status=206;headers['Content-Range']=`bytes ${start}-${end}/${total}`;headers['Content-Length']=String(end-start+1);
  }
  if(request.method==='HEAD'||total===0)return new Response(null,{status,headers});
  const stream=createReadStream(file,{start,end,...(request.signal?{signal:request.signal}:{})});
  return new Response(Readable.toWeb(stream),{status,headers});
}


import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readdir,stat,rename,copyFile,rm,utimes} from 'node:fs/promises';

/**
 * Separated vocals kept for lyric analysis, so a song is separated once instead of on every
 * re-analysis or video retry. Keyed by the audio content and the separation model; oldest entries
 * are dropped beyond `maxBytes`.
 */
export function createVocalCache({root,maxBytes=5*1024**3}){
 const file=key=>path.join(root,key+'.wav');
 async function key(audioPath,model=''){
  const hash=createHash('sha256');for await(const chunk of createReadStream(audioPath))hash.update(chunk);
  return createHash('sha256').update(hash.digest('hex')+'\n'+String(model)).digest('hex').slice(0,40);
 }
 async function get(cacheKey){
  try{const target=file(cacheKey),info=await stat(target);if(!info.isFile()||info.size<=44)return null;const now=new Date();await utimes(target,now,now).catch(()=>{});return target;}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
 }
 async function prune(keep){
  const entries=[];
  for(const name of await readdir(root).catch(()=>[]))if(name.endsWith('.wav')){try{const info=await stat(path.join(root,name));entries.push({name,size:info.size,time:info.mtimeMs});}catch{}}
  let total=entries.reduce((sum,entry)=>sum+entry.size,0);
  for(const entry of entries.sort((a,b)=>a.time-b.time)){if(total<=maxBytes)break;if(entry.name===keep+'.wav')continue;await rm(path.join(root,entry.name),{force:true});total-=entry.size;}
 }
 /** Moves (or copies across drives) a separated vocal into the cache and returns its cached path. */
 async function put(cacheKey,source){
  await mkdir(root,{recursive:true});
  const target=file(cacheKey),temp=path.join(root,`.${cacheKey}.${randomUUID()}.tmp`);
  try{await rename(source,temp);}catch(error){if(error.code!=='EXDEV')throw error;await copyFile(source,temp);}
  try{await rename(temp,target);}catch(error){await rm(temp,{force:true});if(!(await get(cacheKey)))throw error;}
  await prune(cacheKey);return target;
 }
 return {key,get,put,prune,root};
}

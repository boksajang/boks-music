import path from 'node:path';
import {readdir,readFile,rm,stat} from 'node:fs/promises';

/**
 * Removal of data the app keeps outside the song and project folders, so deleting a song or a
 * video leaves nothing behind: the video render cache, separated vocals kept for lyric analysis and
 * the per-job work folders of video jobs.
 */

/** Render-cache entries (`<key>.mp4` + `<key>.json` receipt) that belong to the given songs or keys. */
export async function removeRenderCache(directory,{trackIds=[],cacheKeys=[],unattributed=false}={}){
 const tracks=new Set(trackIds),keys=new Set(cacheKeys),removed=[];
 let names;try{names=await readdir(directory);}catch(error){if(error.code==='ENOENT')return removed;throw error;}
 const receipts=new Set(names.filter(name=>name.endsWith('.json')).map(name=>name.slice(0,-5)));
 for(const key of receipts){
  if(!/^[a-f0-9]{64}$/.test(key))continue;
  let receipt=null;try{receipt=JSON.parse(await readFile(path.join(directory,key+'.json'),'utf8'));}catch{receipt=null;}
  const owners=Array.isArray(receipt?.trackIds)?receipt.trackIds:null;
  // Entries written before receipts named their songs cannot be attributed: removed with any deletion.
  if(keys.has(key)||(owners&&owners.some(id=>tracks.has(id)))||(!owners&&unattributed)){
   await rm(path.join(directory,key+'.mp4'),{force:true});await rm(path.join(directory,key+'.json'),{force:true});removed.push(key);
  }
 }
 // Interrupted writes and videos whose receipt is gone are never reused: always removed.
 for(const name of names){
  const temporary=/\.tmp$/.test(name),orphan=name.endsWith('.mp4')&&!receipts.has(name.slice(0,-4));
  if(temporary||orphan)await rm(path.join(directory,name),{force:true});
 }
 return removed;
}

/** Separated-vocal cache files for the given keys (and their interrupted temporary copies). */
export async function removeVocalCache(directory,keys=[]){
 const wanted=new Set(keys.filter(key=>/^[a-f0-9]{40}$/.test(key)));let names;
 try{names=await readdir(directory);}catch(error){if(error.code==='ENOENT')return [];throw error;}
 const removed=[];
 for(const name of names){const key=name.replace(/^\./,'').split('.')[0];if(wanted.has(key)){await rm(path.join(directory,name),{force:true});removed.push(name);}}
 return removed;
}

/** Work folders of video jobs that are no longer running (job id = folder name). */
export async function sweepVideoJobFolders(directory,activeJobIds=[]){
 const active=new Set(activeJobIds),removed=[];let names;
 try{names=await readdir(directory);}catch(error){if(error.code==='ENOENT')return removed;throw error;}
 for(const name of names){
  if(active.has(name))continue;
  const target=path.join(directory,name);
  try{if(!(await stat(target)).isDirectory())continue;}catch{continue;}
  await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});removed.push(name);
 }
 return removed;
}

import path from 'node:path';
import {readdir,readFile,rm,stat} from 'node:fs/promises';

/**
 * Removal of data the app keeps outside the song and project folders, so deleting a song or a
 * video leaves nothing behind: separated vocals kept for lyric analysis and the per-job work folders
 * of video jobs.
 */

/** Total size in bytes of the files under a folder (0 when it does not exist). */
export async function folderSize(directory){
 let total=0,entries;
 try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))return 0;throw error;}
 for(const entry of entries){const target=path.join(directory,entry.name);if(entry.isDirectory())total+=await folderSize(target);else if(entry.isFile())try{total+=(await stat(target)).size;}catch{}}
 return total;
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

import {access,cp,mkdir,readFile,readdir,rename,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';

/**
 * Where the app keeps its data (library.json, logs, video work folders, vocal/waveform caches, the Chromium
 * profile and temporary files). Tests set BOKS_DATA_DIR. A development run (npm run dev) keeps everything in
 * the project folder (<project>/app-data), next to engine-packages. An installed app has no project folder
 * and keeps the system location (Electron's userData).
 */
export function resolveDataRoot({packaged,env=process.env,projectRoot,fallback}){
 if(env.BOKS_DATA_DIR)return path.resolve(env.BOKS_DATA_DIR);
 if(!packaged&&projectRoot)return path.join(path.resolve(projectRoot),'app-data');
 return fallback;
}
/** Sub-folders of the data root. */
export const dataPaths=root=>({
 library:path.join(root,'library.json'),log:path.join(root,'logs','details.log'),projects:path.join(root,'projects'),
 chromium:path.join(root,'chromium'),temp:path.join(root,'tmp'),videoJobs:path.join(root,'video-jobs'),
 vocalCache:path.join(root,'vocal-cache'),waveformCache:path.join(root,'waveform-cache'),youtubeImports:path.join(root,'youtube-imports'),renderCache:path.join(root,'render-cache'),
});

const exists=file=>access(file).then(()=>true,()=>false);
const samePath=(a,b)=>process.platform==='win32'?path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase():path.resolve(a)===path.resolve(b);
/** `value` with every absolute path under `from` moved under `to` (strings anywhere in the structure). */
export function movePaths(value,from,to){
 const base=path.resolve(from),length=base.length,windows=process.platform==='win32';
 const inside=text=>{if(text.length<length)return false;const head=text.slice(0,length);return (windows?head.toLowerCase()===base.toLowerCase():head===base)&&(text.length===length||text[length]===path.sep||text[length]==='/');};
 const visit=item=>{
  if(typeof item==='string')return path.isAbsolute(item)&&inside(item)?path.join(to,item.slice(length)):item;
  if(Array.isArray(item))return item.map(visit);
  if(item&&typeof item==='object')return Object.fromEntries(Object.entries(item).map(([key,entry])=>[key,visit(entry)]));
  return item;
 };
 return visit(value);
}

/**
 * One-time move of an earlier data folder (the system location used before 2026-10-26) into `to`:
 * library.json with every path under the old folder rewritten, the projects folder (songs, album art, job
 * files), the vocal and waveform caches and the log. Chromium caches, video work folders and YouTube sessions
 * are temporary and are not carried over. Nothing happens when `to` already has a library or `from` has none.
 * The old folder is left as it is; every song file referenced by the library is checked to exist at its new place.
 */
export async function migrateLegacyData({from,to,log=()=>{}}){
 if(!from||samePath(from,to)||!(await exists(path.join(from,'library.json')))||await exists(path.join(to,'library.json')))return {migrated:false};
 const source=JSON.parse(await readFile(path.join(from,'library.json'),'utf8'));
 const paths=dataPaths(to);await mkdir(to,{recursive:true});
 const copied=[];
 for(const [name,target] of [['projects',paths.projects],['vocal-cache',paths.vocalCache],['waveform-cache',paths.waveformCache]]){
  const folder=path.join(from,name);if(!(await exists(folder)))continue;
  await cp(folder,target,{recursive:true,force:false,errorOnExist:false,preserveTimestamps:true});copied.push(name);
 }
 if(await exists(path.join(from,'details.log'))){await mkdir(path.dirname(paths.log),{recursive:true});await cp(path.join(from,'details.log'),paths.log,{force:false,errorOnExist:false});copied.push('details.log');}
 const moved=movePaths(source,from,to);
 // Every file the library points to under the old folder must now exist under the new one.
 const missing=[];
 const check=async(before,after)=>{if(typeof before==='string'&&before!==after&&await exists(before)&&!(await exists(after)))missing.push(after);};
 for(const [index,track] of (source.tracks||[]).entries())for(const key of ['audioPath','artPath'])await check(track[key],moved.tracks[index][key]);
 for(const [index,project] of (source.projects||[]).entries())await check(project.directory,moved.projects[index].directory);
 if(missing.length)throw new Error(`이전 데이터 폴더의 파일 ${missing.length}개를 새 위치로 옮기지 못했습니다: ${missing.slice(0,3).join(', ')}`);
 const text=JSON.stringify(moved);
 await writeFile(path.join(to,'library.json.partial'),text);
 await writeFile(path.join(to,'library.json.bak'),text);
 await rename(path.join(to,'library.json.partial'),paths.library);
 await writeFile(path.join(to,'migrated-from.json'),JSON.stringify({from,at:new Date().toISOString(),copied},null,1));
 log(`앱 데이터를 ${from}에서 ${to}로 옮겼습니다 (${copied.join(', ')}).`);
 return {migrated:true,copied};
}

/** Empties the temporary folder left by an earlier run (render profiles, child process temp files). */
export async function clearTempFolder(root){
 const temp=dataPaths(root).temp;await mkdir(temp,{recursive:true});
 for(const name of await readdir(temp).catch(()=>[]))await rm(path.join(temp,name),{recursive:true,force:true,maxRetries:3,retryDelay:100}).catch(()=>{});
 return temp;
}

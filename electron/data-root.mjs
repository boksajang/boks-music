import {mkdir,readdir,rm} from 'node:fs/promises';
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';

/**
 * Where the app keeps its data (library.json, logs, video work folders, vocal/waveform caches, the Chromium
 * profile and temporary files). Tests set BOKS_DATA_DIR. A development run (npm run dev) keeps everything in
 * the project folder (<project>/app-data), next to engine-packages. An installed app uses installedRoots.
 */
export function resolveDataRoot({packaged,env=process.env,projectRoot,fallback}){
 if(env.BOKS_DATA_DIR)return path.resolve(env.BOKS_DATA_DIR);
 if(!packaged&&projectRoot)return path.join(path.resolve(projectRoot),'app-data');
 return fallback;
}

/**
 * Data and engine folders of an installed app. On Windows everything stays in the install folder, the same
 * layout as a development run: <install>/app-data and <install>/engine-packages (user rule: engines, generated
 * and work files never go to the system folders). The installer creates both and lets users write to them in
 * an all-users install (build/installer.nsh); the uninstaller keeps them on updates and asks before deleting
 * them. writable is false when the folder still cannot be written: the app then stops with a notice instead of
 * storing anything elsewhere. A macOS app bundle cannot hold data, so it keeps the system folder.
 */
export function installedRoots({platform,installRoot,system,canWrite=writableFolder}){
 if(platform!=='win32'||!installRoot)return {data:system,engines:path.join(system,'engine-packages'),writable:true};
 const data=path.join(installRoot,'app-data');
 return {data,engines:path.join(installRoot,'engine-packages'),writable:canWrite(data)};
}
/** Creates the folder and checks a file can be written there (Windows permissions are not visible otherwise). */
export function writableFolder(folder){
 try{mkdirSync(folder,{recursive:true});const probe=path.join(folder,`.write-check-${process.pid}`);writeFileSync(probe,'');unlinkSync(probe);return true;}
 catch{return false;}
}
/** Sub-folders of the data root. */
export const dataPaths=root=>({
 library:path.join(root,'library.json'),log:path.join(root,'logs','details.log'),projects:path.join(root,'projects'),
 chromium:path.join(root,'chromium'),temp:path.join(root,'tmp'),videoJobs:path.join(root,'video-jobs'),
 vocalCache:path.join(root,'vocal-cache'),waveformCache:path.join(root,'waveform-cache'),youtubeImports:path.join(root,'youtube-imports'),renderCache:path.join(root,'render-cache'),
});

/** Empties the temporary folder left by an earlier run (render profiles, child process temp files). */
export async function clearTempFolder(root){
 const temp=dataPaths(root).temp;await mkdir(temp,{recursive:true});
 for(const name of await readdir(temp).catch(()=>[]))await rm(path.join(temp,name),{recursive:true,force:true,maxRetries:3,retryDelay:100}).catch(()=>{});
 return temp;
}

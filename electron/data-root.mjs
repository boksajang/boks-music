import {mkdir,readdir,rm} from 'node:fs/promises';
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

/** Empties the temporary folder left by an earlier run (render profiles, child process temp files). */
export async function clearTempFolder(root){
 const temp=dataPaths(root).temp;await mkdir(temp,{recursive:true});
 for(const name of await readdir(temp).catch(()=>[]))await rm(path.join(temp,name),{recursive:true,force:true,maxRetries:3,retryDelay:100}).catch(()=>{});
 return temp;
}

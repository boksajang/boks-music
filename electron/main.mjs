import {audioWaveform} from './audio-waveform.mjs';
import {stemWaveform} from './stem-waveform.mjs';
import {renderPlaylistVideo,validateVideoOptions} from './playlist-video.mjs';
import {videoPreflight} from './video-preflight.mjs';
import {readVideoTemplates,getVideoTemplate} from './video-template-registry.mjs';
import {removeVocalCache,sweepVideoJobFolders,folderSize} from './cleanup.mjs';
import {lyricSubtitles,videoSubtitles} from './subtitles.mjs';
import {alignTrackLyrics,ensureLyricRuntime,inspectLyricRuntime,lyricAlignmentSupport} from './lyric-alignment.mjs';
import {analyzeLyricBatch} from './lyric-batch.mjs';
import {normalizeLyrics,hashLyrics,validateLyricStarts,mergeLyricProgress,remapLyricTiming,preserveManualStarts,lyricTimingState} from './lyric-timing.mjs';
import {cleanBannedWords} from './lyrics-generation.mjs';
import {LYRIC_FILE_LIMITS,parseLyricTimingFile,planLyricTimingImport} from './lyric-file.mjs';
import {localImageState,installImageVariant,generateLocalImage} from './image-engine.mjs';
import {lyricLines,editLyricLine} from './lyric-lines.mjs';
import {masterAudio,validateMasteringOptions} from './mastering.mjs';
import {commitImportedTrack} from './import-commit.mjs';
import {moveTracks} from './track-move.mjs';
import {createPlaylist,renamePlaylist,deletePlaylist,addToPlaylist,removeFromPlaylist,reorderPlaylist} from './playlists.mjs';
import {createYoutubeImporter,validateYoutubeUrl} from './youtube-import.mjs';
import {validateInstrumentalDuration} from './instrumental-request.mjs';
import {moveToTrash,restoreFromTrash,purgeTrash,deleteProject,releaseFile} from './trash.mjs';
import {registerFinalTrack} from './final-track.mjs';
import {recommendedBundleInstalled} from './recommended-installation.mjs';
import {mediaResponse} from './media-response.mjs';
import {exportAlbumArt} from './art-export.mjs';
import {assertYue2Input} from './yue2-input.mjs';
import {constants as fsConstants} from 'node:fs';
import {stemLabel} from './stem-label.mjs';
import {createVocalCache} from './vocal-cache.mjs';
import { app,BrowserWindow,ipcMain,dialog,protocol,shell,clipboard,nativeImage } from 'electron';
import { mkdir,copyFile,stat,appendFile,realpath,rm,readFile,readdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomInt} from 'node:crypto';
import {parseFile} from 'music-metadata';
import {Store,requiredString,findById,ensureSpace,id,inside} from './store.mjs';
import {JobQueue} from './queue.mjs';
import {presets} from './presets.mjs';
import {inspectSystem,engineStates,clearEngineProbes,runEngine,installedEngineChoices} from './engine.mjs';
import {installationOptions,installationRecommendation} from './compatibility.mjs';
import {installRuntime,readInstalls} from './installer.mjs';
import {inspectCodexInstallation,readCodexUsage,listCodexModels,generateLyrics,generateArt,planInstrumentals as planCodexInstrumentals,writeArtPrompt as writeCodexArtPrompt,cancelCodexProcesses,validateCodexSettings} from './codex.mjs';
import {inspectClaudeInstallation,readClaudeUsage,generateLyrics as generateClaudeLyrics,planInstrumentals as planClaudeInstrumentals,writeArtPrompt as writeClaudeArtPrompt,cancelClaudeProcesses,validateClaudeSettings,claudeModels,agentProviders} from './claude.mjs';
import {removeBillingCredentials,inspectCodexBilling} from './cli-billing.mjs';
import {resolveCodexExecutable} from './codex-discovery.mjs';
import {resolveAgents} from './agent-selection.mjs';
import {resolveDataRoot,dataPaths,clearTempFolder} from './data-root.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let vocalCacheInstance;
const vocalCache=()=>vocalCacheInstance||=createVocalCache({root:path.join(app.getPath('userData'),'vocal-cache')});
// AI agents run only through their CLIs on subscription logins. API keys and cloud-provider
// switches are removed before any child process starts, so no CLI can fall back to metered billing.
removeBillingCredentials(process.env);
app.setName('Boks Music');
// App data (library, logs, video work folders, caches, the Chromium profile and temporary files) lives in the
// project folder in development (<project>/app-data, data-root.mjs); tests use BOKS_DATA_DIR; an installed app
// keeps Electron's userData.
// (Asking Electron for its default userData creates that folder, so a development run never asks.)
const dataRoot=resolveDataRoot({packaged:app.isPackaged,projectRoot:root,fallback:app.isPackaged&&!process.env.BOKS_DATA_DIR?app.getPath('userData'):''}),appPaths=dataPaths(dataRoot);
// Engines and models: <project>/engine-packages in development; an installed app keeps them in its data folder
// because its own folder is read-only (app.asar, usually under Program Files).
const enginePackages=app.isPackaged?path.join(dataRoot,'engine-packages'):path.join(root,'engine-packages');
app.setPath('userData',dataRoot);app.setPath('sessionData',appPaths.chromium);
// Temporary files of the app and of every child process (engines, ffmpeg, render profiles) stay in the data folder.
for(const key of ['TEMP','TMP','TMPDIR'])process.env[key]=appPaths.temp;
app.setAppUserModelId('com.boksajang.boksmusic');
const ownsInstance=app.requestSingleInstanceLock();
if(!ownsInstance)app.quit();
protocol.registerSchemesAsPrivileged([{scheme:'boks-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
let window,store,queue,system,engines=[],codexModels=[],codexError='',quitting=false,installs={},closeReady=false,closePending=false,closeTimer,quitRequested=false,shutdownStarted=false;
let codexStatus={state:'checking'},codexUsage={state:'checking'},codexRefresh,usageRefresh;
let claudeStatus={state:'checking'},claudeRefresh,claudeUsageRefresh,claudeUsageError='';
let codexBilling={pending:true},codexBillingRefresh;
let recommendedInstallation={optionId:'',installed:false};
let lyricInstallation={ready:false,models:[],runtimeReady:false};
let videoInstallation={available:false};
const isMac=process.platform==='darwin';
let desktopReady=false, youtubeImporter;
const youtubeFinishing=new Set();
const videoDirectories=new Set(),videoBackgrounds=new Map();
const resumingVideos=new Set();
// Parsed LRC/SRT awaiting the user's confirmation (one at a time).
const pendingTimingFiles=new Map();
const importPlaylist=id=>id?findById(store.data.playlists,id,'플레이리스트'):null;
const trackBusy=t=>store.data.jobs.some(j=>['queued','running'].includes(j.status)&&(j.request?.trackId===t.id||j.request?.trackIds?.includes(t.id)));
const AGENT_JOB_TYPES=new Set(['lyrics','albumArt','instrumentalPlan']);
const runner=path.join(app.isPackaged?process.resourcesPath:root,'engines','runner.py');
const notify=()=>{if(window&&!window.isDestroyed())window.webContents.send('boks:update');};
// Job progress (stage, percentage, remaining time) goes to the window as a small event at most every
// 200 ms per job instead of republishing the whole library on every engine line or rendered frame batch.
const progressTimers=new Map();
const sendProgress=job=>{if(progressTimers.has(job.id))return;progressTimers.set(job.id,setTimeout(()=>{progressTimers.delete(job.id);if(window&&!window.isDestroyed())window.webContents.send('boks:progress',{id:job.id,status:job.status,stage:job.stage,progress:job.progress,eta:job.eta,speed:job.speed,tokens:job.tokens});},200));};
const fileSafe=value=>String(value||'').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/,'').slice(0,100)||'boks';
// Video settings kept between videos and in named presets (the scene text and output are chosen per video).
const VIDEO_OPTION_KEYS=['mode','template','spectrum','color','aspect','resolution','fps','format','repeat','normalize'];
const pickVideoOptions=options=>Object.fromEntries(VIDEO_OPTION_KEYS.filter(key=>options?.[key]!==undefined).map(key=>[key,options[key]]));
const log=async(error,job='app')=>{try{await appendFile(appPaths.log,`${new Date().toISOString()} [${job}] ${error?.stack||error}\n${error?.cause?.stack||''}\n`);}catch{}};
const track=id=>{const row=findById(store.data.tracks,id,'곡');if(row.trashedAt)throw new Error('휴지통의 곡은 복원한 후 사용할 수 있습니다.');return row;};
let trashBusy=false;
// One library-wide lock serializes trash, playlist and move mutations.
async function withLibraryLock(busyMessage,action){if(trashBusy)throw new Error(busyMessage);trashBusy=true;try{return await action();}finally{trashBusy=false;notify();}}
async function updateTrash(action,ids){return withLibraryLock('휴지통 처리 중입니다. 잠시 후 다시 시도하세요.',()=>action(store,ids));}
// Development runs with their own data folder (BOKS_DATA_DIR, used by tests) never clean the real render
// cache: they use BOKS_RENDER_CACHE_DIR or a folder inside their data folder.
// Videos keep nothing after they are made (every intermediate file lives in the job's work folder). Render
// caches of earlier versions are leftovers: removed at startup and by 캐시 비우기. Development runs with
// their own data folder (tests) only look inside that folder, never at the real engine folder.
const renderCacheDirectories=()=>{
  if(!app.isPackaged&&process.env.BOKS_RENDER_CACHE_DIR)return [path.resolve(process.env.BOKS_RENDER_CACHE_DIR)];
  if(!app.isPackaged&&process.env.BOKS_DATA_DIR)return [path.join(app.getPath('userData'),'render-cache')];
  const root=store.data.settings.modelPath;return [path.join(root,'cache','video-render'),path.join(root,'runtimes','hyperframes'),path.join(app.getPath('userData'),'render-cache')];
};
const videoJobsDirectory=()=>path.join(app.getPath('userData'),'video-jobs');
const activeJobIds=()=>store.data.jobs.filter(job=>['queued','running'].includes(job.status)).map(job=>job.id);
/** Sizes of what 캐시 비우기 removes: old render caches, video work folders of ended jobs, separated vocals. */
async function cacheUsage(){
  const active=new Set(activeJobIds());let work=0;
  for(const name of await readdir(videoJobsDirectory()).catch(()=>[]))if(!active.has(name))work+=await folderSize(path.join(videoJobsDirectory(),name));
  let render=0;for(const dir of renderCacheDirectories())render+=await folderSize(dir);
  return {render,work,vocal:await folderSize(vocalCache().root),analysisRunning:store.data.jobs.some(job=>['queued','running'].includes(job.status)&&['lyricsAlign','video'].includes(job.type))};
}
async function clearCaches(){
  const before=await cacheUsage();
  for(const dir of renderCacheDirectories())await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(error=>log(error));
  await sweepVideoJobFolders(videoJobsDirectory(),activeJobIds()).catch(error=>log(error));
  // Separated vocals are in use while a lyric analysis or a video job runs.
  if(!before.analysisRunning){await rm(vocalCache().root,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(error=>log(error));await store.mutate(data=>{for(const row of data.tracks)delete row.vocalCacheKeys;});}
  const after=await cacheUsage();notify();
  return {freed:Math.max(0,before.render+before.work+before.vocal-after.render-after.work-after.vocal),vocalKept:before.analysisRunning,...after};
}
/**
 * Permanent deletion of songs leaves nothing behind: besides the song files and job folders removed
 * by purgeTrash, the separated vocals made from the songs go too.
 */
async function purgeTracksCompletely(ids){
  const selected=new Set(Array.isArray(ids)?ids:[]),candidates=store.data.tracks.filter(row=>row.trashedAt&&row.kind!=='stem'&&selected.has(row.id));
  const vocalKeys=new Map();
  for(const row of candidates){
    const keys=new Set(row.vocalCacheKeys||[]);
    // Songs analysed before keys were recorded: the key of the current separation model.
    try{keys.add(await vocalCache().key(row.audioPath,store.data.settings.stemModel||''));}catch{}
    vocalKeys.set(row.id,[...keys]);
  }
  const result=await updateTrash(purgeTrash,ids);
  for(const item of result.skippedFiles||[])log(`영구 삭제: 남겨 둔 파일 ${item.file} · ${item.reason}`);
  const deleted=new Set(result.deletedIds||[]),survivors=new Set(store.data.tracks.flatMap(row=>row.vocalCacheKeys||[]));
  await removeVocalCache(vocalCache().root,[...vocalKeys].filter(([id])=>deleted.has(id)).flatMap(([,keys])=>keys).filter(key=>!survivors.has(key))).catch(error=>log(error));
  notify();return result;
}
/**
 * Deletes a finished video: always its list entry, its job records and work folders; the video file
 * too when the user chose it — moved to the system trash, so a mistake can be undone there.
 */
async function deleteVideo(p){
  const row=findById(store.data.videos,p?.id,'영상');
  if(typeof p.removeFile!=='boolean')throw new Error('영상 파일까지 삭제할지 선택하세요.');
  if(store.data.jobs.some(job=>job.type==='video'&&['queued','running'].includes(job.status)&&job.request?.outputPath===row.videoPath))throw new Error('이 영상을 만드는 작업이 끝난 후 삭제하세요.');
  if(p.removeFile){
    let info=null;try{info=await stat(row.videoPath);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(info&&!info.isFile())throw new Error('영상 경로가 일반 파일이 아니어서 삭제하지 않았습니다.');
    if(info){try{await shell.trashItem(row.videoPath);}catch(error){throw new Error('영상 파일을 휴지통으로 옮기지 못했습니다: '+error.message);}}
  }
  const jobs=store.data.jobs.filter(job=>job.type==='video'&&(job.result?.videoId===row.id||(job.request?.outputPath&&job.request.outputPath===row.videoPath)));
  for(const job of jobs)await rm(path.join(app.getPath('userData'),'video-jobs',job.id),{recursive:true,force:true}).catch(error=>log(error));
  const removing=new Set(jobs.map(job=>job.id));
  await store.mutate(data=>{data.videos=data.videos.filter(item=>item.id!==row.id);data.jobs=data.jobs.filter(job=>!removing.has(job.id));});
  notify();return {deleted:true,fileRemoved:p.removeFile};
}
async function resolveFfmpeg(){
  if(store.data.settings.ffmpegPath)return store.data.settings.ffmpegPath;
  if(process.platform!=='win32')return '';
  for(const profile of ['stems-cuda','stems-cpu']){const candidate=path.join(store.data.settings.modelPath,'runtimes',profile,profile,'Scripts','ffmpeg.exe');try{if((await stat(candidate)).isFile())return candidate;}catch{}}
  return '';
}
// A deleted project is only a storage owner (its folder keeps the trashed tracks' files):
// file lookups use projectRecord, user actions use project.
const projectRecord=id=>findById(store.data.projects,id,'Project');
const project=id=>{const row=projectRecord(id);if(row.deletedAt)throw new Error('삭제된 프로젝트입니다. 다른 프로젝트를 선택하세요.');return row;};
// What a mastered song was made from (cover, imported or original), followed through re-mastering.
function originKind(row,depth=0){
  if(row?.kind!=='mastered')return row?.source==='import'?'import':row?.kind||'';
  if(row.originKind||depth>8)return row.originKind||'';
  return originKind(store.data.tracks.find(item=>item.id===row.masteringFromId),depth+1);
}
const media=(id,type='audio')=>`boks-media://track/${id}/${type}`;
const policySettings=()=>({...store.data.settings,installedModelIds:Object.keys(installs).filter(id=>installs[id]?.status==='installed')});
const options=()=>installationOptions(system,policySettings()).map(x=>{const active=path.basename(store.data.settings.backbonePath||'')===x.backbone;let status=installs[x.id]?.status||x.status;if(status==='installed'&&active&&engines.some(e=>e.status==='not-installed'))status='repair-needed';return {...x,active,status};});
// Timing of the current lyrics carried over to new lyrics (timing that belonged to older lyrics is dropped).
function timingAfterLyrics(t,lyrics,options){const current=t.lyricTiming?.cues?.length&&t.lyricTiming.lyricsHash===hashLyrics(t.lyrics||'')?t.lyricTiming:null;return {current,...(current?remapLyricTiming(current,lyrics,options):{timing:undefined,kept:0,changed:0,added:0,removed:0})};}
const visibleTrack=t=>({...t,...(()=>{const timing=lyricTimingState(t);return timing.state?{lyricState:timing.state,lyricReview:timing.review}:{};})(),...(()=>{if(t.kind==='stem'||!String(t.lyrics||'').trim())return {};const lines=lyricLines(t.lyrics);const support=lines.length?lyricAlignmentSupport({lines,duration:Number(t.duration)}):{supported:true};return support.supported?{}:{lyricAutoReason:support.reason};})(),...(t.kind==='stem'?{stemName:stemLabel(t.audioPath),stemMode:t.metadata?.stemMode||'two'}:{}),...(t.kind==='mastered'&&!t.originKind?{originKind:originKind(t)}:{}),audioUrl:media(t.id),artUrl:t.artPath?media(t.id,'art'):undefined});
const recommendationState=()=>{const result=installationRecommendation(system,policySettings());return {...result,installed:result.optionId===recommendedInstallation.optionId&&recommendedInstallation.installed};};
const snapshot=()=>({...store.data,host:{platform:process.platform,arch:process.arch},projects:store.data.projects.filter(row=>!row.deletedAt),presets:[...presets,...store.data.customPresets],videos:store.data.videos.map(row=>({...row,videoUrl:'boks-media://video/'+row.id})),tracks:store.data.tracks.filter(t=>!t.trashedAt).map(visibleTrack),trash:store.data.tracks.filter(t=>t.trashedAt).map(visibleTrack),jobs:store.data.jobs.map(({request,...j})=>({...j,projectId:request?.projectId,...(request?.trackId?{trackId:request.trackId}:{}),...(request?.playlistId?{playlistId:request.playlistId,trackCount:request.trackIds?.length||0,...(j.type==='video'?{videoOptions:pickVideoOptions(request.options),videoTitle:request.title}:{})}:{})})),system,engines,lyricInstallation,videoInstallation,localImage,installOptions:options(),installedEngines:installedEngineChoices(engines),installationRecommendation:recommendationState(),codexModels,codexError,codexStatus,codexUsage,codexAccess:codexBilling.pending?{state:'checking'}:codexBilling,claudeStatus,claudeUsage:claudeUsageView(),claudeModels,agents:agentState()});
// Codex counts as usable only after its login has been confirmed as a ChatGPT subscription.
const codexAgentStatus=()=>codexStatus.state!=='installed'?codexStatus:codexBilling.pending?{...codexStatus,state:'checking'}:{...codexStatus,usable:codexBilling.usable,...(codexBilling.message?{message:codexBilling.message}:{})};
let localImage={families:[],installed:[],engineInstalled:false,recommendedId:null,checked:false};
// Local image models are files on disk: they are checked on their own (in well under a second) so album art
// settings and the agent state never wait for the engine checks, whose Stem runtime check can take minutes.
let imageRefresh=0;
async function refreshLocalImage(){
  const generation=++imageRefresh,next=await localImageState(store.data.settings.modelPath,system).then(state=>({...state,checked:true}),error=>({...localImage,checked:true,error:error.message}));
  if(generation===imageRefresh){localImage=next;notify();}
  return localImage;
}
const agentState=()=>resolveAgents({settings:store.data.settings,codexStatus:codexAgentStatus(),claudeStatus,localImage:{ready:localImage.installed.includes(store.data.settings.localImageModel),checking:!localImage.checked}});
const agentUnavailable=id=>{const status=id==='claude'?claudeStatus:codexAgentStatus();return status.state==='installed'&&status.usable===false?status.message:`${id==='claude'?'Claude Code':'Codex'}가 설치되어 있지 않아 선택할 수 없습니다.`;};
const claudeUsageView=()=>{
  if(claudeStatus.usable===false)return {state:'unavailable',message:claudeStatus.message};
  const saved=store.data.claudeUsage;
  if(saved)return claudeUsageError?{...saved,message:claudeUsageError}:saved;
  return claudeUsageError?{state:'unavailable',message:claudeUsageError}:{state:'checking'};
};
async function refreshClaude(){
  if(quitting||shutdownStarted)return;
  if(claudeRefresh)return claudeRefresh;
  // A re-check keeps the last known status visible instead of flashing back to "checking".
  claudeRefresh=(async()=>{if(claudeStatus.state!=='installed'){claudeStatus={state:'checking'};notify();}claudeStatus=await inspectClaudeInstallation();notify();})();
  try{await claudeRefresh;}finally{claudeRefresh=null;}
  await refreshClaudeUsage();return {claudeStatus};
}
// Plan usage comes from the CLI's built-in /usage command, which runs no model turn.
async function refreshClaudeUsage(){
  if(quitting||shutdownStarted||claudeStatus.usable!==true)return;
  if(claudeUsageRefresh)return claudeUsageRefresh;
  claudeUsageRefresh=(async()=>{try{const usage=await readClaudeUsage();claudeUsageError='';await store.mutate(d=>{d.claudeUsage=usage;});}catch(error){claudeUsageError=error.message;await log(error);}notify();})();
  try{await claudeUsageRefresh;}finally{claudeUsageRefresh=null;}
}
async function refreshCodexBilling(){
  if(codexBillingRefresh)return codexBillingRefresh;
  codexBillingRefresh=(async()=>{
    let executable;
    try{executable=resolveCodexExecutable();}catch(error){codexBilling={usable:false,billing:'none',message:error.message};notify();return codexBilling;}
    codexBilling=await inspectCodexBilling(executable);notify();return codexBilling;
  })();
  try{return await codexBillingRefresh;}finally{codexBillingRefresh=null;}
}
// Every prompt re-checks the login right before it runs; nothing proceeds on metered billing.
async function assertSubscription(agent){
  if(agent==='claude'){
    claudeStatus=await inspectClaudeInstallation();notify();
    if(claudeStatus.state!=='installed')throw new Error(claudeStatus.state==='missing'?'Claude Code를 찾을 수 없습니다. 환경설정에서 AI 에이전트 상태를 확인하세요.':claudeStatus.message);
    if(claudeStatus.usable!==true)throw new Error(claudeStatus.message);
    return;
  }
  const billing=await refreshCodexBilling();
  if(!billing.usable)throw new Error(billing.message);
}
// Wait for in-flight installation checks so a request never picks an agent from stale state.
async function settledAgents(){await Promise.all([codexStatus.state==='checking'&&codexRefresh,claudeStatus.state==='checking'&&claudeRefresh,codexBilling.pending&&(codexBillingRefresh||refreshCodexBilling())].filter(Boolean).map(task=>task.catch(()=>{})));return agentState();}
// An event may carry only one plan window; keep the other from the previous report.
async function recordClaudeUsage(usage){try{await store.mutate(d=>{d.claudeUsage={...d.claudeUsage,...usage};});notify();}catch(error){await log(error);}}
async function refreshCodexUsage(){
  if(quitting||shutdownStarted)return;
  if(usageRefresh)return usageRefresh;
  usageRefresh=(async()=>{try{codexUsage=await readCodexUsage();}catch(error){codexUsage={state:'unavailable',message:error.message};}notify();})();
  try{return await usageRefresh;}finally{usageRefresh=null;}
}
async function refreshCodex(){
  if(quitting||shutdownStarted)return;
  if(codexRefresh)return codexRefresh;
  codexRefresh=(async()=>{
    codexStatus={state:'checking'};codexUsage={state:'checking'};notify();
    codexStatus=await inspectCodexInstallation();notify();
    if(quitting||shutdownStarted)return;
    if(codexStatus.state!=='installed'){codexError=codexStatus.message;codexUsage={state:'unavailable',message:codexError};notify();return;}
    await Promise.all([refreshCodexUsage(),(async()=>{try{codexModels=await listCodexModels();codexError='';}catch(error){codexError=error.message;}notify();})()]);
  })();
  try{await codexRefresh;return {codexStatus,codexUsage};}finally{codexRefresh=null;}
}
/**
 * Video templates are GPU canvas scenes encoded with WebCodecs (H.264) inside the app; FFmpeg (part of
 * the integrated installation) joins the music. Nothing else is installed for videos.
 */
async function videoRendererState(){
  const found=await resolveFfmpeg(),ffmpeg=!!found&&await stat(found).then(info=>info.isFile(),()=>false);
  return {available:ffmpeg,name:'GPU 캔버스 · WebCodecs',message:ffmpeg?'가사·연주곡 영상 렌더링 · GPU H.264 인코딩':'음악 결합에 필요한 FFmpeg가 없습니다. YuE2 모델 통합 설치에 포함됩니다.'};
}
// Engine checks can overlap (a cold Stem check takes minutes): only the latest one's results are kept.
let engineRefresh=0;
async function refreshEngines(){
  const generation=++engineRefresh,settings=store.data.settings;
  void refreshLocalImage();
  const nextEngines=await engineStates(settings,runner),nextInstalls=await readInstalls(settings.modelPath);
  const nextLyric=await inspectLyricRuntime({packageRoot:settings.modelPath}),nextVideo=await videoRendererState();
  const recommendation=installationRecommendation(system,policySettings());
  const option=installationOptions(system,policySettings()).find(item=>item.id===recommendation.optionId);
  const nextRecommended={optionId:recommendation.optionId,installed:nextLyric.ready&&await recommendedBundleInstalled({option,receipt:nextInstalls[recommendation.optionId],settings,runner})};
  if(generation!==engineRefresh)return;
  engines=nextEngines;installs=nextInstalls;lyricInstallation=nextLyric;videoInstallation=nextVideo;recommendedInstallation=nextRecommended;
  notify();
}
/** A failed, cancelled, dismissed or pruned job's folder (`<project>/jobs/<job>`) unless a song uses a file in it. */
async function removeJobFolder(job){
  const request=job.request||{},owner=store.data.projects.find(item=>item.id===(request.storageProjectId||request.projectId));
  if(!owner?.directory||!path.isAbsolute(owner.directory)||typeof job.id!=='string'||!/^[\w-]+$/.test(job.id))return;
  const dir=path.join(owner.directory,'jobs',job.id),inside=file=>typeof file==='string'&&path.resolve(file).toLowerCase().startsWith(path.resolve(dir).toLowerCase()+path.sep);
  if(store.data.tracks.some(row=>inside(row.audioPath)||inside(row.artPath)))return;
  await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
/**
 * 다시 실행: song jobs go through their own action again (its checks: songs in the trash, analyses already
 * running or nothing left to align, FFmpeg lookup); generation checks its project and engine; a video
 * keeps its file name only while no other video took it. The old record (and its folder) then goes.
 */
async function rerunJob(id){
  const job=store.data.jobs.find(item=>item.id===id);
  if(!job||!['interrupted','failed'].includes(job.status))throw new Error('다시 실행할 작업이 없습니다.');
  const request=job.request||{};let started;
  if(job.type==='lyricsAlign')started=await actions.alignLyrics({trackId:request.trackId});
  else if(job.type==='mastering')started=await actions.mastering({trackId:request.trackId,options:request.options});
  else if(job.type==='stems')started=await actions.stems({trackId:request.trackId,stemMode:request.stemMode});
  else if(job.type==='albumArt')started=await actions.albumArt({trackId:request.trackId});
  else if(job.type==='video'){
    const pending=store.data.jobs.some(item=>item!==job&&item.type==='video'&&['queued','running','needs-confirmation'].includes(item.status)&&item.request?.outputPath===request.outputPath);
    const taken=pending||store.data.videos.some(video=>path.resolve(video.videoPath).toLowerCase()===path.resolve(request.outputPath||'').toLowerCase()&&Date.parse(video.createdAt)>Date.parse(job.createdAt));
    if(taken||(!request.overwrite&&await stat(request.outputPath).then(()=>true,()=>false)))throw new Error('그 사이 같은 이름의 영상이 만들어졌습니다. ‘설정 바꿔 만들기’로 이름을 정해 다시 만드세요.');
    const ffmpegPath=await resolveFfmpeg();if(!ffmpegPath)throw new Error('영상 출력에 필요한 FFmpeg를 찾을 수 없습니다.');
    started=await queue.rerun(job.id,{ffmpegPath});return {jobId:started.id};
  }else{
    if(['generate','cover'].includes(job.type)){project(request.projectId);const engine=engines.find(e=>e.id===(job.type==='cover'?'cover':'music'));if(!engine?.available)throw new Error(engine?.message||'엔진 설치가 필요합니다.');}
    // Installations run one at a time and only while nothing else runs (as when started from the settings).
    if(['install','imageInstall'].includes(job.type)&&(queue.processing||store.data.jobs.some(item=>['install','imageInstall'].includes(item.type)&&['queued','running'].includes(item.status))))throw new Error('진행 중인 작업이 끝난 후 설치를 다시 실행하세요.');
    started=await queue.rerun(job.id);await removeJobFolder(job).catch(error=>log(error));return {jobId:started.id};
  }
  await queue.dismiss(job.id);await removeJobFolder(job).catch(error=>log(error));
  return {jobId:(Array.isArray(started)?started[0]:started)?.id||started?.jobId};
}
// Generated audio is 48 kHz 24-bit stereo WAV (about 288 kB per second); job files add a little.
const songBytes=seconds=>Math.ceil(seconds*288000*1.3);
// The latest songs made in the app (any project; not imported), so AI lyrics avoid reusing their images and title words.
function recentSongs(exclude=''){
  const own=exclude?normalizeLyrics(exclude).lyricsHash:'';
  return store.data.tracks.filter(t=>!t.trashedAt&&t.kind!=='stem'&&t.source!=='import'&&!t.instrumental&&typeof t.lyrics==='string'&&t.lyrics.trim()&&(!exclude||normalizeLyrics(t.lyrics).lyricsHash!==own))
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).filter((t,i,rows)=>rows.findIndex(r=>r.title===t.title)===i).slice(0,8)
    .map(t=>({title:t.title,excerpt:[...new Set(t.lyrics.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!/^\[.*\]$/.test(line)))].join(' / ').slice(0,360)}));
}
async function workdir(projectId,jobId){const p=projectRecord(projectId);const dir=path.join(p.directory,'jobs',jobId);await ensureSpace(dir,256*1024*1024);return dir;}
async function prepareAudio({audioPath,projectId,title,...metadata},{signal}={}){
  const s=await stat(audioPath);if(!s.isFile()||s.size<44)throw new Error('올바른 오디오 파일이 아닙니다.');
  const parsed=await parseFile(audioPath,{duration:true});
  if(!parsed.format.duration||!parsed.format.codec)throw new Error('재생 가능한 오디오 데이터를 확인하지 못했습니다.');
  const row={id:id(),projectId,title,createdAt:new Date().toISOString(),audioPath,duration:parsed.format.duration,...metadata};
  if(signal?.aborted)throw new Error('작업이 취소되었습니다.');
  return row;
}
async function addAudio(input,options){
  const row=await prepareAudio(input,options);await store.mutate(d=>d.tracks.push(row));notify();return row;
}
// A vocal stem the user already extracted, newest first, whose file still exists. A mastered song keeps
// its source's timeline (mastering verifies the length within 0.1 s), so the source's vocal stem serves it too.
async function existingVocalStem(t){
  for(let row=t,depth=0;row&&depth<8;row=row.kind==='mastered'?store.data.tracks.find(item=>item.id===row.masteringFromId):null,depth++){
    if(row!==t&&!(Math.abs((Number(row.duration)||0)-(Number(t.duration)||0))<=.1))break;
    const stems=store.data.tracks.filter(item=>!item.trashedAt&&item.kind==='stem'&&item.parentId===row.id&&stemLabel(item.audioPath)==='Vocal').sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    for(const stem of stems){try{if((await stat(stem.audioPath)).isFile())return stem;}catch{}}
  }
  return null;
}
async function analyzeTrackTiming(t,{settings,dir,signal,onProgress,jobId}){
    const lyrics=t.lyrics||'';
    const sourceDuration=(await parseFile(t.audioPath,{duration:true})).format.duration;
    const normalized=normalizeLyrics(lyrics);
    if(!normalized.lines.length)throw new Error('가사를 먼저 입력하세요.');
    // Language and length limits live with the alignment engines (lyric-alignment.mjs).
    const unsupported=lyricAlignmentSupport({lines:normalized.lines,duration:sourceDuration}).reason;
    if(unsupported){
      const old=t.lyricTiming;
      const cues=normalized.lines.map(line=>({...line,start:null,end:null,status:'unmatched',reasons:[unsupported]}));
      const timing=preserveManualStarts({lyricsHash:normalized.lyricsHash,duration:sourceDuration,cues,automation:{version:2,timingMode:'line-starts',needsConfirmation:cues.map(cue=>cue.lineId),message:unsupported},analyzedAt:new Date().toISOString()},old);
      try{signal.throwIfAborted();await store.mutate(()=>{t.lyricTiming=timing;});signal.throwIfAborted();}catch(error){t.lyricTiming=old;await store.save();throw error;}return timing;
    }
    let audioPath=t.audioPath;
    const temporaryStem=path.join(dir,'analysis-vocals');
    try{
    const vocal=await existingVocalStem(t);
    if(vocal){onProgress({stage:'추출해 둔 보컬 Stem으로 가사 분석 준비 중'});audioPath=vocal.audioPath;}
    else if(settings.stemPython){
      // Separate once per song: the vocal is kept in the cache for later re-analysis and video retries.
      const cacheKey=await vocalCache().key(t.audioPath,settings.stemModel||'');
      // Remembered on the song so its separated vocal is removed when the song is permanently deleted.
      t.vocalCacheKeys=[...new Set([...(t.vocalCacheKeys||[]),cacheKey])];
      const cached=await vocalCache().get(cacheKey);
      if(cached){onProgress({stage:'저장된 보컬로 가사 분석 준비 중'});audioPath=cached;}
      else{
        const stemDir=temporaryStem;await mkdir(stemDir,{recursive:true});
        onProgress({stage:'가사 분석용 보컬 분리 중'});
        const separated=await runEngine({operation:'stems',stemMode:'two',singleStem:'Vocals',audioPath:t.audioPath,outputDir:stemDir,settings:settings},{runner,signal,onProgress:event=>onProgress({...event,stage:'가사 분석용 보컬 · '+event.stage}),log:message=>log(message,jobId)});
        const separatedVocal=separated.stems.find(file=>stemLabel(file)==='Vocal');if(!separatedVocal)throw new Error('가사 분석에 사용할 보컬 파일이 없습니다.');
        if(!inside(await realpath(stemDir),await realpath(separatedVocal)))throw new Error('가사 분석용 보컬 파일이 작업 폴더 밖에 있습니다.');
        signal.throwIfAborted();audioPath=await vocalCache().put(cacheKey,separatedVocal);
      }
    }
    const timing=preserveManualStarts(await alignTrackLyrics({audioPath,lyrics,previousTiming:t.lyricTiming,duration:sourceDuration,outputDir:dir,packageRoot:settings.modelPath,engineDirectory:path.dirname(runner)},{signal,onProgress,log:message=>log(message,jobId)}),t.lyricTiming);
    if(signal.aborted)throw new Error('작업이 취소되었습니다.');
    if(hashLyrics(t.lyrics||'')!==timing.lyricsHash)throw new Error('분석 중 가사가 변경되었습니다. 다시 분석하세요.');
    const previous=t.lyricTiming;
    try{await store.mutate(()=>{t.lyricTiming=timing;});signal.throwIfAborted();}catch(error){t.lyricTiming=previous;await store.save();throw error;}
    return timing;
    }finally{await rm(temporaryStem,{recursive:true,force:true}).catch(error=>log(error,jobId));}
}
async function runJob(job,signal,onProgress){
  const request=job.request;
  if(request.operation==='video'){
    let result,row;
    try{
      if(await realpath(request.directory)!==request.directory)throw Error('영상 저장 폴더가 변경되었습니다. 다시 선택하세요.');
      let prepared=await videoPreflight(request.trackIds.map(track),request.options.mode);
      if(!prepared.ready)throw Error('가사가 없는 곡에 가사를 입력하세요.');
      const alignmentFailures=await analyzeLyricBatch(prepared.needsAlignment,{signal,analyze:async(trackId,index)=>{
        signal.throwIfAborted();const t=track(trackId),dir=path.join(app.getPath('userData'),'video-jobs',job.id,'alignment',t.id);await mkdir(dir,{recursive:true});
        await analyzeTrackTiming(t,{settings:request.settings||store.data.settings,dir,signal,jobId:job.id,onProgress:event=>onProgress({...event,stage:`가사 자동 동기화 ${index+1}/${prepared.needsAlignment.length} · ${t.title} · ${event.stage||''}`})});
      },onFailure:async failure=>{failure.title=track(failure.trackId).title;await log(`가사 분석 실패 · ${failure.title}: ${failure.message}`,job.id);}});
      prepared=await videoPreflight(request.trackIds.map(track),request.options.mode);
      if(!prepared.renderReady)return {awaitingConfirmation:true,trackIds:[...new Set([...prepared.needsConfirmation,...prepared.needsAlignment])],alignmentFailures,playlistId:request.playlistId};
      result=await renderPlaylistVideo({tracks:prepared.tracks,options:request.options,outputPath:request.outputPath,overwrite:request.overwrite===true,ffmpegPath:request.ffmpegPath,backgroundPath:request.backgroundPath,workDir:path.join(app.getPath('userData'),'video-jobs',job.id)},{signal,onProgress,log:message=>log(message,job.id)});
      // The file is written: from here the job finishes even if a cancel arrives late.
      row={id:id(),playlistId:request.playlistId,title:request.title,createdAt:new Date().toISOString(),...result};
      // An overwritten file replaces the earlier video's entry and its job records.
      const replaced=request.overwrite?store.data.videos.filter(item=>path.resolve(item.videoPath).toLowerCase()===path.resolve(result.videoPath).toLowerCase()):[];
      const replacedJobs=new Set(store.data.jobs.filter(item=>item.type==='video'&&item.id!==job.id&&replaced.some(video=>item.result?.videoId===video.id)).map(item=>item.id));
      await store.mutate(d=>{d.videos=d.videos.filter(item=>!replaced.includes(item));d.jobs=d.jobs.filter(item=>!replacedJobs.has(item.id));d.videos.push(row);});
      notify();return {videoId:row.id,committed:true};
    }catch(error){
      if(row){store.data.videos=store.data.videos.filter(item=>item.id!==row.id);try{await store.save();}catch(rollbackError){await log(rollbackError,job.id);throw error;}}
      if(result?.videoPath===request.outputPath&&!request.overwrite)await rm(result.videoPath,{force:true}).catch(cleanup=>log(cleanup,job.id));
      throw error;
    }finally{
      // Lyric analysis and render work for this job is no longer needed once it ends (done, paused, failed or cancelled).
      await rm(path.join(app.getPath('userData'),'video-jobs',job.id),{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(cleanup=>log(cleanup,job.id));
    }
  }
  if(request.operation==='install'){
    const option=installationOptions(await inspectSystem(request.settings.modelPath),request.settings).find(x=>x.id===request.optionId);
    const receipt=installs[request.optionId];
    const existing=await recommendedBundleInstalled({option,receipt,settings:request.settings,runner});
    const result=existing?receipt.result:await installRuntime({option,settings:request.settings,engineDirectory:path.dirname(runner),signal,onProgress,log:message=>log(message,job.id)});
    await ensureLyricRuntime({packageRoot:request.settings.modelPath,engineDirectory:path.dirname(runner)},{signal,onProgress,log:message=>log(message,job.id)});
    await store.mutate(d=>{for(const key of ['runtimePlatform','runtimeArch','musicBackend','nativeBackend','nativeExecutable','audioCppModelRoot','backbonePath','vaePath','transcriberPath','stemPython','stemDevice','stemModel','ffmpegPath','engineSelection'])if(result[key])d.settings[key]=result[key];d.settings.installedModelId=request.optionId;});
    clearEngineProbes();await refreshEngines();return result;
  }
  if(request.operation==='imageInstall'){
    const result=await installImageVariant({root:store.data.settings.modelPath,system,variantId:request.variantId,signal,onProgress,log:message=>log(message,job.id)});
    // The first installed model becomes the selected one.
    if(!store.data.settings.localImageModel)await store.mutate(d=>{d.settings.localImageModel=result.variantId;});
    await refreshEngines();return result;
  }
  const dir=await workdir(request.storageProjectId||request.projectId,job.id);
  if(request.operation==='lyricsAlign'){
    const t=track(request.trackId);const timing=await analyzeTrackTiming(t,{settings:request.settings,dir,signal,onProgress,jobId:job.id});
    return {trackId:t.id,lyricTiming:true,...(timing.automation.needsConfirmation.length?{awaitingConfirmation:true,trackIds:[t.id]}:{})};
  }
  if(request.operation==='mastering'){
    const source=track(request.trackId);let row,committed=false;
    try{
      const result=await masterAudio({audioPath:source.audioPath,outputDir:dir,options:request.options,ffmpegPath:request.settings.ffmpegPath},{signal,onProgress,log:message=>log(message,job.id)});
      if(!inside(await realpath(dir),await realpath(result.audioPath)))throw new Error('마스터링 결과 경로가 잘못되었습니다.');
      let artPath;
      if(source.artPath){
        artPath=path.join(dir,'album-art'+path.extname(source.artPath));
        try{await copyFile(source.artPath,artPath,fsConstants.COPYFILE_EXCL);}catch(error){if(error.code!=='ENOENT')throw error;artPath=undefined;await log('원곡의 앨범아트 파일을 찾을 수 없어 음악만 저장합니다.',job.id);}
      }
      row=await prepareAudio({audioPath:result.audioPath,projectId:request.projectId,title:source.title,kind:'mastered',originKind:originKind(source),masteringFromId:source.id,masteringSourceTitle:source.title,lyrics:source.lyrics||'',style:source.style||'',instrumental:!!source.instrumental,presetId:source.presetId,...(artPath?{artPath}:{}),metadata:result.metadata},{signal});
      await store.mutate(d=>d.tracks.push(row));
      if(signal.aborted)throw new Error('작업이 취소되었습니다.');
      committed=true;notify();return {trackId:row.id};
    }catch(error){
      if(!committed){
        if(row){
          store.data.tracks=store.data.tracks.filter(item=>item.id!==row.id);
          // Persist rollback before removing files that a previous save may reference.
          try{await store.save();}catch(rollbackError){await log(rollbackError,job.id);throw error;}
        }
        // This fresh directory is assigned to this job, never the source track's directory.
        const expected=path.resolve(projectRecord(request.projectId).directory,'jobs',job.id);
        if(path.resolve(dir)===expected&&inside(path.resolve(projectRecord(request.projectId).directory),await realpath(dir)))await rm(dir,{recursive:true,force:true}).catch(cleanup=>log(cleanup,job.id));
      }
      throw error;
    }
  }
  if(request.operation==='youtubeExtract')return youtubeImporter.extract(request.url,{signal,onProgress,log:message=>log(message,job.id)});
  if(request.operation==='youtubeImport'){
    const origin=findById(store.data.jobs,request.extractionJobId,'추출 결과');
    const result=await youtubeImporter.finalize(origin.result.sessionId,request.format,dir,{subtitle:request.subtitle,signal,onProgress,log:message=>log(message,job.id)});
    if(!inside(await realpath(dir),await realpath(result.audioPath)))throw new Error('가져온 음악의 결과 경로가 잘못되었습니다.');
    const row=await prepareAudio({audioPath:result.audioPath,projectId:request.projectId,title:result.title,kind:'original',source:'import',importedAt:new Date().toISOString(),lyrics:'',style:'가져온 음악',metadata:result.metadata},{signal});
    // The uploader's subtitle becomes the lyrics with confirmed line starts, as an uploaded LRC/SRT file would.
    let subtitle;
    if(result.subtitle){
      try{
        const plan=planLyricTimingImport({entries:result.subtitle.entries,lyrics:'',duration:row.duration}),now=new Date().toISOString();
        row.lyrics=plan.lyrics;
        row.lyricTiming={lyricsHash:normalizeLyrics(plan.lyrics).lyricsHash,duration:row.duration,cues:plan.cues,automation:{version:2,timingMode:'line-starts',needsConfirmation:[]},source:{format:result.subtitle.format,fileName:`YouTube 자막 · ${result.subtitle.label}`,importedAt:now},analyzedAt:now,reviewedAt:now};
        subtitle={label:result.subtitle.label,lines:plan.lines.length};
      }catch(error){subtitle={label:result.subtitle.label,skipped:error.message};await log(`YouTube subtitle not applied: ${error.message}`,job.id);}
    }
    await commitImportedTrack(store,row,origin,signal);notify();
    // A playlist deleted during the extraction no longer receives the song (the project does).
    if(request.importPlaylistId){if(store.data.playlists.some(item=>item.id===request.importPlaylistId)){await addToPlaylist(store,{playlistId:request.importPlaylistId,ids:[row.id]});notify();}else await log('가져온 음악을 담을 플레이리스트가 삭제되어 프로젝트에만 저장했습니다.',job.id);}
    await youtubeImporter.discard(origin.result.sessionId).catch(error=>log(error,job.id));
    return {trackId:row.id,...(subtitle?{subtitle}:{})};
  }
  if(request.operation==='lyrics'&&request.agent==='claude'){
    await assertSubscription('claude');
    try{return await generateClaudeLyrics({prompt:request.prompt,lyrics:request.lyrics,currentTitle:request.currentTitle,style:request.style,mode:request.mode,targetSeconds:request.targetSeconds,recentSongs:request.recentSongs||[],bannedWords:request.settings.lyricBannedWords||[],model:request.settings.claudeModel,reasoningEffort:request.settings.claudeReasoning,cwd:dir,signal,onProgress,onUsage:usage=>void recordClaudeUsage(usage)});}
    finally{if(!quitting)void refreshClaudeUsage();}
  }
  if(request.operation==='lyrics')await assertSubscription('codex');
  if(request.operation==='lyrics'){try{return await generateLyrics({prompt:request.prompt,lyrics:request.lyrics,currentTitle:request.currentTitle,style:request.style,mode:request.mode,targetSeconds:request.targetSeconds,recentSongs:request.recentSongs||[],bannedWords:request.settings.lyricBannedWords||[],model:request.settings.textModel,reasoningEffort:request.settings.textReasoning,cwd:dir,signal,onProgress});}finally{if(!quitting)void refreshCodexUsage();}}
  if(request.operation==='instrumentalPlan'){
    await assertSubscription(request.agent);
    const plan=request.agent==='claude'
      ?await planClaudeInstrumentals({prompt:request.prompt,count:request.count,durationSeconds:request.instrumentalDuration,style:request.style,bannedWords:request.settings.lyricBannedWords||[],model:request.settings.claudeModel,reasoningEffort:request.settings.claudeReasoning,cwd:dir,signal,onProgress,onUsage:usage=>void recordClaudeUsage(usage)})
      :await planCodexInstrumentals({prompt:request.prompt,count:request.count,durationSeconds:request.instrumentalDuration,style:request.style,bannedWords:request.settings.lyricBannedWords||[],model:request.settings.textModel,reasoningEffort:request.settings.textReasoning,cwd:dir,signal,onProgress});
    if(signal.aborted)throw new Error('작업이 취소되었습니다.');
    onProgress({stage:`${plan.length}곡을 생성 대기열에 등록하는 중`});
    const jobs=await actions.generate({projectId:request.projectId,instrumental:true,instrumentalDuration:request.instrumentalDuration,tracks:plan});
    return {planned:plan.map(({title,style})=>({title,style})),jobIds:jobs.map(item=>item.id)};
  }
  if(request.operation==='albumArt'){
    const agents=await settledAgents();if(!agents.imageAgent)throw new Error(agents.imageReason);
    const t=track(request.trackId);
    // The replaced album art file is removed unless another song uses it (no leftover images).
    const previous=t.artPath;
    if(request.settings.imageEngine==='local'){const artPath=await localArt(t,request.settings,{dir,signal,onProgress,jobId:job.id});await store.mutate(()=>{t.artPath=artPath;});await releaseFile(store,t,previous).catch(error=>log(error,job.id));return {trackId:t.id};}
    await assertSubscription('codex');
    const artPath=await generateArt({...t,model:request.settings.imageModel,reasoningEffort:request.settings.imageReasoning,cwd:dir,signal,onProgress});
    if(signal.aborted)throw new Error('작업이 취소되었습니다.');
    await store.mutate(()=>{t.artPath=artPath;});await releaseFile(store,t,previous).catch(error=>log(error,job.id));return {trackId:t.id};
  }
  const result=await runEngine({...request,outputDir:dir},{runner,signal,onProgress,log:message=>log(message,job.id)});
  if(signal.aborted)throw new Error('작업이 취소되었습니다.');
  // Result paths must be owned by this specific job, including symlink resolution.
  for(const file of result.stems||[result.audioPath])if(!inside(await realpath(dir),await realpath(file)))throw new Error('엔진이 작업 폴더 밖의 결과를 반환했습니다.');
  if(request.operation==='stems'){
    const source=track(request.trackId);const rows=[];
    for(const audioPath of result.stems)rows.push(await addAudio({audioPath,projectId:source.projectId,title:`${source.title} · ${path.basename(audioPath,path.extname(audioPath))}`,kind:'stem',...(source.storageProjectId?{storageProjectId:source.storageProjectId}:{}),parentId:source.id,stemBatchId:job.id,style:source.style,metadata:result.metadata}));
    return {trackIds:rows.map(r=>r.id)};
  }
  const row=await registerFinalTrack(request,result,{addAudio,signal});
  // Without an image agent the setting is shown as unavailable, so generation skips it quietly.
  if(request.settings.autoAlbumArt&&!signal.aborted&&(await settledAgents()).imageAgent){
    try{onProgress({stage:'앨범아트 생성 중'});let artPath;if(request.settings.imageEngine==='local')artPath=await localArt(row,request.settings,{dir,signal,onProgress,jobId:job.id,prompt:request.artPrompt});else{await assertSubscription('codex');artPath=await generateArt({...row,model:request.settings.imageModel,reasoningEffort:request.settings.imageReasoning,cwd:dir,signal,onProgress});}if(!signal.aborted)await store.mutate(()=>{row.artPath=artPath;});}
    catch(e){await log(e,job.id);row.artError=e.message;}
  }
  return {trackId:row.id};
}
// Local album art: the active agent writes the description (on its subscription login), then the
// installed local model renders it on this PC.
async function localArt(t,settings,{dir,signal,onProgress,jobId,prompt:planned}){
  // A description planned together with the track (AI instrumental planning) needs no further agent call.
  let prompt=planned;
  if(!prompt){
  const agent=(await settledAgents()).active;if(!agent)throw new Error('앨범아트 설명문을 쓸 AI 에이전트(Claude Code 또는 Codex)가 필요합니다.');
  await assertSubscription(agent);
  onProgress({stage:`${agent==='claude'?'Claude':'Codex'}가 앨범아트 설명문을 쓰는 중`});
  const write=agent==='claude'?writeClaudeArtPrompt:writeCodexArtPrompt;
  prompt=await write({title:t.title,lyrics:t.lyrics||'',style:t.style||'',model:agent==='claude'?settings.claudeModel:settings.imageModel,reasoningEffort:agent==='claude'?settings.claudeReasoning:settings.imageReasoning,cwd:dir,signal,onProgress:event=>onProgress({...event,stage:`앨범아트 설명문 · ${event.stage||''}`})});
  }
  await log(`앨범아트 설명문: ${prompt}`,jobId);
  let rendered;
  try{rendered=await generateLocalImage({root:store.data.settings.modelPath,system,variantId:settings.localImageModel,prompt,output:path.join(dir,`album-art-${id()}.png`),signal,onProgress,log:message=>log(message,jobId)});}
  catch(error){await refreshEngines().catch(()=>{});throw error;}// a removed corrupt file shows as not installed
  const {output,seconds}=rendered;
  await log(`로컬 앨범아트 생성 ${seconds}초`,jobId);
  return output;
}
async function pickAudio(){const r=await dialog.showOpenDialog(window,{title:'음악 파일 선택',properties:['openFile'],filters:[{name:'Audio',extensions:['wav','flac','mp3','m4a','ogg']} ]});return r.canceled?null:r.filePaths[0];}
async function copyManaged(source,directory){const s=await stat(source);await ensureSpace(directory,s.size);const dest=path.join(directory,id()+path.extname(source).toLowerCase());await copyFile(source,dest);return dest;}
async function saveSettings(payload){
  const next={...store.data.settings,...validateCodexSettings(store.data.settings,payload,codexModels),...validateClaudeSettings(store.data.settings,payload)};
  if(next.agentProvider!==store.data.settings.agentProvider){
    const agents=await settledAgents();
    if(!agentProviders.includes(next.agentProvider))throw new Error('AI 에이전트는 Claude 또는 Codex 중에서 선택하세요.');
    if(!agents.available[next.agentProvider])throw new Error(agentUnavailable(next.agentProvider));
    next.agentChoiceConfirmed=true;
  }
  if(typeof payload.projectPath==='string')next.projectPath=payload.projectPath.trim();
  if(typeof payload.autoAlbumArt==='boolean')next.autoAlbumArt=payload.autoAlbumArt;
  if(payload.imageEngine!==undefined){if(!['agent','local'].includes(payload.imageEngine))throw new Error('이미지 생성 엔진은 로컬 모델 또는 에이전트 중에서 선택하세요.');next.imageEngine=payload.imageEngine;}
  if(payload.localImageModel!==undefined&&payload.localImageModel!==store.data.settings.localImageModel){if(!localImage.checked||!localImage.installed.includes(payload.localImageModel))await refreshLocalImage();if(!localImage.installed.includes(payload.localImageModel))throw new Error('설치된 로컬 이미지 모델만 선택할 수 있습니다.');next.localImageModel=payload.localImageModel;}
  if(payload.lyricBannedWords!==undefined){if(!Array.isArray(payload.lyricBannedWords))throw new Error('가사 금지어 목록이 올바르지 않습니다.');const words=cleanBannedWords(payload.lyricBannedWords);if(words.length>200)throw new Error('가사 금지어는 200개까지 등록할 수 있습니다.');if(words.some(word=>word.length>30))throw new Error('가사 금지어는 한 단어에 30자까지 입력할 수 있습니다.');next.lyricBannedWords=words;}
  if(payload.defaultCount!==undefined){const n=Number(payload.defaultCount);if(!Number.isInteger(n)||n<1)throw new Error('생성 개수는 1곡 이상으로 입력하세요.');next.defaultCount=n;}
  if(payload.engineSelection){for(const [role,id] of Object.entries(payload.engineSelection)){const match=installedEngineChoices(engines).find(e=>e.role===role&&e.id===id);if(!match)throw new Error('등록되지 않은 엔진입니다.');if(id!==next.engineSelection?.[role]&&!match.available)throw new Error(match.reason);}next.engineSelection={...next.engineSelection,...payload.engineSelection};}
  for(const key of ['projectPath','modelPath']){if(!path.isAbsolute(next[key]))throw new Error('저장 위치는 절대 경로로 입력하세요.');await ensureSpace(next[key],0);}
  // Running jobs use the settings copied when they were queued; engine locations and choices wait for them.
  if(queue.processing&&(next.modelPath!==store.data.settings.modelPath||JSON.stringify(next.engineSelection||{})!==JSON.stringify(store.data.settings.engineSelection||{})))throw new Error('진행 중인 작업이 끝난 후 모델 저장 위치나 사용할 엔진을 바꾸세요. 다른 설정은 지금 저장할 수 있습니다.');
  await store.mutate(d=>{d.settings=next;});void refreshEngines().catch(error=>log(error));return next;
}
const playlistAction=(action,payload)=>withLibraryLock('목록 처리 중입니다. 잠시 후 다시 시도하세요.',()=>action(store,payload));
const actions={
  getVideoTemplates:async()=>readVideoTemplates(),
  getVideoPreflight:async p=>{const list=findById(store.data.playlists,p.playlistId,'재생목록');const rows=list.trackIds.map(id=>store.data.tracks.find(t=>t.id===id&&!t.trashedAt&&t.kind!=='stem')).filter(Boolean);const result=await videoPreflight(rows,p.mode);return {...result,tracks:result.tracks.map(({audioPath,artPath,...row})=>row)};},
  revealVideo:async p=>{const row=findById(store.data.videos,p.id,'영상');try{if(!(await stat(row.videoPath)).isFile())throw Error();}catch{throw new Error('영상 파일을 찾을 수 없습니다. 이동하거나 삭제했을 수 있습니다.');}shell.showItemInFolder(row.videoPath);return {revealed:true};},
  videoDestination:async()=>{const result=await dialog.showOpenDialog(window,{title:'영상 저장 폴더 선택',...(store.data.settings.videoDirectory?{defaultPath:store.data.settings.videoDirectory}:{}),properties:['openDirectory','createDirectory']});if(result.canceled||!result.filePaths?.[0])return {cancelled:true};const directory=await realpath(result.filePaths[0]);if(!(await stat(directory)).isDirectory())throw Error('폴더를 선택하세요.');videoDirectories.add(directory);return {directory};},
  selectVideoBackground:async()=>{const result=await dialog.showOpenDialog(window,{title:'영상 배경 사진 선택',properties:['openFile'],filters:[{name:'Image',extensions:['png','jpg','jpeg','webp']} ]});if(result.canceled||!result.filePaths?.[0])return {cancelled:true};const file=await realpath(result.filePaths[0]);if(!(await stat(file)).isFile()||nativeImage.createFromPath(file).isEmpty())throw Error('읽을 수 있는 사진을 선택하세요.');const key=id();videoBackgrounds.set(key,file);return {path:file,url:`boks-media://video-background/${key}`};},
  renderPlaylistVideo:async p=>{
    // The scene shows the video title at the top; the brand line defaults to the saved one.
    const opts=validateVideoOptions({...p.options,playlistTitle:typeof p.title==='string'?p.title:undefined,brand:p.options?.brand??store.data.settings.videoBrand});if(p.options?.codec&&p.options.codec!=='h264')throw Error('H.264 코덱만 지원합니다.');
    const title=requiredString(p.title,'영상 이름',180),list=findById(store.data.playlists,p.playlistId,'재생목록');
    // A folder chosen in the dialog, or the one saved from the last video (still an existing folder).
    const savedFolder=typeof p.directory==='string'&&p.directory===store.data.settings.videoDirectory&&await stat(p.directory).then(info=>info.isDirectory(),()=>false);
    if(typeof p.directory!=='string'||!(videoDirectories.has(p.directory)||savedFolder)||await realpath(p.directory).catch(()=>'')!==p.directory)throw Error('영상 저장 폴더를 선택 창에서 다시 선택하세요.');
    if(p.backgroundPath&&![...videoBackgrounds.values()].includes(p.backgroundPath))throw Error('배경 사진을 선택 창에서 선택하세요.');
    const backgroundPath=getVideoTemplate(opts.template).requiresBackground?p.backgroundPath:undefined;
    const rows=list.trackIds.map(id=>store.data.tracks.find(t=>t.id===id&&!t.trashedAt&&t.kind!=='stem')).filter(Boolean);if(!rows.length)throw Error('플레이리스트에 영상으로 만들 음악이 없습니다.');if(rows.length>500)throw Error('한 영상에는 500곡까지 넣을 수 있습니다.');const prepared=await videoPreflight(rows,opts.mode);if(!prepared.ready)throw Error('가사와 가사 시간을 먼저 검토하세요.');
    const ffmpegPath=await resolveFfmpeg();
    if(!ffmpegPath)throw Error('영상 출력에 필요한 FFmpeg를 찾을 수 없습니다.');
    const safe=title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/,'').slice(0,100)||'playlist';
    // Saved under exactly the user's title. A name already on disk or reserved by a pending video is
    // reported first; the user then keeps both ("제목 (1)") or overwrites.
    const reservedName=/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(safe)?safe+'_':safe,fileKey=file=>process.platform==='win32'?path.resolve(file).toLowerCase():path.resolve(file);
    const reserved=new Set(store.data.jobs.filter(job=>job.type==='video'&&['queued','running','needs-confirmation'].includes(job.status)&&job.request?.outputPath).map(job=>fileKey(job.request.outputPath)));
    const taken=async file=>reserved.has(fileKey(file))||await stat(file).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
    const named=n=>path.join(p.directory,(n?`${reservedName} (${n})`:reservedName)+'.'+opts.format);
    let outputPath=named(0),overwrite=false;
    if(await taken(outputPath)){
      if(p.conflict==='overwrite'){if(reserved.has(fileKey(outputPath)))throw Error('같은 이름으로 만들고 있는 영상이 있습니다. 그 작업이 끝난 뒤 덮어쓰거나 다른 이름을 쓰세요.');overwrite=true;}
      else{let n=1;while(await taken(named(n)))n++;if(p.conflict!=='number')return {conflict:true,name:path.basename(outputPath),suggested:path.basename(named(n))};outputPath=named(n);}
    }
    await store.mutate(data=>{data.settings.videoBrand=opts.brand;data.settings.videoDirectory=p.directory;data.settings.videoOptions=pickVideoOptions(opts);});
    const [job]=await queue.add([{operation:'video',playlistId:list.id,trackIds:rows.map(t=>t.id),title,options:opts,directory:p.directory,outputPath,...(overwrite?{overwrite:true}:{}),backgroundPath,ffmpegPath,settings:{...store.data.settings}}]);return {jobId:job.id,fileName:path.basename(outputPath)};
  },
  resumeVideo:async p=>{
    const previous=findById(store.data.jobs,p.jobId,'영상 작업');
    if(previous.type!=='video'||previous.status!=='needs-confirmation'||resumingVideos.has(previous.id))throw new Error('다시 시작할 영상 작업이 없습니다.');
    resumingVideos.add(previous.id);
    try{
      const check=await videoPreflight(previous.request.trackIds.map(track),previous.request.options.mode);
      if(!check.ready)throw new Error('가사가 없는 곡에 가사를 입력하세요.');
      if(check.needsConfirmation.length)throw new Error('확인이 필요한 가사 구간을 맞춘 뒤 영상 제작을 계속하세요.');
      if(previous.status!=='needs-confirmation')throw new Error('이 영상 작업은 이미 변경되었습니다.');
      // Jobs saved before the GPU templates: same template id (cinematic-gpu → cinematic), at most the
      // template's resolution (8K → 4K), and the scene text the video window now sets.
      const saved=previous.request.options||{},template=getVideoTemplate(saved.template==='cinematic-gpu'?'cinematic':saved.template);
      const options=validateVideoOptions({...saved,resolution:template.maxResolution?Math.min(saved.resolution,template.maxResolution):saved.resolution,brand:saved.brand??store.data.settings.videoBrand,playlistTitle:saved.playlistTitle??previous.request.title});
      if(options.resolution!==saved.resolution)log(`이 템플릿은 최대 ${template.maxResolution}p까지 지원해 ${saved.resolution}p 대신 ${options.resolution}p로 이어서 제작합니다.`,previous.id);
      const job=await queue.resume(previous.id,{...previous.request,options,settings:{...store.data.settings}});return {jobId:job.id};
    }finally{resumingVideos.delete(previous.id);}
  },
  // What saving new lyrics does to the song's lyric timing, for the notice before saving.
  previewLyricsChange:async p=>{const t=track(p?.id);if(typeof p?.lyrics!=='string'||p.lyrics===(t.lyrics||''))return {hasTiming:false};const result=timingAfterLyrics(t,p.lyrics);return {hasTiming:!!result.current,kept:result.kept,changed:result.changed,added:result.added,removed:result.removed};},
  // One sung line corrected or removed from the timing editor; the other lines keep their timing.
  editLyricLine:async p=>{
    const t=track(p?.id);if(typeof p.expectedLyrics!=='string'||p.expectedLyrics!==(t.lyrics||''))throw new Error('가사가 변경되었습니다. 시간 검토 창을 다시 열어 주세요.');
    if(store.data.jobs.some(j=>['queued','running'].includes(j.status)&&(j.request?.trackId===t.id||j.request?.trackIds?.includes(t.id))))throw new Error('이 곡의 작업이 끝난 후 가사를 수정하세요.');
    if(!Number.isInteger(p.index)||(p.text!==null&&(typeof p.text!=='string'||!p.text.trim()||p.text.length>300)))throw new Error('가사 줄은 300자 이내로 입력하세요.');
    const lyrics=editLyricLine(t.lyrics||'',p.index,p.text);if(!normalizeLyrics(lyrics).lines.length)throw new Error('마지막 남은 가사 줄은 지울 수 없습니다.');
    const timing=timingAfterLyrics(t,lyrics,{editedStatus:'keep'}),previous={lyrics:t.lyrics,lyricTiming:t.lyricTiming};
    try{await store.mutate(()=>{t.lyrics=lyrics;if(timing.timing)t.lyricTiming=timing.timing;else delete t.lyricTiming;});}catch(error){Object.assign(t,previous);throw error;}
    notify();return {lyrics,lyricTiming:t.lyricTiming||null};
  },
  updateTrackText:async p=>{
    const t=track(p.id),title=requiredString(p.title,'곡 제목',180);
    if(typeof p.lyrics!=='string'||p.lyrics.length>10000)throw new Error('가사는 10,000자 이내로 입력하세요.');
    if(store.data.jobs.some(j=>['queued','running'].includes(j.status)&&(j.request?.trackId===t.id||j.request?.trackIds?.includes(t.id))))throw new Error('이 곡의 작업이 끝난 후 제목과 가사를 수정하세요.');
    const previous={title:t.title,lyrics:t.lyrics,lyricTiming:t.lyricTiming};
    // Edited lyrics keep the timing of unchanged lines (changed lines are checked again); see remapLyricTiming.
    const timing=t.lyrics!==p.lyrics?timingAfterLyrics(t,p.lyrics):null;
    try{await store.mutate(()=>{if(timing){if(timing.timing)t.lyricTiming=timing.timing;else delete t.lyricTiming;}t.title=title;t.lyrics=p.lyrics;});}catch(error){Object.assign(t,previous);throw error;}
    notify();return visibleTrack(t);
  },
  alignLyrics:async p=>{
    const t=track(p.trackId);if(t.kind==='stem')throw new Error('전체 곡의 가사를 선택하세요.');
    const normalized=normalizeLyrics(t.lyrics||'');
    if(!normalized.lines.length)throw new Error('대괄호 태그를 제외한 가사를 입력하세요.');
    if(store.data.jobs.some(j=>j.request?.trackId===t.id&&j.type==='lyricsAlign'&&['queued','running'].includes(j.status)))throw new Error('이미 가사 시간을 분석 중입니다.');
    // Lyrics the analysis does not support are refused here (no job that would only save empty timing).
    const support=lyricAlignmentSupport({lines:normalized.lines,duration:Number(t.duration)});if(!support.supported)throw new Error(support.reason);
    // Confirmed timing (uploaded LRC/SRT or checked lines) is never re-analysed: nothing is open.
    const saved=t.lyricTiming;
    if(saved?.lyricsHash===normalized.lyricsHash&&saved.cues?.length===normalized.lines.length&&saved.cues.every(cue=>['manual','automatic'].includes(cue.status)))throw new Error('모든 줄의 시작점이 확정되어 있어 다시 맞출 줄이 없습니다. 바꿀 줄은 시작점 손잡이로 옮겨 확정해 주세요.');
    // A new analysis replaces earlier ones still waiting for this song's confirmation.
    const superseded=store.data.jobs.filter(j=>j.type==='lyricsAlign'&&j.status==='needs-confirmation'&&j.request?.trackId===t.id);
    if(superseded.length)await store.mutate(()=>{for(const j of superseded){j.status='completed';j.stage='새 분석으로 대체됨';j.result={...j.result,awaitingConfirmation:false};}});
    const [job]=await queue.add([{operation:'lyricsAlign',trackId:t.id,projectId:t.projectId,...(t.storageProjectId?{storageProjectId:t.storageProjectId}:{}),title:t.title+' · 가사 시간 분석',settings:{...store.data.settings}}]);return {jobId:job.id};
  },
  // Confirmed starts are kept as soon as they are confirmed; the review (and a waiting video) finishes only
  // with saveLyricTiming once every line is confirmed.
  saveLyricProgress:async p=>{
    const t=track(p.id),normalized=normalizeLyrics(t.lyrics||'');
    if(typeof p.expectedLyrics!=='string'||p.expectedLyrics!==(t.lyrics||''))throw Error('가사가 변경되었습니다. 시간 검토 창을 다시 열어 주세요.');
    if(store.data.jobs.some(j=>j.type==='video'&&j.request?.trackIds?.includes(t.id)&&['queued','running'].includes(j.status)))throw Error('영상 제작이 끝난 후 가사 시간을 수정하세요.');
    if(store.data.jobs.some(j=>j.type==='lyricsAlign'&&j.request?.trackId===t.id&&['queued','running'].includes(j.status)))throw new Error('분석이 끝난 후 시간을 저장하세요.');
    const old=t.lyricTiming;if(!old?.cues?.length||old.lyricsHash!==normalized.lyricsHash)throw new Error('이 가사의 시간 분석이 없습니다. 자동으로 다시 맞추기를 먼저 실행하세요.');
    const merged=mergeLyricProgress({lines:normalized.lines,cues:p.cues,duration:old.duration,previousCues:old.cues});
    await store.mutate(()=>{t.lyricTiming={...old,cues:merged.cues,automation:{...old.automation,needsConfirmation:merged.needsConfirmation},reviewedAt:new Date().toISOString()};});
    notify();return {open:merged.needsConfirmation.length};
  },
  saveLyricTiming:async p=>{
    const t=track(p.id),normalized=normalizeLyrics(t.lyrics||'');
    if(typeof p.expectedLyrics!=='string'||p.expectedLyrics!==(t.lyrics||''))throw Error('가사가 변경되었습니다. 시간 검토 창을 다시 열어 주세요.');
    if(store.data.jobs.some(j=>j.type==='video'&&j.request?.trackIds?.includes(t.id)&&['queued','running'].includes(j.status)))throw Error('영상 제작이 끝난 후 가사 시간을 수정하세요.');
    if(store.data.jobs.some(j=>j.type==='lyricsAlign'&&j.request?.trackId===t.id&&['queued','running'].includes(j.status)))throw new Error('분석이 끝난 후 시간을 저장하세요.');
    const duration=(await parseFile(t.audioPath,{duration:true})).format.duration;
    const old=t.lyricTiming;
    const validated=validateLyricStarts({lines:normalized.lines,cues:p.cues,duration,previousCues:old?.cues||[]});
    if(validated.some(cue=>!['manual','automatic'].includes(cue.status)))throw new Error('확인이 필요한 가사 구간을 하나씩 확인하세요.');
    const cues=validated.map(cue=>{const before=old?.cues?.find(row=>row.lineId===cue.lineId);return {...before,...cue,status:before?.status==='automatic'&&before.start===cue.start?'automatic':'manual',reasons:[]};});
    const waiting=store.data.jobs.filter(job=>job.type==='lyricsAlign'&&job.status==='needs-confirmation'&&job.request?.trackId===t.id),previousJobs=waiting.map(job=>({...job}));
    try{await store.mutate(()=>{t.lyricTiming={...old,lyricsHash:normalized.lyricsHash,cues,duration,automation:{...old?.automation,version:2,timingMode:'line-starts',needsConfirmation:[]},reviewedAt:new Date().toISOString()};for(const job of waiting){job.status='completed';job.stage='가사 시간 저장 완료';job.result={...job.result,awaitingConfirmation:false};}});}catch(error){t.lyricTiming=old;waiting.forEach((job,index)=>Object.assign(job,previousJobs[index]));throw error;}notify();return t.lyricTiming;
  },
  // '나중에' on the banner: the analysis stops asking; its open lines stay on the song (LRC 확인 badge).
  rerunJob:async p=>rerunJob(p?.id),
  dismissJob:async p=>{const job=store.data.jobs.find(item=>item.id===p?.id);await queue.dismiss(p?.id);if(job&&job.type!=='video')await removeJobFolder(job).catch(error=>log(error));},
  cacheUsage:()=>cacheUsage(),
  clearCaches:()=>withLibraryLock('다른 정리 작업이 진행 중입니다. 잠시 후 다시 시도하세요.',()=>clearCaches()),
  saveVideoPresets:async p=>{
    if(!Array.isArray(p?.presets)||p.presets.length>30)throw new Error('영상 설정 프리셋은 30개까지 저장할 수 있습니다.');
    const presets=p.presets.map(item=>{const name=requiredString(item?.name,'프리셋 이름',40);validateVideoOptions(item.options);return {name,options:pickVideoOptions(item.options)};});
    if(new Set(presets.map(item=>item.name)).size!==presets.length)throw new Error('같은 이름의 프리셋이 있습니다.');
    await store.mutate(data=>{data.settings.videoPresets=presets;});notify();return presets;
  },
  exportLyricTiming:async p=>{
    const t=track(p?.trackId),text=lyricSubtitles(t);
    const result=await dialog.showSaveDialog(window,{title:'LRC 내보내기',defaultPath:fileSafe(t.title)+'.lrc',filters:[{name:'LRC',extensions:['lrc']}]});
    if(result.canceled||!result.filePath)return null;await writeFile(result.filePath,'\ufeff'+text,'utf8');return {fileName:path.basename(result.filePath)};
  },
  exportVideoSubtitles:async p=>{
    const row=findById(store.data.videos,p?.id,'영상');
    if(row.options?.mode!=='vocal')throw new Error('가사 영상만 자막을 내보낼 수 있습니다.');
    if(!Array.isArray(row.chapters))throw new Error('이 영상에는 곡 위치 정보가 없습니다. 이번 버전부터 만든 영상의 자막을 내보낼 수 있습니다.');
    const {text,count,missing}=videoSubtitles({chapters:row.chapters,tracks:new Map(store.data.tracks.map(item=>[item.id,item]))});
    const result=await dialog.showSaveDialog(window,{title:'자막(SRT) 내보내기',defaultPath:fileSafe(row.title)+'.srt',filters:[{name:'SRT',extensions:['srt']}]});
    if(result.canceled||!result.filePath)return null;await writeFile(result.filePath,'\ufeff'+text,'utf8');return {fileName:path.basename(result.filePath),count,missing};
  },
  dismissLyricConfirmation:async p=>{
    const job=findById(store.data.jobs,p?.jobId,'가사 분석');
    if(job.type!=='lyricsAlign'||job.status!=='needs-confirmation')return;
    await store.mutate(()=>{job.status='completed';job.stage='확인 보류 · 곡의 LRC 확인에서 이어서 맞출 수 있습니다';job.result={...job.result,awaitingConfirmation:false};});notify();
  },
  // LRC/SRT upload: the file is chosen and parsed here (the renderer never passes a path), shown
  // as a summary for confirmation, then replaces the song's lyric timing entirely.
  previewLyricTimingFile:async p=>{
    const t=track(p.trackId);if(t.kind==='stem')throw new Error('전체 곡을 선택하세요.');
    if(trackBusy(t))throw new Error('이 곡의 작업이 끝난 후 가사 시간 파일을 불러오세요.');
    const picked=await dialog.showOpenDialog(window,{title:'가사 시간 파일 선택 (LRC·SRT)',properties:['openFile'],filters:[{name:'가사 시간 파일 (LRC, SRT)',extensions:['lrc','srt']}]});
    if(picked.canceled||!picked.filePaths?.[0])return {cancelled:true};
    const file=picked.filePaths[0];if((await stat(file)).size>LYRIC_FILE_LIMITS.maxBytes)throw new Error('가사 시간 파일은 1MB 이하만 불러올 수 있습니다.');
    const parsed=parseLyricTimingFile({name:file,bytes:await readFile(file)});
    const duration=(await parseFile(t.audioPath,{duration:true})).format.duration;
    const plan=planLyricTimingImport({entries:parsed.entries,lyrics:t.lyrics||'',duration});
    const token=id();pendingTimingFiles.clear();pendingTimingFiles.set(token,{trackId:t.id,lyrics:t.lyrics||'',entries:parsed.entries,format:parsed.format,fileName:path.basename(file)});
    return {token,title:t.title,fileName:path.basename(file),format:parsed.format,lineCount:plan.lines.length,matchesLyrics:plan.matches,lyricsEmpty:!lyricLines(t.lyrics||'').length,hasTiming:!!t.lyricTiming?.cues?.length};
  },
  applyLyricTimingFile:async p=>{
    const pending=pendingTimingFiles.get(p?.token);if(!pending)throw new Error('가사 시간 파일을 다시 선택해 주세요.');
    pendingTimingFiles.delete(p.token);
    const t=track(pending.trackId);
    const duration=(await parseFile(t.audioPath,{duration:true})).format.duration;
    // Checked after the await so nothing can change the lyrics or start a job in between.
    if((t.lyrics||'')!==pending.lyrics)throw new Error('파일을 고른 뒤 가사가 바뀌었습니다. 파일을 다시 불러와 주세요.');
    if(trackBusy(t))throw new Error('이 곡의 작업이 끝난 후 가사 시간 파일을 불러오세요.');
    const plan=planLyricTimingImport({entries:pending.entries,lyrics:t.lyrics||'',duration}),now=new Date().toISOString();
    const timing={lyricsHash:normalizeLyrics(plan.lyrics).lyricsHash,duration,cues:plan.cues,automation:{version:2,timingMode:'line-starts',needsConfirmation:[]},source:{format:pending.format,fileName:pending.fileName,importedAt:now},analyzedAt:now,reviewedAt:now};
    // Analyses waiting for this song's confirmation are answered by the file.
    const waiting=store.data.jobs.filter(job=>job.type==='lyricsAlign'&&job.status==='needs-confirmation'&&job.request?.trackId===t.id),previousJobs=waiting.map(job=>({...job})),previous={lyrics:t.lyrics,lyricTiming:t.lyricTiming};
    try{await store.mutate(()=>{t.lyrics=plan.lyrics;t.lyricTiming=timing;for(const job of waiting){job.status='completed';job.stage='가사 시간 파일 적용 완료';job.result={...job.result,awaitingConfirmation:false};}});}
    catch(error){Object.assign(t,previous);waiting.forEach((job,index)=>Object.assign(job,previousJobs[index]));throw error;}
    notify();return {lines:plan.lines.length,lyricsReplaced:!plan.matches};
  },
  createPlaylist:p=>playlistAction(createPlaylist,p),
  renamePlaylist:p=>playlistAction(renamePlaylist,p),
  deletePlaylist:p=>playlistAction(deletePlaylist,p),
  addToPlaylist:p=>playlistAction(addToPlaylist,p),
  removeFromPlaylist:p=>playlistAction(removeFromPlaylist,p),
  reorderPlaylist:async p=>{const row=await playlistAction(reorderPlaylist,p);notify();return row;},
  bootstrap:async()=>snapshot(),
  trackWaveform:async p=>{const row=track(p.id);return audioWaveform(row.audioPath,{ffmpegPath:store.data.settings.ffmpegPath,cacheDirectory:path.join(app.getPath('userData'),'waveform-cache')});},
  stemWaveform:async p=>{const row=track(p.id);if(row.kind!=='stem')throw new Error('Stem 음원을 선택하세요.');return stemWaveform(row.audioPath);},
  pickProjectFolder:async()=>{const result=await dialog.showOpenDialog(window,{title:'프로젝트 저장 폴더 선택',defaultPath:store.data.settings.projectPath,properties:['openDirectory','createDirectory']});if(result.canceled||!result.filePaths?.[0])return null;const selected=result.filePaths[0];if(!path.isAbsolute(selected)||(await stat(selected)).isDirectory()!==true)throw new Error('올바른 프로젝트 폴더를 선택하세요.');return selected;},
  copyText:async p=>{if(typeof p.text!=='string'||p.text.length>200000)throw new Error('복사할 텍스트가 올바르지 않습니다.');clipboard.writeText(p.text);return true;},
  createProject:async p=>{const name=requiredString(p.name,'프로젝트 이름',100);const projectId=id();const directory=path.join(store.data.settings.projectPath,projectId);await ensureSpace(directory,0);const item={id:projectId,name,directory,createdAt:new Date().toISOString(),draft:{}};await store.mutate(d=>d.projects.push(item));notify();return item;},
  renameProject:async p=>{const item=project(p.id);await store.mutate(()=>{item.name=requiredString(p.name,'프로젝트 이름',100);});notify();},
  deleteProject:async p=>{return withLibraryLock('휴지통 처리 중입니다. 잠시 후 다시 시도하세요.',()=>deleteProject(store,p.id));},
  saveDraft:async p=>{const item=project(p.projectId);if(!p.draft||JSON.stringify(p.draft).length>100000)throw new Error('초안 데이터가 너무 큽니다.');await store.mutate(()=>{item.draft=Object.fromEntries(Object.entries(p.draft).filter(([key])=>['title','lyrics','style','presetId','instrumental','instrumentalDuration','count','parentId'].includes(key)));});},
  saveSettings,
  refreshSystem:async()=>{system=await inspectSystem(store.data.settings.modelPath);clearEngineProbes();await refreshEngines();return snapshot();},
  refreshCodex:async()=>{const [result]=await Promise.all([refreshCodex(),refreshCodexBilling()]);return result;},
  refreshModels:async()=>{await Promise.all([refreshCodex(),refreshCodexBilling()]);return codexModels;},
  generate:async p=>{
    // Planned instrumentals (AI instrumental planning): one job per planned track with its own title, style and art description.
    if(Array.isArray(p.tracks)){
      if(!p.tracks.length)throw new Error('생성할 곡이 없습니다.');
      const duration=validateInstrumentalDuration(p.instrumentalDuration);project(p.projectId);
      const engine=engines.find(e=>e.id==='music');if(!engine?.available)throw new Error(engine?.message||'엔진 설치가 필요합니다.');
      for(const row of p.tracks){assertYue2Input(row.style,'',true);requiredString(row.title,'제목',200);requiredString(row.style,'Style');}
      await ensureSpace(project(p.projectId).directory,p.tracks.length*songBytes(duration));
      const seeds=new Set();while(seeds.size<p.tracks.length)seeds.add(randomInt(0,2147483647));
      return queue.add([...seeds].map((seed,i)=>({projectId:p.projectId,instrumental:true,instrumentalDuration:duration,operation:'generate',title:p.tracks[i].title.trim(),style:p.tracks[i].style.trim(),lyrics:'',seed,...(p.tracks[i].art?{artPrompt:p.tracks[i].art}:{}),settings:{...store.data.settings}})));
    }
    assertYue2Input(p.style,p.lyrics,!!p.instrumental);
    if(p.instrumental)p={...p,instrumentalDuration:validateInstrumentalDuration(p.instrumentalDuration)};
    project(p.projectId);const style=requiredString(p.style,'Style');const title=typeof p.title==='string'&&p.title.trim()?requiredString(p.title,'제목',200):'새로운 곡';
    // No upper limit (user decision 2026-10-30): every song is its own queued job; the disk must hold them all.
    const count=Number(p.count??store.data.settings.defaultCount);if(!Number.isInteger(count)||count<1)throw new Error('생성 개수는 1곡 이상으로 입력하세요.');
    await ensureSpace(project(p.projectId).directory,count*songBytes(p.instrumental?Number(p.instrumentalDuration)||240:300));
    const lyrics=p.instrumental?'':requiredString(p.lyrics,'가사');
    const operation=p.parentId?'cover':'generate';
    const engine=engines.find(e=>e.id===(operation==='cover'?'cover':'music'));if(!engine?.available)throw new Error(engine?.message||'엔진 설치가 필요합니다.');
    let parent;if(p.parentId){parent=track(p.parentId);if(parent.projectId!==p.projectId)throw new Error('같은 Project의 원곡을 선택하세요.');}
    const seeds=new Set();while(seeds.size<count)seeds.add(randomInt(0,2147483647));
    return queue.add([...seeds].map((seed,i)=>({projectId:p.projectId,parentId:parent?.id,presetId:p.presetId,instrumental:!!p.instrumental,...(p.instrumental?{instrumentalDuration:p.instrumentalDuration}:{}),operation,title:count>1?`${title} ${i+1}`:title,style,lyrics,seed,audioPath:parent?.audioPath,settings:{...store.data.settings}})));
  },
  // Imported from a playlist page: the song joins the chosen project and that playlist.
  importAudio:async p=>{const item=project(p.projectId),list=importPlaylist(p.playlistId);const source=await pickAudio();if(!source)return null;const audioPath=await copyManaged(source,path.join(item.directory,'imports'));const row=await addAudio({audioPath,projectId:item.id,title:path.basename(source,path.extname(source)),kind:'original',source:'import',importedAt:new Date().toISOString(),lyrics:'',style:'가져온 음악'});if(list){await addToPlaylist(store,{playlistId:list.id,ids:[row.id]});notify();}return row;},
  extractYoutube:async p=>{
    project(p.projectId);const url=validateYoutubeUrl(p.url),list=importPlaylist(p.playlistId);
    const [job]=await queue.add([{operation:'youtubeExtract',projectId:p.projectId,...(list?{playlistId:list.id}:{}),url,title:'유튜브 음악 추출',settings:{...store.data.settings}}]);return {jobId:job.id};
  },
  finalizeYoutube:async p=>{
    if(!['wav','mp3'].includes(p.format))throw new Error('WAV 또는 MP3 형식을 선택하세요.');
    const origin=findById(store.data.jobs,p.jobId,'추출 결과');
    if(origin.type!=='youtubeExtract'||origin.status!=='completed'||!origin.result?.sessionId||origin.result.discarded||origin.result.expired)throw new Error('추출을 완료한 후 저장 형식을 선택하세요.');
    if(origin.result.importedTrackId)throw new Error('이미 가져온 음악입니다.');
    const subtitles=origin.result.subtitles||[];
    if(subtitles.length>1&&p.subtitle!=='none'&&!subtitles.some(item=>item.id===p.subtitle))throw new Error('가사로 가져올 자막 언어를 선택하세요.');
    if(youtubeFinishing.has(origin.id)||store.data.jobs.some(job=>job.request?.extractionJobId===origin.id&&['queued','running','completed'].includes(job.status)))throw new Error('이미 가져오는 중이거나 완료된 음악입니다.');
    youtubeFinishing.add(origin.id);
    try {project(origin.request.projectId);const [job]=await queue.add([{operation:'youtubeImport',projectId:origin.request.projectId,...(origin.request.playlistId?{importPlaylistId:origin.request.playlistId}:{}),extractionJobId:origin.id,format:p.format,...(subtitles.length>1?{subtitle:p.subtitle}:{}),title:origin.result.title||'유튜브 음악 가져오기',settings:{...store.data.settings}}]);return {jobId:job.id};}
    finally{youtubeFinishing.delete(origin.id);}
  },
  discardYoutube:async p=>{
    const origin=findById(store.data.jobs,p.jobId,'추출 결과');
    if(origin.type!=='youtubeExtract'||origin.status!=='completed'||!origin.result?.sessionId)throw new Error('완료된 추출 결과만 정리할 수 있습니다.');
    if(youtubeFinishing.has(origin.id)||store.data.jobs.some(job=>job.request?.extractionJobId===origin.id&&['queued','running'].includes(job.status)))throw new Error('저장 중인 음악은 취소 후 정리하세요.');
    await youtubeImporter.discard(origin.result.sessionId);await store.mutate(()=>{origin.result.discarded=true;});notify();return true;
  },
  moveTracks:async p=>{return withLibraryLock('진행 중인 작업이 완료된 후 이동하세요.',()=>moveTracks(store,p.ids,p.projectId));},
  trashTracks:async p=>updateTrash(moveToTrash,p.ids),
  cancelJob:async p=>queue.cancel(p.id),
  discardLyricsResult:async p=>{
    const job=findById(store.data.jobs,p.id,'가사 결과');
    if(job.request?.operation!=='lyrics'||job.status!=='completed')throw new Error('완료된 AI 가사 결과만 삭제할 수 있습니다.');
    await store.mutate(d=>{d.jobs=d.jobs.filter(item=>item.id!==job.id);});notify();
  },
  planInstrumentals:async p=>{
    project(p.projectId);const prompt=requiredString(p.prompt,'기획 요청');
    const count=Number(p.count);if(!Number.isInteger(count)||count<1)throw new Error('생성 개수는 1곡 이상으로 입력하세요.');
    const instrumentalDuration=validateInstrumentalDuration(p.instrumentalDuration),style=typeof p.style==='string'?p.style.slice(0,1000):'';
    const engine=engines.find(e=>e.id==='music');if(!engine?.available)throw new Error(engine?.message||'엔진 설치가 필요합니다.');
    await ensureSpace(project(p.projectId).directory,count*songBytes(instrumentalDuration));
    const agents=await settledAgents();if(!agents.active)throw new Error(agents.reason);
    if(agents.needsChoice)throw new Error('먼저 사용할 AI 에이전트를 선택하세요.');
    const [job]=await queue.add([{operation:'instrumentalPlan',agent:agents.active,projectId:p.projectId,title:`AI 연주곡 기획 · ${count}곡`,prompt,count,instrumentalDuration,style,settings:{...store.data.settings}}]);return {jobId:job.id};
  },
  lyrics:async p=>{const origin=project(p.projectId);const prompt=requiredString(p.prompt,'작사 요청');
    if(p.mode!==undefined&&!['create','edit'].includes(p.mode))throw new Error('올바른 작사 작업을 선택하세요.');
    const lyrics=p.mode==='edit'?requiredString(p.lyrics,'수정할 가사'):'';
    const currentTitle=typeof p.currentTitle==='string'?p.currentTitle.slice(0,180):origin.draft?.title||'';
    const style=typeof p.style==='string'?p.style.slice(0,1000):origin.draft?.style||'';
    const agents=await settledAgents();if(!agents.active)throw new Error(agents.reason);
    if(agents.needsChoice)throw new Error('먼저 사용할 AI 에이전트를 선택하세요.');
    const label=p.mode==='edit'?'AI 가사 수정':'AI 작사';
    const targetSeconds=Number.isInteger(Number(p.targetSeconds))&&Number(p.targetSeconds)>=60&&Number(p.targetSeconds)<=600?Number(p.targetSeconds):undefined;
    const [job]=await queue.add([{operation:'lyrics',agent:agents.active,targetSeconds,recentSongs:recentSongs(lyrics),projectId:p.projectId,title:agents.installed.codex&&agents.installed.claude?`${label} · ${agents.active==='claude'?'Claude':'Codex'}`:label,prompt,lyrics,currentTitle,style,mode:p.mode,settings:{...store.data.settings}}]);return {jobId:job.id};},
  chooseAgent:async p=>{
    if(!agentProviders.includes(p.provider))throw new Error('AI 에이전트는 Claude 또는 Codex 중에서 선택하세요.');
    if(!(await settledAgents()).available[p.provider])throw new Error(agentUnavailable(p.provider));
    await store.mutate(d=>{d.settings.agentProvider=p.provider;d.settings.agentChoiceConfirmed=true;});notify();return agentState();
  },
  refreshClaude,
  stems:async p=>{const mode=p.stemMode||'two';if(!['two','multi'].includes(mode))throw new Error('알 수 없는 Stem 분리 방식입니다.');const t=track(p.trackId);if(!engines.find(e=>e.id==='stems')?.available)throw new Error('Stem 엔진 Python 환경을 먼저 설치하세요.');return queue.add([{operation:'stems',stemMode:mode,trackId:t.id,projectId:t.projectId,...(t.storageProjectId?{storageProjectId:t.storageProjectId}:{}),audioPath:t.audioPath,title:t.title+' · Stems',settings:{...store.data.settings}}]);},
  mastering:async p=>{
    const t=track(p.trackId);if(t.kind==='stem')throw new Error('전체 곡에서 마스터링을 실행하세요.');
    const options=validateMasteringOptions(p.options);
    if(store.data.jobs.some(j=>j.type==='mastering'&&j.request?.trackId===t.id&&['queued','running'].includes(j.status)))throw new Error('이 곡의 마스터링이 이미 진행 중입니다.');
    const ffmpegPath=await resolveFfmpeg();
    if(!ffmpegPath)throw new Error('마스터링에 필요한 FFmpeg를 찾을 수 없습니다. 환경설정에서 음악 실행 환경을 설치하세요.');
    const [job]=await queue.add([{operation:'mastering',trackId:t.id,projectId:t.projectId,title:t.title+' · 마스터링',options,settings:{...store.data.settings,ffmpegPath}}]);return {jobId:job.id};
  },
  // Album art from the user's own image: square (1:1) images only, copied into the song's project.
  uploadAlbumArt:async p=>{
    const t=track(p.trackId);
    if(store.data.jobs.some(job=>job.type==='albumArt'&&job.request?.trackId===t.id&&['queued','running'].includes(job.status)))throw new Error('앨범아트를 만드는 중입니다. 작업이 끝난 후 업로드하세요.');
    const picked=await dialog.showOpenDialog(window,{title:'앨범아트 이미지 선택 · 정사각형(1:1) 이미지만 가능',properties:['openFile'],filters:[{name:'이미지 (PNG, JPG, WEBP)',extensions:['png','jpg','jpeg','webp']}]});
    if(picked.canceled||!picked.filePaths?.[0])return {cancelled:true};
    const file=await realpath(picked.filePaths[0]),info=await stat(file);
    if(!info.isFile()||info.size>30*1024*1024)throw new Error('30MB 이하의 이미지 파일을 선택하세요.');
    const image=nativeImage.createFromPath(file);if(image.isEmpty())throw new Error('읽을 수 있는 이미지 파일(PNG, JPG, WEBP)을 선택하세요.');
    const {width,height}=image.getSize();
    if(width!==height)return {rejected:true,width,height,name:path.basename(file)};
    const project=store.data.projects.find(row=>row.id===(t.storageProjectId||t.projectId));
    if(!project?.directory||!path.isAbsolute(project.directory))throw new Error('곡의 프로젝트 폴더를 찾을 수 없습니다.');
    const folder=path.join(project.directory,'imports');await mkdir(folder,{recursive:true});
    const target=path.join(folder,`art-${t.id}-${id()}${path.extname(file).toLowerCase()}`);
    await copyFile(file,target,fsConstants.COPYFILE_EXCL);
    const previous=t.artPath;
    try{await store.mutate(()=>{t.artPath=target;delete t.artError;});}catch(error){await rm(target,{force:true});throw error;}
    await releaseFile(store,t,previous).catch(error=>log(error));
    notify();return {width,height};
  },
  albumArt:async p=>{const t=track(p.trackId);const agents=await settledAgents();if(!agents.imageAgent)throw new Error(agents.imageReason);return queue.add([{operation:'albumArt',trackId:t.id,projectId:t.projectId,...(t.storageProjectId?{storageProjectId:t.storageProjectId}:{}),title:t.title+' · Album Art',settings:{...store.data.settings}}]);},
  exportAlbumArt:async p=>{const t=track(p.id);if(!t.artPath)throw new Error('다운로드할 앨범아트가 없습니다.');
    const result=await dialog.showOpenDialog(window,{title:'앨범아트 저장 폴더 선택',properties:['openDirectory','createDirectory']});
    if(result.canceled||!result.filePaths?.[0])return {cancelled:true};
    const filePath=await exportAlbumArt(t.artPath,t.title,result.filePaths[0]);return {cancelled:false,filePath};
  },
  exportTrack:async p=>{const t=track(p.id);const result=await dialog.showSaveDialog(window,{title:'음원 내보내기',defaultPath:(t.kind==='stem'?stemLabel(t.audioPath):t.title).replace(/[<>:"/\\|?*]/g,'_')+path.extname(t.audioPath)});if(!result.canceled&&result.filePath){await ensureSpace(path.dirname(result.filePath),(await stat(t.audioPath)).size);await copyFile(t.audioPath,result.filePath);}return !result.canceled;},
  exportStems:async p=>{
    const source=track(p.parentId);
    if(!Array.isArray(p.ids)||!p.ids.length)throw new Error('다운로드할 Stem을 선택하세요.');
    const rows=[...new Set(p.ids)].map(id=>track(id));
    if(rows.some(t=>t.kind!=='stem'||t.parentId!==source.id))throw new Error('이 곡의 Stem만 다운로드할 수 있습니다.');
    const result=await dialog.showOpenDialog(window,{title:'Stem 다운로드 폴더 선택',properties:['openDirectory','createDirectory']});
    if(result.canceled||!result.filePaths[0])return {cancelled:true};
    const folder=result.filePaths[0];const sizes=await Promise.all(rows.map(t=>stat(t.audioPath)));await ensureSpace(folder,sizes.reduce((n,s)=>n+s.size,0));
    const files=[];
    for(const row of rows){const base=source.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,80)+' - '+stemLabel(row.audioPath);let n=0;
      while(true){const dest=path.join(folder,base+(n?' ('+n+')':'')+path.extname(row.audioPath));try{await copyFile(row.audioPath,dest,fsConstants.COPYFILE_EXCL);files.push(dest);break;}catch(error){if(error.code!=='EEXIST')throw error;n++;}}
    }return {files};
  },
  revealTrack:async p=>{const t=track(p.id);shell.showItemInFolder(t.audioPath);},
  deleteTrack:async p=>updateTrash(moveToTrash,[p.id]),
  restoreTracks:async p=>withLibraryLock('휴지통 처리 중입니다. 잠시 후 다시 시도하세요.',()=>restoreFromTrash(store,p.ids,p.projectId)),
  purgeTracks:async p=>purgeTracksCompletely(p.ids),
  deleteVideo:async p=>deleteVideo(p),
  savePreset:async p=>{if(p.mode!==undefined&&!['vocal','instrumental'].includes(p.mode))throw new Error('프리셋 종류를 확인하세요.');const item={id:id(),...(p.mode?{mode:p.mode}:{}),category:'나만의 프리셋',name:requiredString(p.name,'프리셋 이름',80),description:typeof p.description==='string'?p.description:'사용자 프리셋',prompt:requiredString(p.prompt,'Style',1000)};await store.mutate(d=>d.customPresets.push(item));notify();return item;},
  installRecommended:async p=>{system=await inspectSystem(store.data.settings.modelPath);await refreshEngines();const recommendation=recommendationState();if(!recommendation.available)throw new Error(recommendation.reason);if(p.optionId!==recommendation.optionId)throw new Error('추천 구성이 변경되었습니다. 시스템을 재검사하고 표시된 구성을 확인하세요.');if(recommendation.installed)return {alreadyInstalled:true};return actions.installModel({id:recommendation.optionId});},
  installImageModel:async p=>{
    await refreshEngines();
    const row=localImage.families?.flatMap(family=>family.variants).find(item=>item.id===p.variantId);
    if(!row)throw new Error('설치할 이미지 모델을 목록에서 선택하세요.');
    if(row.status==='unavailable')throw new Error(row.reason||'이 PC에는 설치할 수 없는 모델입니다.');
    if(row.installed)throw new Error('이미 설치된 모델입니다.');
    if(store.data.jobs.some(job=>job.type==='imageInstall'&&['queued','running'].includes(job.status)))throw new Error('이미지 모델을 설치하고 있습니다. 끝난 뒤 다시 시도하세요.');
    const [job]=await queue.add([{operation:'imageInstall',variantId:row.id,title:`앨범아트 모델 설치 · ${row.familyName} ${row.quant}`,settings:{...store.data.settings}}]);return {jobId:job.id};
  },
  installModel:async p=>{system=await inspectSystem(store.data.settings.modelPath);const option=installationOptions(system,policySettings()).find(x=>x.id===p.id);if(!option)throw new Error('알 수 없는 설치 옵션입니다.');if(!option.supported)throw new Error(option.reason);if(queue.processing)throw new Error('진행 중인 작업이 끝난 후 모델을 변경하세요.');const receipt=installs[p.id];if(receipt?.status==='installed'&&receipt.result){const ready=await recommendedBundleInstalled({option,receipt,settings:store.data.settings,runner});if(ready&&(await inspectLyricRuntime({packageRoot:store.data.settings.modelPath})).ready){await store.mutate(d=>{Object.assign(d.settings,receipt.result);d.settings.installedModelId=p.id;d.settings.modelPath=enginePackages;});await refreshEngines();return {activated:true};}}if(store.data.jobs.some(j=>['running','queued'].includes(j.status)&&j.type==='install'))throw new Error('모델 설치가 이미 대기 중이거나 진행 중입니다.');return queue.add([{operation:'install',optionId:p.id,title:option.name+' 설치',settings:{...store.data.settings}}]);}
};
function trusted(event){return !!window&&!window.isDestroyed()&&event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame;}

async function finishQuit(){
  if(shutdownStarted)return;shutdownStarted=true;
  cancelCodexProcesses();cancelClaudeProcesses();
  try{await queue?.shutdown();}catch(error){await log(error);}
  quitting=true;app.quit();
}
function finishClose(){
  if(quitRequested){void finishQuit();return;}
  closeReady=true;if(window&&!window.isDestroyed())window.close();
}
function requestClose(quitApp=false){
  if(quitting||shutdownStarted)return;
  if(quitApp&&!quitRequested&&queue?.processing&&window&&!window.isDestroyed()){
    const choice=dialog.showMessageBoxSync(window,{type:'question',buttons:['계속 작업','작업 취소 후 종료'],defaultId:0,cancelId:0,message:'진행 중인 작업을 취소하고 종료할까요?'});
    if(choice===0)return;
  }
  quitRequested=quitRequested||quitApp;
  if(!window||window.isDestroyed()){if(quitRequested)void finishQuit();return;}
  if(closePending)return;
  closePending=true;window.webContents.send('boks:prepare-close');
  closeTimer=setTimeout(()=>{
    closePending=false;
    if(!window||window.isDestroyed()){if(quitRequested)void finishQuit();return;}
    const choice=dialog.showMessageBoxSync(window,{type:'warning',buttons:['앱으로 돌아가기','저장 확인 없이 종료'],defaultId:0,cancelId:0,message:'편집 화면의 저장 응답을 받지 못했습니다.'});
    if(choice===1)finishClose();else quitRequested=false;
  },5000);
}
async function createWindow(){
  closeReady=false;closePending=false;
  window=new BrowserWindow({width:1440,height:950,minWidth:1000,minHeight:700,...(isMac?{titleBarStyle:'hiddenInset',trafficLightPosition:{x:16,y:15}}:{frame:false}),backgroundColor:'#101110',icon:path.join(root,'assets',isMac?'icon.png':'icon.ico'),title:'Boks Music by @boksajang',show:false,webPreferences:{preload:path.join(root,'electron','preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event)=>event.preventDefault());
  // Native video controls use the Fullscreen API. Grant it only to our app window.
  const allowFullscreen=(contents,permission)=>permission==='fullscreen'&&!!window&&!window.isDestroyed()&&contents===window.webContents;
  window.webContents.session.setPermissionCheckHandler((contents,permission,_origin,details)=>allowFullscreen(contents,permission)&&details.isMainFrame===true);
  window.webContents.session.setPermissionRequestHandler((contents,permission,callback,details)=>callback(allowFullscreen(contents,permission)&&details.isMainFrame===true));
  let htmlFullscreen=false;
  window.webContents.on('enter-html-full-screen',()=>{htmlFullscreen=true;});
  window.webContents.on('leave-html-full-screen',()=>{htmlFullscreen=false;});
  window.webContents.on('before-input-event',(event,input)=>{if(htmlFullscreen&&input.type==='keyDown'&&input.key==='Escape'){event.preventDefault();void window.webContents.executeJavaScript('document.fullscreenElement ? document.exitFullscreen() : undefined',true).catch(log);}});
  const devURL=!app.isPackaged&&process.env.BOKS_DEV_URL;
  if(devURL&&!/^http:\/\/127\.0\.0\.1:\d+$/.test(devURL))throw new Error('개발 서버는 127.0.0.1 주소만 허용합니다.');
  const csp=`default-src 'self'; script-src 'self'${devURL?" 'unsafe-inline'":''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: boks-media:; media-src 'self' boks-media:; connect-src 'self' boks-media:${devURL?' '+devURL.replace('http:','ws:'):''}; object-src 'none'; base-uri 'none'`;
  window.webContents.session.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':[csp]}}));
  window.once('ready-to-show',()=>window.show());
  window.on('close',event=>{if(quitting||closeReady)return;event.preventDefault();requestClose(!isMac);});
  window.on('closed',()=>{clearTimeout(closeTimer);window=null;closeReady=false;closePending=false;});
  if(process.env.BOKS_DEV_URL&&!app.isPackaged)await window.loadURL(process.env.BOKS_DEV_URL);else await window.loadFile(path.join(root,'dist','index.html'));
}

if(ownsInstance)void app.whenReady().then(async()=>{
try{
  await mkdir(path.dirname(appPaths.log),{recursive:true});await clearTempFolder(dataRoot);
  store=await new Store(app.getPath('userData')).init();
  // Composer drafts live for this app session; saved songs and job requests remain intact.
  await store.mutate(d=>{d.settings.modelPath=enginePackages;for(const project of d.projects)project.draft={};for(const job of d.jobs)if(job.type==='youtubeExtract'&&job.result?.sessionId&&!job.result.importedTrackId)job.result.expired=true;});
  const discovered=Object.values(await readInstalls(store.data.settings.modelPath)).filter(x=>x.status==='installed'&&x.result).sort((a,b)=>String(b.installedAt).localeCompare(String(a.installedAt)))[0];
  if(discovered&&(!store.data.settings.installedModelId||!store.data.settings.nativeExecutable||!inside(store.data.settings.modelPath,store.data.settings.nativeExecutable)))await store.mutate(d=>{Object.assign(d.settings,discovered.result);d.settings.installedModelId=discovered.id;d.settings.modelPath=enginePackages;});
  await mkdir(store.data.settings.projectPath,{recursive:true});await mkdir(store.data.settings.modelPath,{recursive:true});
  system=await inspectSystem(store.data.settings.modelPath);
  youtubeImporter=createYoutubeImporter({packageRoot:store.data.settings.modelPath,sessionRoot:path.join(app.getPath('userData'),'youtube-imports'),ffmpegPath:()=>store.data.settings.ffmpegPath,nodePath:process.execPath});
  await youtubeImporter.cleanupExpired();
  // Work folders of video jobs from earlier runs (nothing runs yet at startup).
  await sweepVideoJobFolders(path.join(app.getPath('userData'),'video-jobs')).catch(error=>log(error));
  for(const job of store.prunedJobs||[])await removeJobFolder(job).catch(error=>log(error));
  // Videos keep no render cache: caches and the HyperFrames runtime left by earlier versions go.
  for(const dir of renderCacheDirectories())await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(error=>log(error));
  // Agent work runs through a CLI and never touches the GPU, so it gets its own serial lane:
  // a lyric request no longer waits behind a music generation (measured 110 s wait in the e2e).
  // Local album art uses the GPU: it waits in the engine lane with music, stems and installs.
  queue=new JobQueue({store,run:runJob,notify,progress:sendProgress,finished:job=>job.type==='video'?undefined:removeJobFolder(job),log,lane:job=>AGENT_JOB_TYPES.has(job.type)&&!(job.type==='albumArt'&&job.request?.settings?.imageEngine==='local')?'agent':'engine'});
  protocol.handle('boks-media',async request=>{try{const u=new URL(request.url);if(u.hostname==='video'){const row=findById(store.data.videos,u.pathname.slice(1),'영상');return await mediaResponse(row.videoPath,request);}if(u.hostname==='video-background'){const file=videoBackgrounds.get(u.pathname.slice(1));if(!file)return new Response('Not found',{status:404});return await mediaResponse(file,request);}if(u.hostname!=='track')return new Response('Not found',{status:404});const [trackId,type]=u.pathname.slice(1).split('/');const t=findById(store.data.tracks,trackId,'곡');const file=type==='art'?t.artPath:t.audioPath;if(!file)return new Response('Not found',{status:404});return await mediaResponse(file,request);}catch{return new Response('Not found',{status:404});}});
  ipcMain.handle('boks:invoke',async(event,method,payload)=>{try{if(!trusted(event)||!Object.hasOwn(actions,method))throw new Error('허용되지 않은 요청입니다.');if(trashBusy&&method!=='bootstrap')throw new Error('휴지통 처리 중입니다. 잠시 후 다시 시도하세요.');return {ok:true,data:await actions[method](payload||{})};}catch(e){await log(e);return {ok:false,error:e.code==='ENOSPC'?'저장 공간이 부족합니다.':e.code==='ENOENT'?'파일을 찾을 수 없습니다. 저장 위치와 설치 상태를 확인하세요.':e.message||'작업에 실패했습니다. 상세 로그를 확인하세요.'};}});
  ipcMain.on('boks:window',(event,action)=>{if(!trusted(event))return;if(action==='minimize')window.minimize();if(action==='maximize')window.isMaximized()?window.unmaximize():window.maximize();if(action==='close')window.close();});
  ipcMain.on('boks:close-ready',(event,ok)=>{if(!trusted(event)||!closePending)return;clearTimeout(closeTimer);closePending=false;if(ok===true)finishClose();else{quitRequested=false;void dialog.showMessageBox(window,{type:'error',message:'초안 저장에 실패하여 앱을 닫지 않았습니다. 저장 공간과 폴더 권한을 확인하세요.'});}});
  await createWindow();desktopReady=true;
  void refreshEngines();void refreshCodex();void refreshCodexBilling();void refreshClaude();
  const claudeUsageTimer=setInterval(()=>{if(!quitting&&claudeStatus.usable===true&&!claudeRefresh)void refreshClaudeUsage();},300000);claudeUsageTimer.unref();
  app.once('will-quit',()=>clearInterval(claudeUsageTimer));
  const usageTimer=setInterval(()=>{if(!quitting&&codexStatus.state==='installed'&&!codexRefresh)void refreshCodexUsage();},300000);usageTimer.unref();
  app.once('will-quit',()=>clearInterval(usageTimer));
}catch(e){await log(e);dialog.showErrorBox('Boks Music 시작 오류',e.message);app.quit();}
});
app.on('window-all-closed',()=>{if(!isMac)app.quit();});
app.on('activate',()=>{if(desktopReady&&!quitting&&!shutdownStarted&&(!window||window.isDestroyed()))void createWindow().catch(log);});
app.on('second-instance',()=>{if(window&&!window.isDestroyed()){if(window.isMinimized())window.restore();window.focus();}});
app.on('before-quit',event=>{if(quitting)return;event.preventDefault();requestClose(true);});
process.on('message',message=>{if(message==='boks:quit')app.quit();});

process.on('SIGINT',()=>app.quit());
process.on('SIGTERM',()=>app.quit());


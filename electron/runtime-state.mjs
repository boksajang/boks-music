import path from 'node:path';
import {existsSync} from 'node:fs';
import {hostProfile} from './host-profile.mjs';

const enginePaths=['nativeExecutable','backbonePath','vaePath','transcriberPath','stemPython','ffmpegPath','audioCppModelRoot'];
export function withoutVoiceRuntime(settings,platform=process.platform){
  const result={...settings};
  // Existing audio stays intact. Prefer the independent Stem FFmpeg; if an old
  // configuration has only its previous executable, retain it until repaired.
  const paths=platform==='win32'?path.win32:path.posix;
  const ffmpeg=result.stemPython?paths.join(paths.dirname(result.stemPython),platform==='win32'?'ffmpeg.exe':'ffmpeg'):'';
  if(ffmpeg&&existsSync(ffmpeg))result.ffmpegPath=ffmpeg;
  for(const key of ['voicePython','voiceRoot','voiceCheckpoint','voiceConfig','voiceDevice','defaultVoiceId'])delete result[key];
  if(result.engineSelection){result.engineSelection={...result.engineSelection};delete result.engineSelection.voice;}
  return result;
}
export function runtimeDefaults(platform=process.platform,arch=process.arch){
  const host=hostProfile(platform,arch);
  return {runtimePlatform:platform,runtimeArch:arch,musicBackend:platform==='darwin'?'audio-cpp':'yue2-cpp',nativeBackend:host.nativeBackend,stemDevice:host.stemDevice};
}
export function executableMatchesHost(file,platform=process.platform){
  if(typeof file!=='string'||!file)return false;
  if(platform==='darwin')return file.startsWith('/')&&!file.includes('\\')&&!/\.(exe|cmd|bat)$/i.test(file);
  return platform==='win32'&&path.win32.isAbsolute(file);
}
export function migrateRuntimeSettings(saved,defaults,platform=process.platform,arch=process.arch){
  const next={...defaults,...saved};
  const foreign=saved.runtimePlatform ? saved.runtimePlatform!==platform||saved.runtimeArch!==arch
    : enginePaths.some(key=>saved[key]&&(platform==='darwin'?/^[A-Za-z]:[\\/]|\.exe$/i.test(saved[key]):String(saved[key]).startsWith('/')));
  if(foreign){
    for(const key of enginePaths)next[key]='';
    for(const key of ['installedModelId','nativeCudaVariant','stemModel'])delete next[key];
    next.engineSelection={...defaults.engineSelection};
    Object.assign(next,runtimeDefaults(platform,arch));
  }
  Object.assign(next,{runtimePlatform:platform,runtimeArch:arch});
  if(platform==='darwin'&&!path.posix.isAbsolute(next.projectPath||''))next.projectPath=defaults.projectPath;
  return withoutVoiceRuntime(next,platform);
}
export function receiptMatchesHost(receipt,platform=process.platform,arch=process.arch){
  if(!receipt||receipt.status!=='installed'||!receipt.result)return false;
  const storedPlatform=receipt.platform||receipt.result.runtimePlatform;
  const storedArch=receipt.arch||receipt.result.runtimeArch;
  if(storedPlatform)return storedPlatform===platform&&storedArch===arch;
  // Existing verified bundles predate platform metadata and were Windows x64 only.
  return platform==='win32'&&arch==='x64'&&/\.exe$/i.test(receipt.result.nativeExecutable||'');
}

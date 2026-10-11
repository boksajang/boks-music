import path from 'node:path';
import {stat} from 'node:fs/promises';
import {receiptMatchesHost} from './runtime-state.mjs';
import {engineStates} from './engine.mjs';

// Inspect the recommended receipt's own bundle, never fill missing engine paths
// from whichever model the user currently has active.
export async function recommendedBundleInstalled({option,receipt,settings,runner,inspect=engineStates,platform=process.platform,arch=process.arch}) {
  if(!option || !receiptMatchesHost(receipt,platform,arch))return false;
  const result=receipt.result;
  const required=['nativeExecutable','backbonePath','vaePath','transcriberPath','stemPython','ffmpegPath'];
  if(required.some(key=>typeof result[key]!=='string'||!path.isAbsolute(result[key])))return false;
  if(path.basename(result.backbonePath)!==option.backbone)return false;
  if(platform==='darwin'&&!path.isAbsolute(result.audioCppModelRoot||''))return false;
  const candidate={...result,modelPath:settings.modelPath};
  const files=required.map(key=>result[key]);
  files.push(path.join(settings.modelPath,'stems',result.stemModel||'model_bs_roformer_ep_317_sdr_12.9755.ckpt'));
  // The integrated Stem installation includes both two-stem and multi-stem data.
  files.push(path.join(settings.modelPath,'stems','BS-Rofo-SW-Fixed.ckpt'),path.join(settings.modelPath,'stems','BS-Rofo-SW-Fixed.yaml'));
  try {
    for(const file of files){const info=await stat(file);if(!info.isFile()||info.size===0)return false;}
    const states=await inspect(candidate,runner);
    return ['music','cover','stems'].every(id=>states.some(state=>state.id===id&&state.available===true));
  }catch{return false;}
}

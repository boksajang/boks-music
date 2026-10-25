import {drawSpectrum,frameAt} from './canvas-kit.mjs';
import {analyzeAudioFrame} from './audio-frame.mjs';
import albumblur from './canvas-scenes/albumblur.mjs';
import photo from './canvas-scenes/photo.mjs';
import vinyl from './canvas-scenes/vinyl.mjs';
import paper from './canvas-scenes/paper.mjs';
import cinematic from './canvas-scenes/cinematic.mjs';
import spectrum from './canvas-scenes/spectrum.mjs';
import tracklist from './canvas-scenes/tracklist.mjs';
import cassette from './canvas-scenes/cassette.mjs';
import crt from './canvas-scenes/crt.mjs';
import radio from './canvas-scenes/radio.mjs';
import vumeter from './canvas-scenes/vumeter.mjs';
import polaroid from './canvas-scenes/polaroid.mjs';
import rainwindow from './canvas-scenes/rainwindow.mjs';
import water from './canvas-scenes/water.mjs';
import phone from './canvas-scenes/phone.mjs';
import neon from './canvas-scenes/neon.mjs';
import kinetic from './canvas-scenes/kinetic.mjs';
import karaoke from './canvas-scenes/karaoke.mjs';
import swiss from './canvas-scenes/swiss.mjs';
import coverflow from './canvas-scenes/coverflow.mjs';
import subway from './canvas-scenes/subway.mjs';
import forge from './canvas-scenes/forge.mjs';
import bloodmoon from './canvas-scenes/bloodmoon.mjs';
import rockstage from './canvas-scenes/rockstage.mjs';
import vhs from './canvas-scenes/vhs.mjs';
import graffiti from './canvas-scenes/graffiti.mjs';
import fisheye from './canvas-scenes/fisheye.mjs';
import nightdrive from './canvas-scenes/nightdrive.mjs';
import boombox from './canvas-scenes/boombox.mjs';
import loveletter from './canvas-scenes/loveletter.mjs';
import heartmonitor from './canvas-scenes/heartmonitor.mjs';
import rose from './canvas-scenes/rose.mjs';
import sakura from './canvas-scenes/sakura.mjs';
import silentfilm from './canvas-scenes/silentfilm.mjs';
import streetlamp from './canvas-scenes/streetlamp.mjs';
import typewriter from './canvas-scenes/typewriter.mjs';
import inkbleed from './canvas-scenes/inkbleed.mjs';

/**
 * GPU canvas scenes. A scene draws one frame for a given time on a 2D canvas, so the same code drives
 * the editor preview and the WebCodecs renderer (no screenshots).
 */
const SCENES={albumblur,photo,vinyl,paper,cinematic,spectrum,tracklist,cassette,crt,radio,vumeter,polaroid,rainwindow,water,phone,neon,kinetic,karaoke,swiss,coverflow,subway,forge,bloodmoon,rockstage,vhs,graffiti,fisheye,nightdrive,boombox,loveletter,heartmonitor,rose,sakura,silentfilm,streetlamp,typewriter,inkbleed};
export const CANVAS_SCENES=Object.freeze(Object.keys(SCENES));
/** Scene modules, for the render cache identity. */
export const CANVAS_SCENE_FILES=Object.freeze(['./canvas-kit.mjs','./audio-frame.mjs',...CANVAS_SCENES.map(id=>`./canvas-scenes/${id}.mjs`)]);
export {drawSpectrum};

/** Decodes the packed analysis produced by the renderer (same format as the HTML scene). */
export function unpackAnalysis(item){
 if(item?.encoding!=='u8-bins-i8-wave')return item||null;
 const binary=atob(item.data||'');
 if(binary.length!==item.frameCount*192)throw Error('Audio analysis size mismatch');
 return {...item,data:undefined,packed:Uint8Array.from(binary,char=>char.charCodeAt(0))};
}

export function createCanvasScene({scene,...input}){
 const make=SCENES[scene];
 if(!make)throw Error('지원하지 않는 GPU 영상 장면입니다.');
 return make({...input,options:{...input.options},images:input.images||{},analyses:input.analyses||[]});
}

/** Decodes an image no larger than `limit` on its long side (album art is drawn at most about that size). */
export async function boundedBitmap(blob,limit){
 const bitmap=await createImageBitmap(blob),scale=limit/Math.max(bitmap.width,bitmap.height);
 if(!(scale<1))return bitmap;
 const smaller=await createImageBitmap(bitmap,{resizeWidth:Math.max(1,Math.round(bitmap.width*scale)),resizeHeight:Math.max(1,Math.round(bitmap.height*scale)),resizeQuality:'high'});bitmap.close();return smaller;
}
const loadBitmap=async(src,limit,signal)=>{if(!src)return null;try{const response=await fetch(src,{signal});if(!response.ok)return null;return await boundedBitmap(await response.blob(),limit);}catch{return null;}};
/** Decodes a song for the editor preview and analyses frames on demand with the renderer's FFT. */
async function liveAnalysis(src,signal){
 if(!src)return null;
 try{
  const response=await fetch(src,{signal});if(!response.ok)return null;const bytes=await response.arrayBuffer();
  const context=new OfflineAudioContext(1,1,12000),buffer=await context.decodeAudioData(bytes);
  const channels=Array.from({length:buffer.numberOfChannels},(_,c)=>buffer.getChannelData(c)),samples=new Float32Array(buffer.length);
  for(const data of channels)for(let i=0;i<data.length;i++)samples[i]+=data[i]/channels.length;
  const cache=new Map();
  return {sample(time){const key=Math.round(Math.max(0,time)*30);if(!cache.has(key)){if(cache.size>900)cache.clear();cache.set(key,analyzeAudioFrame(samples,key/30,buffer.sampleRate));}return cache.get(key);}};
 }catch{return null;}
}

/**
 * Editor preview: the scene plays in real time on a canvas inside the preview host, starting a little
 * before the first lyric so motion and lyrics are visible at once. Art and the background are fetched
 * as bitmaps (the album color can be read; no tainted canvas) and the first song is decoded for a
 * measured spectrum. `update` swaps the scene or its options without reloading media or restarting.
 */
export function mountCanvasPreview(host,{scene,tracks=[],options={},duration,assets={},start}={}){
 const root=host.shadowRoot||host.attachShadow({mode:'open'});
 const width=Number(options.width)||960,height=Number(options.height)||540;
 const canvas=Object.assign(document.createElement('canvas'),{width,height});canvas.style.cssText='display:block;transform-origin:0 0';
 root.replaceChildren(canvas);
 const fit=()=>{canvas.style.transform=`scale(${Math.min(host.clientWidth/width,host.clientHeight/height)})`;};
 const observer=new ResizeObserver(fit);observer.observe(host);fit();
 const ctx=canvas.getContext('2d',{alpha:false});
 let disposed=false,frame=0,instance=null,current={scene,options},media=null;const controller=new AbortController();
 const rows=tracks.map(track=>({...track,duration:Number(track.duration)||Number(duration)||0}));
 const analyses=rows.map(()=>null);
 const build=()=>{try{instance=createCanvasScene({scene:current.scene,width,height,tracks:rows,options:current.options,images:media,analyses});}catch(error){instance=null;console.error(error);}};
 const ready=(rows.length?Promise.all([loadBitmap(assets.backgroundUrl,2048,controller.signal),...rows.map(track=>loadBitmap(track.artUrl,1024,controller.signal))]):Promise.resolve([null])).then(([background,...arts])=>{
  media={background,arts};
  if(disposed)return;
  if(!rows.length){ctx.fillStyle='#0b0f18';ctx.fillRect(0,0,width,height);return;}
  build();
  const firstCue=rows[0]?.cues?.find(cue=>Number.isFinite(cue.start))?.start;
  const from=Number.isFinite(start)?start:options.mode==='vocal'&&Number.isFinite(firstCue)?Math.max(0,firstCue-1.2):0,began=performance.now();
  // The first song's spectrum follows its real audio once decoded; the preview never fakes a spectrum.
  void liveAnalysis(rows[0]?.audioUrl,controller.signal).then(live=>{if(live&&!disposed)analyses[0]=live;});
  const tick=()=>{
   if(disposed)return;
   const total=instance?.duration||0,t=total>0?(from+(performance.now()-began)/1000)%total:0;
   try{instance?.draw(ctx,t);}catch(error){console.error(error);instance=null;}
   frame=requestAnimationFrame(tick);
  };
  tick();
 });
 const release=()=>{for(const image of [media?.background,...(media?.arts||[])])image?.close?.();};
 return {ready,
  update:next=>{current={scene:next.scene??current.scene,options:next.options??current.options};if(media&&rows.length)build();},
  dispose:()=>{disposed=true;controller.abort();cancelAnimationFrame(frame);observer.disconnect();if(media)release();else ready.then(release);}};
}
export {frameAt};

/** One still frame of a scene for the template picker (same drawing code as the video). */
export function renderSceneThumbnail(canvas,{scene,tracks=[],options={},images={},time=0}){
 try{
  const rows=tracks.map(track=>({...track,duration:Number(track.duration)||0}));
  if(!rows.length)return false;
  createCanvasScene({scene,width:canvas.width,height:canvas.height,tracks:rows,options:{...options,width:canvas.width,height:canvas.height},images,analyses:[]}).draw(canvas.getContext('2d',{alpha:false}),time);
  return true;
 }catch(error){console.error(error);return false;}
}
export {loadBitmap as loadSceneBitmap};

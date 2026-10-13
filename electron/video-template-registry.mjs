import {readdirSync,readFileSync,realpathSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SPECTRUM_STYLES} from './video-spectrum.mjs';
import {CANVAS_SCENES} from './canvas-scene.mjs';

// Every template is a manifest for a built-in canvas scene (renderer "canvas"): GPU-drawn and
// hardware-encoded with WebCodecs (H.264 caps it at 2160p).

export const videoTemplateDirectory=fileURLToPath(new URL('../video-templates/',import.meta.url));
const safeId=/^[a-z][a-z0-9-]{0,63}$/;
function localFile(folder,name){
 if(typeof name!=='string'||path.isAbsolute(name))throw Error('템플릿 파일 이름이 올바르지 않습니다.');
 const resolved=realpathSync(path.resolve(folder,name)),relative=path.relative(realpathSync(folder),resolved);
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('템플릿 폴더 밖의 파일은 사용할 수 없습니다.');
 if(!statSync(resolved).isFile()||statSync(resolved).size>256*1024)throw Error('템플릿 파일이 너무 크거나 읽을 수 없습니다.');
 return readFileSync(resolved,'utf8');
}
export function readVideoTemplates(directory=videoTemplateDirectory){
 const templates=[],errors=[];
 for(const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  if(!entry.isDirectory()||entry.name.startsWith('.'))continue;
  try{
   const folder=path.join(directory,entry.name),data=JSON.parse(localFile(folder,'template.json'));
   if(data.schemaVersion!==1||!safeId.test(data.id)||data.id!==entry.name||typeof data.name!=='string'||!data.name.trim()||data.name.length>80)throw Error('템플릿 ID·이름·버전을 확인하세요.');
   if(!Array.isArray(data.aspects)||!data.aspects.length||data.aspects.some(a=>!['16:9','9:16'].includes(a)))throw Error('지원 화면 비율을 확인하세요.');
   if(!Array.isArray(data.spectra)||!data.spectra.length||data.spectra.some(id=>!SPECTRUM_STYLES.some(style=>style.id===id))||!data.spectra.includes(data.recommendedSpectrum))throw Error('지원 스펙트럼과 추천 스펙트럼을 확인하세요.');
   const modes=data.modes??['vocal','instrumental'];
   if(!Array.isArray(modes)||!modes.length||modes.some(mode=>!['vocal','instrumental'].includes(mode)))throw Error('지원 영상 종류(modes)는 vocal, instrumental 중에서 지정하세요.');
   if(data.renderer!=='canvas')throw Error('GPU 장면 템플릿(renderer: canvas)만 사용할 수 있습니다.');
   if(!CANVAS_SCENES.includes(data.scene))throw Error('GPU 템플릿의 장면(scene)을 확인하세요.');
   const maxResolution=Math.min(2160,Number(data.maxResolution)||2160);
   templates.push({id:data.id,name:data.name.trim(),description:String(data.description||'').slice(0,240),order:Number(data.order)||100,requiresBackground:data.requiresBackground===true,aspects:data.aspects,modes:[...new Set(modes)],spectra:data.spectra,recommendedSpectrum:data.recommendedSpectrum,renderer:'canvas',scene:data.scene,maxResolution});
  }catch(error){errors.push({folder:entry.name,message:error.message});}
 }
 templates.sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name));return {templates,errors};
}
export function listVideoTemplates(){return readVideoTemplates().templates;}
export function getVideoTemplate(id){const {templates,errors}=readVideoTemplates();const item=templates.find(t=>t.id===id);if(!item)throw Error(errors.find(e=>e.folder===id)?.message||'선택한 영상 템플릿을 찾지 못했습니다. 목록을 새로고침하세요.');return item;}

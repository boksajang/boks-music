import {readdirSync,readFileSync,realpathSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SPECTRUM_STYLES} from './video-spectrum.mjs';
import {CANVAS_SCENES} from './canvas-scene.mjs';

// renderer "html" (default): theme.css over the shared HTML scene, captured by HyperFrames.
// renderer "canvas": a built-in canvas scene, GPU-drawn and hardware-encoded (H.264 caps it at 2160p).

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
   const renderer=data.renderer??'html';
   if(!['html','canvas'].includes(renderer))throw Error('템플릿 렌더러는 html 또는 canvas입니다.');
   if(renderer==='canvas'&&!CANVAS_SCENES.includes(data.scene))throw Error('GPU 템플릿의 장면(scene)을 확인하세요.');
   const maxResolution=renderer==='canvas'?Math.min(2160,Number(data.maxResolution)||2160):Number(data.maxResolution)||undefined;
   const themeCss=renderer==='canvas'?'':localFile(folder,data.stylesheet||'theme.css');
   if(/<\/style|@import|url\s*\(/i.test(themeCss))throw Error('테마에는 외부 파일을 불러오는 CSS를 사용할 수 없습니다.');
   templates.push({id:data.id,name:data.name.trim(),description:String(data.description||'').slice(0,240),order:Number(data.order)||100,requiresBackground:data.requiresBackground===true,aspects:data.aspects,modes:[...new Set(modes)],spectra:data.spectra,recommendedSpectrum:data.recommendedSpectrum,themeCss,renderer,...(renderer==='canvas'?{scene:data.scene}:{}),...(maxResolution?{maxResolution}:{})});
  }catch(error){errors.push({folder:entry.name,message:error.message});}
 }
 templates.sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name));return {templates,errors};
}
export function listVideoTemplates(){return readVideoTemplates().templates;}
export function getVideoTemplate(id){const {templates,errors}=readVideoTemplates();const item=templates.find(t=>t.id===id);if(!item)throw Error(errors.find(e=>e.folder===id)?.message||'선택한 영상 템플릿을 찾지 못했습니다. 목록을 새로고침하세요.');return item;}

import path from 'node:path';
import {copyFile,constants} from 'node:fs/promises';
import {validatePng} from './codex.mjs';
import {ensureSpace} from './store.mjs';
import {stat} from 'node:fs/promises';

export async function exportAlbumArt(source,title,directory) {
  if(!source)throw new Error('다운로드할 앨범아트가 없습니다.');
  await validatePng(source);
  await ensureSpace(directory,(await stat(source)).size);
  let name=Array.from(String(title||'노래').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').trim()).slice(0,100).join('').replace(/[. ]+$/,'')||'노래';
  while(Buffer.byteLength(name,'utf8')>220)name=Array.from(name).slice(0,-1).join('');
  for(let index=0;index<10000;index++){
    const destination=path.join(directory,`${name}_album_art${index?` (${index})`:''}.png`);
    try{await copyFile(source,destination,constants.COPYFILE_EXCL);return destination;}
    catch(error){if(error.code!=='EEXIST')throw error;}
  }
  throw new Error('동일한 이름의 파일이 너무 많습니다. 다른 폴더를 선택하세요.');
}

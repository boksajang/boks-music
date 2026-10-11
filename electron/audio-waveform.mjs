import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {stemWaveform} from './stem-waveform.mjs';

const cache=new Map(),pending=new Map();
export async function audioWaveform(file,{ffmpegPath,cacheDirectory}={}){
  const info=await stat(file),key=`${file}:${info.size}:${info.mtimeMs}`;
  if(cache.has(key))return cache.get(key);
  if(pending.has(key))return pending.get(key);
  const operation=(async()=>{
    let result;
    try{result=await stemWaveform(file,1600);}catch(original){
      if(!ffmpegPath)throw original;
      await mkdir(cacheDirectory,{recursive:true});const directory=await mkdtemp(path.join(cacheDirectory,'waveform-'));
      try{
        const output=path.join(directory,'audio.wav');
        await new Promise((resolve,reject)=>{
          const child=spawn(ffmpegPath,['-hide_banner','-nostdin','-v','error','-n','-i',file,'-map','0:a:0','-vn','-ac','1','-ar','8000','-c:a','pcm_s16le',output],{shell:false,windowsHide:true,stdio:['ignore','ignore','pipe']});let error='';
          const timeout=setTimeout(()=>{error='오디오 분석 응답 시간이 초과되었습니다.';child.kill('SIGKILL');},120000);timeout.unref();
          child.stderr.on('data',data=>error=(error+data).slice(-2000));child.on('error',failure=>{clearTimeout(timeout);reject(failure);});child.on('close',code=>{clearTimeout(timeout);code===0?resolve():reject(new Error('파형을 읽지 못했습니다. '+error));});
        });
        result=await stemWaveform(output,1600);
      }finally{await rm(directory,{recursive:true,force:true});}
    }
    if(cache.size>=24)cache.delete(cache.keys().next().value);cache.set(key,result);return result;
  })();pending.set(key,operation);try{return await operation;}finally{pending.delete(key);}
}

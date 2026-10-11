import path from 'node:path';
import {lstat} from 'node:fs/promises';
import {downloadVerified} from './download.mjs';

// Hugging Face model API (blobs=true), inspected 2026-10-06. Pin both the
// repository revision and LFS digest; never resolve a mutable main branch.
export const instrumentalLoraAsset=Object.freeze({
  repository:'Mothersuperior/YuE2-instrumental-cot-full-loras',
  revision:'947f2f4b28978b2b6c3e316e6a87925c76bf3c4b',
  filename:'ar_lora_inst_v3abc.bf16.safetensors',
  bytes:139502088,
  sha256:'e408fd3148b75b1165f7ddbf63db575d83bb6402a0b5f876fcb767dbcb2c5414',
  license:'cc-by-nc-4.0',
  url:'https://huggingface.co/Mothersuperior/YuE2-instrumental-cot-full-loras/resolve/947f2f4b28978b2b6c3e316e6a87925c76bf3c4b/ar_lora_inst_v3abc.bf16.safetensors',
});

async function rejectRedirects(target){
  const resolved=path.resolve(target),root=path.parse(resolved).root;
  let current=root;
  for(const part of resolved.slice(root.length).split(path.sep).filter(Boolean)){
    current=path.join(current,part);
    let info;try{info=await lstat(current);}catch(error){if(error.code==='ENOENT')continue;throw error;}
    if(info.isSymbolicLink())throw new Error('LoRA 설치 경로에 연결 폴더 또는 심볼릭 링크를 사용할 수 없습니다.');
    if(current!==resolved&&!info.isDirectory())throw new Error('LoRA 설치 폴더 경로가 올바르지 않습니다.');
  }
}

export async function ensureInstrumentalLora({modelPath,signal,onProgress=()=>{}},{platform=process.platform,download=downloadVerified}={}){
  signal?.throwIfAborted();
  if(!['win32','darwin'].includes(platform))throw new Error('경음악 LoRA 설치는 Windows와 macOS에서 지원합니다.');
  if(typeof modelPath!=='string'||!path.isAbsolute(modelPath))throw new Error('프로젝트 엔진 패키지 폴더를 확인하세요.');
  const directory=path.join(modelPath,'adapters','instrumental-v3');
  const destination=path.join(directory,instrumentalLoraAsset.filename);
  await rejectRedirects(destination);
  await rejectRedirects(destination+'.partial');
  signal?.throwIfAborted();
  onProgress({stage:'경음악 LoRA 설치·무결성 확인 중'});
  // downloadVerified checks SHA-256 even for an existing file; corrupt assets are
  // replaced only after a complete, verified download. Cancellation propagates.
  await download(instrumentalLoraAsset,destination,{signal,onProgress});
  signal?.throwIfAborted();
  return {directory,name:instrumentalLoraAsset.filename,identity:{repository:instrumentalLoraAsset.repository,revision:instrumentalLoraAsset.revision,filename:instrumentalLoraAsset.filename,sha256:instrumentalLoraAsset.sha256,bytes:instrumentalLoraAsset.bytes,license:instrumentalLoraAsset.license}};
}

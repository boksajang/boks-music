// SHA-256 verification of large local model files, remembered per file identity.
// A model is hashed once; later runs reuse that result while its size, modification time (ns) and
// file ID are unchanged, which any rewrite or replacement changes. Re-hashing the 7.2 GB YuE2
// BF16 backbone + VAE took 7-12 s of every generation (song e2e, 2026-10-11).
// The record protects against corrupt or swapped files, like the full hash it stands in for.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {hashFile} from './download.mjs';

async function identity(file){
  const info=await fs.stat(file,{bigint:true});
  return {size:String(info.size),mtimeNs:String(info.mtimeNs),ino:String(info.ino),dev:String(info.dev)};
}
async function readRecords(cacheFile){try{const data=JSON.parse(await fs.readFile(cacheFile,'utf8'));return data&&typeof data==='object'&&!Array.isArray(data)?data:{};}catch{return {};}}

// true when the file has the expected size and SHA-256 (from the record or a fresh full hash).
export async function verifyFile(file,{sha256,bytes},{cacheFile,signal}={}){
  if(!/^[a-f\d]{64}$/i.test(sha256||''))throw new Error('고정된 모델 SHA-256이 없습니다.');
  const expected=sha256.toLowerCase(),key=path.resolve(file),before=await identity(file);
  if(bytes!==undefined&&before.size!==String(bytes))return false;
  const known=cacheFile?(await readRecords(cacheFile))[key]:null;
  if(known&&known.sha256===expected&&['size','mtimeNs','ino','dev'].every(name=>known[name]===before[name]))return true;
  if(await hashFile(file,signal)!==expected)return false;
  // A file replaced while it was being hashed is not recorded.
  const after=await identity(file);
  if(cacheFile&&Object.keys(before).every(name=>before[name]===after[name])){
    const records={...await readRecords(cacheFile),[key]:{...after,sha256:expected,verifiedAt:new Date().toISOString()}};
    await fs.mkdir(path.dirname(cacheFile),{recursive:true});
    const temp=`${cacheFile}.${randomUUID()}.partial`;
    try{await fs.writeFile(temp,JSON.stringify(records,null,2));await fs.rename(temp,cacheFile);}catch{await fs.rm(temp,{force:true}).catch(()=>{});}
  }
  return true;
}
export const verifiedModelsFile=modelPath=>path.join(modelPath,'cache','verified-models.json');

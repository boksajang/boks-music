import {readFile,writeFile,rename,readdir,readlink,symlink,unlink,stat,rmdir,copyFile} from 'node:fs/promises';
import path from 'node:path';

/**
 * Moving the app folder (a portable copy carried elsewhere, an install folder moved or copied) must keep songs,
 * engines and models working. Paths are stored as absolute paths in many places: the library, the engine install
 * receipts, the lyric runtime's ready.json, the model verification cache, the Python environments' pyvenv.cfg,
 * the folder links uv makes for its Python and uv's python.exe launchers, which carry the base interpreter's path. Each root keeps a note of where it last ran (LOCATION_FILE); when the
 * app starts somewhere else, every stored path under the old root is rewritten to the new one. Paths outside the
 * roots (a project or video folder the user chose elsewhere) are left alone.
 */
export const LOCATION_FILE='.boks-location.json';

const key=(value,platform)=>{const resolved=path.resolve(value);return platform==='win32'?resolved.toLowerCase():resolved;};
export const samePath=(a,b,platform=process.platform)=>key(a,platform)===key(b,platform);

/** The value with an old root prefix swapped for the new root, or the value itself. */
export function swapRoot(value,pairs,platform=process.platform){
 if(typeof value!=='string'||!path.isAbsolute(value))return value;
 const lower=platform==='win32'?value.toLowerCase():value;
 for(const [from,to] of pairs){
  const prefix=platform==='win32'?from.toLowerCase():from;
  if(lower===prefix)return to;
  if(lower.startsWith(prefix)&&/[\\/]/.test(value[from.length]))return to+value.slice(from.length);
 }
 return value;
}
/** Rewrites every string (and object key) under an old root in place; returns how many values changed. */
export function rewriteRoots(target,pairs,platform=process.platform){
 let changed=0;
 const visit=node=>{
  if(Array.isArray(node)){for(let i=0;i<node.length;i++){const next=swapRoot(node[i],pairs,platform);if(next!==node[i]){node[i]=next;changed++;}else if(node[i]&&typeof node[i]==='object')visit(node[i]);}return;}
  for(const name of Object.keys(node)){
   const value=node[name],next=swapRoot(value,pairs,platform);
   if(next!==value){node[name]=next;changed++;}else if(value&&typeof value==='object')visit(value);
   const renamed=swapRoot(name,pairs,platform);
   if(renamed!==name){const entry=node[name];delete node[name];node[renamed]=entry;changed++;}
  }
 };
 if(target&&typeof target==='object')visit(target);
 return changed;
}
/** Text files (pyvenv.cfg): every occurrence of an old root followed by a separator or the end of the token. */
export function rewriteRootsInText(text,pairs,platform=process.platform){
 let result=text;
 for(const [from,to] of pairs){
  const pattern=new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=[\\\\/]|$|[\\s"\'])',platform==='win32'?'gim':'gm');
  result=result.replace(pattern,()=>to);
 }
 return result;
}

export async function readLocation(root){
 try{const note=JSON.parse(await readFile(path.join(root,LOCATION_FILE),'utf8'));return typeof note?.path==='string'&&path.isAbsolute(note.path)?note.path:'';}
 catch{return '';}
}
export async function writeLocation(root,location=root){
 const file=path.join(root,LOCATION_FILE),temporary=file+'.tmp';
 await writeFile(temporary,JSON.stringify({path:path.resolve(location),updatedAt:new Date().toISOString()}));await rename(temporary,file);
}

/** Where the data folder ran before, for libraries written before LOCATION_FILE existed: the default project folder. */
export function legacyDataRoot(data,platform=process.platform){
 const candidates=[data?.settings?.projectPath,...(data?.projects||[]).map(row=>row?.directory&&path.dirname(row.directory))];
 for(const folder of candidates)if(typeof folder==='string'&&path.isAbsolute(folder)&&path.basename(folder).toLowerCase()==='projects'&&path.basename(path.dirname(folder)).toLowerCase()==='app-data')return path.dirname(folder);
 return '';
}

// Folders that never hold path records: model weights, caches, Python libraries and the contents of a Python environment.
const skipped=new Set(['uv-cache','huggingface','gguf','models','downloads','temp','tmp','.temp','cache-tmp','lib','libs','dlls','include','share','scripts','bin','site-packages','__pycache__','node_modules','torch','tcl','audit-legacy']);
/** Path records, Python environment configs, launchers and folder links under the engine root. */
export async function engineRecords(root){
 const found={json:[],cfg:[],links:[],launchers:[]};
 const walk=async(folder,depth)=>{
  let entries;try{entries=await readdir(folder,{withFileTypes:true});}catch{return;}
  const environment=entries.some(entry=>entry.isFile()&&entry.name==='pyvenv.cfg');
  // A Python environment: its launchers (Windows) or interpreter links (macOS) point at the base Python.
  if(environment)for(const name of ['Scripts','bin'])for(const entry of await readdir(path.join(folder,name),{withFileTypes:true}).catch(()=>[])){
   const file=path.join(folder,name,entry.name);
   if(entry.isSymbolicLink())found.links.push(file);else if(entry.isFile()&&/^pythonw?\.exe$/i.test(entry.name))found.launchers.push(file);
  }
  for(const entry of entries){
   const file=path.join(folder,entry.name);
   if(entry.isSymbolicLink())found.links.push(file);
   else if(entry.isFile()){if(entry.name==='pyvenv.cfg')found.cfg.push(file);else if(/\.json$/i.test(entry.name)&&entry.name!==LOCATION_FILE)found.json.push(file);}
   else if(entry.isDirectory()&&!environment&&depth<5&&!skipped.has(entry.name.toLowerCase())&&!/^cpython-\d/i.test(entry.name))await walk(file,depth+1);
  }
 };
 await walk(root,0);
 return found;
}
async function replaceFile(file,content){const temporary=file+'.relocating';await writeFile(temporary,content);await rename(temporary,file);}
/** Rewrites the engine folder's own records and links; returns {changed, failures}. */
export async function relocateEngineRecords(root,pairs,platform=process.platform){
 const records=await engineRecords(root),failures=[];let changed=0;
 for(const file of records.json)try{
  const info=await stat(file);if(info.size>4*1024*1024)continue;
  const text=await readFile(file,'utf8');let data;try{data=JSON.parse(text.replace(/^\uFEFF/,''));}catch{continue;}
  if(!rewriteRoots(data,pairs,platform))continue;
  await replaceFile(file,/^\{\r?\n\s/.test(text)?JSON.stringify(data,null,2)+'\n':JSON.stringify(data));changed++;
 }catch(error){failures.push({file,reason:error.message});}
 for(const file of records.cfg)try{
  const text=await readFile(file,'utf8'),next=rewriteRootsInText(text,pairs,platform);
  if(next!==text){await replaceFile(file,next);changed++;}
 }catch(error){failures.push({file,reason:error.message});}
 // uv links its Python folder by version (a junction on Windows): point it at the moved folder.
 for(const link of records.links)try{
  const target=await readlink(link),next=swapRoot(target,pairs,platform);
  if(next===target)continue;
  const info=await stat(next).catch(()=>null);if(!info)throw new Error(`연결 대상이 없습니다: ${next}`);
  const kind=info.isDirectory()?'dir':'file';
  // Only the link goes: unlink, or rmdir for a directory link where unlink is refused.
  await unlink(link).catch(error=>['EPERM','EISDIR'].includes(error.code)?rmdir(link):Promise.reject(error));
  await symlink(next,link,platform==='win32'&&kind==='dir'?'junction':kind);changed++;
 }catch(error){failures.push({file:link,reason:error.message});}
 // uv's launcher has the base interpreter's absolute path built in (a PE resource), so it would keep starting the
 // Python of the old folder. CPython's own venv launcher reads home from pyvenv.cfg (rewritten above) instead.
 for(const launcher of records.launchers)try{
  const binary=await readFile(launcher);
  if(!binary.includes('uv.Trampoline')||!pairs.some(([from])=>binary.toString('utf8').toLowerCase().includes(from.toLowerCase())))continue;
  const config=await readFile(path.join(path.dirname(path.dirname(launcher)),'pyvenv.cfg'),'utf8');
  const home=/^home\s*=\s*(.+?)\s*$/m.exec(config)?.[1];if(!home)throw new Error('pyvenv.cfg에 home이 없습니다.');
  const source=path.join(home,'Lib','venv','scripts','nt',path.basename(launcher).toLowerCase());
  if(!(await stat(source).catch(()=>null))?.isFile())throw new Error(`Python 실행기를 찾을 수 없습니다: ${source}`);
  const temporary=launcher+'.relocating';await copyFile(source,temporary);await rename(temporary,launcher);changed++;
 }catch(error){failures.push({file:launcher,reason:error.message});}
 return {changed,failures};
}

/**
 * Runs at startup before anything reads a stored path. dataRoot holds the library (store); engineRoot is skipped
 * (null) for test runs that use the real engine folder. Returns what moved, for the log and a notice.
 */
export async function relocateRoots({store,dataRoot,engineRoot,platform=process.platform}){
 const result={moved:[],changed:0,failures:[]};
 const dataFrom=await readLocation(dataRoot)||legacyDataRoot(store.data,platform);
 const engineFrom=[];
 if(engineRoot){
  const noted=await readLocation(engineRoot);
  if(noted)engineFrom.push(noted);
  else{
   // Before the note existed: the engine folder the library last used (settings.modelPath, set at every start)
   // and the one each install receipt recorded.
   const roots=new Set([store.data.settings?.modelPath]);
   for(const file of (await engineRecords(engineRoot)).json)try{const text=await readFile(file,'utf8');const data=JSON.parse(text.replace(/^\uFEFF/,''));for(const value of [data?.modelPath,data?.result?.modelPath,data?.result?.settings?.modelPath])roots.add(value);}catch{}
   // Only engine folders by name: a stray path elsewhere is never taken for an old app folder.
   for(const value of roots)if(typeof value==='string'&&path.isAbsolute(value)&&path.basename(value).toLowerCase()==='engine-packages')engineFrom.push(value);
  }
 }
 const pairs=[];
 if(dataFrom&&!samePath(dataFrom,dataRoot,platform))pairs.push([path.resolve(dataFrom),path.resolve(dataRoot)]);
 for(const from of engineFrom)if(!samePath(from,engineRoot,platform)&&!pairs.some(([known])=>samePath(known,from,platform)))pairs.push([path.resolve(from),path.resolve(engineRoot)]);
 // A longer old root first, so a folder inside another is matched by its own pair.
 pairs.sort((a,b)=>b[0].length-a[0].length);
 if(pairs.length){
  result.moved=pairs.map(([from,to])=>({from,to}));
  await store.mutate(data=>{result.changed+=rewriteRoots(data,pairs,platform);});
  if(engineRoot){const engines=await relocateEngineRecords(engineRoot,pairs,platform);result.changed+=engines.changed;result.failures.push(...engines.failures);}
 }
 await writeLocation(dataRoot);
 // After a failed engine record the note keeps the old location, so the next start tries again.
 if(engineRoot){const old=pairs.find(([,to])=>samePath(to,engineRoot,platform))?.[0];await writeLocation(engineRoot,result.failures.length&&old?old:engineRoot);}
 return result;
}

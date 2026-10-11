import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Bounded native executable discovery; never invokes npm shims or a shell. */
export function resolveCodexExecutable({env=process.env,platform=process.platform,home=os.homedir(),fs:io=fs}={}) {
  const windows=platform==='win32',mac=platform==='darwin';
  const paths=windows?path.win32:path.posix;
  const variable=name=>Object.entries(env).find(([key])=>windows?key.toLowerCase()===name.toLowerCase():key===name)?.[1];
  const fail=message=>{throw Object.assign(new Error(message),{code:'CODEX_NOT_FOUND'});};
  if(!windows&&!mac)return fail('Codex 실행파일 탐색은 Windows와 macOS에서 지원됩니다.');
  const basename=windows?'codex.exe':'codex';
  function native(file){
    if(typeof file!=='string'||!paths.isAbsolute(file)||/[\0\r\n]/.test(file)||/\.(cmd|bat|ps1|js|mjs|cjs)$/i.test(file))return false;
    let descriptor;
    try{
      if(!io.statSync(file).isFile())return false;
      if(mac)io.accessSync(file,fs.constants.X_OK);
      descriptor=io.openSync(file,'r');const header=Buffer.alloc(4);
      if(io.readSync(descriptor,header,0,4,0)<4)return false;
      return windows?header[0]===0x4d&&header[1]===0x5a:[0xfeedface,0xfeedfacf,0xcefaedfe,0xcffaedfe,0xcafebabe,0xbebafeca,0xcafebabf,0xbfbafeca].includes(header.readUInt32BE(0));
    }catch{return false;}finally{if(descriptor!==undefined)try{io.closeSync(descriptor);}catch{}}
  }
  const override=variable('BOKS_CODEX_PATH');
  if(override!==undefined&&override!==''){
    if(native(override))return paths.normalize(override);
    return fail('BOKS_CODEX_PATH가 올바른 절대 경로의 Codex 네이티브 실행파일을 가리키지 않습니다: '+override);
  }
  const pathDirectories=String(variable('PATH')||'').split(windows?';':':').map(value=>value.replace(/^"(.*)"$/,'$1')).filter(value=>value&&paths.isAbsolute(value));
  if(mac){
    const additional=[variable('NVM_BIN'),variable('VOLTA_HOME')&&paths.join(variable('VOLTA_HOME'),'bin'),variable('npm_config_prefix')&&paths.join(variable('npm_config_prefix'),'bin'),home&&paths.join(home,'.volta','bin')];
    const nvmRoot=paths.join(variable('NVM_DIR')||paths.join(home,'.nvm'),'versions','node');
    try{additional.push(...io.readdirSync(nvmRoot,{withFileTypes:true}).filter(entry=>entry.isDirectory()&&/^v\d+\.\d+\.\d+$/.test(entry.name)).map(entry=>entry.name).sort((a,b)=>b.localeCompare(a,'en',{numeric:true})).map(version=>paths.join(nvmRoot,version,'bin')));}catch{}
    for(const directory of additional)if(directory&&paths.isAbsolute(directory)&&!pathDirectories.includes(directory))pathDirectories.push(directory);
  }
  for(const directory of pathDirectories){const file=paths.join(directory,basename);if(native(file))return paths.normalize(file);}
  const locals=[...new Set([variable('LOCALAPPDATA'),windows&&home?paths.join(home,'AppData','Local'):''].filter(value=>value&&paths.isAbsolute(value)))];
  for(const local of windows?locals:[]){
    const bin=paths.join(local,'OpenAI','Codex','bin');
    let versions=[];
    try{versions=io.readdirSync(bin,{withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>{
      const directory=paths.join(bin,entry.name),file=paths.join(directory,basename);
      let modified=0;try{modified=io.statSync(file).mtimeMs;}catch{}
      return {file,modified};
    }).sort((a,b)=>b.modified-a.modified||a.file.localeCompare(b.file));}catch{}
    for(const {file} of versions)if(native(file))return file;
    const direct=paths.join(bin,basename);if(native(direct))return direct;
  }
  if(mac){
    for(const file of ['/Applications/Codex.app/Contents/Resources/codex',...(home&&paths.isAbsolute(home)?[paths.join(home,'Applications/Codex.app/Contents/Resources/codex'),paths.join(home,'.local/bin/codex')]:[]),'/opt/homebrew/bin/codex','/usr/local/bin/codex'])if(native(file))return file;
  }
  const npmRoots=[];
  const addRoot=root=>{if(root&&paths.isAbsolute(root)&&!npmRoots.includes(root))npmRoots.push(root);};
  if(windows){const roaming=variable('APPDATA')||(home?paths.join(home,'AppData','Roaming'):'');if(roaming)addRoot(paths.join(roaming,'npm','node_modules'));}
  else for(const prefix of ['/opt/homebrew','/usr/local',...(home?[paths.join(home,'.npm-global')]:[])])addRoot(paths.join(prefix,'lib','node_modules'));
  const prefix=variable('npm_config_prefix');if(prefix)addRoot(paths.join(prefix,windows?'node_modules':'lib/node_modules'));
  for(const directory of pathDirectories){addRoot(paths.join(directory,'node_modules'));if(mac&&paths.basename(directory)==='bin')addRoot(paths.join(paths.dirname(directory),'lib','node_modules'));}
  const targets=windows?[['win32-x64','x86_64-pc-windows-msvc'],['win32-arm64','aarch64-pc-windows-msvc']]:[['darwin-arm64','aarch64-apple-darwin'],['darwin-x64','x86_64-apple-darwin']];
  for(const root of npmRoots)for(const [suffix,target] of targets){
    for(const packageRoot of [paths.join(root,'@openai','codex-'+suffix),paths.join(root,'@openai','codex','node_modules','@openai','codex-'+suffix),paths.join(root,'@openai','codex')]){
      const file=paths.join(packageRoot,'vendor',target,'codex',basename);if(native(file))return file;
    }
  }
  return fail('Codex 네이티브 실행파일을 찾지 못했습니다. Codex 앱 또는 CLI를 설치한 뒤 다시 확인하세요.');
}

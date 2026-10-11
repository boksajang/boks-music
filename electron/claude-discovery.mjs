import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Bounded Claude Code CLI discovery. Native executables run directly; an npm
 * installation runs its cli.js through this Electron binary as Node. Shell and
 * cmd shims are never executed.
 */
export function resolveClaudeExecutable({env=process.env,platform=process.platform,home=os.homedir(),execPath=process.execPath,fs:io=fs}={}) {
  const windows=platform==='win32',mac=platform==='darwin';
  const paths=windows?path.win32:path.posix;
  const variable=name=>Object.entries(env).find(([key])=>windows?key.toLowerCase()===name.toLowerCase():key===name)?.[1];
  const fail=message=>{throw Object.assign(new Error(message),{code:'CLAUDE_NOT_FOUND'});};
  if(!windows&&!mac)return fail('Claude 실행파일 탐색은 Windows와 macOS에서 지원됩니다.');
  const basename=windows?'claude.exe':'claude';
  const safe=file=>typeof file==='string'&&paths.isAbsolute(file)&&!/[\0\r\n]/.test(file);
  function native(file){
    if(!safe(file)||/\.(cmd|bat|ps1|js|mjs|cjs|sh)$/i.test(file))return false;
    let descriptor;
    try{
      if(!io.statSync(file).isFile())return false;
      if(mac)io.accessSync(file,fs.constants.X_OK);
      descriptor=io.openSync(file,'r');const header=Buffer.alloc(4);
      if(io.readSync(descriptor,header,0,4,0)<4)return false;
      return windows?header[0]===0x4d&&header[1]===0x5a:[0xfeedface,0xfeedfacf,0xcefaedfe,0xcffaedfe,0xcafebabe,0xbebafeca,0xcafebabf,0xbfbafeca].includes(header.readUInt32BE(0));
    }catch{return false;}finally{if(descriptor!==undefined)try{io.closeSync(descriptor);}catch{}}
  }
  const script=file=>{if(!safe(file)||paths.basename(file)!=='cli.js')return false;try{return io.statSync(file).isFile();}catch{return false;}};
  const viaNode=file=>({command:execPath,args:[file],env:{ELECTRON_RUN_AS_NODE:'1'},path:file});
  const direct=file=>({command:paths.normalize(file),args:[],env:{},path:paths.normalize(file)});
  const override=variable('BOKS_CLAUDE_PATH');
  if(override!==undefined&&override!==''){
    if(native(override))return direct(override);
    if(script(override))return viaNode(override);
    return fail('BOKS_CLAUDE_PATH가 올바른 절대 경로의 Claude 실행파일 또는 cli.js를 가리키지 않습니다: '+override);
  }
  const directories=String(variable('PATH')||'').split(windows?';':':').map(value=>value.replace(/^"(.*)"$/,'$1')).filter(value=>value&&paths.isAbsolute(value));
  const add=directory=>{if(directory&&paths.isAbsolute(directory)&&!directories.includes(directory))directories.push(directory);};
  // Native installer default, then platform package managers.
  if(home&&paths.isAbsolute(home))add(paths.join(home,'.local','bin'));
  if(mac)['/opt/homebrew/bin','/usr/local/bin'].forEach(add);
  for(const directory of directories){const file=paths.join(directory,basename);if(native(file))return direct(file);}
  const roots=[];
  const addRoot=root=>{if(root&&paths.isAbsolute(root)&&!roots.includes(root))roots.push(root);};
  if(windows){const roaming=variable('APPDATA')||(home?paths.join(home,'AppData','Roaming'):'');if(roaming)addRoot(paths.join(roaming,'npm','node_modules'));}
  else{
    for(const prefix of ['/opt/homebrew','/usr/local',...(home?[paths.join(home,'.npm-global')]:[])])addRoot(paths.join(prefix,'lib','node_modules'));
    if(home)addRoot(paths.join(home,'.claude','local','node_modules'));
    const nvmRoot=paths.join(variable('NVM_DIR')||paths.join(home||'/','.nvm'),'versions','node');
    try{io.readdirSync(nvmRoot,{withFileTypes:true}).filter(entry=>entry.isDirectory()&&/^v\d+\.\d+\.\d+$/.test(entry.name)).map(entry=>entry.name).sort((a,b)=>b.localeCompare(a,'en',{numeric:true})).forEach(version=>addRoot(paths.join(nvmRoot,version,'lib','node_modules')));}catch{}
  }
  const prefix=variable('npm_config_prefix');if(prefix)addRoot(paths.join(prefix,windows?'node_modules':'lib/node_modules'));
  for(const directory of directories){addRoot(paths.join(directory,'node_modules'));if(mac&&paths.basename(directory)==='bin')addRoot(paths.join(paths.dirname(directory),'lib','node_modules'));}
  for(const root of roots){
    const packageRoot=paths.join(root,'@anthropic-ai','claude-code');
    const bundled=paths.join(packageRoot,'bin',basename);if(native(bundled))return direct(bundled);
    const cli=paths.join(packageRoot,'cli.js');if(script(cli))return viaNode(cli);
  }
  return fail('Claude Code 실행파일을 찾지 못했습니다. Claude Code를 설치한 뒤 다시 확인하세요.');
}

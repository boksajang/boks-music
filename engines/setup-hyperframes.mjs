// Installs published JavaScript and prebuilt binaries only. Lifecycle scripts are disabled.
import {spawn} from 'node:child_process';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const directory=path.resolve(process.argv[2]);
if(!['win32','darwin'].includes(process.platform))throw Error('Windows 또는 macOS가 필요합니다.');
await mkdir(directory,{recursive:true});
let packageInfo={};try{packageInfo=JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));}catch{}
packageInfo.private=true;packageInfo.overrides={...packageInfo.overrides,...Object.fromEntries(['core','engine','parsers','lint','studio-server'].map(name=>['@hyperframes/'+name,'0.8.140']))};
await writeFile(path.join(directory,'package.json'),JSON.stringify(packageInfo,null,2));
const candidates=[process.env.npm_execpath,path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')];
for(const folder of (process.env.PATH||'').split(path.delimiter))if(path.isAbsolute(folder))candidates.push(path.join(folder,'node_modules/npm/bin/npm-cli.js'),path.join(folder,'../lib/node_modules/npm/bin/npm-cli.js'));
let npm;for(const candidate of candidates.filter(Boolean)){try{await access(candidate);npm=candidate;break;}catch{}}
if(!npm)throw Error('영상 실행 환경을 준비하려면 Node.js와 npm이 필요합니다.');
const probePackage=`@ffprobe-installer/${process.platform}-${process.arch}`,probeVersion=process.platform==='darwin'&&process.arch==='arm64'?'5.0.1':'5.1.0';
await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[npm,'install','--prefix',directory,'--ignore-scripts','--no-audit','--no-fund','--save-exact','@hyperframes/producer@0.8.140','@puppeteer/browsers@2.13.0','gsap@3.14.2',`${probePackage}@${probeVersion}`],{stdio:'inherit',windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',npm_config_cache:path.join(directory,'npm-cache'),PUPPETEER_SKIP_DOWNLOAD:'true'}});child.on('error',reject);child.on('close',code=>code?reject(Error('영상 패키지 다운로드 실패')):resolve());});
const {install,Browser}=await import(pathToFileURL(path.join(directory,'node_modules/@puppeteer/browsers/lib/esm/main.js')));
const browser=await install({browser:Browser.CHROMEHEADLESSSHELL,buildId:'154.0.8037.57',cacheDir:path.join(directory,'browser'),downloadProgressCallback:(done,total)=>process.stdout.write(JSON.stringify({type:'progress',stage:'영상 브라우저 다운로드 중',progress:total?done/total*100:undefined})+'\n')});
const ffprobePath=path.join(directory,'node_modules',probePackage,process.platform==='win32'?'ffprobe.exe':'ffprobe');await access(ffprobePath);
await writeFile(path.join(directory,'ready.json'),JSON.stringify({version:'0.8.140',browserVersion:'154.0.8037.57',platform:process.platform,arch:process.arch,chromePath:browser.executablePath,ffprobePath,packageLockSha256:createHash('sha256').update(await readFile(path.join(directory,'package-lock.json'))).digest('hex'),installedAt:new Date().toISOString()},null,2));

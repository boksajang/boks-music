// Apple Silicon companion environments. No compiler or source package builds.
import {spawn} from 'node:child_process';
import {readFile,mkdir,access,chmod} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {downloadVerified} from '../electron/download.mjs';

const directory=path.dirname(fileURLToPath(import.meta.url));
const event=(type,fields)=>process.stdout.write(JSON.stringify({type,...fields})+'\n');
const args=process.argv.slice(2);
const argument=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const exists=file=>access(file).then(()=>true,()=>false);
async function main(){
  if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('Apple Silicon macOS에서만 실행할 수 있습니다.');
  if(!argument('--runtime-root')||!argument('--model-root'))throw new Error('설치 폴더가 필요합니다.');
  const runtimeRoot=path.resolve(argument('--runtime-root')),modelRoot=path.resolve(argument('--model-root'));
  const relative=path.relative(modelRoot,runtimeRoot);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('실행 환경은 모델 폴더 안에 설치해야 합니다.');
  const profile=argument('--profile')||'all';
  if(!['all','stems-mps'].includes(profile))throw new Error('알 수 없는 macOS 설치 구성입니다.');
  const env={...process.env,UV_CACHE_DIR:path.join(runtimeRoot,'uv-cache'),UV_PYTHON_INSTALL_DIR:path.join(runtimeRoot,'python'),UV_PYTHON_BIN_DIR:path.join(runtimeRoot,'python-bin'),UV_NO_MODIFY_PATH:'1',UV_PYTHON_PREFERENCE:'only-managed',UV_NO_BUILD:'1',HF_HOME:path.join(modelRoot,'huggingface'),HF_HUB_CACHE:path.join(modelRoot,'huggingface','hub'),TORCH_HOME:path.join(modelRoot,'torch'),XDG_CACHE_HOME:path.join(modelRoot,'cache'),NUMBA_CACHE_DIR:path.join(modelRoot,'cache','numba'),MPLCONFIGDIR:path.join(modelRoot,'cache','matplotlib'),PIP_CACHE_DIR:path.join(modelRoot,'cache','pip'),TMPDIR:path.join(runtimeRoot,'temp'),PYTHONIOENCODING:'utf-8',PYTORCH_ENABLE_MPS_FALLBACK:'1'};
  await Promise.all([runtimeRoot,env.TMPDIR,env.NUMBA_CACHE_DIR,env.MPLCONFIGDIR].map(dir=>mkdir(dir,{recursive:true})));
  async function run(command,commandArgs,{protocol=false}={}){
    return new Promise((resolve,reject)=>{
      const child=spawn(command,commandArgs,{env,cwd:runtimeRoot,shell:false,stdio:['ignore','pipe','pipe']});
      let result,failure;
      child.stderr.on('data',chunk=>process.stderr.write(chunk));
      const lines=createInterface({input:child.stdout});
      lines.on('line',line=>{
        if(protocol){try{const item=JSON.parse(line);if(item.type==='result')result=item;else if(item.type==='error')failure=item.message;else if(item.type==='progress')event('progress',item);return;}catch{}}
        process.stderr.write(line+'\n');
      });
      child.on('error',reject);
      child.on('close',code=>{lines.close();if(code||failure||protocol&&!result)reject(new Error(failure||`필수 환경 준비 실패: ${path.basename(command)} (${code})`));else resolve(result);});
    });
  }
  const catalog=JSON.parse((await readFile(path.join(directory,'macos-catalog.json'),'utf8')).replace(/^\uFEFF/,''));
  const uvRoot=path.join(runtimeRoot,'uv-'+catalog.uv.version),archive=path.join(runtimeRoot,'uv-'+catalog.uv.version+'.tar.gz');
  await downloadVerified(catalog.uv,archive,{onProgress:fields=>event('progress',fields)});
  await mkdir(uvRoot,{recursive:true});
  await run('/usr/bin/tar',['-xzf',archive,'-C',uvRoot,'--strip-components=1']);
  const uv=path.join(uvRoot,catalog.uv.executable);await chmod(uv,0o755);
  const settings={};
  for(const current of profile==='all'?['stems-mps']:[profile]){
    // audio-separator's diffq dependency has an ARM64 wheel for CPython 3.10,
    // but none for 3.11. Keep this environment wheel-only.
    const version='3.10',environment=path.join(runtimeRoot,current),python=path.join(environment,'bin','python');
    event('progress',{stage:`${current} · 프로젝트 전용 Python ${version} 준비 중`});
    await run(uv,['python','install',version]);
    if(!await exists(python))await run(uv,['venv','--python',version,environment]);
    const packages=['torch==2.13.0','torchvision==0.28.0','audio-separator[cpu]==0.47.0','onnxruntime==1.23.2','imageio-ffmpeg==0.6.0','numpy==2.2.6','numba==0.61.2','llvmlite==0.44.0','scipy==1.15.3'];
    event('progress',{stage:`${current} · 사전 빌드 패키지 설치 중`});
    await run(uv,['pip','install','--python',python,'--only-binary',':all:',...packages]);
    const helper=[path.join(directory,'prepare_stems.py'),'--root',modelRoot,'--profile','stems-mps'];
    if(args.includes('--download-models'))helper.push('--download-models');
    const result=await run(python,helper,{protocol:true});Object.assign(settings,result.settings);
  }
  event('result',{settings,inferenceValidated:false,listeningValidated:false});
}
main().catch(error=>{event('error',{message:error.message});process.exitCode=1;});

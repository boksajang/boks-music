// Source-only macOS installer: no actual macOS inference validation has been performed.
import {spawn} from 'node:child_process';
import {mkdir,readdir,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),project=path.dirname(here),packages=path.join(project,'engine-packages');
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const runtime=path.resolve(arg('--runtime-root',path.join(packages,'runtimes','lyrics-alignment'))),models=path.resolve(arg('--model-root',path.join(packages,'models','lyrics-alignment')));
const event=(type,fields)=>console.log(JSON.stringify({type,...fields}));
const exists=async file=>{try{await access(file);return true;}catch{return false;}};
async function findUv(dir,depth=0){if(depth>4)return;for(const item of await readdir(dir,{withFileTypes:true}).catch(()=>[])){const file=path.join(dir,item.name);if(item.isFile()&&item.name==='uv')return file;if(item.isDirectory()&&!['uv-cache','cache','models','venv','python'].includes(item.name)){const found=await findUv(file,depth+1);if(found)return found;}}}
async function main(){
 if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('이 설치 경로는 Apple Silicon macOS용입니다.');
 for(const value of [runtime,models]){const rel=path.relative(packages,value);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw new Error('설치 경로는 프로젝트 engine-packages 내부여야 합니다.');}
 const uv=await findUv(path.join(packages,'runtimes'));if(!uv)throw new Error('음악 모델 통합 설치를 먼저 완료하세요. 프로젝트 Python 설치 도구가 필요합니다.');
 const env={...process.env,UV_CACHE_DIR:path.join(runtime,'uv-cache'),UV_PYTHON_INSTALL_DIR:path.join(runtime,'python'),UV_PYTHON_BIN_DIR:path.join(runtime,'python-bin'),UV_NO_MODIFY_PATH:'1',UV_NO_BUILD:'1',UV_PYTHON_PREFERENCE:'only-managed',HF_HOME:path.join(models,'cache','huggingface'),TORCH_HOME:path.join(models,'cache','torch'),XDG_CACHE_HOME:path.join(models,'cache'),PIP_CACHE_DIR:path.join(runtime,'pip-cache'),TMPDIR:path.join(runtime,'temp'),PYTHONIOENCODING:'utf-8'};
 await mkdir(env.TMPDIR,{recursive:true});
 const run=(cmd,args)=>new Promise((resolve,reject)=>{const child=spawn(cmd,args,{env,shell:false,stdio:['ignore','pipe','pipe']});child.stdout.on('data',data=>process.stdout.write(data));child.stderr.on('data',data=>process.stderr.write(data));child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('가사 정렬 설치 실패: 사전 빌드 휠과 실행 환경을 확인하세요.')));});
 event('progress',{stage:'macOS 노래 인식·가사 정렬 Python 준비 중'});await run(uv,['python','install','3.11']);const python=path.join(runtime,'venv','bin','python');if(!await exists(python))await run(uv,['venv','--python','3.11',path.join(runtime,'venv')]);
 await run(uv,['pip','install','--python',python,'--only-binary',':all:','torch==2.8.0','torchaudio==2.8.0','transformers==5.19.0','soundfile==0.13.1','scipy==1.17.1','soynlp==0.0.493','librosa==0.11.0']);
 await run(python,[path.join(here,'setup-lyrics-models.py'),'--model-root',models]);await run(python,['-c','from transformers import Qwen3ASRForTokenClassification,Qwen3ASRForConditionalGeneration']);event('result',{pythonPath:python,modelRoot:models,devicePolicy:'cpu',macInferenceVerified:false});
}
main().catch(error=>{event('error',{message:error.message});process.exitCode=1;});

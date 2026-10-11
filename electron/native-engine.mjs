import {ensureInstrumentalLora} from './instrumental-lora.mjs';
import {newInstrumentalRequest} from './instrumental-request.mjs';
import {assertYue2Input} from './yue2-input.mjs';
import { instrumentalScore } from './instrumental-score.mjs';
export { instrumentalScore } from './instrumental-score.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { verifyFile, verifiedModelsFile } from './verified-files.mjs';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const catalogPath = fileURLToPath(new URL('../engines/native-catalog.json', import.meta.url));
const exists = async p => !!p && !!(await fs.stat(p).catch(() => null))?.isFile();
const aborted = signal => { if (signal?.aborted) throw new Error('작업이 취소되었습니다.'); };
async function pause(ms, signal) { aborted(signal); await new Promise(resolve => setTimeout(resolve, ms)); aborted(signal); }
async function catalog() { return JSON.parse((await fs.readFile(catalogPath, 'utf8')).replace(/^\uFEFF/, '')); }

export function nativeBackendDevice(backend, platform=process.platform) {
  const allowed=platform==='darwin'?{metal:'Metal',cpu:'CPU'}:platform==='win32'?{cuda:'CUDA0',cpu:'CPU',vulkan:'Vulkan0'}:{};
  if(!allowed[backend])throw new Error('현재 운영체제에서 지원하지 않는 네이티브 장치입니다.');
  return allowed[backend];
}
async function macExecutable(file, arch) {
  if(!file||!path.isAbsolute(file)||/\\|\.exe$/i.test(file))return false;
  let handle;
  try {
    handle=await fs.open(file,'r');const bytes=Buffer.alloc(8);await handle.read(bytes,0,8,0);
    // Thin Mach-O binaries only; universal binaries require an explicit manifest later.
    return bytes.readUInt32LE(0)===0xfeedfacf && bytes.readUInt32LE(4)===(arch==='arm64'?0x0100000c:arch==='x64'?0x01000007:0);
  } catch{return false;}finally{await handle?.close();}
}
export async function inspectNative(settings, {platform=process.platform,arch=process.arch}={}) {
  const backend=settings.nativeBackend||(platform==='darwin'?'metal':'cuda');
  let platformValid=true;try{nativeBackendDevice(backend,platform);}catch{platformValid=false;}
  const required = [settings.nativeExecutable, settings.backbonePath, settings.vaePath];
  if (platform==='win32' && settings.nativeExecutable) {
    const directory = path.dirname(settings.nativeExecutable);
    required.push(...['ggml.dll','ggml-base.dll'].map(name => path.join(directory,name)));
    if ((settings.nativeBackend || 'cuda') === 'cuda') {
      const variant = settings.nativeCudaVariant || 'cuda13';
      const major = variant === 'cuda12' ? '12' : '13';
      required.push(path.join(directory,variant,'ggml-cuda.dll'),path.join(directory,`cublas64_${major}.dll`),path.join(directory,`cublasLt64_${major}.dll`));
    }
  }
  const pathsValid=required.every(file=>typeof file==='string'&&path.isAbsolute(file));
  const executableValid=platform==='darwin'?await macExecutable(settings.nativeExecutable,arch):platform==='win32'&&/\.exe$/i.test(settings.nativeExecutable||'');
  const ready = platformValid && pathsValid && executableValid && (await Promise.all(required.map(exists))).every(Boolean);
  const cover = ready && await exists(settings.transcriberPath);
  return {
    music: { available: ready, message: ready ? '네이티브 엔진 파일 준비됨; 실제 생성 검증은 별도입니다.' : platform==='darwin'?'현재 Mac 아키텍처의 Mach-O 실행파일과 Backbone/VAE가 필요합니다. Metal/CPU 런타임은 실제 Mac 검증 전입니다.':platform==='win32'?'Windows 네이티브 실행파일, GGML/cuBLAS DLL 및 Backbone/VAE 모델을 확인하세요.':'Windows와 macOS에서만 네이티브 엔진을 지원합니다.' },
    cover: { available: cover, message: cover ? 'SheetSage2 네이티브 분석 준비됨' : 'Cover용 SheetSage2 GGUF 모델이 필요합니다.' },
    capabilities: { instrumental: { available: ready, conditional: true, message: '선택한 스타일로 가사 없는 경음악을 생성합니다. 목표 길이와 실제 길이는 다를 수 있습니다.' } }
  };
}

/** Binary-safe parsing; server-supplied filenames are never used as disk paths. */
export function parseNativeMultipart(buffer, contentType) {
  const boundary = /boundary="?([^";\s]+)/i.exec(contentType)?.[1];
  if (!boundary || boundary.length > 100) throw new Error('엔진 multipart 경계가 올바르지 않습니다.');
  const marker = Buffer.from('--' + boundary), separator = Buffer.from('\r\n\r\n');
  const parts = [];
  let position = 0;
  while ((position = buffer.indexOf(marker, position)) >= 0) {
    position += marker.length;
    if (buffer.subarray(position, position+2).toString() === '--') break;
    const headerEnd = buffer.indexOf(separator, position);
    if (headerEnd < 0) throw new Error('엔진 결과 헤더가 잘렸습니다.');
    const next = buffer.indexOf(Buffer.from('\r\n--' + boundary), headerEnd + 4);
    if (next < 0) throw new Error('엔진 결과 데이터가 잘렸습니다.');
    const type = /content-type:\s*([^\r\n]+)/i.exec(buffer.subarray(position, headerEnd).toString())?.[1];
    parts.push({ type, data: buffer.subarray(headerEnd + 4, next) });
    position = next + 2;
  }
  if (parts.length !== 2 || parts[0].type !== 'application/json' || !['audio/wav','audio/mpeg'].includes(parts[1].type)) throw new Error('단일 곡 엔진 결과 형식이 예상과 다릅니다.');
  return { replay: JSON.parse(parts[0].data.toString('utf8')), audio: parts[1].data, extension: parts[1].type === 'audio/wav' ? '.wav' : '.mp3' };
}

export function inspectNativeWav(buffer) {
  if (buffer.length < 44 || buffer.toString('ascii',0,4) !== 'RIFF' || buffer.toString('ascii',8,12) !== 'WAVE') throw new Error('네이티브 엔진이 올바른 WAV 파일을 반환하지 않았습니다.');
  let format, data;
  for (let offset=12; offset+8<=buffer.length;) {
    const name=buffer.toString('ascii',offset,offset+4), size=buffer.readUInt32LE(offset+4), start=offset+8;
    if (start+size>buffer.length) throw new Error('네이티브 WAV 데이터가 잘렸습니다.');
    if (name==='fmt ' && size>=16) format={codec:buffer.readUInt16LE(start),channels:buffer.readUInt16LE(start+2),rate:buffer.readUInt32LE(start+4),bits:buffer.readUInt16LE(start+14)};
    if (name==='data') data=buffer.subarray(start,start+size);
    offset=start+size+(size%2);
  }
  if (!format || !data?.length || format.codec!==1 || format.channels!==2 || format.rate!==48000 || format.bits!==24 || data.length%6) throw new Error('네이티브 48kHz stereo PCM24 결과가 올바르지 않습니다.');
  let peak=0;
  for(let offset=0;offset<data.length;offset+=3)peak=Math.max(peak,Math.abs(data.readIntLE(offset,3)));
  if (!peak) throw new Error('네이티브 엔진이 완전한 무음 오디오를 반환했습니다.');
  return {durationSeconds:data.length/6/48000,peak:peak/8388608,sampleRate:48000,channels:2,bits:24};
}

/** Token denominator is a stopping budget, not the eventual song length. */
export function parseNativeProgress(line) {
  const ar=/\[AR\] (Score|Semantic)(?: (\d+)\/\d+| song \d+: (\d+) tokens)?/.exec(line);
  if(ar) {
    const tokens=ar[2] ?? ar[3];
    return {stage:ar[1]==='Score'?'악보 생성 중':'음악 토큰 생성 중',tokens:tokens===undefined?null:Number(tokens)};
  }
  const step=/\[NAR\] Step (\d+)\/(\d+)/.exec(line);
  if(step)return {stage:`오디오 합성 중 · Step ${step[1]} / ${step[2]}`,tokens:null};
  const match=/\[(Plan|LM|NAR|VAE|SS2|Synth|Decode)\]/i.exec(line);
  if(match)return {stage:({plan:'악보 생성 중',lm:'음악 토큰 생성 중',nar:'오디오 합성 중',vae:'오디오 디코딩 중',ss2:'원곡 분석 중',synth:'오디오 합성 중',decode:'오디오 디코딩 중'})[match[1].toLowerCase()],tokens:null};
  return null;
}

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function kill(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') await new Promise(resolve => {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    killer.once('error', resolve); killer.once('exit', resolve);
  });
  else child.kill('SIGKILL');
}

export async function runNative(request, { signal, onProgress = () => {}, log = () => {} } = {}) {
  assertYue2Input(request.style,request.lyrics,!!request.instrumental);
  const s = request.settings;
  const status = await inspectNative(s);
  if (!status.music.available) throw new Error(status.music.message);
  if (request.operation === 'cover' && !status.cover.available) throw new Error(status.cover.message);
  if (!['generate','cover'].includes(request.operation)) throw new Error('네이티브 음악 엔진이 지원하지 않는 작업입니다.');
  const sourceCatalog = await catalog(), identities = [];
  onProgress({ stage: '네이티브 모델 무결성 확인 중' });
  for (const filename of [s.backbonePath, s.vaePath, ...(request.operation === 'cover' ? [s.transcriberPath] : [])]) {
    const item = sourceCatalog.models.find(m => m.filename === path.basename(filename));
    if (!item) throw new Error('등록된 고정 revision GGUF 모델을 선택하세요.');
    if (!await verifyFile(filename, item, { cacheFile: verifiedModelsFile(s.modelPath), signal })) throw new Error('모델 크기 또는 SHA-256이 일치하지 않습니다: ' + item.filename);
    identities.push({ filename:item.filename, sha256:item.sha256, revision:sourceCatalog.modelRevision });
  }
  const instrumentalAdapter = request.instrumental === true && request.operation === 'generate' ? await ensureInstrumentalLora({modelPath:s.modelPath,signal,onProgress}) : null;
  if(instrumentalAdapter)identities.push(instrumentalAdapter.identity);
  const port = await unusedPort(), origin = `http://127.0.0.1:${port}`;
  const exeDir = path.dirname(s.nativeExecutable);
  const cudaCache=path.join(s.modelPath,'cache','cuda');await fs.mkdir(cudaCache,{recursive:true});
  const env = { ...process.env, CUDA_CACHE_PATH:cudaCache, PATH:exeDir + path.delimiter + process.env.PATH };
  delete env.YUE_CUDA_BACKEND;
  const backend = s.nativeBackend || (process.platform==='darwin'?'metal':'cuda');
  env.GGML_BACKEND = nativeBackendDevice(backend);
  if (backend === 'cuda') {
    const folder = s.nativeCudaVariant || 'cuda13';
    if (!['cuda12','cuda13'].includes(folder)) throw new Error('CUDA backend 선택이 올바르지 않습니다.');
    env.YUE_CUDA_BACKEND = path.join(exeDir, folder, 'ggml-cuda.dll');
    if (!await exists(env.YUE_CUDA_BACKEND)) throw new Error('선택한 CUDA backend DLL이 없습니다.');
  }
  const args = ['--model',s.backbonePath,'--vae',s.vaePath,'--host','127.0.0.1','--port',String(port),'--max-batch','1'];
  if (request.operation === 'cover') args.push('--transcriber',s.transcriberPath);
  if (instrumentalAdapter) args.push('--adapters',instrumentalAdapter.directory);
  if (backend === 'vulkan') args.push('--clamp-fp16');
  aborted(signal);
  const child = spawn(s.nativeExecutable,args,{cwd:exeDir,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let processError;
  child.once('error', e => { processError = e; });
  const progressReaders=[child.stderr,child.stdout].map(stream=>{
    stream.on('data',data=>log(data.toString()));
    const reader=createInterface({input:stream,crlfDelay:Infinity});
    reader.on('line',line=>{const event=parseNativeProgress(line);if(event)onProgress(event);});
    return reader;
  });
  const stop = () => { void kill(child); };
  signal?.addEventListener('abort',stop,{once:true});
  const http = async (url, options={}) => {
    aborted(signal);
    if (processError) throw processError;
    if (child.exitCode !== null) throw new Error('네이티브 엔진이 종료되었습니다. 로그를 확인하세요.');
    const response = await fetch(origin + url,{...options,signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(`네이티브 엔진 HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);
    return response;
  };
  const job = async (route, options) => {
    const {id} = await (await http(route,options)).json();
    if (typeof id !== 'string' || !id) throw new Error('엔진 작업 ID가 없습니다.');
    while (true) {
      await pause(500,signal);
      const {status:state} = await (await http('/job?id='+encodeURIComponent(id))).json();
      if (state === 'done') return http('/job?id='+encodeURIComponent(id)+'&result=1');
      if (['failed','cancelled'].includes(state)) throw new Error(state === 'cancelled' ? '작업이 취소되었습니다.' : '네이티브 생성에 실패했습니다. 엔진 로그를 확인하세요.');
      if (state !== 'running') throw new Error('알 수 없는 엔진 작업 상태입니다.');
    }
  };
  try {
    onProgress({stage:'네이티브 엔진 시작 중'});
    let started = false;
    const startupDeadline = Date.now() + 120000;
    while (Date.now() < startupDeadline) {
      try { await http('/health'); started=true;break; } catch(e) { if(processError || child.exitCode !== null || signal?.aborted) throw e; }
      await pause(500,signal);
    }
    if (!started) throw new Error('네이티브 엔진 시작 시간이 초과되었습니다.');
    await fs.mkdir(request.outputDir,{recursive:true});
    let abc;
    if (request.operation === 'cover') {
      onProgress({stage:'원곡 멜로디 분석 중'});
      const form = new FormData();
      form.append('audio',new Blob([await fs.readFile(request.audioPath)]),path.basename(request.audioPath));
      form.append('melody_only','1');
      const transcription = await (await job('/transcribe',{method:'POST',body:form})).json();
      abc = transcription.abc;
      if (typeof abc !== 'string' || !abc.trim()) throw new Error('원곡 분석에서 악보를 얻지 못했습니다.');
      await fs.writeFile(path.join(request.outputDir,'source-score.abc'),abc,'utf8');
    }
    const base = {style:request.style,lyrics:request.lyrics || '',cot:abc?'melody':'full',seed:request.seed,lm_seed:request.seed,lm_batch_size:1,synth_batch_size:1,output_format:'wav24',...(newInstrumentalRequest(request,{lora:!!instrumentalAdapter})||{}),...(instrumentalAdapter?{adapters:[{name:instrumentalAdapter.name,scale:1,ar_scale:1,nar_scale:0}]}:{})};
    const synth = async fields => {
      const response = await job('/synth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fields)});
      return parseNativeMultipart(Buffer.from(await response.arrayBuffer()),response.headers.get('content-type') || '');
    };
    if (request.instrumental && request.operation === 'cover') {
      const transferred = instrumentalScore(abc);
      abc = transferred.abc;
      base.lyrics = '';
      base.style = 'Instrumental, '+base.style+', no vocals, no singing, no choir, no spoken words';
      await fs.writeFile(path.join(request.outputDir,'instrumental-transfer.json'),JSON.stringify({movedNotes:transferred.movedNotes,...transferred.report},null,2));
    }
    onProgress({stage:'음악 생성 중'});
    const result = await synth({...base,...(abc ? {abc} : {})});
    aborted(signal);
    const audioInfo = inspectNativeWav(result.audio);
    const audioPath = path.join(request.outputDir,'audio'+result.extension);
    await fs.writeFile(audioPath,result.audio,{flag:'wx'});
    await fs.writeFile(path.join(request.outputDir,'replay.json'),JSON.stringify(result.replay,null,2));
    const metadata = {engine:'yue2.cpp',sourceCommit:sourceCatalog.sourceCommit,models:identities,seed:request.seed,replay:result.replay,audioInfo,instrumental:!!request.instrumental,...(request.instrumental&&request.operation==='generate'?{instrumentalMode:instrumentalAdapter?'lora-full':'direct',targetDurationSeconds:request.instrumentalDuration||180}:{}),listeningValidated:false};
    await fs.writeFile(path.join(request.outputDir,'native-result.json'),JSON.stringify(metadata,null,2));
    aborted(signal);
    return {audioPath,metadata};
  } finally { signal?.removeEventListener('abort',stop); await kill(child);progressReaders.forEach(reader=>reader.close()); }
}


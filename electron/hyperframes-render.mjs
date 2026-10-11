import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile,stat,rm,link,unlink,copyFile,rename} from 'node:fs/promises';
import {constants,createReadStream} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {availableParallelism,freemem} from 'node:os';
import {parseFile} from 'music-metadata';
import {getVideoTemplate} from './video-template-registry.mjs';
import {createVideoComposition} from './video-composition.mjs';
import {ensureVideoRuntime,runVideoProcess} from './hyperframes-runtime.mjs';
import {validateVideoOptions,analyzeAudioFrame} from './playlist-video.mjs';
import {renderCanvasVideo} from './canvas-render.mjs';
async function hashFile(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
export function videoWorkerCount(height,{cores=availableParallelism(),freeBytes=freemem()}={}){return height>2160?1:Math.max(1,Math.min(4,Math.floor(cores/2),Math.floor(freeBytes/(2*1024**3))));}
export async function probeVideoEncoder(ffmpegPath,{signal,log=()=>{},platform=process.platform}={}){
 const encoder=platform==='win32'?'h264_nvenc':platform==='darwin'?'h264_videotoolbox':null;
 if(!encoder)return {encoder:'libx264',hardware:false};
 try{await runVideoProcess(ffmpegPath,['-hide_banner','-nostdin','-v','error','-f','lavfi','-i','color=size=640x360:rate=30','-frames:v','3','-c:v',encoder,'-f','null','-'],{signal,log});return {encoder,hardware:true};}catch(error){signal?.throwIfAborted();log(`하드웨어 인코더를 사용할 수 없어 CPU 인코딩을 사용합니다: ${error.message}`);return {encoder:'libx264',hardware:false};}
}
export async function renderPlaylistVideo({tracks,options:input,outputPath,ffmpegPath,backgroundPath,workDir,packageRoot},{signal,onProgress=()=>{},log=()=>{}}={}){
 const options=validateVideoOptions(input),template=getVideoTemplate(options.template);
 if(!Array.isArray(tracks)||!tracks.length||tracks.length>500)throw Error('내보낼 음악을 선택하세요.');
 if(!path.isAbsolute(outputPath)||path.extname(outputPath).toLowerCase()!=='.'+options.format)throw Error('출력 파일 경로와 형식이 일치해야 합니다.');
 try{await stat(outputPath);throw Error('같은 이름의 파일이 이미 있습니다.');}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!ffmpegPath)throw Error('FFmpeg 설치가 필요합니다.');
 const runtime=await ensureVideoRuntime(packageRoot,{signal,onProgress,log});
 if(workDir)await mkdir(workDir,{recursive:true});
 const work=path.join(workDir||path.dirname(outputPath),'.boks-video-'+randomUUID());await mkdir(work);const projectDir=path.join(work,'composition');await mkdir(projectDir);
 const candidate=path.join(work,'final.'+options.format),cycle=path.join(work,'cycle.mp4');let committed=false;
 const common=['-hide_banner','-nostdin','-v','error','-n'];const prepared=[];let cacheHit=false,encoder;
 const run=args=>runVideoProcess(ffmpegPath,args,{signal,log});
 const copyImage=async(file,name)=>{if(!file)return '';const target=name+path.extname(file).toLowerCase();await copyFile(file,path.join(projectDir,target),constants.COPYFILE_EXCL);return target;};
 try{
  const identity=[];
  for(const track of tracks){signal?.throwIfAborted();const info=await parseFile(track.audioPath,{duration:true}),duration=info.format.duration;if(!Number.isFinite(duration)||duration<=0)throw Error('곡 길이를 확인하지 못했습니다.');identity.push({audio:await hashFile(track.audioPath),art:track.artPath?await hashFile(track.artPath):null,title:track.title,cues:track.cues||[],duration});prepared.push({...track,duration});}
  const cycleDuration=prepared.reduce((sum,t)=>sum+t.duration,0),cycleFrames=Math.ceil(cycleDuration*options.fps),alignedCycleDuration=cycleFrames/options.fps,duration=alignedCycleDuration*options.repeat,frames=cycleFrames*options.repeat;
  const sources=await Promise.all(['./video-composition.mjs','./video-spectrum.mjs','./hyperframes-worker.mjs','./playlist-video.mjs','./hyperframes-render.mjs','./canvas-scene.mjs','./canvas-render.mjs','./canvas-render/page.mjs'].map(f=>readFile(fileURLToPath(new URL(f,import.meta.url)),'utf8')));
  const cacheKey=createHash('sha256').update(JSON.stringify({pipelineVersion:3,version:runtime.version,source:sources,identity,options:{...options,repeat:1,format:'mp4'},theme:template.themeCss,background:backgroundPath?await hashFile(backgroundPath):null})).digest('hex');
  const cacheDirectory=path.join(runtime.directory,'render-cache');await mkdir(cacheDirectory,{recursive:true});const cached=path.join(cacheDirectory,cacheKey+'.mp4'),receipt=path.join(cacheDirectory,cacheKey+'.json');
  try{const meta=JSON.parse(await readFile(receipt,'utf8'));if(meta.sha256===await hashFile(cached)){await copyFile(cached,cycle,constants.COPYFILE_EXCL);cacheHit=true;encoder=meta.encoder;onProgress({stage:'동일한 영상 구성 재사용 중',progress:90});}}catch(error){if(error.code!=='ENOENT')log('영상 캐시를 다시 생성합니다: '+error.message);}
  if(!cacheHit){
   for(let i=0;i<prepared.length;i++){
    signal?.throwIfAborted();const track=prepared[i];onProgress({stage:`오디오 분석 ${i+1}/${prepared.length}`,progress:i/prepared.length*8});
    const wav=path.join(projectDir,`audio-${i}.wav`),pcm=path.join(work,`analysis-${i}.f32`);
    await run([...common,'-i',track.audioPath,'-map','0:a:0','-vn','-ac','2','-ar','48000','-c:a','pcm_f32le','-rf64','auto',wav]);await run([...common,'-i',wav,'-ac','1','-ar','12000','-f','f32le',pcm]);
    const raw=await readFile(pcm),samples=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)),analysisFps=15,frameCount=Math.ceil(track.duration*analysisFps),analysis=Buffer.alloc(frameCount*192);
    for(let f=0;f<frameCount;f++){if(f%120===0){signal?.throwIfAborted();await new Promise(resolve=>setImmediate(resolve));}const frame=analyzeAudioFrame(samples,f/analysisFps);frame.bins.forEach((v,j)=>analysis[f*192+j]=Math.round(v*255));frame.waveform.forEach((v,j)=>analysis.writeInt8(Math.round(Math.max(-1,Math.min(1,v))*127),f*192+64+j));}
    const analysisUrl=`analysis-${i}.json`;await writeFile(path.join(projectDir,analysisUrl),JSON.stringify({fps:analysisFps,frameCount,encoding:'u8-bins-i8-wave',data:analysis.toString('base64')}));Object.assign(track,{wav,analysisUrl,artUrl:await copyImage(track.artPath,`art-${i}`)});
   }
   const rawVideo=path.join(work,'visual.mp4');
   if(template.renderer==='canvas'){
    // GPU path: the canvas scene is drawn per exact timestamp and hardware-encoded with WebCodecs (no screenshots).
    const streamPath=path.join(work,'visual.h264');
    const report=await renderCanvasVideo({scene:template.scene,width:options.width,height:options.height,fps:options.fps,frames:cycleFrames,tracks:prepared,options,analysisFiles:prepared.map(t=>path.join(projectDir,t.analysisUrl)),artFiles:prepared.map(t=>t.artPath||null),backgroundFile:backgroundPath||null,streamPath},{signal,log,onProgress:value=>onProgress({stage:'GPU 영상 렌더링 중',progress:8+Math.max(0,Math.min(1,value.framesRendered/value.totalFrames))*80,framesRendered:value.framesRendered,totalFrames:value.totalFrames})});
    encoder={encoder:'webcodecs-h264',hardware:report.hardware};
    await run([...common,'-f','h264','-framerate',String(options.fps),'-i',streamPath,'-c:v','copy','-an',rawVideo]);
   }else{
   const backgroundUrl=await copyImage(backgroundPath,'background');await copyFile(path.join(runtime.directory,'node_modules/gsap/dist/gsap.min.js'),path.join(projectDir,'gsap.min.js'));
   await writeFile(path.join(projectDir,'index.html'),createVideoComposition({tracks:prepared,options:{...options,repeat:1,themeCss:template.themeCss},duration:cycleDuration,assets:{backgroundUrl}}));encoder=await probeVideoEncoder(ffmpegPath,{signal,log});
   const render=async hardware=>{const request={runtime,ffmpegPath,projectDir,outputPath:rawVideo,reportPath:path.join(work,'hyperframes-report.json'),tempDir:path.join(work,'scratch'),fps:options.fps,workers:videoWorkerCount(options.height),useGpu:hardware};const requestFile=path.join(work,'render-request.json');await writeFile(requestFile,JSON.stringify(request));let failure;
    try{await runVideoProcess(process.execPath,[fileURLToPath(new URL('./hyperframes-worker.mjs',import.meta.url)),requestFile],{signal,env:{ELECTRON_RUN_AS_NODE:'1'},log,onLine:line=>{try{const value=JSON.parse(line);if(value.type==='error')failure=value.message;else if(value.type==='progress')onProgress({stage:'HTML 영상 렌더링 중',progress:8+Math.max(0,Math.min(100,value.progress||0))*.8,framesRendered:value.framesRendered,totalFrames:value.totalFrames});else log(line);}catch{log(line);}}});}catch(error){throw Error(failure||error.message);}};
   try{await render(encoder.hardware);}catch(error){signal?.throwIfAborted();if(!encoder.hardware)throw error;log('하드웨어 렌더링 실패, CPU 인코딩으로 다시 시도합니다: '+error.message);await rm(rawVideo,{force:true});encoder={encoder:'libx264',hardware:false};await render(false);}
   }
   // Cache video alone: AAC priming must never determine the visual repeat period.
   await run([...common,'-i',rawVideo,'-map','0:v:0','-c:v','copy','-an',cycle]);
   signal?.throwIfAborted();const tempCache=cached+'.'+randomUUID()+'.tmp';await copyFile(cycle,tempCache);await rename(tempCache,cached);await writeFile(receipt,JSON.stringify({sha256:await hashFile(cached),encoder,duration:cycleDuration,createdAt:new Date().toISOString()}));
  }
  signal?.throwIfAborted();onProgress({stage:options.repeat>1?'반복 영상과 원본 음악 결합 중':'영상 파일 저장 중',progress:94});
  for(let i=0;i<prepared.length;i++)if(!prepared[i].wav){prepared[i].wav=path.join(projectDir,`audio-${i}.wav`);await run([...common,'-i',prepared[i].audioPath,'-map','0:a:0','-vn','-ac','2','-ar','48000','-c:a','pcm_f32le','-rf64','auto',prepared[i].wav]);}
  const manifest=path.join(work,'audio-list.txt'),pcmCycle=path.join(work,'playlist.wav');await writeFile(manifest,prepared.map(t=>`file '${t.wav.replaceAll('\\','/').replaceAll("'","'\\''")}'`).join('\n'));
  // Pad only the end of a playlist cycle (less than one frame), so every
  // copied video cycle and unmodified musical samples restart together.
  await run([...common,'-f','concat','-safe','0','-i',manifest,'-af',`apad=whole_dur=${alignedCycleDuration}`,'-t',String(alignedCycleDuration),'-c:a','pcm_f32le','-rf64','auto',pcmCycle]);
  const loop=options.repeat>1?['-stream_loop',String(options.repeat-1)]:[];
  await run([...common,...loop,'-i',cycle,...loop,'-i',pcmCycle,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','320k','-t',String(duration),'-movflags','+faststart',candidate]);
  if((await stat(candidate)).size<1024)throw Error('비디오 출력이 비어 있습니다.');signal?.throwIfAborted();
  let probeText='';await runVideoProcess(runtime.ffprobePath,['-v','error','-show_streams','-show_format','-of','json',candidate],{signal,log,onLine:line=>{probeText+=line;}});
  const probe=JSON.parse(probeText),video=probe.streams?.find(s=>s.codec_type==='video'),audio=probe.streams?.find(s=>s.codec_type==='audio');
  const rational=s=>{const [a,b]=String(s||'0/1').split('/').map(Number);return a/b;};
  if(video?.codec_name!=='h264'||video.width!==options.width||video.height!==options.height||audio?.codec_name!=='aac'||Number(video.nb_frames)!==frames||Math.abs(rational(video.r_frame_rate)-options.fps)>.001||Math.abs(rational(video.avg_frame_rate)-options.fps)>.001||Math.abs(Number(probe.format?.duration)-duration)>.15+options.repeat*.025)throw Error('완성 영상의 코덱·크기·프레임 수·재생시간 검증에 실패했습니다.');
  const actualEncoder=video.tags?.encoder||'h264';encoder={...encoder,actual:actualEncoder,hardware:template.renderer==='canvas'?!!encoder.hardware:/nvenc|videotoolbox/i.test(actualEncoder)};
  try{await link(candidate,outputPath);}catch(error){if(!['EXDEV','EPERM','ENOTSUP'].includes(error.code))throw error;await copyFile(candidate,outputPath,constants.COPYFILE_EXCL);}committed=true;signal?.throwIfAborted();
  return {videoPath:outputPath,duration,width:options.width,height:options.height,fps:options.fps,format:options.format,frames,cycleAudioDuration:cycleDuration,cycleEndPaddingSeconds:alignedCycleDuration-cycleDuration,trackIds:Array.from({length:options.repeat},()=>tracks.map(t=>t.id)).flat(),spectrumAnalysis:'12000 Hz decoded mono PCM, 1024-point Hann FFT',renderer:template.renderer==='canvas'?'canvas-webcodecs':'hyperframes',rendererVersion:template.renderer==='canvas'?process.versions.chrome:runtime.version,encoder,cacheHit,options};
 }catch(error){if(committed)await unlink(outputPath).catch(()=>{});throw error;}
 finally{await rm(work,{recursive:true,force:true,maxRetries:20,retryDelay:200});}
}

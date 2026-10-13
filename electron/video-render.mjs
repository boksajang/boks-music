import path from 'node:path';
import {mkdir,readFile,writeFile,stat,rm,link,unlink,copyFile,rename} from 'node:fs/promises';
import {constants} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {parseFile} from 'music-metadata';
import {getVideoTemplate} from './video-template-registry.mjs';
import {runVideoProcess} from './video-process.mjs';
import {validateVideoOptions,analyzeAudioFrame} from './playlist-video.mjs';
import {renderCanvasVideo,canvasBitrate} from './canvas-render.mjs';
import {readMp4Info} from './mp4-info.mjs';
import {ensureSpace} from './store.mjs';

// YouTube's loudness target: songs brought to one level when the user asks for it.
const LOUDNESS={I:-14,TP:-1,LRA:11};

/**
 * Chapter list of a video: where each song starts, for every repetition of the playlist
 * (YouTube chapters: "0:00 제목").
 */
export function videoChapters(tracks,{cycleDuration,repeat=1}){
 const chapters=[];
 for(let round=0;round<repeat;round++){let offset=round*cycleDuration;for(const track of tracks){chapters.push({start:Math.round(offset*1000)/1000,title:track.title||'',trackId:track.id});offset+=track.duration;}}
 return chapters;
}

/**
 * Playlist video: one playlist cycle is drawn by the template's GPU canvas scene at exact frame times and
 * hardware-encoded with WebCodecs (H.264), repeated without re-encoding and joined with the music
 * (AAC 320k). Every intermediate file stays in the job's work folder and is removed when the job ends —
 * nothing is kept for later videos. The finished file is verified from its MP4/MOV header.
 */
export async function renderPlaylistVideo({tracks,options:input,outputPath,overwrite=false,ffmpegPath,backgroundPath,workDir},{signal,onProgress=()=>{},log=()=>{}}={}){
 const options=validateVideoOptions(input),template=getVideoTemplate(options.template);
 if(!Array.isArray(tracks)||!tracks.length)throw Error('영상에 넣을 음악이 없습니다.');
 if(tracks.length>500)throw Error('한 영상에는 500곡까지 넣을 수 있습니다.');
 if(!path.isAbsolute(outputPath)||path.extname(outputPath).toLowerCase()!=='.'+options.format)throw Error('출력 파일 경로와 형식이 일치해야 합니다.');
 // The user chose to overwrite an existing video of the same name; otherwise an existing file is never replaced.
 if(!overwrite)try{await stat(outputPath);throw Error('같은 이름의 파일이 이미 있습니다.');}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!ffmpegPath)throw Error('FFmpeg 설치가 필요합니다.');
 if(workDir)await mkdir(workDir,{recursive:true});
 const work=path.join(workDir||path.dirname(outputPath),'.boks-video-'+randomUUID());await mkdir(work);
 const candidate=path.join(work,'final.'+options.format),cycle=path.join(work,'cycle.mp4');
 const common=['-hide_banner','-nostdin','-v','error','-n'];const prepared=[];
 const run=args=>runVideoProcess(ffmpegPath,args,{signal,log});
 try{
  for(const track of tracks){signal?.throwIfAborted();const info=await parseFile(track.audioPath,{duration:true}),duration=info.format.duration;if(!Number.isFinite(duration)||duration<=0)throw Error(`「${track.title||'곡'}」의 길이를 확인하지 못했습니다.`);prepared.push({...track,duration});}
  const cycleDuration=prepared.reduce((sum,t)=>sum+t.duration,0),cycleFrames=Math.ceil(cycleDuration*options.fps),alignedCycleDuration=cycleFrames/options.fps,duration=alignedCycleDuration*options.repeat,frames=cycleFrames*options.repeat;
  // Disk space before any work: decoded audio (32-bit float, 48 kHz stereo) per song and for the whole
  // playlist, three copies of the encoded cycle while it is assembled, and the finished file (twice if it
  // is copied to another drive).
  const videoBytes=canvasBitrate({width:options.width,height:options.height,fps:options.fps})/8,audioBytes=320000/8;
  const finalBytes=Math.ceil(duration*(videoBytes+audioBytes)*1.1),workBytes=Math.ceil(cycleDuration*48000*8*2+alignedCycleDuration*videoBytes*3*1.1)+finalBytes;
  try{await ensureSpace(work,workBytes);await ensureSpace(path.dirname(outputPath),finalBytes);}
  catch{throw Error(`저장 공간이 부족합니다. 작업 폴더에 약 ${Math.ceil(workBytes/1024**3)}GB, 저장 폴더에 약 ${Math.ceil(finalBytes/1024**3)}GB가 필요합니다.`);}
  for(let i=0;i<prepared.length;i++){
   signal?.throwIfAborted();const track=prepared[i];onProgress({stage:`오디오 분석 ${i+1}/${prepared.length}`,progress:i/prepared.length*8});
   const wav=path.join(work,`audio-${i}.wav`),pcm=path.join(work,`analysis-${i}.f32`);
   if(options.normalize){
    // Two-pass loudness normalisation: measure, then apply the measured values linearly.
    let report='';await runVideoProcess(ffmpegPath,['-hide_banner','-nostdin','-i',track.audioPath,'-map','0:a:0','-af',`loudnorm=I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}:print_format=json`,'-f','null','-'],{signal,log:chunk=>{report+=chunk;}});
    const measured=JSON.parse(report.slice(report.lastIndexOf('{'),report.lastIndexOf('}')+1));
    // A silent song has no measurable loudness (-inf): it keeps its level.
    if(!['input_i','input_tp','input_lra','input_thresh','target_offset'].every(key=>Number.isFinite(Number(measured[key])))){log(`음량을 측정할 수 없어 원음으로 넣습니다: ${track.title||''}`);await run([...common,'-i',track.audioPath,'-map','0:a:0','-vn','-ac','2','-ar','48000','-c:a','pcm_f32le','-rf64','auto',wav]);}
    else{const filter=`loudnorm=I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
    await run([...common,'-i',track.audioPath,'-map','0:a:0','-vn','-af',filter,'-ac','2','-ar','48000','-c:a','pcm_f32le','-rf64','auto',wav]);}
   }else await run([...common,'-i',track.audioPath,'-map','0:a:0','-vn','-ac','2','-ar','48000','-c:a','pcm_f32le','-rf64','auto',wav]);
   await run([...common,'-i',wav,'-ac','1','-ar','12000','-f','f32le',pcm]);
   const raw=await readFile(pcm),samples=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)),analysisFps=15,frameCount=Math.ceil(track.duration*analysisFps),analysis=Buffer.alloc(frameCount*192);
   for(let f=0;f<frameCount;f++){if(f%120===0){signal?.throwIfAborted();await new Promise(resolve=>setImmediate(resolve));}const frame=analyzeAudioFrame(samples,f/analysisFps);frame.bins.forEach((v,j)=>analysis[f*192+j]=Math.round(v*255));frame.waveform.forEach((v,j)=>analysis.writeInt8(Math.round(Math.max(-1,Math.min(1,v))*127),f*192+64+j));}
   const analysisFile=path.join(work,`analysis-${i}.json`);await writeFile(analysisFile,JSON.stringify({fps:analysisFps,frameCount,encoding:'u8-bins-i8-wave',data:analysis.toString('base64')}));await rm(pcm,{force:true});Object.assign(track,{wav,analysisFile});
  }
  // The canvas scene is drawn per exact timestamp and hardware-encoded with WebCodecs (no screenshots).
  const streamPath=path.join(work,'visual.h264'),rawVideo=path.join(work,'visual.mp4');
  const report=await renderCanvasVideo({scene:template.scene,width:options.width,height:options.height,fps:options.fps,frames:cycleFrames,tracks:prepared,options,analysisFiles:prepared.map(t=>t.analysisFile),artFiles:prepared.map(t=>t.artPath||null),backgroundFile:backgroundPath||null,streamPath},{signal,log,onProgress:value=>onProgress({stage:'GPU 영상 렌더링 중',progress:8+Math.max(0,Math.min(1,value.framesRendered/value.totalFrames))*80,framesRendered:value.framesRendered,totalFrames:value.totalFrames,fps:options.fps})});
  const encoder={encoder:'webcodecs-h264',hardware:!!report.hardware};
  await run([...common,'-f','h264','-framerate',String(options.fps),'-i',streamPath,'-c:v','copy','-an',rawVideo]);await rm(streamPath,{force:true});
  // The repeated part is video alone: AAC priming must never determine the visual repeat period.
  await run([...common,'-i',rawVideo,'-map','0:v:0','-c:v','copy','-an',cycle]);await rm(rawVideo,{force:true});
  signal?.throwIfAborted();onProgress({stage:options.repeat>1?'반복 영상과 원본 음악 결합 중':'영상 파일 저장 중',progress:94});
  const manifest=path.join(work,'audio-list.txt'),pcmCycle=path.join(work,'playlist.wav');await writeFile(manifest,prepared.map(t=>`file '${t.wav.replaceAll('\\','/').replaceAll("'","'\\''")}'`).join('\n'));
  // Pad only the end of a playlist cycle (less than one frame), so every
  // copied video cycle and unmodified musical samples restart together.
  await run([...common,'-f','concat','-safe','0','-i',manifest,'-af',`apad=whole_dur=${alignedCycleDuration}`,'-t',String(alignedCycleDuration),'-c:a','pcm_f32le','-rf64','auto',pcmCycle]);
  for(const track of prepared)await rm(track.wav,{force:true});
  const loop=options.repeat>1?['-stream_loop',String(options.repeat-1)]:[];
  await run([...common,...loop,'-i',cycle,...loop,'-i',pcmCycle,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','320k','-t',String(duration),'-movflags','+faststart',candidate]);
  await rm(cycle,{force:true});await rm(pcmCycle,{force:true});
  if((await stat(candidate)).size<1024)throw Error('비디오 출력이 비어 있습니다.');signal?.throwIfAborted();
  const info=await readMp4Info(candidate),video=info.tracks.find(t=>t.type==='video'),audio=info.tracks.find(t=>t.type==='audio');
  if(video?.codec!=='h264'||video.width!==options.width||video.height!==options.height||audio?.codec!=='aac'||video.frames!==frames||Math.abs(video.frameRate-options.fps)>.001||Math.abs(video.averageFrameRate-options.fps)>.001||Math.abs(info.duration-duration)>.15+options.repeat*.025)throw Error('완성 영상의 코덱·크기·프레임 수·재생시간 검증에 실패했습니다.');
  // Last moment to cancel: once the file is written the video is kept.
  signal?.throwIfAborted();
  if(overwrite){
   // Written next to the old file first, then swapped in, so a failure never leaves a half-written video.
   const staged=outputPath+'.'+randomUUID()+'.boks-tmp';await copyFile(candidate,staged,constants.COPYFILE_EXCL);
   try{await rename(staged,outputPath);}catch(error){await unlink(staged).catch(()=>{});throw error.code==='EPERM'||error.code==='EBUSY'?Error('덮어쓸 영상 파일이 다른 프로그램에서 열려 있습니다. 닫은 뒤 다시 만들어 주세요.'):error;}
  }else try{await link(candidate,outputPath);}catch(error){if(!['EXDEV','EPERM','ENOTSUP'].includes(error.code))throw error;await copyFile(candidate,outputPath,constants.COPYFILE_EXCL);}
  return {videoPath:outputPath,duration,width:options.width,height:options.height,fps:options.fps,format:options.format,frames,cycleAudioDuration:cycleDuration,cycleEndPaddingSeconds:alignedCycleDuration-cycleDuration,trackIds:Array.from({length:options.repeat},()=>tracks.map(t=>t.id)).flat(),chapters:videoChapters(prepared,{cycleDuration:alignedCycleDuration,repeat:options.repeat}),spectrumAnalysis:'12000 Hz decoded mono PCM, 1024-point Hann FFT',loudness:options.normalize?`${LOUDNESS.I} LUFS`:'원음',renderer:'canvas-webcodecs',rendererVersion:process.versions.chrome,encoder,options};
 }finally{await rm(work,{recursive:true,force:true,maxRetries:20,retryDelay:200});}
}

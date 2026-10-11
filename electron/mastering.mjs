import {spawn} from 'node:child_process';
import {mkdir,stat,rm,rename,realpath} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {parseFile} from 'music-metadata';

export function validateMasteringOptions(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('마스터링 설정이 올바르지 않습니다.');
 const options={targetLufs:value.targetLufs??-10,truePeak:value.truePeak??-1,character:value.character??'balanced'};
 if(![-14,-12,-10,-8].includes(options.targetLufs)||![-2,-1,-0.5,0].includes(options.truePeak)||!['balanced','gentle','punchy'].includes(options.character))throw new Error('지원하지 않는 마스터링 설정입니다.');
 return options;
}
export function parseLoudness(text){
 const blocks=text.match(/\{[^{}]*"input_i"[^{}]*\}/g);if(!blocks?.length)throw new Error('오디오 음량 분석 결과가 없습니다.');
 const raw=JSON.parse(blocks.at(-1));
 const result={integratedLufs:Number(raw.input_i),truePeakDbtp:Number(raw.input_tp),loudnessRange:Number(raw.input_lra),threshold:Number(raw.input_thresh),offset:Number(raw.target_offset)};
 if(!Object.values(result).every(Number.isFinite)||result.integratedLufs<=-70)throw new Error('무음이거나 음량을 안정적으로 분석할 수 없는 오디오입니다.');
 return result;
}
export function masteringPlan(before,options){
 const gain=options.targetLufs-before.integratedLufs;
 const excess=Math.max(0,before.truePeakDbtp+gain-options.truePeak);
 const settings={gentle:{ratio:1.5,attack:40,release:250,lra:15},balanced:{ratio:2,attack:25,release:180,lra:11},punchy:{ratio:2.7,attack:18,release:120,lra:8}}[options.character];
 const needed=excess>3||before.loudnessRange>settings.lra;
 const thresholdDb=Math.min(-6,Math.max(-36,before.integratedLufs+6));
 const compressor=needed?`acompressor=threshold=${10**(thresholdDb/20)}:ratio=${settings.ratio}:attack=${settings.attack}:release=${settings.release}:makeup=1:knee=2.828:link=maximum:detection=rms`:'';
 return {compressor,compressorApplied:needed,thresholdDb:needed?thresholdDb:null,ratio:needed?settings.ratio:1,lra:Math.min(50,Math.max(settings.lra,before.loudnessRange)),anticipatedPeakExcessDb:excess};
}
function ffmpegRun(exe,args,{signal,onProgress,log,stage,duration}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(new Error('작업이 취소되었습니다.'));
  onProgress({stage});if(signal?.aborted)return reject(new Error('작업이 취소되었습니다.'));let stderr='',pending='';
  const child=spawn(exe,args,{shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
  const abort=()=>{if(!child.pid)return;if(process.platform==='win32'){const p=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,shell:false,stdio:'ignore'});p.on('error',()=>child.kill());}else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}};
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();
  child.stderr.on('data',data=>{const text=String(data);stderr=(stderr+text).slice(-32000);log(text);});
  child.stdout.on('data',data=>{pending+=String(data);const lines=pending.split(/\r?\n/);pending=lines.pop();for(const line of lines){const m=line.match(/^out_time_us=(\d+)$/);if(m)onProgress({stage,processedSeconds:Number(m[1])/1e6,...(duration>0?{progress:Math.min(99,Number(m[1])/1e6/duration*100)}:{})});}});
  child.on('error',error=>{signal?.removeEventListener('abort',abort);reject(new Error('FFmpeg 마스터링 도구를 실행하지 못했습니다.',{cause:error}));});
  child.on('close',code=>{signal?.removeEventListener('abort',abort);if(signal?.aborted)reject(new Error('작업이 취소되었습니다.'));else if(code!==0)reject(new Error('FFmpeg 마스터링에 실패했습니다. '+stderr.slice(-1200)));else resolve(stderr);});
 });
}
export async function masterAudio({audioPath,outputDir,options:input,ffmpegPath},{signal,onProgress=()=>{},log=()=>{}}={}){
 const options=validateMasteringOptions(input);
 if(!ffmpegPath)throw new Error('FFmpeg 오디오 도구 설치가 필요합니다.');
 signal?.throwIfAborted();const source=await realpath(audioPath);if(!(await stat(source)).isFile())throw new Error('원본 오디오가 없습니다.');
 const info=await parseFile(source),duration=info.format.duration,sampleRate=info.format.sampleRate;
 if(!Number.isFinite(duration)||duration<0.4||!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000)throw new Error('분석 가능한 길이와 샘플레이트의 오디오를 선택하세요.');
 await mkdir(outputDir,{recursive:true});const root=await realpath(outputDir),id=randomUUID(),candidate=path.join(root,`mastering-${id}.partial.wav`),corrected=path.join(root,`mastering-${id}.guard.wav`),final=path.join(root,`mastered-${id}.wav`);
 const owned=[candidate,corrected,final],context={signal,onProgress,log,duration};
 const common=['-hide_banner','-nostdin','-n'];
 const loudnorm=`loudnorm=I=${options.targetLufs}:TP=${options.truePeak-0.15}:LRA=50:print_format=json`;
 async function analyze(file,filter,stage){const text=await ffmpegRun(ffmpegPath,[...common,'-i',file,'-map','0:a:0','-vn','-af',filter,'-progress','pipe:1','-nostats','-f','null','-'],{...context,stage});return parseLoudness(text);}
 try{
  const before=await analyze(source,loudnorm,'원본 음량·피크 분석 중'),plan=masteringPlan(before,options);
  const prepared=plan.compressor?await analyze(source,plan.compressor+','+loudnorm,'다이내믹 처리 후 음량 분석 중'):before;
  const norm=`loudnorm=I=${options.targetLufs}:TP=${options.truePeak-0.15}:LRA=${plan.lra}:measured_I=${prepared.integratedLufs}:measured_TP=${prepared.truePeakDbtp}:measured_LRA=${prepared.loudnessRange}:measured_thresh=${prepared.threshold}:offset=${prepared.offset}:linear=true:print_format=json`;
  const limit=10**((options.truePeak-0.15)/20);
  const filter=[plan.compressor,norm,'aresample=192000',`alimiter=limit=${limit}:level=false:attack=5:release=80:latency=true`,`aresample=${sampleRate}`].filter(Boolean).join(',');
  await ffmpegRun(ffmpegPath,[...common,'-i',source,'-map','0:a:0','-vn','-map_metadata','-1','-af',filter,'-c:a','pcm_s24le','-ar',String(sampleRate),'-progress','pipe:1','-nostats',candidate],{...context,stage:'마스터 음량·리미터 처리 중'});
  let after=await analyze(candidate,loudnorm,'최종 파일 음량·True Peak 확인 중'),guardReductionDb=0;
  if(after.truePeakDbtp>options.truePeak){
   guardReductionDb=after.truePeakDbtp-options.truePeak+0.1;
   await ffmpegRun(ffmpegPath,[...common,'-i',candidate,'-map','0:a:0','-vn','-af',`volume=-${guardReductionDb}dB`,'-c:a','pcm_s24le','-ar',String(sampleRate),'-progress','pipe:1','-nostats',corrected],{...context,stage:'샘플레이트 변환 후 피크 여유 확보 중'});
   after=await analyze(corrected,loudnorm,'보정 파일 True Peak 재확인 중');
  }
  if(after.truePeakDbtp>options.truePeak)throw new Error('출력 True Peak가 설정 상한을 넘어 결과를 저장하지 않았습니다.');
  signal?.throwIfAborted();const resultFile=guardReductionDb?corrected:candidate,resultInfo=await parseFile(resultFile);
  if(resultInfo.format.bitsPerSample!==24||Math.abs(resultInfo.format.duration-duration)>0.1)throw new Error('마스터 결과의 오디오 길이 또는 PCM 형식이 올바르지 않습니다.');
  await rename(resultFile,final);await Promise.all([candidate,corrected].map(file=>rm(file,{force:true})));
  return {audioPath:final,metadata:{mastering:{options,before,after,processing:{compressorApplied:plan.compressorApplied,ratio:plan.ratio,thresholdDb:plan.thresholdDb,guardReductionDb,normalization:'FFmpeg two-pass loudnorm',limiter:'192 kHz oversampled lookahead',sampleRate,bitsPerSample:24},targetDeltaLufs:Number((after.integratedLufs-options.targetLufs).toFixed(2)),achievedTarget:Math.abs(after.integratedLufs-options.targetLufs)<=0.5,truePeakVerified:true}}};
 }catch(error){await Promise.all(owned.map(file=>rm(file,{force:true}).catch(()=>{})));throw error;}
}

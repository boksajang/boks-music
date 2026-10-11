import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const request=JSON.parse(await readFile(process.argv[2],'utf8'));
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
process.env.HYPERFRAMES_FFMPEG_PATH=request.ffmpegPath;
process.env.HYPERFRAMES_FFPROBE_PATH=request.runtime.ffprobePath;
process.env.PRODUCER_HEADLESS_SHELL_PATH=request.runtime.chromePath;
process.env.TEMP=request.tempDir;process.env.TMP=request.tempDir;process.env.TMPDIR=request.tempDir;
process.env.HF_CAPTURE_PARALLEL_STREAM='true';
await mkdir(request.tempDir,{recursive:true});
try{
 const {createRenderJob,executeRenderJob,resolveConfig}=await import(pathToFileURL(path.join(request.runtime.directory,'node_modules/@hyperframes/producer/dist/index.js')));
 const producerConfig=resolveConfig({chromePath:request.runtime.chromePath,browserGpuMode:'auto',jpegQuality:92,enableStreamingEncode:true,useDrawElement:true,enableBrowserPool:false});
 const job=createRenderJob({fps:request.fps,quality:'high',format:'mp4',workers:request.workers,useGpu:request.useGpu,crf:24,hdrMode:'force-sdr',producerConfig});
 await executeRenderJob(job,request.projectDir,request.outputPath,(state,message)=>send({type:'progress',stage:state.currentStage,progress:state.progress,framesRendered:state.framesRendered,totalFrames:state.totalFrames,message}));
 await writeFile(request.reportPath,JSON.stringify(job,null,2));send({type:'result',outputPath:request.outputPath,duration:job.duration,perfSummary:job.perfSummary});
}catch(error){send({type:'error',message:error.stack||error.message});process.exitCode=1;}

// Entry for the GPU render child process (started with --boks-canvas-render <request.json>).
// It owns its GPU process, so the main window's repaint never throttles rendering.
import {app} from 'electron';
import {readFile} from 'node:fs/promises';
import {renderCanvasInWindow} from './canvas-render.mjs';

const argument=name=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:undefined;};
const send=value=>new Promise(resolve=>process.stdout.write(JSON.stringify(value)+'\n',resolve));
const profile=argument('--boks-canvas-profile');
if(profile)app.setPath('userData',profile);
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 try{
  const request=JSON.parse(await readFile(argument('--boks-canvas-render'),'utf8'));
  const report=await renderCanvasInWindow(request,{onProgress:value=>void send({type:'progress',...value}),log:message=>void send({type:'log',message:String(message)})});
  await send({type:'result',report});app.exit(0);
 }catch(error){await send({type:'error',message:error?.message||String(error)});app.exit(1);}
});

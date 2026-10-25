import {sceneBase,drawSpectrum,fitText,setFont,ellipsize,rgba,layer,hash,random,clamp,lerp,easeOut,easeInOut,drawCover} from '../canvas-kit.mjs';

/**
 * VHS 캠코더: a 90s camcorder viewfinder in a dark, grungy home-video grade. The album art (or the
 * generated picture) is shot handheld through tape: low resolution, chroma smeared to the right,
 * ringing edges, snow, a ragged head-switching strip at the bottom and the odd tracking glitch. The
 * pixelated on-screen display blinks REC, counts the tape, shows the battery, a date stamp and a small
 * audio level, with autofocus brackets in the middle. Lyrics are superimposed captions; when the next
 * line comes a tracking band tears up the picture and the new caption splits into red and cyan for a
 * moment. Each song ends in fast-forward search bars and starts on a blue PLAY screen.
 */
const LINEAR=['bars','round-bars','mirror','blocks','dots','reflection','wave','double-wave','area','mirror-area','ribbon'];
const MONTHS=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function lru(limit){const m=new Map();return (key,make)=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make();m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};}

/** Tape look on a small frame: luma ringing, smeared and shifted chroma, crushed greenish shadows. */
function tape(image,w,h,seed){
 const c=layer(w,h),g=c.getContext('2d',{willReadFrequently:true});drawCover(g,image,0,0,w,h);
 let img;try{img=g.getImageData(0,0,w,h);}catch{return c;}
 const d=img.data,n=w*h,Y=new Float32Array(n),I=new Float32Array(n),Q=new Float32Array(n),r=random(seed);
 for(let p=0;p<n;p++){const R=d[p*4]/255,G=d[p*4+1]/255,B=d[p*4+2]/255;Y[p]=.299*R+.587*G+.114*B;I[p]=.596*R-.274*G-.322*B;Q[p]=.211*R-.523*G+.312*B;}
 const box=(src,rad,shift)=>{const out=new Float32Array(n);for(let y=0;y<h;y++){let sum=0;const row=y*w;for(let x=-rad;x<w+rad;x++){const add=src[row+clamp(x,0,w-1)];sum+=add;const at=x-rad;if(at>=0){const o=at+shift;if(o<w)out[row+o]=sum/(rad*2+1);sum-=src[row+clamp(at-rad,0,w-1)];}}}return out;};
 const Yb=box(Y,2,0),Ib=box(I,5,3),Qb=box(Q,6,3);
 for(let p=0;p<n;p++){
  let y=Y[p]+(Y[p]-Yb[p])*.7;y=clamp((y-.08)*1.12,0,1);y=Math.pow(y,1.3)*.74;
  const sat=.5,i=Ib[p]*sat,q=Qb[p]*sat,shadow=1-Math.min(1,y*2.2);
  let R=y+.956*i+.621*q,G=y-.272*i-.647*q,B=y-1.106*i+1.703*q;G+=shadow*.04+.012;B+=shadow*.02;R-=shadow*.025;
  const grain=(r()-.5)*.05;d[p*4]=clamp(R+grain,0,1)*255;d[p*4+1]=clamp(G+grain,0,1)*255;d[p*4+2]=clamp(B+grain,0,1)*255;}
 g.putImageData(img,0,0);return c;
}

export default function vhs(input){
 const base=sceneBase(input,{hue:180}),{width:W,height:H,portrait,u,tracks}=base,N=tracks.length;
 const M=portrait?u*.07:H*.075,O=2;
 const L=portrait?{caption:H*.7,capW:u*.86,cap:u*.074,title:H*.47,spec:[M,H-M-H*.065,u*.3,H*.04]}
  :{caption:H*.75,capW:W*.78,cap:u*.07,title:H*.46,spec:[M,H-M-H*.1,W*.16,H*.055]};
 const measure=layer(8,8).getContext('2d');
 const SW=portrait?216:384,SH=portrait?384:216,frames=lru(3);
 const frame=i=>frames(i,()=>tape(base.art(i).image,SW,SH,hash(`vhs${i}`)));

 // ---- Fixed overlays: scanlines, vignette, snow --------------------------------------------------
 const lines=layer(W,H);{const g=lines.getContext('2d'),step=Math.max(2,Math.round(u*.0034));g.fillStyle='rgba(0,0,0,.22)';for(let y=0;y<H;y+=step)g.fillRect(0,y,W,Math.max(1,step/2));
  const v=g.createRadialGradient(W/2,H/2,u*.25,W/2,H/2,Math.hypot(W,H)*.56);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(.7,'rgba(0,0,0,.35)');v.addColorStop(1,'rgba(0,0,0,.85)');g.fillStyle=v;g.fillRect(0,0,W,H);}
 const SNW=Math.ceil(W/3),SNH=Math.ceil(H/3);
 const snow=[0,1,2,3].map(k=>{const c=layer(SNW,SNH),g=c.getContext('2d'),r=random(hash(`snow${k}`));for(let y=0;y<SNH;y++)for(let x=0;x<SNW;){const run=1+Math.floor(r()*6),v=r();if(v>.45){g.fillStyle=`rgba(${v>.9?255:200},${v>.9?255:205},${v>.9?255:215},${(v-.45)*1.2})`;g.fillRect(x,y,run,1);}x+=run;}return c;});
 const osd=layer(Math.ceil(W/O),Math.ceil(H/O)),og=osd.getContext('2d');

 // ---- Captions: white with a black edge, plus red and cyan copies for the split --------------------
 const caps=lru(6);
 function caption(key,value,size,maxW,maxLines){return caps(key,()=>{
  const fit=fitText(measure,value||' ',{size,minSize:size*.5,weight:800,lineHeight:1.24,maxWidth:maxW,maxHeight:size*1.24*maxLines,spacing:.01,maxLines});
  const pad=Math.ceil(fit.font*.3),lh=fit.font*fit.lineHeight,w=Math.ceil(maxW+pad*2),h=Math.ceil(fit.lines.length*lh+pad*2);
  const put=(g,mode)=>{setFont(g,800,fit.font,.01);g.textAlign='center';g.textBaseline='middle';g.lineJoin='round';fit.lines.forEach((line,n)=>{const y=pad+lh*(n+.5);if(mode==='stroke')g.strokeText(line,w/2,y);else g.fillText(line,w/2,y);});};
  const main=layer(w,h),g=main.getContext('2d');g.strokeStyle='rgba(0,0,0,.92)';g.lineWidth=fit.font*.16;put(g,'stroke');g.fillStyle='#f4f4ee';put(g,'fill');
  const tint=col=>{const c=layer(w,h),cg=c.getContext('2d');cg.fillStyle=col;put(cg,'fill');return c;};
  return {main,red:tint('rgb(255,30,60)'),cyan:tint('rgb(20,230,255)'),w,h};});}
 const lineCap=(i,n)=>caption(`l${i}:${n}`,tracks[i].cues[n].text,L.cap,L.capW,2);
 const titleCap=i=>caption(`t${i}`,tracks[i].title,L.cap*1.3,portrait?u*.84:W*.7,2);
 function putCaption(ctx,c,cx,cy,split,alpha){
  const x=cx-c.w/2,y=cy-c.h/2,d=u*(.0018+split*.016);ctx.globalAlpha=alpha;
  if(split>.02){const k=3,sh=c.h/k;for(let n=0;n<k;n++){const off=(n-1)*split*u*.02*(n%2?-1:1);ctx.drawImage(c.main,0,n*sh,c.w,sh,x+off,y+n*sh,c.w,sh);}}
  else ctx.drawImage(c.main,x,y);
  ctx.globalCompositeOperation='screen';ctx.globalAlpha=alpha*(.35+split*.65);ctx.drawImage(c.red,x-d,y);ctx.drawImage(c.cyan,x+d,y+d*.2);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
 }

 /** Horizontal displacement of the picture row at height y (0..1). */
 function jitter(y,t,band){
  let off=Math.sin(y*37+t*9)*u*.0012+Math.sin(y*11-t*3.1)*u*.0008;
  // Occasional tracking glitch: in some 1.9 s slots a strip slides for a moment.
  const slot=Math.floor(t/1.9),r=random(hash(`glitch${slot}`));if(r()<.28){const at=r()*1.5,len=.12+r()*.2,gy=r(),gh=.03+r()*.07,dt=t-slot*1.9-at;if(dt>0&&dt<len&&Math.abs(y-gy)<gh)off+=(r()-.3)*u*.05;}
  if(band!==null){const dist=Math.abs(y-band);if(dist<.09)off+=(1-dist/.09)*u*.06*Math.sin(y*140+t*40);}
  if(y>.965)off+=u*.025*(1+Math.sin(y*300+t*60)*.5);
  return off;
 }
 function picture(ctx,i,t,band){
  const src=frame(i),strips=48,zoom=1.07,dx=Math.sin(t*.37)*u*.007+Math.sin(t*.93+1)*u*.003,dy=Math.sin(t*.29+2)*u*.006+Math.sin(t*.71)*u*.002;
  const pw=W*zoom,ph=H*zoom,x0=(W-pw)/2+dx,y0=(H-ph)/2+dy,sh=SH/strips,dh=ph/strips;
  ctx.imageSmoothingEnabled=true;
  for(let k=0;k<strips;k++){const yy=y0+k*dh,mid=(yy+dh/2)/H;ctx.drawImage(src,0,k*sh,SW,sh,x0+jitter(mid,t,band),yy,pw,dh+1);}
 }
 function snowOver(ctx,t,alpha){const f=Math.floor(t*30),r=random(hash(`sn${f}`));ctx.save();ctx.globalAlpha=alpha;ctx.globalCompositeOperation='screen';ctx.imageSmoothingEnabled=false;ctx.drawImage(snow[f%4],-r()*W*.1,-r()*H*.1,W*1.1,H*1.1);ctx.restore();ctx.imageSmoothingEnabled=true;}

 // ---- On-screen display (drawn at half resolution, scaled up without smoothing) -------------------
 function display(s,{mode,levels,focus}){
  const g=og,w=osd.width,h=osd.height,m=M/O,sz=u*.03/O,{t,i,local}=s;g.clearRect(0,0,w,h);
  const put=(value,x,y,{size=sz,align='left',color='#f2f2ea',weight=800,maxWidth=Infinity}={})=>{setFont(g,weight,size,.08);g.textAlign=align;g.textBaseline='middle';const v=Number.isFinite(maxWidth)?ellipsize(g,value,maxWidth):value;g.fillStyle='rgba(0,0,0,.85)';g.fillText(v,x+size*.08,y+size*.08);g.fillStyle=color;g.fillText(v,x,y);};
  if(mode==='rec'){const on=(t%1.2)<.75;if(on){g.fillStyle='#ff2a2a';g.beginPath();g.arc(m+sz*.45,m+sz*.5,sz*.38,0,Math.PI*2);g.fill();}put('REC',m+sz*1.1,m+sz*.5);}
  else put(mode==='play'?'PLAY ▶':'▶▶',m,m+sz*.5);
  // Battery, draining over the whole video, and the tape speed.
  {const bw=sz*2,bh=sz*.9,bx=w-m-bw,by=m+sz*.05,lvl=Math.max(1,3-Math.floor(s.t/Math.max(1,base.total)*3));g.strokeStyle='#f2f2ea';g.lineWidth=Math.max(1,sz*.12);g.strokeRect(bx,by,bw,bh);g.fillStyle='#f2f2ea';g.fillRect(bx+bw,by+bh*.3,sz*.15,bh*.4);
   for(let k=0;k<lvl;k++)g.fillRect(bx+sz*.15+k*(bw-sz*.3)/3,by+sz*.15,(bw-sz*.3)/3-sz*.1,bh-sz*.3);put('SP',bx-sz*.6,m+sz*.5,{align:'right'});}
  if(base.headline)put(base.headline,w/2,m+sz*.5,{size:sz*1.05,align:'center',maxWidth:portrait?w*.46:w*.5});
  put(`T${String(i+1).padStart(2,'0')}  ${tracks[i].title||''}`,m,m+sz*2,{size:sz*.8,color:'rgba(242,242,234,.85)',maxWidth:w*(portrait?.8:.5)});
  // Tape counter (video time) and the date stamp (a fixed night per song, the clock running).
  const tt=Math.floor(s.t),counter=`${Math.floor(tt/3600)}:${String(Math.floor(tt/60)%60).padStart(2,'0')}:${String(tt%60).padStart(2,'0')}`;
  put(counter,m,h-m-sz*.5);
  const day=(hash(`d${i}`)%27)+1,mon=MONTHS[(9+Math.floor(i/3))%12],year=1996+Math.floor(i/12)%4,min=(47+Math.floor(local/60))%60,hr=11+Math.floor((47+local/60)/60);
  put(`PM ${hr>12?hr-12:hr}:${String(min).padStart(2,'0')}`,w-m,h-m-sz*1.75,{align:'right'});put(`${mon}. ${String(day).padStart(2,'0')} ${year}`,w-m,h-m-sz*.5,{align:'right'});
  // Audio level: two rows of blocks.
  {const bx=m,by=h-m-sz*2.9,cells=12,cw=sz*.42;levels.forEach((v,row)=>{put(row?'R':'L',bx,by+row*sz*.75,{size:sz*.6});for(let k=0;k<cells;k++){g.fillStyle=k<Math.round(v*cells)?(k>9?'#ff4040':'#f2f2ea'):'rgba(242,242,234,.2)';g.fillRect(bx+sz*.8+k*cw,by+row*sz*.75-sz*.2,cw*.7,sz*.4);}});}
  // Autofocus brackets: they tighten for a moment when a new line comes in.
  if(mode==='rec'){const fw=(portrait?w*.34:w*.22)*focus,fh=(portrait?h*.13:h*.26)*focus,cx=w/2,cy=h*(portrait?.42:.44),k=sz*.9;g.strokeStyle='rgba(242,242,234,.8)';g.lineWidth=Math.max(1,sz*.1);
   for(const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){const x=cx+sx*fw/2,y=cy+sy*fh/2;g.beginPath();g.moveTo(x-sx*k,y);g.lineTo(x,y);g.lineTo(x,y-sy*k);g.stroke();}}
 }
 function showDisplay(ctx){ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(osd,0,0,W,H);ctx.restore();}

 function draw(ctx,time){
  const s=base.at(time),{i,local,duration,t}=s,cues=s.track.cues||[];
  const e=s.energy,levels=[e.level,clamp(e.level*.7+e.high*.4,0,1)];
  // Song start: noise burst, blue PLAY screen, then the picture comes in under a tracking band.
  if(local<1.15){
   if(local<.22){picture(ctx,i,t,null);snowOver(ctx,t,.9);}
   else{ctx.fillStyle='#0c1e9c';ctx.fillRect(0,0,W,H);ctx.drawImage(lines,0,0);display(s,{mode:'play',levels:[0,0],focus:1});const sz=u*.03/O;og.textAlign='center';setFont(og,800,sz*1.5,.12);og.fillStyle='#f2f2ea';og.fillText(`TRACK ${String(i+1).padStart(2,'0')}`,osd.width/2,osd.height/2);showDisplay(ctx);}
   return;
  }
  const line=base.lineState(s),c=line.index,age=c>=0?local-line.start:local-1.15;
  const band=age<.5?1.08-easeInOut(age/.5)*1.2:null,ff=duration-local<.8?clamp(1-(duration-local)/.8,0,1):0;
  picture(ctx,i,t,band);
  // Fast-forward search: bars of noise rolling down the picture.
  if(ff>0){ctx.save();for(let k=0;k<3;k++){const y=((t*1.7+k/3)%1)*H*1.2-H*.1,bh=H*(.05+.03*k);ctx.beginPath();ctx.rect(0,y,W,bh);ctx.clip();const f=Math.floor(t*30)+k;ctx.globalAlpha=.9;ctx.drawImage(snow[f%4],-k*W*.05,0,W*1.1,H);ctx.restore();ctx.save();}ctx.restore();}
  if(band!==null){const y=band*H,bh=H*.07;ctx.save();ctx.beginPath();ctx.rect(0,y-bh/2,W,bh);ctx.clip();snowOver(ctx,t,.75);ctx.restore();}
  snowOver(ctx,t,.07+ff*.3);
  ctx.drawImage(lines,0,0);
  // Captions.
  if(c<0){const first=Number.isFinite(line.next)?line.next:Infinity,tc=titleCap(i),a=clamp((local-1.3)/.3,0,1)*clamp((first-.15)/.35,0,1);if(a>0)putCaption(ctx,tc,W/2,L.title,clamp(1-(local-1.3)/.4,0,1),a);}
  else{const quiet=Number.isFinite(line.next)?line.next:duration-local,a=quiet>3.5&&local>line.end+1.2?clamp(1-(local-line.end-1.2)/.5,0,1):1;
   const split=age<.45?Math.pow(1-age/.45,1.5):0;if(a>0)putCaption(ctx,lineCap(i,c),W/2,L.caption,split,a*s.exit);}
  // Spectrum: the chosen kind as a small OSD level display.
  if(s.frame){const [x,y,w,h]=L.spec,kind=LINEAR.includes(base.options.spectrum)?base.options.spectrum:'bars';drawSpectrum(ctx,{kind,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:[242,242,234],alpha:.75,x,y:y-h*1.4,width:w,height:h});}
  const focus=c>=0&&age<.6?1-.12*Math.sin(Math.PI*clamp(age/.6,0,1)):1;
  display(s,{mode:ff>.05?'ff':'rec',levels,focus});showDisplay(ctx);
 }
 return {draw,duration:base.total};
}

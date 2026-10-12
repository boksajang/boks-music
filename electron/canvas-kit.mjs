import {interpolateAnalysisFrame} from './video-composition.mjs';

/**
 * Shared drawing kit for the GPU canvas scenes. Every motion is a function of the frame time, so the
 * editor preview and the WebCodecs render draw identical frames. `u` is the short side of the frame.
 */
export const FONT='"Malgun Gothic","Apple SD Gothic Neo",sans-serif';
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const lerp=(a,b,t)=>a+(b-a)*t;
export const easeOut=t=>1-Math.pow(1-clamp(t,0,1),3);
export const easeInOut=t=>{t=clamp(t,0,1);return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;};
export const stamp=n=>{n=Math.max(0,Math.floor(Number(n)||0));const s=String(n%60).padStart(2,'0');return n>=3600?`${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${s}`:`${Math.floor(n/60)}:${s}`;};
export const layer=(w,h)=>(typeof OffscreenCanvas==='function'?new OffscreenCanvas(Math.max(1,Math.ceil(w)),Math.max(1,Math.ceil(h))):Object.assign(document.createElement('canvas'),{width:Math.max(1,Math.ceil(w)),height:Math.max(1,Math.ceil(h))}));
export const rgba=([r,g,b],a=1)=>`rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
export const mix=(a,b,t)=>a.map((v,i)=>lerp(v,b[i],t));
export function hash(text){let h=2166136261;for(const char of String(text)){h^=char.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;}
export function random(seed){let s=(seed>>>0)||1;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;};}

// ---- Color --------------------------------------------------------------------------------------
function toHsl([r,g,b]){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2;if(max===min)return [0,0,l];const d=max-min,s=l>.5?d/(2-max-min):d/(max+min);const h=max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4;return [h*60,s,l];}
export function hsl(h,s,l){h=((h%360)+360)%360;s=clamp(s,0,1);l=clamp(l,0,1);const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;const [r,g,b]=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return [(r+m)*255,(g+m)*255,(b+m)*255];}
/** The album's most characteristic color (hue bucket weighted by saturation), brought to a usable lightness. */
export function accentOf(image,fallbackHue=215){
 const fallback={hue:fallbackHue,sat:.5,luma:.35};
 let pick=fallback;
 if(image)try{
  const c=layer(24,24),g=c.getContext('2d',{willReadFrequently:true});g.drawImage(image,0,0,24,24);const data=g.getImageData(0,0,24,24).data;
  const buckets=Array.from({length:18},()=>({w:0,s:0}));let gray=0,luma=0;
  for(let i=0;i<data.length;i+=4){luma+=(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2])/255/(data.length/4);const [h,s,l]=toHsl([data[i],data[i+1],data[i+2]]);const weight=s*(1-Math.abs(l-.5)*1.6);if(weight<=.08||l<.08||l>.94){gray++;continue;}const b=buckets[Math.floor(h/20)%18];b.w+=weight;b.s+=s*weight;}
  const best=buckets.reduce((a,b,i)=>b.w>a.w?{...b,i}:a,{w:0,i:-1});
  pick={...fallback,luma};if(best.i>=0&&best.w>2.5)pick={hue:best.i*20+10,sat:clamp(best.s/best.w,.35,.85),luma};
 }catch{/* tainted or unreadable image: keep the scene color */}
 return pick;
}
/** Scene palette from an accent: vivid accent, soft tint, deep background tones. */
export function palette({hue,sat,luma=.35}){return {hue,luma,accent:hsl(hue,Math.max(.55,sat),.6),soft:hsl(hue,sat*.7,.78),glow:hsl(hue,Math.max(.6,sat),.55),deep:hsl(hue,sat*.55,.09),mid:hsl(hue,sat*.45,.2),ink:hsl(hue,sat*.25,.95)};}

// ---- Text ---------------------------------------------------------------------------------------
export function setFont(ctx,weight,size,spacing=0){ctx.font=`${weight} ${size}px ${FONT}`;ctx.letterSpacing=`${spacing*size}px`;}
// Wraps like CSS `word-break: keep-all; overflow-wrap: anywhere`.
export function wrap(ctx,text,maxWidth){
 const lines=[];let line='';
 for(const word of String(text).split(/\s+/).filter(Boolean)){
  const candidate=line?line+' '+word:word;
  if(ctx.measureText(candidate).width<=maxWidth){line=candidate;continue;}
  if(line)lines.push(line);
  if(ctx.measureText(word).width<=maxWidth){line=word;continue;}
  line='';
  for(const char of word){if(ctx.measureText(line+char).width>maxWidth&&line){lines.push(line);line=char;}else line+=char;}
 }
 if(line)lines.push(line);
 return lines.length?lines:[''];
}
/** Shrinks in 5% steps until the wrapped block fits, down to a floor. */
export function fitText(ctx,text,{size,minSize,weight,lineHeight,maxWidth,maxHeight,spacing=0,maxLines=Infinity}){
 let font=size,lines;
 for(;;){setFont(ctx,weight,font,spacing);lines=wrap(ctx,text,maxWidth);if((lines.length*font*lineHeight<=maxHeight+1&&lines.length<=maxLines)||font<=minSize)break;font*=.95;}
 if(lines.length>maxLines){lines=lines.slice(0,maxLines);lines[maxLines-1]=ellipsize(ctx,lines[maxLines-1]+'…',maxWidth);}
 return {font,lines,height:lines.length*font*lineHeight,weight,lineHeight,spacing};
}
// Ellipsized strings are the same every frame: measured once per text, font and width.
const shortened=new Map();
export function ellipsize(ctx,text,maxWidth){
 text=String(text);const key=`${ctx.font}|${ctx.letterSpacing}|${Math.round(maxWidth)}|${text}`;
 if(shortened.has(key))return shortened.get(key);
 let value=text;
 if(ctx.measureText(text).width>maxWidth){value=text.replace(/…$/,'');while(value&&ctx.measureText(value+'…').width>maxWidth)value=value.slice(0,-1);value+='…';}
 if(shortened.size>4000)shortened.clear();shortened.set(key,value);return value;
}
/** One line of text, ellipsized to maxWidth. */
export function text(ctx,value,x,y,{size,weight=400,color='#fff',align='left',baseline='alphabetic',spacing=0,maxWidth=Infinity,alpha=1}={}){
 if(!value)return;setFont(ctx,weight,size,spacing);ctx.textAlign=align;ctx.textBaseline=baseline;ctx.fillStyle=color;ctx.globalAlpha=alpha;
 ctx.fillText(Number.isFinite(maxWidth)?ellipsize(ctx,value,maxWidth):String(value),x,y);ctx.globalAlpha=1;
}
/** Draws a fitted block (from fitText) with its first line top at y. */
export function drawBlock(ctx,block,x,y,{color='#fff',align='left',alpha=1}={}){
 setFont(ctx,block.weight,block.font,block.spacing);ctx.textAlign=align;ctx.textBaseline='top';ctx.fillStyle=color;ctx.globalAlpha=alpha;
 block.lines.forEach((line,n)=>ctx.fillText(line,x,y+n*block.font*block.lineHeight+block.font*(block.lineHeight-1)/2));ctx.globalAlpha=1;
}

// ---- Images -------------------------------------------------------------------------------------
export function drawCover(ctx,image,x,y,w,h){
 const iw=image.width,ih=image.height,scale=Math.max(w/iw,h/ih),sw=w/scale,sh=h/scale;
 ctx.drawImage(image,(iw-sw)/2,(ih-sh)/2,sw,sh,x,y,w,h);
}
/** Album art substitute for songs without art: a deterministic gradient study from the title. */
export function abstractArt(title,size=512){
 const c=layer(size,size),g=c.getContext('2d'),r=random(hash(title)),hue=r()*360;
 const bg=g.createLinearGradient(0,0,size,size);bg.addColorStop(0,rgba(hsl(hue,.45,.3)));bg.addColorStop(.55,rgba(hsl(hue+40,.35,.22)));bg.addColorStop(1,rgba(hsl(hue+110,.4,.42)));g.fillStyle=bg;g.fillRect(0,0,size,size);
 for(let k=0;k<3;k++){const x=r()*size,y=r()*size,rad=size*(.25+r()*.4),glow=g.createRadialGradient(x,y,0,x,y,rad);glow.addColorStop(0,rgba(hsl(hue+r()*90,.6,.7),.55));glow.addColorStop(1,rgba(hsl(hue,.6,.5),0));g.fillStyle=glow;g.fillRect(0,0,size,size);}
 g.save();g.translate(size*.5,size*.72);g.rotate(-.55);for(let ring=0;ring<6;ring++){g.strokeStyle=`rgba(230,238,250,${.42-ring*.06})`;g.lineWidth=size*.003;g.beginPath();g.ellipse(0,0,size*(.62+ring*.05),size*(.3+ring*.05),0,0,Math.PI*2);g.stroke();}g.restore();
 return c;
}
/** A blurred, slightly darkened copy small enough to scale cheaply every frame. */
export function blurredCover(image,aspect,{blur=.035,dim=.25}={}){
 const w=aspect>=1?220:Math.round(220*aspect),h=aspect>=1?Math.round(220/aspect):220,c=layer(w,h),g=c.getContext('2d'),pad=Math.max(w,h)*.12;
 g.filter=`blur(${Math.max(w,h)*blur}px)`;drawCover(g,image,-pad,-pad,w+pad*2,h+pad*2);g.filter='none';
 if(dim){g.fillStyle=`rgba(0,0,0,${dim})`;g.fillRect(0,0,w,h);}
 return c;
}
/** Draws a cover layer filling the frame with a slow zoom and drift. */
export function drawDrift(ctx,image,width,height,t,{zoom=1.12,amount=.04,speed=.05,seed=0,alpha=1}={}){
 const s=zoom+Math.sin(t*speed*.8+seed)*.04,w=width*s,h=height*s,dx=Math.sin(t*speed+seed*1.7)*width*amount,dy=Math.cos(t*speed*.73+seed)*height*amount;
 ctx.globalAlpha=alpha;drawCover(ctx,image,(width-w)/2+dx,(height-h)/2+dy,w,h);ctx.globalAlpha=1;
}
/** A soft round shadow sprite; drawn under moving objects instead of per-frame shadowBlur. */
export function shadowSprite(size=256,{alpha=.6,round=false}={}){
 const c=layer(size,size),g=c.getContext('2d'),pad=size*.18;g.filter=`blur(${size*.07}px)`;g.fillStyle=`rgba(0,0,0,${alpha})`;
 g.beginPath();if(round)g.arc(size/2,size/2,size/2-pad,0,Math.PI*2);else g.roundRect(pad,pad,size-pad*2,size-pad*2,size*.04);g.fill();g.filter='none';return c;
}
export function drawShadow(ctx,sprite,x,y,w,h,{offsetY=.06,spread=1.32,alpha=1}={}){const sw=w*spread,sh=h*spread;ctx.globalAlpha=alpha;ctx.drawImage(sprite,x+w/2-sw/2,y+h/2-sh/2+h*offsetY,sw,sh);ctx.globalAlpha=1;}
export function roundedImage(ctx,image,x,y,w,h,radius){ctx.save();ctx.beginPath();ctx.roundRect(x,y,w,h,radius);ctx.clip();drawCover(ctx,image,x,y,w,h);ctx.restore();}

// ---- Discs --------------------------------------------------------------------------------------
/** Pre-rendered record (vinyl) or printed CD face; rotated per frame, the gloss stays fixed. */
export function discTexture(size,{kind='vinyl',art,accent=[150,170,210]}={}){
 const c=layer(size,size),g=c.getContext('2d'),r=size/2,rng=random(hash(kind+size));g.translate(r,r);
 if(kind==='vinyl'){
  const base=g.createRadialGradient(0,0,r*.3,0,0,r);base.addColorStop(0,'#16171b');base.addColorStop(1,'#0a0a0d');g.fillStyle=base;g.beginPath();g.arc(0,0,r,0,Math.PI*2);g.fill();
  for(let rad=r*.36;rad<r*.97;rad+=Math.max(1.2,size*.0032)){g.strokeStyle=`rgba(255,255,255,${.018+rng()*.035})`;g.lineWidth=Math.max(.6,size*.0012);g.beginPath();g.arc(0,0,rad,0,Math.PI*2);g.stroke();}
  for(const edge of [.355,.62,.97]){g.strokeStyle='rgba(0,0,0,.65)';g.lineWidth=size*.004;g.beginPath();g.arc(0,0,r*edge,0,Math.PI*2);g.stroke();}
  // Pressing irregularities: faint uneven wedges and a run-out mark turn with the record, so a spin
  // is visible even where only the grooves show (the fixed gloss in drawDisc does not move).
  for(const [from,span,alpha] of [[.3,.5,.07],[1.9,.28,.05],[3.4,.62,.06],[4.8,.2,.08]]){const wedge=g.createConicGradient(from,0,0);wedge.addColorStop(0,'rgba(255,255,255,0)');wedge.addColorStop(span/(Math.PI*2)/2,`rgba(255,255,255,${alpha})`);wedge.addColorStop(span/(Math.PI*2),'rgba(255,255,255,0)');g.fillStyle=wedge;g.beginPath();g.arc(0,0,r*.96,0,Math.PI*2);g.arc(0,0,r*.37,0,Math.PI*2,true);g.fill('evenodd');}
  g.strokeStyle='rgba(255,255,255,.22)';g.lineWidth=Math.max(1,size*.0025);g.beginPath();g.arc(0,0,r*.5,-.35,.05);g.stroke();g.beginPath();g.arc(0,0,r*.78,2.6,2.75);g.stroke();
  g.save();g.beginPath();g.arc(0,0,r*.33,0,Math.PI*2);g.clip();if(art)drawCover(g,art,-r*.33,-r*.33,r*.66,r*.66);else{g.fillStyle=rgba(accent);g.fill();}g.restore();
  // Label print: a band of text marks along one side of the label edge.
  g.save();g.fillStyle='rgba(255,255,255,.75)';for(let k=0;k<14;k++){g.save();g.rotate(-1.2+k*.11);g.fillRect(-size*.004,-r*.3,size*.008,size*(.012+((k*7)%5)*.004));g.restore();}g.restore();
  g.strokeStyle='rgba(255,255,255,.18)';g.lineWidth=size*.002;g.beginPath();g.arc(0,0,r*.33,0,Math.PI*2);g.stroke();
  g.fillStyle='#0b0b0e';g.beginPath();g.arc(0,0,r*.022,0,Math.PI*2);g.fill();
 }else{
  const base=g.createRadialGradient(0,0,r*.2,0,0,r);base.addColorStop(0,'#d9dde3');base.addColorStop(.7,'#b8bec8');base.addColorStop(1,'#9aa1ad');g.fillStyle=base;g.beginPath();g.arc(0,0,r,0,Math.PI*2);g.fill();
  g.save();g.beginPath();g.arc(0,0,r*.985,0,Math.PI*2);g.arc(0,0,r*.27,0,Math.PI*2,true);g.clip('evenodd');
  if(art){g.globalAlpha=.94;drawCover(g,art,-r,-r,size,size);g.globalAlpha=1;}else{const fill=g.createLinearGradient(-r,-r,r,r);fill.addColorStop(0,rgba(accent));fill.addColorStop(1,rgba(mix(accent,[20,24,32],.6)));g.fillStyle=fill;g.fillRect(-r,-r,size,size);}
  g.restore();
  g.fillStyle='rgba(225,230,238,.55)';g.beginPath();g.arc(0,0,r*.27,0,Math.PI*2);g.arc(0,0,r*.17,0,Math.PI*2,true);g.fill('evenodd');
  g.strokeStyle='rgba(255,255,255,.35)';g.lineWidth=size*.003;for(const edge of [.27,.17,.985]){g.beginPath();g.arc(0,0,r*edge,0,Math.PI*2);g.stroke();}
  g.globalCompositeOperation='destination-out';g.beginPath();g.arc(0,0,r*.075,0,Math.PI*2);g.fill();g.globalCompositeOperation='source-over';
 }
 return c;
}
export function drawDisc(ctx,texture,cx,cy,radius,angle,{kind='vinyl',gloss=1}={}){
 ctx.save();ctx.translate(cx,cy);ctx.rotate(angle);ctx.drawImage(texture,-radius,-radius,radius*2,radius*2);ctx.restore();
 if(!gloss)return;
 ctx.save();ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);if(kind==='vinyl')ctx.arc(cx,cy,radius*.34,0,Math.PI*2,true);ctx.clip('evenodd');
 const sheen=ctx.createConicGradient(-.6,cx,cy);
 if(kind==='vinyl'){for(const [at,a] of [[0,0],[.06,.16],[.12,0],[.5,0],[.56,.12],[.62,0],[1,0]])sheen.addColorStop(at,`rgba(255,255,255,${a*gloss})`);}
 else{for(const [at,color] of [[0,'rgba(255,255,255,0)'],[.08,`rgba(140,220,255,${.28*gloss})`],[.14,`rgba(255,180,240,${.24*gloss})`],[.2,'rgba(255,255,255,0)'],[.55,'rgba(255,255,255,0)'],[.62,`rgba(255,240,170,${.22*gloss})`],[.7,'rgba(255,255,255,0)'],[1,'rgba(255,255,255,0)']])sheen.addColorStop(at,color);}
 ctx.fillStyle=sheen;ctx.fillRect(cx-radius,cy-radius,radius*2,radius*2);ctx.restore();
}
/** Turntable arm pivoting at (px,py); angle 0 points straight down. */
export function drawTonearm(ctx,px,py,length,angle,{color='#c9ced6',u=1000}={}){
 ctx.save();ctx.translate(px,py);ctx.rotate(angle);
 ctx.strokeStyle='rgba(0,0,0,.35)';ctx.lineWidth=u*.012;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(u*.006,u*.008);ctx.lineTo(u*.006,length*.82+u*.008);ctx.lineTo(-length*.1+u*.006,length+u*.008);ctx.stroke();
 ctx.strokeStyle=color;ctx.lineWidth=u*.008;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,length*.82);ctx.lineTo(-length*.1,length);ctx.stroke();
 ctx.fillStyle='#2a2d33';ctx.save();ctx.translate(-length*.1,length);ctx.rotate(.3);ctx.fillRect(-u*.012,-u*.018,u*.024,u*.04);ctx.restore();
 const base=ctx.createRadialGradient(0,0,0,0,0,u*.04);base.addColorStop(0,'#eef0f3');base.addColorStop(1,'#7c828c');ctx.fillStyle=base;ctx.beginPath();ctx.arc(0,0,u*.032,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#3a3e46';ctx.beginPath();ctx.arc(0,0,u*.012,0,Math.PI*2);ctx.fill();ctx.restore();
}

// ---- Atmosphere ---------------------------------------------------------------------------------
export function makeParticles(seed,count){const r=random(seed);return Array.from({length:count},()=>({x:r(),y:r(),z:.35+r()*.65,phase:r()*Math.PI*2,speed:.5+r()*.5}));}
const dots=new Map();
function dotSprite(color){color=color.map(Math.round);const key=color.join(',');if(!dots.has(key)){if(dots.size>48)dots.clear();const c=layer(64,64),g=c.getContext('2d'),glow=g.createRadialGradient(32,32,0,32,32,32);glow.addColorStop(0,rgba(color,1));glow.addColorStop(.25,rgba(color,.55));glow.addColorStop(1,rgba(color,0));g.fillStyle=glow;g.fillRect(0,0,64,64);dots.set(key,c);}return dots.get(key);}
/** Floating dust/light motes rising slowly, swaying, and brightening with the music. */
export function drawParticles(ctx,list,t,{width,height,color=[255,255,255],size=8,alpha=.5,rise=.012,sway=.015,level=0}={}){
 const sprite=dotSprite(color);ctx.save();ctx.globalCompositeOperation='lighter';
 for(const p of list){const y=(((p.y-t*rise*p.speed*p.z)%1)+1)%1,x=p.x+Math.sin(t*.25*p.speed+p.phase)*sway,s=size*p.z*(1+level*.35),a=alpha*p.z*(.55+.45*Math.sin(t*.7*p.speed+p.phase))*(1+level*.5);ctx.globalAlpha=clamp(a,0,1);ctx.drawImage(sprite,x*width-s,(y*1.1-.05)*height-s,s*2,s*2);}
 ctx.restore();
}
/** A broad diagonal light band crossing the frame every `period` seconds. */
export function drawSweep(ctx,t,{width,height,period=16,color=[255,236,210],alpha=.1,skew=.35,band=.28}={}){
 const phase=((t%period)+period)%period/period,x=lerp(-.6,1.6,phase)*width,w=width*band;
 ctx.save();ctx.globalCompositeOperation='screen';ctx.translate(x,height/2);ctx.transform(1,0,-skew,1,0,0);
 const g=ctx.createLinearGradient(-w/2,0,w/2,0);g.addColorStop(0,rgba(color,0));g.addColorStop(.5,rgba(color,alpha));g.addColorStop(1,rgba(color,0));ctx.fillStyle=g;ctx.fillRect(-w/2,-height,w,height*2);ctx.restore();
}
export function vignette(ctx,width,height,{alpha=.55,inner=.45}={}){const g=ctx.createRadialGradient(width/2,height/2,Math.min(width,height)*inner*.6,width/2,height/2,Math.hypot(width,height)/2);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${alpha})`);ctx.fillStyle=g;ctx.fillRect(0,0,width,height);}
export function radialGlow(ctx,x,y,radius,color,alpha){const g=ctx.createRadialGradient(x,y,0,x,y,radius);g.addColorStop(0,rgba(color,alpha));g.addColorStop(1,rgba(color,0));ctx.fillStyle=g;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);}

// ---- Audio --------------------------------------------------------------------------------------
/** A measured spectrum frame. `analysis.sample` is the editor's live decoder; otherwise packed frames. */
export function frameAt(analysis,time,fps=30){if(!analysis)return undefined;return typeof analysis.sample==='function'?analysis.sample(time):interpolateAnalysisFrame(analysis,time,fps);}
const avg=(values,a,b)=>{let sum=0,n=0;for(let i=a;i<b&&i<values.length;i++){sum+=values[i];n++;}return n?sum/n:0;};
/**
 * Loudness envelope (fast attack, ~0.25 s release) from measured frames only: level, low, high in 0..1.
 * Bin b covers FFT bins from 2^(9b/64) at 11.7 Hz each: 12–24 ≈ 40–120 Hz (kick, bass), 48–64 ≈ 2.2–6 kHz.
 * Bins 0–7 all read the inaudible ~12 Hz FFT bin and are left out.
 */
export function energyAt(analysis,time,fps=30){
 const out={level:0,low:0,high:0};if(!analysis)return out;
 // Ranges from real songs (bin averages, 10th/50th/90th percentile): all .14/.32/.45, bass .06/.4/.6,
 // highs .05/.24/.36 — mapped so a typical passage sits mid-way and loud moments approach 1.
 const shape=(v,from,span)=>clamp((v-from)/span,0,1);
 for(let k=0;k<6;k++){const frame=frameAt(analysis,Math.max(0,time-k*.045),fps);if(!frame?.bins?.length)continue;const w=Math.pow(.74,k),b=frame.bins;
  out.level=Math.max(out.level,shape(avg(b,8,64),.15,.35)*w);out.low=Math.max(out.low,shape(avg(b,12,24),.2,.45)*w);out.high=Math.max(out.high,shape(avg(b,48,64),.1,.3)*w);}
 return out;
}

/** Spectrum geometry shared with video-spectrum.mjs; `tint` replaces the mono color. */
export function drawSpectrum(ctx,{kind='bars',bins=[],waveform=[],color='mono',tint,alpha=1,amp=1,x,y,width:w,height:h}){
 // The first 8 of 64 log bins all read the same ~12 Hz FFT bin (inaudible, near zero): not drawn.
 const b=bins.slice(bins.length>=64?8:0).map(v=>clamp(Number(v)||0,0,1)),v=waveform.map(n=>clamp(Number(n)||0,-1,1));
 if(!b.length&&!v.length)return;
 let paint=tint?rgba(tint):'#b1d4fa';
 if(color!=='mono'){
  const g=ctx.createLinearGradient(x,0,x+w,0);g.addColorStop(0,'#71c8ff');
  if(color==='rainbow'){g.addColorStop(.32,'#b298ff');g.addColorStop(.65,'#f0a2b5');g.addColorStop(1,'#f0d096');}else g.addColorStop(1,'#b298ff');
  paint=g;
 }
 ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.strokeStyle=paint;ctx.fillStyle=paint;ctx.lineJoin='round';
 const base=alpha;
 const wavePoints=(scale=1,offset=h/2)=>v.map((n,i)=>[i/Math.max(1,v.length-1)*w,offset-n*h*.4*scale]);
 const stroke=(points,{close=false,fill=false,opacity=1,width=Math.max(2,h*.02)}={})=>{if(!points.length)return;ctx.globalAlpha=opacity*base;ctx.beginPath();points.forEach(([px,py],i)=>(i?ctx.lineTo(px,py):ctx.moveTo(px,py)));if(close)ctx.closePath();if(fill)ctx.fill();else{ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke();}ctx.globalAlpha=base;};
 const bar=(x1,y1,x2,y2,width,opacity=1)=>{ctx.globalAlpha=opacity*base;ctx.lineWidth=width;ctx.lineCap=kind==='round-bars'?'round':'butt';ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.globalAlpha=base;};
 if(['wave','double-wave','area','mirror-area','ribbon'].includes(kind)){
  if(kind==='wave')stroke(wavePoints());
  if(kind==='double-wave'){stroke(wavePoints(.6,h*.34));stroke(wavePoints(-.6,h*.68),{opacity:.55});}
  if(kind==='area')stroke([...wavePoints(),[w,h],[0,h]],{close:true,fill:true,opacity:.65});
  if(kind==='mirror-area'){const xs=i=>i/Math.max(1,v.length-1)*w;stroke([...v.map((n,i)=>[xs(i),h/2-Math.abs(n)*h*.43]),...[...v].reverse().map((n,i)=>[xs(v.length-1-i),h/2+Math.abs(n)*h*.43])],{close:true,fill:true,opacity:.6});}
  if(kind==='ribbon'){const xs=i=>i/Math.max(1,v.length-1)*w;stroke([...wavePoints(.75),...[...v].reverse().map((n,i)=>[xs(v.length-1-i),h/2+n*h*.23+8])],{close:true,opacity:.7});}
 }else if(['radial-bars','ring','double-ring','radial-dots','ellipse'].includes(kind)){
  const radius=h*.31,cx=w/2,cy=h/2,stretch=kind==='ellipse'?2.1:1;
  const points=b.map((n,i)=>{const a=i/Math.max(1,b.length)*Math.PI*2-Math.PI/2,r=radius+n*h*.09*amp;return [cx+Math.cos(a)*r*stretch,cy+Math.sin(a)*r];});
  if(kind==='radial-bars'||kind==='radial-dots')b.forEach((n,i)=>{const a=i/b.length*Math.PI*2-Math.PI/2,px=cx+Math.cos(a)*radius,py=cy+Math.sin(a)*radius;if(kind==='radial-bars')bar(px,py,points[i][0],points[i][1],Math.max(1,h*.011));else{ctx.beginPath();ctx.arc(points[i][0],points[i][1],h*(.004+n*.008),0,Math.PI*2);ctx.fill();}});
  else{stroke(points,{close:true,width:Math.max(1.5,h*.006)});if(kind==='double-ring')stroke(points.map(([px,py])=>[cx+(px-cx)*.73,cy+(py-cy)*.73]),{close:true,opacity:.55,width:Math.max(1.5,h*.006)});}
 }else b.forEach((n,i)=>{
  const step=w/Math.max(1,b.length),px=(i+.5)*step,bh=n*h*.83,cell=Math.max(4,h*.06);
  if(kind==='blocks')for(let yy=0;yy<bh;yy+=cell)ctx.fillRect(px-step*.31,h-yy-cell*.78,step*.62,cell*.56);
  else if(kind==='dots')for(let yy=0;yy<bh;yy+=cell){ctx.beginPath();ctx.arc(px,h-yy-cell*.55,Math.max(1,Math.min(cell*.28,step*.24)),0,Math.PI*2);ctx.fill();}
  else if(kind==='mirror')bar(px,h/2-bh/2,px,h/2+bh/2,Math.max(1,step*.55));
  else if(kind==='reflection'){bar(px,h*.65-bh*.65,px,h*.65,Math.max(1,step*.6));bar(px,h*.68,px,h*.68+bh*.28,Math.max(1,step*.6),.25);}
  else bar(px,h-bh,px,h,kind==='round-bars'?Math.max(2,step*.65):Math.max(1,step*.3));
 });
 ctx.restore();
}

// ---- Icons --------------------------------------------------------------------------------------
/** Player glyphs as simple vector shapes (decorative, centered at x,y). */
export function glyph(ctx,name,x,y,size,color){
 ctx.save();ctx.translate(x,y);ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=size*.1;ctx.lineCap='round';ctx.lineJoin='round';const s=size/2;
 const tri=(ox,dir)=>{ctx.beginPath();ctx.moveTo(ox-dir*s*.5,-s*.62);ctx.lineTo(ox+dir*s*.5,0);ctx.lineTo(ox-dir*s*.5,s*.62);ctx.closePath();ctx.fill();};
 if(name==='play')tri(s*.12,1);
 else if(name==='pause'){ctx.fillRect(-s*.5,-s*.62,s*.34,s*1.24);ctx.fillRect(s*.16,-s*.62,s*.34,s*1.24);}
 else if(name==='next'){tri(-s*.12,1);ctx.fillRect(s*.42,-s*.6,s*.16,s*1.2);}
 else if(name==='prev'){tri(s*.12,-1);ctx.fillRect(-s*.58,-s*.6,s*.16,s*1.2);}
 else if(name==='repeat'){ctx.beginPath();ctx.moveTo(-s*.7,s*.05);ctx.lineTo(-s*.7,-s*.35);ctx.lineTo(s*.55,-s*.35);ctx.moveTo(s*.7,-s*.05);ctx.lineTo(s*.7,s*.35);ctx.lineTo(-s*.55,s*.35);ctx.stroke();ctx.beginPath();ctx.moveTo(s*.32,-s*.6);ctx.lineTo(s*.62,-s*.35);ctx.lineTo(s*.32,-s*.1);ctx.moveTo(-s*.32,s*.1);ctx.lineTo(-s*.62,s*.35);ctx.lineTo(-s*.32,s*.6);ctx.stroke();}
 else if(name==='shuffle'){ctx.beginPath();ctx.moveTo(-s*.75,-s*.4);ctx.bezierCurveTo(-s*.1,-s*.4,s*.1,s*.4,s*.7,s*.4);ctx.moveTo(-s*.75,s*.4);ctx.bezierCurveTo(-s*.1,s*.4,s*.1,-s*.4,s*.7,-s*.4);ctx.stroke();ctx.beginPath();ctx.moveTo(s*.45,-s*.62);ctx.lineTo(s*.72,-s*.4);ctx.lineTo(s*.45,-s*.18);ctx.moveTo(s*.45,s*.18);ctx.lineTo(s*.72,s*.4);ctx.lineTo(s*.45,s*.62);ctx.stroke();}
 else if(name==='spark'){ctx.beginPath();ctx.moveTo(0,-s);ctx.quadraticCurveTo(s*.12,-s*.12,s,0);ctx.quadraticCurveTo(s*.12,s*.12,0,s);ctx.quadraticCurveTo(-s*.12,s*.12,-s,0);ctx.quadraticCurveTo(-s*.12,-s*.12,0,-s);ctx.fill();}
 ctx.restore();
}
/** Three to five bars bouncing with measured bins: a "now playing" mark. */
export function equalizer(ctx,x,y,w,h,bins,color,count=4){
 ctx.fillStyle=color;const step=w/count;
 for(let i=0;i<count;i++){const v=bins?.length?clamp((avg(bins,10+i*12,22+i*12)-.25)*1.8,.14,1):.3;const bh=h*v;ctx.fillRect(x+i*step+step*.18,y+h-bh,step*.64,bh);}
}
export function progressBar(ctx,x,y,w,h,value,{track='rgba(255,255,255,.18)',fill='#fff',knob=0}={}){
 ctx.fillStyle=track;ctx.beginPath();ctx.roundRect(x,y,w,h,h/2);ctx.fill();
 const p=clamp(value,0,1);ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,Math.max(h,w*p),h,h/2);ctx.fill();
 if(knob){ctx.beginPath();ctx.arc(x+w*p,y+h/2,knob,0,Math.PI*2);ctx.fill();}
}

// ---- Scene base ---------------------------------------------------------------------------------
/** Timing, per-track art/palette, audio and content (lyrics or the track list) shared by scenes. */
export function sceneBase({width,height,tracks,options,images={},analyses=[]},{hue=215}={}){
 const portrait=height>width,u=Math.min(width,height),vocal=options.mode==='vocal',fps=options.fps||30;
 const offsets=[];let total=0;for(const track of tracks){offsets.push(total);total+=Number(track.duration)||0;}
 // Art and palette of the songs in view (current and previous); generated art for songs without one.
 const cache=new Map();
 const art=i=>{if(!cache.has(i)){if(cache.size>5)cache.delete(cache.keys().next().value);const image=images.arts?.[i]||null,picture=image||abstractArt(tracks[i]?.title||String(i));cache.set(i,{image:picture,real:!!image,...palette(image?accentOf(image,hue):{hue:(hash(tracks[i]?.title||'')%360),sat:.45})});}return cache.get(i);};
 function at(time){
  const t=clamp(Number(time)||0,0,total);let i=0;for(let n=offsets.length-1;n>=0;n--)if(offsets[n]<=t){i=n;break;}
  const track=tracks[i]||{title:'',duration:0,cues:[]},duration=Number(track.duration)||0,local=clamp(t-offsets[i],0,duration);
  const enter=easeOut(local/1.15),exit=duration>3?easeOut((duration-local)/.75):1;
  return {t,i,track,duration,local,progress:duration?local/duration:0,enter,exit,show:Math.min(enter,exit),energy:energyAt(analyses[i],local,fps),frame:frameAt(analyses[i],local,fps)};
 }
 /** Index of the active row and the eased transition into it (lyrics: cue starts; instrumental: tracks). */
 function rollState(state){
  if(!vocal)return {index:state.i,ease:easeOut(state.local/.6)};
  const cues=state.track.cues||[];let index=-1;for(let n=cues.length-1;n>=0;n--)if(Number.isFinite(cues[n].start)&&cues[n].start<=state.local){index=n;break;}
  return {index,ease:index>=0?easeOut((state.local-cues[index].start)/.42):1};
 }
 /**
  * The sung line now: its index, start, end (its own end, else the next line's start, at most 8 s) and
  * progress 0..1 through it. Used for karaoke wipes and word-by-word reveals; -1 before the first line.
  */
 function lineState(state){
  const cues=state.track.cues||[];let index=-1;for(let n=cues.length-1;n>=0;n--)if(Number.isFinite(cues[n].start)&&cues[n].start<=state.local){index=n;break;}
  if(index<0){const next=cues.find(cue=>Number.isFinite(cue.start));return {index:-1,start:0,end:next?next.start:state.duration,progress:0,next:next?next.start-state.local:Infinity,text:''};}
  const cue=cues[index],following=cues.slice(index+1).find(item=>Number.isFinite(item.start))?.start;
  const end=Math.min(cue.start+8,Number.isFinite(cue.end)&&cue.end>cue.start?cue.end:(following??state.duration),following??Infinity,state.duration);
  return {index,start:cue.start,end,progress:clamp((state.local-cue.start)/Math.max(.2,end-cue.start),0,1),next:following!==undefined?following-state.local:Infinity,text:cue.text||''};
 }
 // headline: the title text typed in the video window (shown at the top of every scene; empty hides it).
 return {width,height,portrait,u,vocal,fps,tracks,options,total,offsets,art,at,rollState,lineState,headline:String(options.brand??'BOKS MUSIC').trim(),background:images.background||null};
}

/**
 * Scrolling list (lyrics or tracks) drawn in a faded window. Rows move up by one row per change with
 * the same easing as before; the anchor row is where the active row settles.
 */
export function createRoll(){
 let canvas=null;
 return function drawRoll(ctx,{x,y,w,h,rowH,anchor=1,index,ease,count,row,highlight,fade=.16,pinTop=false}){
  if(!canvas||canvas.width!==Math.ceil(w)||canvas.height!==Math.ceil(h))canvas=layer(w,h);
  const g=canvas.getContext('2d');g.clearRect(0,0,canvas.width,canvas.height);
  let shift=(anchor-Math.max(0,index)+(index>0?1-ease:0))*rowH,band=anchor*rowH,fadeTop=fade,fadeBottom=fade;
  if(pinTop){
   // Lists: rows stay put until the active row reaches the anchor, then the list scrolls; the band moves to the row.
   // Only an edge with rows hidden beyond it fades.
   const visible=Math.floor(h/rowH),last=Math.max(0,count-visible),target=n=>clamp(n-anchor,0,last),from=index>0?target(index-1):target(index),scroll=lerp(from,target(Math.max(0,index)),ease);
   shift=-scroll*rowH;band=(lerp(index>0?index-1:index,Math.max(0,index),ease)-scroll)*rowH;
   fadeTop=fade*clamp(scroll,0,1);fadeBottom=fade*clamp(last-scroll,0,1);
  }
  if(highlight&&index>=0)highlight(g,0,band,w,rowH);
  for(let n=Math.max(0,Math.floor(-shift/rowH)-1);n<count;n++){
   const top=shift+n*rowH;if(top>h)break;if(top+rowH<0)continue;
   const emphasis=n===index?(index>0?ease:1):n===index-1?1-ease:0;
   row(g,n,0,top,w,rowH,emphasis);
  }
  if(fadeTop||fadeBottom){g.globalCompositeOperation='destination-in';const mask=g.createLinearGradient(0,0,0,h);mask.addColorStop(0,`rgba(0,0,0,${fadeTop?0:1})`);mask.addColorStop(Math.max(fadeTop,.001),'#000');mask.addColorStop(Math.min(1-fadeBottom,.999),'#000');mask.addColorStop(1,`rgba(0,0,0,${fadeBottom?0:1})`);g.fillStyle=mask;g.fillRect(0,0,canvas.width,canvas.height);g.globalCompositeOperation='source-over';}
  ctx.drawImage(canvas,x,y);
 };
}
/** Fitted lyric rows for a track, cached per track and box. */
export function lyricLayout(ctx,cues,{size,minSize,weight=600,maxWidth,rowH,lineHeight=1.32,spacing=-.02}){
 return cues.map(cue=>fitText(ctx,cue.text||'',{size,minSize,weight,lineHeight,maxWidth,maxHeight:rowH*.92,spacing,maxLines:2}));
}
/** Draws one fitted lyric row with emphasis 0..1 (color, alpha and a slight scale). */
export function lyricRow(g,block,x,top,w,rowH,emphasis,{align='left',dim=[200,208,222],hot=[255,255,255],dimAlpha=.42,scale=.06}={}){
 const s=1+scale*(emphasis-1),cx=align==='center'?x+w/2:x,cy=top+rowH/2;
 g.save();g.translate(cx,cy);g.scale(s,s);g.globalAlpha=dimAlpha+(1-dimAlpha)*emphasis;
 setFont(g,block.weight,block.font,block.spacing);g.textAlign=align;g.textBaseline='middle';g.fillStyle=rgba(mix(dim,hot,emphasis));
 const first=-(block.lines.length-1)*block.font*block.lineHeight/2;block.lines.forEach((line,k)=>g.fillText(line,0,first+k*block.font*block.lineHeight));g.restore();
}
/** Draws one track row: number, title, duration. */
export function trackRow(g,{number,title,duration},x,top,w,rowH,emphasis,{size,dim=[200,208,222],hot=[255,255,255],accent=[150,190,255],dimAlpha=.5,showTime=true}={}){
 const cy=top+rowH/2,color=rgba(mix(dim,hot,emphasis));g.globalAlpha=dimAlpha+(1-dimAlpha)*emphasis;
 text(g,String(number).padStart(2,'0'),x,cy,{size:size*.82,weight:600,color:emphasis>.5?rgba(accent):color,baseline:'middle',spacing:.04});
 const timeW=showTime?size*3.2:0;
 text(g,title,x+size*2.3,cy,{size,weight:emphasis>.5?700:500,color,baseline:'middle',spacing:-.01,maxWidth:w-size*2.3-timeW-size*.6});
 if(showTime)text(g,stamp(duration),x+w,cy,{size:size*.78,weight:500,color,baseline:'middle',align:'right'});
 g.globalAlpha=1;
}

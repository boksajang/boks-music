import {sceneBase,createRoll,drawSpectrum,fitText,setFont,ellipsize,text,stamp,rgba,mix,layer,hash,random,clamp,lerp,easeOut,easeInOut} from '../canvas-kit.mjs';

/**
 * 하트 모니터: a dark wine-colored patient monitor. A rose phosphor trace sweeps left to right, drawing
 * heartbeats that stay on the glass until the sweep comes round again; every third sweep the cursor
 * leaves the baseline to draw a heart and runs on. Beat height and the cursor glow follow the music.
 * Lyrics are written onto the screen by a scan beam; instrumental videos list the songs as channels.
 * Between songs the line goes flat, then a restart spike brings the heart back.
 */
const TAU=Math.PI*2,ROSE=[255,84,146],HOT=[255,228,238],DIM=[176,96,128],WINE=[18,5,11];
const S=5.2,DH=1.9,T3=3*S+DH,DT=S/720,FLAT=2.2,WAKE=1;
const lru=(limit,make)=>{const m=new Map();return key=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make(key);m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};};
const gauss=(x,m,w)=>Math.exp(-(((x-m)/w)**2));
// Sweep position: three sweeps per cycle, the third pauses at a seeded point while the heart is drawn.
const heartAt=k=>.36+random(hash('heart'+k))()*.26;
function sigma(t){const k=Math.floor(t/T3),r=t-k*T3;if(r<2*S)return 3*k+r/S;const e=r-2*S,h=heartAt(k);return e<h*S?3*k+2+e/S:e<h*S+DH?3*k+2+h:3*k+2+(e-DH)/S;}
function sigmaInv(v){const k=Math.floor(v/3),rem=v-3*k;if(rem<2)return k*T3+rem*S;const e=rem-2,h=heartAt(k);return k*T3+2*S+e*S+(e>h?DH:0);}
function heartPhase(t){const k=Math.floor(t/T3),e=t-k*T3-2*S-heartAt(k)*S;return e>=0&&e<DH?{phi:e/DH,h:heartAt(k)}:null;}
const beatPhase=t=>t*1.2+4*Math.sin(t*.031),bpmAt=t=>72+7.44*Math.cos(t*.031);
function ecg(p){return .1*gauss(p,.1,.03)-.12*gauss(p,.215,.014)+gauss(p,.25,.022)-.32*gauss(p,.29,.018)+.24*gauss(p,.52,.05);}
function heartPath(g,cx,cy,s){g.beginPath();g.moveTo(cx,cy+s*.62);g.bezierCurveTo(cx-s*.2,cy+s*.4,cx-s,cy+s*.02,cx-s*.92,cy-s*.38);g.bezierCurveTo(cx-s*.82,cy-s*.86,cx-s*.18,cy-s*.86,cx,cy-s*.42);g.bezierCurveTo(cx+s*.18,cy-s*.86,cx+s*.82,cy-s*.86,cx+s*.92,cy-s*.38);g.bezierCurveTo(cx+s,cy+s*.02,cx+s*.2,cy+s*.4,cx,cy+s*.62);g.closePath();}

export default function heartmonitor(input){
 const base=sceneBase(input,{hue:340}),{width:W,height:H,portrait,u,vocal,tracks,offsets}=base;
 const L=portrait
  ?{top:H*.055,trace:[W*.07,W*.93,H*.095,H*.375],baseY:H*.305,amp:H*.115,hh:H*.145,audio:[W*.07,H*.54,W*.86,H*.05],read:[W*.07,H*.41,W*.86,H*.1],lyric:[W*.07,H*.625,W*.86,H*.25],ls:u*.075,list:[W*.07,H*.71,W*.86,H*.235],row:u*.06,title:[W*.07,H*.65,W*.86]}
  :{top:H*.07,trace:[W*.06,W*.69,H*.13,H*.565],baseY:H*.44,amp:H*.2,hh:H*.25,audio:[W*.06,H*.605,W*.63,H*.065],read:[W*.735,H*.13,W*.205,H*.3],lyric:[W*.06,H*.71,W*.63,H*.2],ls:u*.064,list:[W*.735,H*.48,W*.205,H*.44],row:u*.05,title:[W*.06,H*.775,W*.63]};
 const [X0,X1,TY0,TY1]=L.trace,TWD=X1-X0,BASE=L.baseY,A=L.amp,HH=L.hh,HR=HH*16/29*1.05;
 const measure=layer(8,8).getContext('2d'),roll=createRoll();

 // ---- Screen: wine glass, fine grid, channel frames and labels (painted once) ----------------------
 const screen=(()=>{
  const c=layer(W,H),g=c.getContext('2d'),bg=g.createRadialGradient(W*.45,H*.4,u*.1,W*.5,H*.5,Math.hypot(W,H)*.65);bg.addColorStop(0,'#2a0a18');bg.addColorStop(.6,'#16050d');bg.addColorStop(1,'#080206');g.fillStyle=bg;g.fillRect(0,0,W,H);
  const cell=u*.022,line=Math.max(1,u*.0011);
  const grid=(x0,y0,x1,y1,a)=>{for(let k=0,x=x0;x<=x1+.5;k++,x+=cell){g.fillStyle=rgba(ROSE,k%5?a:a*2.4);g.fillRect(x,y0,line,y1-y0);}for(let k=0,y=y0;y<=y1+.5;k++,y+=cell){g.fillStyle=rgba(ROSE,k%5?a:a*2.4);g.fillRect(x0,y,x1-x0,line);}};
  grid(X0,TY0,X1,TY1,.045);
  g.fillStyle=rgba(ROSE,.12);g.fillRect(X0,BASE,TWD,Math.max(1,u*.0012));
  const label=(s,x,y,size=u*.017,a=.6)=>{setFont(g,700,size,.22);g.textAlign='left';g.textBaseline='alphabetic';g.fillStyle=rgba(DIM,a);g.fillText(s,x,y);};
  label('I  ECG',X0,TY0-u*.012);label('×1.0  25mm/s',X0+u*.14,TY0-u*.012,u*.014,.4);
  const [ax,ay,aw,ah]=L.audio;label('II  AUDIO',ax,ay-u*.012);g.fillStyle=rgba(ROSE,.07);g.fillRect(ax,ay+ah,aw,Math.max(1,u*.0012));
  const [rx,ry,rw,rh]=L.read;g.strokeStyle=rgba(ROSE,.16);g.lineWidth=Math.max(1,u*.0012);
  if(!portrait){g.beginPath();g.moveTo(rx-W*.022,TY0-u*.03);g.lineTo(rx-W*.022,H*.93);g.stroke();label('HR',rx,ry+u*.005);}else label('HR',rx,ry+u*.005);
  for(const [x,y] of [[u*.03,u*.03],[W-u*.03,u*.03],[u*.03,H-u*.03],[W-u*.03,H-u*.03]]){g.fillStyle=rgba(ROSE,.18);g.fillRect(x-u*.008,y-line/2,u*.016,line);g.fillRect(x-line/2,y-u*.008,line,u*.016);}
  const gloss=g.createLinearGradient(0,0,W*.6,H);gloss.addColorStop(0,'rgba(255,220,235,.045)');gloss.addColorStop(.4,'rgba(255,220,235,0)');g.fillStyle=gloss;g.fillRect(0,0,W,H);
  const v=g.createRadialGradient(W/2,H/2,u*.45,W/2,H/2,Math.hypot(W,H)*.6);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,.55)');g.fillStyle=v;g.fillRect(0,0,W,H);
  return c;
 })();
 const dot=(()=>{const c=layer(96,96),g=c.getContext('2d'),o=g.createRadialGradient(48,48,0,48,48,48);o.addColorStop(0,'rgba(255,250,252,1)');o.addColorStop(.14,'rgba(255,170,205,.9)');o.addColorStop(.4,rgba(ROSE,.3));o.addColorStop(1,rgba(ROSE,0));g.fillStyle=o;g.fillRect(0,0,96,96);return c;})();

 // ---- Signal: heartbeats scaled by the music at each beat; flat between songs, a restart spike after ----
 const where=t=>{let i=0;for(let n=offsets.length-1;n>=0;n--)if(offsets[n]<=t){i=n;break;}return {i,l:t-offsets[i],d:Number(tracks[i]?.duration)||0};};
 const amps=new Map();
 function beatAmp(n){
  if(amps.has(n))return amps.get(n);let t=n/1.2;for(let k=0;k<4;k++)t-=(beatPhase(t)-n)/(1.2+.124*Math.cos(t*.031));
  const v=.5+.7*base.at(clamp(t,0,base.total)).energy.level;if(amps.size>400)amps.clear();amps.set(n,v);return v;
 }
 const life=t=>{const {l,d}=where(t);return clamp((l-WAKE-.5)/1.1,0,1)*clamp((d-FLAT-l)/.8,0,1);};
 function signal(t){
  const {l}=where(t),spike=1.3*gauss(l,WAKE+.08,.022)-.75*gauss(l,WAKE+.14,.03)+.18*gauss(l,WAKE+.32,.07),k=life(t);
  if(k<=0)return spike;const p=beatPhase(t),n=Math.floor(p);return spike+ecg(p-n)*beatAmp(n)*k;
 }
 function point(t){
  const hp=heartPhase(t);
  if(hp&&life(t-hp.phi*DH)>.5){const th=Math.PI+hp.phi*TAU,hx=16*Math.sin(th)**3,hy=13*Math.cos(th)-5*Math.cos(2*th)-2*Math.cos(3*th)-Math.cos(4*th);return [X0+hp.h*TWD+hx/16*HR,BASE-(hy+17)/29*HH];}
  const sg=sigma(t);return [X0+(sg-Math.floor(sg))*TWD,BASE-signal(t)*A];
 }
 const passes=[[u*.016,.07],[u*.0065,.2],[Math.max(1.5,u*.0024),1]];
 function drawTrace(ctx,t,level){
  const now=sigma(t),n0=Math.ceil(sigmaInv(now-.93)/DT),n1=Math.floor(t/DT),pts=[];
  for(let n=n0;n<=n1;n++){const tt=n*DT,[x,y]=point(tt);pts.push(x,y,(.2+.8*Math.exp(-(t-tt)/.9))*clamp((.93-(now-sigma(tt)))/.09,0,1));}
  const [cx,cy]=point(t);pts.push(cx,cy,1);
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineJoin='round';ctx.lineCap='round';
  for(const [width,alpha] of passes){ctx.lineWidth=width;ctx.strokeStyle=rgba(alpha===1?mix(ROSE,HOT,.45):ROSE,1);
   for(let a=0;a<pts.length/3-1;a+=10){const b=Math.min(pts.length/3-1,a+10);ctx.globalAlpha=clamp(pts[a*3+2]*alpha,0,1);if(ctx.globalAlpha<.01)continue;ctx.beginPath();ctx.moveTo(pts[a*3],pts[a*3+1]);
    for(let k=a+1;k<=b;k++){if(pts[k*3]<pts[k*3-3]-TWD*.5)ctx.moveTo(pts[k*3],pts[k*3+1]);else ctx.lineTo(pts[k*3],pts[k*3+1]);}ctx.stroke();}}
  const size=u*(.045+.06*level);ctx.globalAlpha=1;ctx.drawImage(dot,cx-size/2,cy-size/2,size,size);ctx.restore();
 }

 // ---- Text: phosphor sprites (glow baked once per line) ---------------------------------------------
 function glowSprite(lines,size,weight,spacing,color=HOT){
  setFont(measure,weight,size,spacing);const pad=size*.6,w=Math.ceil(Math.max(...lines.map(l=>measure.measureText(l).width))+pad*2),lh=size*1.26,h=Math.ceil(lines.length*lh+pad*2),c=layer(w,h),g=c.getContext('2d');
  setFont(g,weight,size,spacing);g.textAlign='left';g.textBaseline='middle';
  g.shadowColor=rgba(ROSE,.85);g.shadowBlur=size*.38;g.fillStyle=rgba(mix(ROSE,color,.5));lines.forEach((l,k)=>g.fillText(l,pad,pad+lh*(k+.5)));
  g.shadowBlur=0;g.fillStyle=rgba(color);lines.forEach((l,k)=>g.fillText(l,pad,pad+lh*(k+.5)));
  return {c,w,h,pad};
 }
 const [LX,LY,LW,LH]=L.lyric;
 const lineSprite=lru(10,key=>{const [i,n]=key.split(':').map(Number),str=n<0?tracks[i].title||' ':tracks[i].cues[n].text||' ';const b=fitText(measure,str,{size:L.ls*(n<0?1.05:1),minSize:L.ls*.55,weight:n<0?700:600,lineHeight:1.26,maxWidth:LW-L.ls*1.2,maxHeight:LH*.78,spacing:-.01,maxLines:n<0&&!vocal&&!portrait?1:2});return glowSprite(b.lines,b.font,b.weight,-.01);});
 const numSprite=lru(12,v=>glowSprite([v],u*(portrait?.115:.14),700,.02));
 /** The scan beam writes the new sprite in left to right and wipes the old one out. */
 function scanWrite(ctx,next,prev,x,cy,k,alpha=1){
  const band=u*.05,span=Math.max(next?.w||0,prev?.w||0)+band,wx=x+k*span-band*.5;
  if(prev&&k<1){const cut=clamp(wx-x,0,prev.w);ctx.globalAlpha=alpha*.85*clamp(1-k*3,0,1);ctx.drawImage(prev.c,cut,0,prev.w-cut,prev.h,x+cut,cy-prev.h/2,prev.w-cut,prev.h);}
  if(next){const cut=clamp(wx-x,0,next.w);if(cut>0){ctx.globalAlpha=alpha;ctx.drawImage(next.c,0,0,cut,next.h,x,cy-next.h/2,cut,next.h);}}
  ctx.globalAlpha=1;
  if(k>0&&k<1){const h=Math.max(next?.h||0,prev?.h||0)*.8,o=ctx.createLinearGradient(wx-band,0,wx+band*.2,0);o.addColorStop(0,rgba(ROSE,0));o.addColorStop(.85,rgba(ROSE,.5*alpha));o.addColorStop(1,rgba(HOT,.9*alpha));
   ctx.globalCompositeOperation='lighter';ctx.fillStyle=o;ctx.fillRect(wx-band,cy-h/2,band*1.2,h);ctx.globalCompositeOperation='source-over';}
 }

 // ---- Track list (instrumental): channels -----------------------------------------------------------
 const [QX,QY,QW,QH]=L.list,RH=L.row;
 function channelRow(g,n,x,top,w,h,e,s){
  const cy=top+h/2,size=RH*.42,cur=n===s.i;
  if(cur){g.fillStyle=rgba(ROSE,.14);g.fillRect(x,top+h*.1,w,h*.8);g.fillStyle=rgba(ROSE,.9);g.fillRect(x,top+h*.1,Math.max(2,u*.004),h*.8);}
  g.globalAlpha=.5+.5*e;text(g,String(n+1).padStart(2,'0'),x+size*.9,cy,{size:size*.85,weight:700,color:rgba(cur?ROSE:DIM),baseline:'middle',spacing:.08});
  text(g,tracks[n].title||'',x+size*3,cy,{size,weight:cur?700:500,color:rgba(cur?HOT:mix(DIM,HOT,.35)),baseline:'middle',maxWidth:w-size*8.2});
  text(g,stamp(Number(tracks[n].duration)||0),x+w-size*.5,cy,{size:size*.82,weight:600,color:rgba(DIM,.9),baseline:'middle',align:'right'});
  if(cur){const b=.5+.5*Math.cos((beatPhase(s.t)%1)*TAU);g.fillStyle=rgba(ROSE,.5+.5*b);heartPath(g,x+w-size*4.1,cy,size*.42*(1+.15*b));g.fill();}
  g.globalAlpha=1;
 }

 function draw(ctx,time){
  const s=base.at(time),{i,local,energy}=s,k=life(s.t),beat=beatPhase(s.t)%1,pulse=Math.exp(-(((beat-.25+1)%1))*7)*k;
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.drawImage(screen,0,0);
  // Top bar: the title phrase with a small beating heart, and the channel number.
  const ts=u*(portrait?.026:.024);let hx=X0;
  ctx.fillStyle=rgba(ROSE,.65+.35*pulse);heartPath(ctx,hx+ts*.45,L.top-ts*.35,ts*.5*(1+.18*pulse));ctx.fill();hx+=ts*1.3;
  if(base.headline)text(ctx,base.headline,hx,L.top,{size:ts,weight:700,color:rgba(HOT,.88),spacing:.22,maxWidth:(portrait?W*.6:W*.5)});
  text(ctx,`CH ${String(i+1).padStart(2,'0')} / ${String(tracks.length).padStart(2,'0')}`,W-X0,L.top,{size:ts*.85,weight:700,color:rgba(DIM,.85),align:'right',spacing:.2});

  drawTrace(ctx,s.t,energy.level);
  // Channel II: the measured audio, drawn in the user's spectrum style.
  {const [ax,ay,aw,ah]=L.audio;if(s.frame)drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:ROSE,alpha:.8,x:ax,y:ay,width:aw,height:ah});}

  // Readouts: heart rate (dashes while the line is flat), song, time.
  {const [rx,ry,rw]=L.read,alive=k>.5,num=numSprite(alive?String(Math.round(bpmAt(s.t))):'– –'),ny=ry+u*(portrait?.08:.11);
   ctx.globalAlpha=alive?1:.55+.25*Math.sin(s.t*6);ctx.drawImage(num.c,rx-num.pad,ny-num.h/2);ctx.globalAlpha=1;
   const hs=u*.03*(1+.22*pulse);ctx.fillStyle=rgba(ROSE,.45+.55*pulse);heartPath(ctx,rx+num.w-num.pad*1.4+hs,ny-u*.03,hs);ctx.fill();
   text(ctx,'BPM',rx+num.w-num.pad*1.4+u*.004,ny+u*.035,{size:u*.016,weight:700,color:rgba(DIM,.7),spacing:.2});
   const art=base.art(i),block=(tx,ty,tw,title)=>{
    text(ctx,'TRACK',tx,ty,{size:u*.016,weight:700,color:rgba(DIM,.6),spacing:.22});let y=ty;
    if(title){text(ctx,tracks[i].title||'',tx,y+u*.045,{size:u*.03,weight:700,color:rgba(HOT,.92),maxWidth:tw});y+=u*.045;}
    text(ctx,`${stamp(local)} / ${stamp(s.duration)}`,tx,y+u*.04,{size:u*.02,weight:600,color:rgba(DIM,.85),spacing:.08});
    const py=y+u*.063;ctx.fillStyle=rgba(ROSE,.15);ctx.fillRect(tx,py,tw,Math.max(2,u*.003));ctx.fillStyle=rgba(mix(ROSE,art.accent,.25),.9);ctx.fillRect(tx,py,tw*s.progress,Math.max(2,u*.003));};
   if(portrait)block(rx+rw*.52,ry+u*.005,rw*.48,vocal);else if(vocal)block(rx,H*.735,rw,true);else block(L.title[0],L.title[1]+u*.06,L.title[2]*.55,false);}

  if(vocal){
   const line=base.lineState(s),{index,ease}=base.rollState(s),cues=s.track.cues||[],cy=LY+LH*.38;
   // Before the first line the song title is written in after the restart spike.
   const cur=index>=0?lineSprite(`${i}:${index}`):lineSprite(`${i}:-1`),prev=index>0?lineSprite(`${i}:${index-1}`):index===0?lineSprite(`${i}:-1`):null;
   const kk=index>=0?clamp((local-cues[index].start)/.5,0,1):clamp((local-WAKE-.15)/.6,0,1);
   const fade=clamp((s.duration-local-.3)/.6,0,1);scanWrite(ctx,cur,prev,LX-cur.pad,cy,kk,fade);
   const nextCue=cues[index+1];
   if(nextCue&&Number.isFinite(nextCue.start)&&line.next<12)text(ctx,nextCue.text||'',LX,cy+cur.h/2+L.ls*.2,{size:L.ls*.46,weight:500,color:rgba(DIM,.75*ease*fade),maxWidth:LW,baseline:'top'});
  }else{
   const [tx,ty,tw]=L.title,t=lineSprite(`${i}:-1`),kk=clamp((local-WAKE-.15)/.6,0,1),prev=i>0?lineSprite(`${i-1}:-1`):null;
   scanWrite(ctx,t,kk<1?prev:null,tx-t.pad,ty,kk);
   const {index,ease}=base.rollState(s),rows=Math.max(2,Math.floor(QH/RH));
   roll(ctx,{x:QX,y:QY,w:QW,h:Math.min(QH,rows*RH),rowH:RH,anchor:Math.min(2,rows-1),index,ease,count:tracks.length,pinTop:true,fade:.14,row:(g,n,x,top,w,h,e)=>channelRow(g,n,x,top,w,h,e,s)});
  }
 }
 return {draw,duration:base.total};
}

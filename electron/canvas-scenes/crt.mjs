import {sceneBase,layer,rgba,mix,hash,random,clamp,lerp,easeOut,easeInOut,text,fitText,setFont,drawSpectrum,shadowSprite,drawShadow,drawCover,stamp,radialGlow,progressBar} from '../canvas-kit.mjs';

/**
 * 브라운관 TV: a cream 70s television on a VCR in a dark room. The picture is the album art seen through
 * a curved tube — scanlines, a soft barrel falloff and a bright band slowly rolling down. Lyrics are
 * closed captions; every song is a channel: the dial clicks over and the screen bursts into static.
 * The first song powers the set on; the last one switches it off.
 */
const TAU=Math.PI*2;
const LINEAR=['bars','round-bars','mirror','blocks','dots','reflection','wave','double-wave','area','mirror-area','ribbon'];
function lru(limit){const m=new Map();return (key,make)=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make();m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};}
function noise(w,h,seed,alpha=1){
 const c=layer(w,h),g=c.getContext('2d'),img=g.createImageData(c.width,c.height),r=random(seed);
 for(let k=0;k<img.data.length;k+=4){const v=Math.pow(r(),1.4)*255;img.data[k]=v;img.data[k+1]=v;img.data[k+2]=v*1.04;img.data[k+3]=alpha*255;}
 g.putImageData(img,0,0);return c;
}
const hms=n=>{n=Math.max(0,Math.floor(n));return `${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};

export default function crt(input){
 const base=sceneBase(input,{hue:200}),{width:W,height:H,portrait,u,vocal,tracks}=base,N=tracks.length;
 const offsets=base.offsets,total=base.total;
 // Geometry: cabinet, screen, control panel (side in 16:9, below in 9:16), VCR, and the paper guide (9:16).
 let tw,th,tx,ty,sx,sy,sw,sh,panel;
 if(portrait){tw=u*.9;const bz=tw*.045;sw=tw-bz*2;sh=sw*.75;const ph=tw*.17;th=sh+bz*2.1+ph;tx=(W-tw)/2;ty=H*.1;sx=tx+bz;sy=ty+bz;panel=[tx+bz,sy+sh+bz*.6,sw,ph];}
 else{tw=W*.62;const pw=tw*.22,bz=tw*.04;sw=tw-pw-bz*2.4;sh=sw*.75;th=sh+bz*2.2;tx=(W-tw)/2;ty=H*.075;sx=tx+bz*1.2;sy=ty+(th-sh)/2;panel=[tx+tw-pw,ty,pw-bz*.6,th];}
 const vw=tw*.78,vh=portrait?H*.062:H*.1,vx=(W-vw)/2,vy=ty+th+u*.014,standY=vy+vh;
 const guide=portrait?[u*.07,H*.672,u*.86,H*.282]:null;
 const corner=sw*.07,screenPath=g=>{g.beginPath();g.roundRect(sx,sy,sw,sh,corner);};
 const measure=layer(8,8).getContext('2d'),shadow=shadowSprite(256,{alpha:.8});
 const cream=['#f1ead9','#ddd3bd','#c2b597'];

 // ---- Static layers -------------------------------------------------------------------------------
 const room=layer(W,H);{
  const g=room.getContext('2d'),wall=g.createLinearGradient(0,0,0,standY);wall.addColorStop(0,'#14171d');wall.addColorStop(1,'#1d2028');g.fillStyle=wall;g.fillRect(0,0,W,standY);
  const r=random(hash('wall'));for(let x=0;x<W;x+=u*.06){g.fillStyle=`rgba(255,255,255,${.012+r()*.01})`;g.fillRect(x,0,u*.004,standY);}
  // Rabbit-ear antenna behind the set.
  const ax=tx+tw*(portrait?.5:.4),ay=ty+u*.01;g.fillStyle='#202226';g.beginPath();g.ellipse(ax,ay,u*.05,u*.018,0,0,TAU);g.fill();
  for(const [a,len] of [[-.62,u*.36],[.45,u*.32]]){const ex=ax+Math.sin(a)*len,ey=ay-Math.cos(a)*len;const m=g.createLinearGradient(ax,ay,ex,ey);m.addColorStop(0,'#d7dbe2');m.addColorStop(1,'#7c828c');g.strokeStyle=m;g.lineCap='round';
   for(let k=0;k<3;k++){g.lineWidth=u*(.006-k*.0014);const s0=k/3,s1=(k+1)/3;g.beginPath();g.moveTo(ax+(ex-ax)*s0,ay+(ey-ay)*s0);g.lineTo(ax+(ex-ax)*s1,ay+(ey-ay)*s1);g.stroke();}
   g.fillStyle='#e8ebef';g.beginPath();g.arc(ex,ey,u*.006,0,TAU);g.fill();}
  // Stand top and front.
  const top=g.createLinearGradient(0,standY,0,standY+u*.03);top.addColorStop(0,'#3a2f2a');top.addColorStop(1,'#1f1916');g.fillStyle=top;g.fillRect(0,standY,W,u*.03);
  const front=g.createLinearGradient(0,standY+u*.03,0,H);front.addColorStop(0,'#16110f');front.addColorStop(1,'#0b0908');g.fillStyle=front;g.fillRect(0,standY+u*.03,W,H);
  g.fillStyle='rgba(255,230,200,.08)';g.fillRect(0,standY,W,Math.max(1,u*.0015));
 }
 const vfd=[vx+vw*.58,vy+vh*.2,vw*.38,vh*.6],dial={},vol={};
 const set=layer(W,H);{
  const g=set.getContext('2d');
  // Cabinet: cream plastic with a soft top light, a seam and rounded edges.
  drawShadow(g,shadow,tx,ty,tw,th,{alpha:.9,offsetY:.03,spread:1.06});
  for(const fx of [.14,.86]){g.fillStyle='#17181b';g.beginPath();g.roundRect(tx+tw*fx-u*.03,ty+th-u*.01,u*.06,u*.024,u*.006);g.fill();}
  const body=g.createLinearGradient(0,ty,0,ty+th);body.addColorStop(0,cream[0]);body.addColorStop(.55,cream[1]);body.addColorStop(1,cream[2]);g.fillStyle=body;g.beginPath();g.roundRect(tx,ty,tw,th,u*.045);g.fill();
  g.save();g.clip();const r=random(hash('cabinet'));for(let k=0;k<2400;k++){g.fillStyle=`rgba(${r()<.5?'255,255,255':'90,70,40'},${r()*.05})`;g.fillRect(tx+r()*tw,ty+r()*th,u*.002,u*.002);}
  const rim=g.createLinearGradient(tx,0,tx+tw,0);rim.addColorStop(0,'rgba(0,0,0,.14)');rim.addColorStop(.06,'rgba(0,0,0,0)');rim.addColorStop(.94,'rgba(0,0,0,0)');rim.addColorStop(1,'rgba(0,0,0,.18)');g.fillStyle=rim;g.fillRect(tx,ty,tw,th);
  g.fillStyle='rgba(255,255,255,.5)';g.fillRect(tx+u*.04,ty+u*.004,tw-u*.08,Math.max(1,u*.002));g.restore();
  g.strokeStyle='rgba(60,45,25,.35)';g.lineWidth=Math.max(1,u*.0016);g.beginPath();g.roundRect(tx,ty,tw,th,u*.045);g.stroke();
  // Screen recess with a chrome trim.
  const pad=sw*.035;g.fillStyle='#16171a';g.beginPath();g.roundRect(sx-pad,sy-pad,sw+pad*2,sh+pad*2,corner+pad);g.fill();
  const trim=g.createLinearGradient(0,sy-pad,0,sy+sh+pad);trim.addColorStop(0,'#f6f7f9');trim.addColorStop(.5,'#8d939c');trim.addColorStop(1,'#e2e5ea');g.strokeStyle=trim;g.lineWidth=Math.max(1.5,u*.004);g.stroke();
  const inner=g.createLinearGradient(0,sy-pad,0,sy+sh+pad);inner.addColorStop(0,'#050506');inner.addColorStop(1,'#26272b');g.fillStyle=inner;g.beginPath();g.roundRect(sx-pad*.45,sy-pad*.45,sw+pad*.9,sh+pad*.9,corner+pad*.45);g.fill();
  // Control panel.
  const [px,py,pw,ph]=panel,slot=(x,y,w,h)=>{g.fillStyle='rgba(40,30,18,.75)';g.beginPath();g.roundRect(x,y,w,h,h/2);g.fill();g.fillStyle='rgba(255,255,255,.5)';g.fillRect(x+h/2,y+h,w-h,Math.max(1,u*.001));};
  const plate=(x,y,w,h)=>{const m=g.createLinearGradient(0,y,0,y+h);m.addColorStop(0,'#fbfcfd');m.addColorStop(.45,'#a9afb8');m.addColorStop(.55,'#8c929c');m.addColorStop(1,'#e9ecf0');g.fillStyle=m;g.beginPath();g.roundRect(x,y,w,h,h*.2);g.fill();g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=1;g.stroke();
   const label=base.headline||'COLOR TV';setFont(g,800,h*.42,.08);const size=clamp(h*.42*w*.86/Math.max(1,g.measureText(label).width),h*.26,h*.42);
   text(g,label,x+w/2,y+h*.56+1,{size,weight:800,color:'rgba(255,255,255,.7)',spacing:.08,align:'center',baseline:'middle',maxWidth:w*.88});text(g,label,x+w/2,y+h*.56,{size,weight:800,color:'#2b2f36',spacing:.08,align:'center',baseline:'middle',maxWidth:w*.88});};
  const dialRing=(cx,cy,r)=>{for(let n=0;n<12;n++){const a=-Math.PI/2+n/12*TAU;text(g,String(n+1),cx+Math.cos(a)*r*1.32,cy+Math.sin(a)*r*1.32,{size:r*.24,weight:800,color:'#4a3f30',align:'center',baseline:'middle'});}
   g.fillStyle='rgba(70,55,35,.18)';g.beginPath();g.arc(cx,cy,r*1.12,0,TAU);g.fill();};
  if(portrait){
   plate(px+pw*.02,py+ph*.32,pw*.38,ph*.36);
   for(let k=0;k<6;k++)slot(px+pw*.46,py+ph*(.2+k*.11),pw*.22,ph*.045);
   dial.x=px+pw*.86;dial.y=py+ph*.5;dial.r=ph*.27;dialRing(dial.x,dial.y,dial.r);vol.x=px+pw*.73;vol.y=py+ph*.5;vol.r=ph*.16;
  }else{
   dial.x=px+pw/2;dial.y=py+ph*.2;dial.r=pw*.24;dialRing(dial.x,dial.y,dial.r);vol.x=px+pw/2;vol.y=py+ph*.44;vol.r=pw*.14;
   for(let k=0;k<8;k++)slot(px+pw*.16,py+ph*(.56+k*.032),pw*.68,ph*.012);
   plate(px+pw*.04,py+ph*.845,pw*.92,ph*.09);
  }
  text(g,'VOLUME',vol.x,vol.y+vol.r*1.55,{size:u*.0105,weight:800,color:'#5c5040',spacing:.2,align:'center',baseline:'middle'});
  g.fillStyle='#5b0f0b';g.beginPath();g.arc(vol.x+(portrait?-vol.r*1.9:vol.r*1.9),vol.y,u*.006,0,TAU);g.fill();
  // VCR.
  drawShadow(g,shadow,vx,vy,vw,vh,{alpha:.8,offsetY:.08,spread:1.06});
  const vb=g.createLinearGradient(0,vy,0,vy+vh);vb.addColorStop(0,'#2d2f34');vb.addColorStop(.08,'#1d1e22');vb.addColorStop(1,'#111214');g.fillStyle=vb;g.beginPath();g.roundRect(vx,vy,vw,vh,u*.006);g.fill();
  g.fillStyle='rgba(255,255,255,.18)';g.fillRect(vx+u*.006,vy+1,vw-u*.012,Math.max(1,u*.0014));
  g.fillStyle='#0b0b0d';g.beginPath();g.roundRect(vx+vw*.05,vy+vh*.28,vw*.34,vh*.4,u*.004);g.fill();g.strokeStyle='rgba(255,255,255,.1)';g.stroke();
  g.fillStyle='rgba(255,255,255,.06)';g.fillRect(vx+vw*.06,vy+vh*.31,vw*.32,vh*.05);
  text(g,'VIDEO CASSETTE RECORDER',vx+vw*.05,vy+vh*.16,{size:Math.min(vh*.11,u*.012),weight:700,color:'rgba(220,225,232,.45)',spacing:.24,baseline:'middle'});
  text(g,'HI-FI STEREO · 4 HEAD',vx+vw*.05,vy+vh*.84,{size:Math.min(vh*.1,u*.011),weight:700,color:'rgba(220,225,232,.35)',spacing:.2,baseline:'middle'});
  for(let k=0;k<5;k++){g.fillStyle='#2a2c31';g.beginPath();g.roundRect(vx+vw*(.42+k*.034),vy+vh*.62,vw*.026,vh*.16,u*.002);g.fill();}
  g.fillStyle='#030405';g.beginPath();g.roundRect(...vfd,u*.004);g.fill();
 }
 const glass=layer(sw,sh);{
  const g=glass.getContext('2d'),edge=g.createRadialGradient(sw/2,sh/2,Math.min(sw,sh)*.3,sw/2,sh/2,Math.hypot(sw,sh)*.55);edge.addColorStop(0,'rgba(0,0,0,0)');edge.addColorStop(.7,'rgba(0,0,0,.22)');edge.addColorStop(1,'rgba(0,0,0,.75)');g.fillStyle=edge;g.fillRect(0,0,sw,sh);
  const sheen=g.createRadialGradient(sw*.28,sh*.12,0,sw*.28,sh*.12,sw*.55);sheen.addColorStop(0,'rgba(255,255,255,.1)');sheen.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=sheen;g.fillRect(0,0,sw,sh);
  g.strokeStyle='rgba(255,255,255,.05)';g.lineWidth=sw*.012;g.beginPath();g.ellipse(sw*.5,sh*.5,sw*.47,sh*.46,0,Math.PI*1.08,Math.PI*1.42);g.stroke();
 }
 const lines=layer(sw,sh);{const g=lines.getContext('2d'),p=Math.max(2,Math.round(sh/230));g.fillStyle='rgba(0,0,0,.34)';for(let y=0;y<sh;y+=p)g.fillRect(0,y+p*.55,sw,p*.45);
  const r=random(hash('mask'));g.fillStyle='rgba(0,0,0,.06)';for(let x=0;x<sw;x+=3)g.fillRect(x,0,1,sh);void r;}
 const nW=Math.ceil(sw/3),nH=Math.ceil(sh/3),static_=noise(nW*2,nH*2,hash('static'));
 const vfdLayer=layer(vfd[2],vfd[3]);

 // ---- Per-song picture: album art with a slight RGB split and bloom, cached ------------------------
 const programs=lru(4);
 const program=(i,w,h)=>programs(`${i}:${Math.round(w)}x${Math.round(h)}`,()=>{
  const c=layer(w,h),g=c.getContext('2d'),src=layer(w,h),sg=src.getContext('2d');drawCover(sg,base.art(i).image,0,0,w,h);
  g.fillStyle='#000';g.fillRect(0,0,w,h);g.globalCompositeOperation='lighter';const off=Math.max(1,w*.0022);
  for(const [color,d] of [['#ff0000',-off],['#00ff00',0],['#0000ff',off]]){const ch=layer(w,h),cg=ch.getContext('2d');cg.drawImage(src,0,0);cg.globalCompositeOperation='multiply';cg.fillStyle=color;cg.fillRect(0,0,w,h);g.drawImage(ch,d,0);}
  g.globalCompositeOperation='screen';g.globalAlpha=.22;g.filter=`blur(${Math.max(2,w*.008)}px)`;g.drawImage(src,0,0);g.filter='none';g.globalAlpha=1;g.globalCompositeOperation='source-over';
  return c;
 });
 const captions=lru(3),capSize=sh*.074;
 const captionsOf=i=>captions(i,()=>(tracks[i].cues||[]).map(cue=>{const b=fitText(measure,String(cue.text||''),{size:capSize,minSize:capSize*.62,weight:700,lineHeight:1.34,maxWidth:sw*.84,maxHeight:capSize*2.8,maxLines:2});setFont(measure,700,b.font,0);b.widths=b.lines.map(l=>measure.measureText(l).width);return b;}));

 function osd(ctx,value,x,y,size,{color='#f4f4f4',align='left',alpha=1,maxWidth}={}){
  text(ctx,value,x+size*.07,y+size*.07,{size,weight:800,color:'rgba(0,0,0,.75)',align,baseline:'middle',spacing:.06,alpha,maxWidth});
  text(ctx,value,x,y,{size,weight:800,color,align,baseline:'middle',spacing:.06,alpha,maxWidth});
 }
 const chOf=i=>`CH ${String(i+1).padStart(2,'0')}`;
 function picture(ctx,s,i,x,y,w,h,roll){
  const zoom=1.02+.05*easeInOut(s.progress),pw=w*zoom,ph=h*zoom,img=program(i,w,h),ox=x+(w-pw)/2,oy=y+(h-ph)/2;
  if(!roll){ctx.drawImage(img,ox,oy,pw,ph);return;}
  const shift=roll*h;ctx.drawImage(img,ox,oy+shift,pw,ph);ctx.drawImage(img,ox,oy+shift-ph,pw,ph);ctx.fillStyle='#000';ctx.fillRect(x,y+shift-h*.03,w,h*.03);
 }
 function screen(ctx,s){
  const {i,local,t}=s,dur=s.duration||1,art=base.art(i);
  ctx.save();screenPath(ctx);ctx.clip();ctx.fillStyle='#050606';ctx.fillRect(sx,sy,sw,sh);
  // Channel change: the picture slips, then static; the new channel settles in.
  const out=i<N-1?clamp(1-(dur-local)/.28,0,1):0,inn=i>0?clamp(1-(local-.28)/.32,0,1):0,static_level=Math.max(out,inn),roll=out>0?(out*1.7)%1:0;
  const split=!vocal&&!portrait,picH=split?sh*.56:sh;
  picture(ctx,s,i,sx,sy,sw,picH,roll);
  if(split){
   // Program guide under the picture, scrolled to the current channel.
   const gy=sy+picH,gh=sh-picH,hh=gh*.17,rowH=(gh-hh-sh*.045)/3,list=gy+hh+sh*.012;
   const bg=ctx.createLinearGradient(0,gy,0,sy+sh);bg.addColorStop(0,'#1c2d7a');bg.addColorStop(1,'#0e1648');ctx.fillStyle=bg;ctx.fillRect(sx,gy,sw,gh);
   ctx.fillStyle='#0a1033';ctx.fillRect(sx,gy,sw,hh);ctx.fillStyle='#f2c94c';ctx.fillRect(sx,gy,sw,Math.max(1,u*.002));
   const cs=hh*.42;text(ctx,'CHANNEL GUIDE',sx+sw*.06,gy+hh/2,{size:cs,weight:800,color:'#f2c94c',spacing:.2,baseline:'middle'});text(ctx,`${N} CH · ${stamp(total)}`,sx+sw*.94,gy+hh/2,{size:cs,weight:700,color:'#c9d4ff',align:'right',baseline:'middle'});
   const ease=i>0?easeInOut((local-.3)/.8):1,scrollTo=n=>clamp(n-1,0,Math.max(0,N-3)),scroll=lerp(scrollTo(Math.max(0,i-1)),scrollTo(i),ease);
   ctx.save();ctx.beginPath();ctx.rect(sx,list,sw,rowH*3);ctx.clip();
   for(let n=Math.max(0,Math.floor(scroll)-1);n<Math.min(N,Math.floor(scroll)+5);n++){
    const y=list+(n-scroll)*rowH+rowH*.08,cur=n===i,size=rowH*.36;
    ctx.fillStyle=cur?`rgba(80,220,255,${.25+.6*ease})`:n%2?'rgba(255,255,255,.05)':'rgba(255,255,255,.1)';ctx.fillRect(sx+sw*.04,y,sw*.92,rowH*.86);
    ctx.fillStyle=cur?'#0a1033':'#26368a';ctx.fillRect(sx+sw*.04,y,sw*.14,rowH*.86);
    text(ctx,chOf(n),sx+sw*.11,y+rowH*.44,{size,weight:800,color:'#f2c94c',align:'center',baseline:'middle'});
    text(ctx,tracks[n].title||'',sx+sw*.21,y+rowH*.44,{size,weight:cur?800:600,color:cur?'#ffffff':'#e3e8ff',baseline:'middle',maxWidth:sw*.56});
    text(ctx,stamp(Number(tracks[n].duration)||0),sx+sw*.93,y+rowH*.44,{size:size*.9,weight:700,color:cur?'#ffffff':'#c9d4ff',align:'right',baseline:'middle'});
   }
   ctx.restore();
  }
  // On-screen display.
  const m=sh*.075,os=sh*.048,lift=Math.max(out,inn);
  const big=i>0?clamp(1-(local-2.2)/.5,0,1):0,chSize=lerp(os*1.25,os*2.1,big);
  osd(ctx,chOf(i),sx+m,sy+m*.9+chSize*.3,chSize,{color:'#8dff8a'});
  const first=(s.track.cues||[]).find(c=>Number.isFinite(c.start))?.start??Infinity;
  const bannerOn=vocal?clamp((local-.9)/.5,0,1)*clamp((Math.min(first-.4,9)-local)/.5,0,1):portrait?clamp((local-.9)/.5,0,1):0;
  osd(ctx,tracks[i].title||'',sx+m,sy+m*.9+chSize*.9+os*.55,os*.82,{maxWidth:sw*.52,alpha:(1-big*.6)*(1-bannerOn)});
  osd(ctx,'▶ PLAY',sx+sw-m,sy+m*.9+os*.4,os,{align:'right'});
  osd(ctx,hms(local),sx+sw-m,sy+m*.9+os*1.6,os,{align:'right'});
  if(vocal){
   const caps=captionsOf(i),line=base.lineState(s),k=line.index,fade=k>=0?clamp((local-line.start)/.12,0,1)*clamp((line.end+.6-local)/.3,0,1):0;
   if(k>=0&&fade>0){const b=caps[k],lh=b.font*b.lineHeight,y0=sy+sh-m*.85-b.lines.length*lh;setFont(ctx,700,b.font,0);
    b.lines.forEach((l,n)=>{const w=b.widths[n]+b.font*.8,y=y0+n*lh;ctx.globalAlpha=fade;ctx.fillStyle='rgba(0,0,0,.78)';ctx.fillRect(sx+sw/2-w/2,y,w,lh);ctx.globalAlpha=1;text(ctx,l,sx+sw/2,y+lh*.53,{size:b.font,weight:700,color:'#ffffff',align:'center',baseline:'middle',alpha:fade});});}
  }
  // Lower third with the song title: while the intro plays (lyrics) or always (instrumental, 9:16).
  if(bannerOn>0){const bh=sh*.2,by=sy+sh-m*.7-bh,bx=sx+m*.6-(1-easeOut(bannerOn))*sw*.4,bw=sw*.78;ctx.globalAlpha=bannerOn;
   const bgc=ctx.createLinearGradient(bx,0,bx+bw,0);bgc.addColorStop(0,'rgba(10,16,51,.92)');bgc.addColorStop(1,'rgba(10,16,51,0)');ctx.fillStyle=bgc;ctx.fillRect(bx,by,bw,bh);ctx.fillStyle='#f2c94c';ctx.fillRect(bx,by,Math.max(2,u*.004),bh);
   text(ctx,`${chOf(i)}  ·  ${stamp(dur)}`,bx+sw*.035,by+bh*.3,{size:bh*.17,weight:800,color:'#f2c94c',spacing:.12,baseline:'middle'});
   const fit=fitText(measure,tracks[i].title||'',{size:bh*.34,minSize:bh*.2,weight:800,lineHeight:1.1,maxWidth:bw*.86,maxHeight:bh*.4,maxLines:1});text(ctx,fit.lines[0],bx+sw*.035,by+bh*.66,{size:fit.font,weight:800,color:'#ffffff',baseline:'middle'});
   if(!vocal)progressBar(ctx,bx+sw*.035,by+bh*.9,bw*.6,Math.max(2,bh*.025),s.progress,{fill:'#f2c94c',track:'rgba(255,255,255,.2)'});
   ctx.globalAlpha=1;}
  // Static burst.
  if(static_level>0){const f=Math.floor(t*30),r=random(hash('n'+f));ctx.imageSmoothingEnabled=false;ctx.globalAlpha=Math.min(1,static_level*1.15);
   ctx.drawImage(static_,Math.floor(r()*nW),Math.floor(r()*nH),nW,nH,sx,sy,sw,sh);ctx.globalAlpha=1;ctx.imageSmoothingEnabled=true;
   for(let k=0;k<3;k++){const y=sy+r()*sh,h=sh*(.02+r()*.06);ctx.fillStyle=`rgba(255,255,255,${.12*static_level})`;ctx.fillRect(sx,y,sw,h);}}
  // Tube: scanlines, a slowly rolling bright band, barrel falloff and glass.
  ctx.drawImage(lines,sx,sy);
  const bandY=sy+(((t/7.5)%1)*1.4-.2)*sh,band=ctx.createLinearGradient(0,bandY-sh*.1,0,bandY+sh*.1);band.addColorStop(0,'rgba(255,255,255,0)');band.addColorStop(.5,'rgba(255,255,255,.06)');band.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=band;ctx.fillRect(sx,bandY-sh*.1,sw,sh*.2);
  ctx.drawImage(glass,sx,sy);
  // Power on (first song) and off (last song): the picture opens from a bright line and closes into one.
  const on=i===0?clamp(t/.75,0,1):1,off=i===N-1?clamp((dur-local)/.7,0,1):1,open=Math.min(on,off);
  if(open<1){const k=easeInOut(open),hh=sh*Math.max(.004,k)/2,cy=sy+sh/2;ctx.fillStyle='#000';ctx.fillRect(sx,sy,sw,sh/2-hh);ctx.fillRect(sx,cy+hh,sw,sh/2-hh);
   const lineW=sw*clamp(open*4,.02,1);radialGlow(ctx,sx+sw/2,cy,sw*.12*clamp(open*3,.2,1),[220,240,255],(1-k)*.35);ctx.fillStyle=`rgba(235,245,255,${(1-k)*.9})`;ctx.fillRect(sx+sw/2-lineW/2,cy-Math.max(1,hh),lineW,Math.max(2,hh*2));}
  ctx.restore();
  return {static_level,open,art,lift};
 }
 function knob(ctx,{x,y,r},angle,dark){
  ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.arc(x+r*.06,y+r*.14,r*1.02,0,TAU);ctx.fill();
  const b=ctx.createRadialGradient(x-r*.35,y-r*.4,0,x,y,r);b.addColorStop(0,dark?'#5a5650':'#fdfdfd');b.addColorStop(1,dark?'#141311':'#8a8f98');ctx.fillStyle=b;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=dark?'#262420':'#c3c7ce';ctx.beginPath();ctx.roundRect(-r*.16,-r*.92,r*.32,r*1.84,r*.12);ctx.fill();
  ctx.fillStyle='#f4efe4';ctx.fillRect(-r*.04,-r*.88,r*.08,r*.42);ctx.restore();
  ctx.fillStyle=dark?'rgba(255,255,255,.12)':'rgba(255,255,255,.6)';ctx.beginPath();ctx.arc(x,y,r*.18,0,TAU);ctx.fill();
 }
 function drawGuide(ctx,s){
  const [gx,gy,gw,gh]=guide,{i,local}=s,rot=-.008;
  drawShadow(ctx,shadow,gx,gy,gw,gh,{alpha:.75,offsetY:.02,spread:1.05});
  ctx.save();ctx.translate(gx+gw/2,gy+gh/2);ctx.rotate(rot);ctx.translate(-gw/2,-gh/2);
  ctx.fillStyle=ctx.createPattern(paperTile,'repeat');ctx.fillRect(0,0,gw,gh);
  const pad=gw*.06,hh=gh*.2,rowH=(gh-hh-pad*.6)/6;
  text(ctx,'오늘의 편성표',pad,pad*.62+hh*.22,{size:hh*.3,weight:800,color:'#1d1c1a',baseline:'middle'});
  text(ctx,`채널 ${N}개 · 총 ${stamp(total)}`,gw-pad,pad*.62+hh*.24,{size:hh*.16,weight:700,color:'#5d5850',align:'right',baseline:'middle'});
  ctx.fillStyle='#1d1c1a';ctx.fillRect(pad,hh+pad*.2,gw-pad*2,Math.max(2,u*.003));
  const ease=i>0?easeInOut((local-.3)/.8):1,rows=6,scrollTo=n=>clamp(n-2,0,Math.max(0,N-rows)),scroll=lerp(scrollTo(Math.max(0,i-1)),scrollTo(i),ease),top=hh+pad*.45;
  ctx.save();ctx.beginPath();ctx.rect(0,top,gw,rows*rowH);ctx.clip();
  for(let n=Math.max(0,Math.floor(scroll)-1);n<Math.min(N,Math.floor(scroll)+rows+1);n++){
   const y=top+(n-scroll)*rowH,cy=y+rowH/2,cur=n===i,size=rowH*.36,done=n<i;
   text(ctx,stamp(offsets[n]),pad,cy,{size:size*.92,weight:700,color:done?'#9a958c':'#3d3a35',baseline:'middle'});
   text(ctx,chOf(n),pad+gw*.15,cy,{size:size*.92,weight:800,color:done?'#9a958c':'#1d1c1a',baseline:'middle'});
   text(ctx,tracks[n].title||'',pad+gw*.32,cy,{size,weight:cur?800:600,color:done?'#9a958c':'#1d1c1a',baseline:'middle',maxWidth:gw-pad*2-gw*.32-size*3.2});
   text(ctx,stamp(Number(tracks[n].duration)||0),gw-pad,cy,{size:size*.85,weight:600,color:'#6d685f',align:'right',baseline:'middle'});
   ctx.fillStyle='rgba(29,28,26,.15)';ctx.fillRect(pad,y+rowH-1,gw-pad*2,1);
   if(cur){const k=easeOut((local-.5)/.7);if(k>0){ctx.strokeStyle='rgba(200,30,40,.85)';ctx.lineWidth=Math.max(2,u*.004);ctx.lineCap='round';ctx.beginPath();
    for(let a=0;a<=k*1.08;a+=.02){const ang=-2.6+a*TAU,px=pad+gw*.15+size*1.45+Math.cos(ang)*size*2.05,py=cy+Math.sin(ang)*rowH*.44+a*rowH*.06;a?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();}}
  }
  ctx.restore();ctx.restore();
 }
 const paperTile=(()=>{const c=layer(96,96),g=c.getContext('2d'),r=random(hash('paper'));g.fillStyle='#ebe5d6';g.fillRect(0,0,96,96);for(let k=0;k<1400;k++){g.fillStyle=`rgba(80,70,50,${r()*.07})`;g.fillRect(r()*96,r()*96,1,1);}return c;})();

 function draw(ctx,time){
  const s=base.at(time),{i,local}=s,art=base.art(i);
  ctx.drawImage(room,0,0);
  // The tube lights the wall in the picture's colour, white for a moment while it shows static.
  const pre=screenLight(s);radialGlow(ctx,sx+sw/2,sy+sh/2,u*(portrait?.8:.95),mix(art.glow,[210,225,255],pre.flash),(.2+pre.flash*.15)*pre.open);
  ctx.drawImage(set,0,0);
  const st=screen(ctx,s);
  // Channel dial clicks to the song's channel; volume stays put.
  const angleOf=n=>(n%12)/12*TAU,turn=i>0?easeInOut((local-.05)/.45):1;
  knob(ctx,dial,lerp(angleOf(Math.max(0,i-1)),angleOf(i)+(i%12===0&&i>0?TAU:0),turn),true);knob(ctx,vol,-.6,false);
  ctx.fillStyle=st.open>.02?'#ff3b2f':'#5b0f0b';ctx.beginPath();ctx.arc(vol.x+(portrait?-vol.r*1.9:vol.r*1.9),vol.y,u*.0055,0,TAU);ctx.fill();if(st.open>.02)radialGlow(ctx,vol.x+(portrait?-vol.r*1.9:vol.r*1.9),vol.y,u*.02,[255,60,40],.5);
  // VCR display: spectrum, channel and the tape time in fluorescent cyan.
  const [fx,fy,fw,fh]=vfd,cyan=[120,240,226],g=vfdLayer.getContext('2d');g.clearRect(0,0,fw,fh);
  text(g,chOf(i),fh*.18,fh*.32,{size:fh*.26,weight:800,color:rgba(cyan),baseline:'middle',spacing:.08});
  text(g,`▶ ${hms(local)}`,fw-fh*.18,fh*.32,{size:fh*.26,weight:800,color:rgba(cyan),align:'right',baseline:'middle',spacing:.06});
  if(s.frame){const kind=LINEAR.includes(base.options.spectrum)?base.options.spectrum:'bars';drawSpectrum(g,{kind,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:cyan,alpha:.95,x:fh*.18,y:fh*.52,width:fw-fh*.36,height:fh*.4});}
  radialGlow(ctx,fx+fw/2,fy+fh/2,fw*.55,cyan,.06);ctx.drawImage(vfdLayer,fx,fy);
  ctx.fillStyle='rgba(255,255,255,.06)';ctx.fillRect(fx,fy,fw,fh*.42);
  if(guide)drawGuide(ctx,s);
 }
 function screenLight(s){const dur=s.duration||1,out=s.i<N-1?clamp(1-(dur-s.local)/.28,0,1):0,inn=s.i>0?clamp(1-(s.local-.28)/.32,0,1):0,on=s.i===0?clamp(s.t/.75,0,1):1,off=s.i===N-1?clamp((dur-s.local)/.7,0,1):1;return {flash:Math.max(out,inn),open:Math.min(on,off)};}
 return {draw,duration:base.total};
}

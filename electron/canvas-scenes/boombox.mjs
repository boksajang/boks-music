import {sceneBase,layer,rgba,mix,hash,random,clamp,lerp,easeOut,easeInOut,setFont,text,ellipsize,stamp,drawSpectrum,glyph,shadowSprite,drawShadow,radialGlow} from '../canvas-kit.mjs';

/**
 * 붐박스 (instrumental): an 80s chrome-and-black ghetto blaster on a wooden stage floor against a dark
 * block wall, under one warm spotlight. Its two woofers and tweeters push out on the bass and highs;
 * the cyan VFD window shows the track number, the title scrolling as a marquee, the time and the
 * spectrum. The PLAY key stays latched; at every song change the FF key is punched, PLAY pops up and
 * relatches, the display flickers and comes back on the next number, the EQ sliders move to a new
 * preset. A marker-written setlist is taped to the wall: played songs get struck through, the current
 * one is circled, and long playlists flip to the next sheet.
 */
const TAU=Math.PI*2;
const VFD=[96,244,226],VFD2=[150,255,160],AMBER=[255,176,70];
function lru(limit){const m=new Map();return (key,make)=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make();m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};}

export default function boombox(input){
 const base=sceneBase(input,{hue:180}),{width:W,height:H,portrait,u,tracks}=base,N=tracks.length;
 const bw=portrait?u*.92:W*.6,bh=bw/3,bx=portrait?(W-bw)/2:W*.07,by=portrait?H*.19:H*.33,floorY=by+bh+bh*.07;
 const SL=portrait?{x:u*.08,y:H*.47,w:u*.84,h:H*.46,rows:8}:{x:W*.715,y:H*.1,w:W*.235,h:H*.8,rows:10};
 const sp=bh*.92,cw=bw-sp*2,R=bh*.33,spk=[[bx+bh*.5,by+bh*.57],[bx+bw-bh*.5,by+bh*.57]],tw=[[bx+bh*.13,by+bh*.15],[bx+bw-bh*.13,by+bh*.15]];
 const D={x:bx+sp+cw*.07,y:by+bh*.14,w:cw*.86,h:bh*.44};
 const pad2=n=>String(n).padStart(2,'0');
 const measure=layer(8,8).getContext('2d');

 // ---- Room ------------------------------------------------------------------------------------------
 const room=(()=>{
  const c=layer(W,H),g=c.getContext('2d'),r=random(hash('bb-room'));
  g.fillStyle='#14161a';g.fillRect(0,0,W,floorY);
  const blockH=u*.075,blockW=blockH*2.05,m=Math.max(1,u*.003);
  for(let row=0,y=floorY;y>-blockH;row++,y-=blockH){const sh=row%2?blockW/2:0;for(let x=-sh;x<W;x+=blockW){const tone=20+r()*8;g.fillStyle=`rgb(${tone},${tone+2},${tone+6})`;g.fillRect(x+m,y-blockH+m,blockW-m*2,blockH-m*2);
   g.fillStyle='rgba(255,255,255,.035)';g.fillRect(x+m,y-blockH+m,blockW-m*2,m);for(let k=0;k<6;k++){g.fillStyle=`rgba(0,0,0,${r()*.25})`;g.beginPath();g.arc(x+r()*blockW,y-r()*blockH,u*(.001+r()*.003),0,TAU);g.fill();}}}
  const noise=layer(256,256),ng=noise.getContext('2d');for(let k=0;k<3000;k++){const v=r()<.5?0:255;ng.fillStyle=`rgba(${v},${v},${v},${.03+r()*.05})`;ng.fillRect(r()*256,r()*256,1.5,1.5);}g.fillStyle=g.createPattern(noise,'repeat');g.fillRect(0,0,W,floorY);
  // Stage boards.
  const fl=g.createLinearGradient(0,floorY,0,H);fl.addColorStop(0,'#2a1d14');fl.addColorStop(1,'#0e0906');g.fillStyle=fl;g.fillRect(0,floorY,W,H-floorY);
  for(let y=floorY,k=0;y<H;k++){const hgt=u*(.02+k*.008);g.fillStyle='rgba(0,0,0,.45)';g.fillRect(0,y,W,Math.max(1,u*.002));for(let x=r()*-W*.3;x<W;x+=W*(.25+r()*.3)){g.fillStyle='rgba(0,0,0,.35)';g.fillRect(x,y,Math.max(1,u*.002),hgt);}
   for(let n=0;n<14;n++){g.fillStyle=`rgba(${r()<.5?0:120},${r()<.5?0:80},${r()<.5?0:50},${.05+r()*.06})`;g.fillRect(r()*W,y+r()*hgt,W*(.05+r()*.2),Math.max(1,u*.0015));}y+=hgt;}
  // Spotlight from above onto the boombox, and a darker room edge.
  const cx=bx+bw/2,sl=g.createRadialGradient(cx,by-bh*.4,bh*.1,cx,by+bh*.4,bw*.85);sl.addColorStop(0,'rgba(255,214,160,.2)');sl.addColorStop(.5,'rgba(255,200,140,.07)');sl.addColorStop(1,'rgba(255,200,140,0)');g.globalCompositeOperation='lighter';g.fillStyle=sl;g.fillRect(0,0,W,H);
  const pool=g.createRadialGradient(cx,floorY+bh*.1,0,cx,floorY+bh*.1,bw*.6);pool.addColorStop(0,'rgba(255,190,120,.16)');pool.addColorStop(1,'rgba(255,190,120,0)');g.save();g.translate(0,floorY);g.scale(1,.3);g.translate(0,-floorY);g.fillStyle=pool;g.fillRect(0,floorY-bw,W,bw*2);g.restore();g.globalCompositeOperation='source-over';
  const vg=g.createRadialGradient(cx,H*.45,u*.3,cx,H*.45,Math.hypot(W,H)*.65);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.7)');g.fillStyle=vg;g.fillRect(0,0,W,H);
  return c;})();

 // ---- Boombox body (static) -------------------------------------------------------------------------
 const chrome=(g,x0,y0,x1,y1)=>{const c=g.createLinearGradient(x0,y0,x1,y1);c.addColorStop(0,'#f4f6f8');c.addColorStop(.25,'#8c939c');c.addColorStop(.5,'#e3e7ec');c.addColorStop(.75,'#5d636b');c.addColorStop(1,'#c9ced5');return c;};
 const KEYS=['rec','prev','play','next','stop','pause'],keyW=cw*.13,keyGap=cw*.025,keysX=bx+sp+(cw-(keyW*6+keyGap*5))/2;
 const body=(()=>{
  const pad=bh*.5,c=layer(bw+pad*2,bh*1.55+pad),g=c.getContext('2d'),ox=pad,oy=bh*.42,r=random(hash('bb-body'));
  g.translate(ox,oy);
  // Handle.
  g.lineCap='round';g.strokeStyle=chrome(g,0,-bh*.35,0,-bh*.2);g.lineWidth=bh*.07;g.beginPath();g.moveTo(bw*.18,-bh*.02);g.lineTo(bw*.2,-bh*.3);g.lineTo(bw*.8,-bh*.3);g.lineTo(bw*.82,-bh*.02);g.stroke();
  g.strokeStyle='rgba(0,0,0,.4)';g.lineWidth=bh*.012;g.beginPath();g.moveTo(bw*.21,-bh*.27);g.lineTo(bw*.79,-bh*.27);g.stroke();
  for(const x of [bw*.18,bw*.82]){g.fillStyle='#16171a';g.fillRect(x-bh*.06,-bh*.08,bh*.12,bh*.1);}
  // Feet.
  for(const x of [bw*.08,bw*.92]){g.fillStyle='#0b0b0d';g.beginPath();g.roundRect(x-bh*.08,bh*.95,bh*.16,bh*.1,bh*.03);g.fill();}
  // Shell: black plastic, a chrome band, a recessed front.
  const shell=g.createLinearGradient(0,0,0,bh);shell.addColorStop(0,'#2b2d33');shell.addColorStop(.12,'#1a1b1f');shell.addColorStop(1,'#0c0c0e');g.fillStyle=shell;g.beginPath();g.roundRect(0,0,bw,bh,bh*.09);g.fill();
  g.strokeStyle=chrome(g,0,0,bw,bh);g.lineWidth=bh*.025;g.beginPath();g.roundRect(bh*.03,bh*.03,bw-bh*.06,bh-bh*.06,bh*.07);g.stroke();
  g.fillStyle='rgba(255,255,255,.12)';g.fillRect(bh*.1,bh*.008,bw-bh*.2,Math.max(1,bh*.006));
  for(let k=0;k<bw*bh/40;k++){g.fillStyle=`rgba(255,255,255,${r()*.03})`;g.fillRect(r()*bw,r()*bh,1,1);}
  // Speaker baffles: perforated grill ring around each woofer, a tweeter cup.
  for(const [sx] of spk){const cx=sx-bx,cy=spk[0][1]-by;
   g.fillStyle='#08080a';g.beginPath();g.arc(cx,cy,R*1.24,0,TAU);g.fill();
   g.fillStyle='#24262b';for(let ring=0;ring<4;ring++){const rr=R*(1.1+ring*.035),n=Math.round(rr*TAU/(bh*.022));for(let k=0;k<n;k++){const a=k/n*TAU+ring*.3;g.beginPath();g.arc(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr,bh*.0055,0,TAU);g.fill();}}
   g.strokeStyle=chrome(g,cx-R,cy-R,cx+R,cy+R);g.lineWidth=bh*.03;g.beginPath();g.arc(cx,cy,R*1.06,0,TAU);g.stroke();g.lineWidth=bh*.012;g.beginPath();g.arc(cx,cy,R*1.24,0,TAU);g.stroke();}
  for(const [tx,ty] of tw){const cx=tx-bx,cy=ty-by;g.fillStyle='#08080a';g.beginPath();g.arc(cx,cy,bh*.07,0,TAU);g.fill();g.strokeStyle=chrome(g,cx-bh*.07,cy-bh*.07,cx+bh*.07,cy+bh*.07);g.lineWidth=bh*.016;g.stroke();}
  // Center panel: brushed plate, display bezel, labels.
  const px=sp,pw=cw;const plate=g.createLinearGradient(0,bh*.1,0,bh*.95);plate.addColorStop(0,'#3a3d44');plate.addColorStop(1,'#1c1d21');g.fillStyle=plate;g.beginPath();g.roundRect(px,bh*.1,pw,bh*.84,bh*.03);g.fill();
  for(let k=0;k<bh*.84;k+=Math.max(1,bh*.004)){g.fillStyle=`rgba(255,255,255,${r()*.03})`;g.fillRect(px,bh*.1+k,pw,1);}
  g.fillStyle='#020404';g.beginPath();g.roundRect(D.x-bx-bh*.015,D.y-by-bh*.015,D.w+bh*.03,D.h+bh*.03,bh*.025);g.fill();
  g.strokeStyle='rgba(255,255,255,.12)';g.lineWidth=Math.max(1,bh*.004);g.stroke();
  text(g,'HYPER  BASS  SOUND  SYSTEM',px+pw/2,bh*.88,{size:bh*.03,weight:800,color:'rgba(220,226,235,.55)',align:'center',baseline:'middle',spacing:.35,maxWidth:pw*.9});
  text(g,'VOLUME',px+pw*.13,bh*.62,{size:bh*.026,weight:800,color:'rgba(220,226,235,.5)',align:'center',baseline:'middle',spacing:.2});
  ['60','250','1K','4K','12K'].forEach((l,n)=>text(g,l,px+pw*(.36+n*.105),bh*.62,{size:bh*.022,weight:800,color:'rgba(220,226,235,.45)',align:'center',baseline:'middle'}));
  text(g,'BASS',px+pw*.9,bh*.62,{size:bh*.026,weight:800,color:'rgba(220,226,235,.5)',align:'center',baseline:'middle',spacing:.2});
  for(let n=0;n<5;n++){const x=px+pw*(.36+n*.105);g.fillStyle='#050506';g.beginPath();g.roundRect(x-bh*.008,bh*.66,bh*.016,bh*.14,bh*.008);g.fill();for(let k=0;k<5;k++){g.fillStyle='rgba(220,226,235,.3)';g.fillRect(x+bh*.018,bh*(.67+k*.03),bh*.014,Math.max(1,bh*.003));}}
  // Key labels under the keys on the top.
  KEYS.forEach((k,n)=>{const x=keysX-bx+n*(keyW+keyGap)+keyW/2;if(k==='rec'){g.fillStyle='#d6312e';g.beginPath();g.arc(x,bh*.06,bh*.012,0,TAU);g.fill();}else if(k==='stop'){g.fillStyle='rgba(220,226,235,.6)';g.fillRect(x-bh*.012,bh*.048,bh*.024,bh*.024);}else glyph(g,k,x,bh*.06,bh*.03,'rgba(220,226,235,.6)');});
  return {c,ox,oy};})();
 const shadow=shadowSprite(256,{alpha:.85});
 const reflection=(()=>{const c=layer(body.c.width,bh*.7),g=c.getContext('2d');g.save();g.translate(0,bh*.7);g.scale(1,-1);g.drawImage(body.c,0,-(body.oy+bh*1.05)+bh*.7);g.restore();
  g.globalCompositeOperation='destination-in';const f=g.createLinearGradient(0,0,0,c.height);f.addColorStop(0,'rgba(0,0,0,.3)');f.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=f;g.fillRect(0,0,c.width,c.height);return c;})();

 // ---- Display -----------------------------------------------------------------------------------------
 const disp=layer(D.w,D.h),dg=disp.getContext('2d'),glowL=layer(Math.max(2,D.w/5),Math.max(2,D.h/5)),gg=glowL.getContext('2d');
 const ghost=(()=>{const c=layer(D.w,D.h),g=c.getContext('2d'),dot=Math.max(2,D.h*.028);g.fillStyle=rgba(VFD,.045);for(let y=dot/2;y<D.h;y+=dot)for(let x=dot/2;x<D.w;x+=dot)g.fillRect(x,y,dot*.6,dot*.6);
  g.strokeStyle=rgba(VFD,.08);g.lineWidth=1;g.strokeRect(D.w*.03,D.h*.25,D.w*.94,D.h*.44);return c;})();
 const marquee=lru(3);
 const titleStrip=i=>marquee(i,()=>{const size=D.h*.17;setFont(measure,700,size,.04);const t=`${tracks[i].title||''}`,w=Math.ceil(measure.measureText(t).width)+size,c=layer(w,size*1.5),g=c.getContext('2d');text(g,t,0,size*.78,{size,weight:700,color:rgba(VFD),baseline:'middle',spacing:.04});return {c,w,size};});
 function display(s,flick){
  const {i,local}=s;dg.clearRect(0,0,D.w,D.h);dg.drawImage(ghost,0,0);if(flick<=0)return;
  dg.globalAlpha=flick;
  // Indicators.
  const ind=D.h*.08,iy=D.h*.12;let ix=D.w*.05;setFont(measure,800,ind,.12);for(const [l,on] of [['STEREO',true],['CD',true],['TAPE',false],['FM',false]]){text(dg,l,ix,iy,{size:ind,weight:800,color:on?rgba(AMBER):rgba(AMBER,.12),baseline:'middle',spacing:.12});ix+=measure.measureText(l).width+ind*1.2;}
  text(dg,s.energy.low>.72?'BASS':'',D.w*.95,iy,{size:ind,weight:800,color:rgba(VFD2),baseline:'middle',align:'right',spacing:.12});
  // Track number and the marquee title.
  const ny=D.h*.47;text(dg,pad2(i+1),D.w*.05,ny,{size:D.h*.36,weight:800,color:rgba(VFD),baseline:'middle',spacing:-.02});
  const mx=D.w*.27,mw=D.w*.68,strip=titleStrip(i);dg.save();dg.beginPath();dg.rect(mx,D.h*.27,mw,D.h*.4);dg.clip();
  if(strip.w<=mw)dg.drawImage(strip.c,mx,ny-strip.size*.78);else{const gap=strip.size*3,cycle=strip.w+gap,off=Math.floor((Math.max(0,local-1.2)*strip.size*2.2)%cycle);for(let x=mx-off;x<mx+mw;x+=cycle)dg.drawImage(strip.c,x,ny-strip.size*.78);}
  dg.restore();
  // Spectrum (segmented like the glass) and the clock.
  if(s.frame){const sx=D.w*.05,sy=D.h*.72,sw=D.w*.58,sh=D.h*.24;dg.save();drawSpectrum(dg,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:VFD2,alpha:1,amp:1,x:sx,y:sy,width:sw,height:sh});
   dg.globalCompositeOperation='destination-out';const step=Math.max(3,sh/6);for(let y=sy+step*.8;y<sy+sh;y+=step)dg.fillRect(sx-2,y,sw+4,Math.max(1,step*.25));dg.restore();}
  text(dg,stamp(local),D.w*.95,D.h*.82,{size:D.h*.2,weight:800,color:rgba(VFD),baseline:'middle',align:'right',spacing:.04});
  dg.fillStyle=rgba(VFD,.25);dg.fillRect(D.w*.68,D.h*.95,D.w*.27,Math.max(1,D.h*.012));dg.fillStyle=rgba(VFD);dg.fillRect(D.w*.68,D.h*.95,D.w*.27*clamp(s.progress,0,1),Math.max(1,D.h*.012));
  dg.globalAlpha=1;
 }

 // ---- Setlist (marker on paper), one sheet per page -----------------------------------------------------
 const per=SL.rows,pages=Math.max(1,Math.ceil(N/per)),rowH=(SL.h*.82)/per,headH=SL.h*.14;
 const sheets=lru(3);
 const sheetOf=p=>sheets(p,()=>{
  const c=layer(SL.w,SL.h),g=c.getContext('2d'),r=random(hash(`sheet${p}`));
  g.fillStyle='#ecebe4';g.beginPath();g.moveTo(0,0);for(let n=1;n<=8;n++)g.lineTo(SL.w*n/8,(r()-.5)*u*.004);g.lineTo(SL.w,SL.h);for(let n=7;n>=0;n--)g.lineTo(SL.w*n/8,SL.h+(r()-.5)*u*.004);g.closePath();g.fill();
  for(let k=0;k<SL.w*SL.h/120;k++){g.fillStyle=`rgba(80,70,50,${r()*.05})`;g.fillRect(r()*SL.w,r()*SL.h,1.5,1.5);}
  const fold=g.createLinearGradient(0,SL.h*.48,0,SL.h*.52);fold.addColorStop(0,'rgba(0,0,0,0)');fold.addColorStop(.5,'rgba(0,0,0,.08)');fold.addColorStop(1,'rgba(255,255,255,.05)');g.fillStyle=fold;g.fillRect(0,SL.h*.48,SL.w,SL.h*.04);
  const head=base.headline||'SETLIST',hw=SL.w*(pages>1?.7:.86);let hs=Math.min(headH*.42,u*(portrait?.05:.036));setFont(measure,900,hs,-.02);hs*=clamp(hw/measure.measureText(head).width,.62,1);
  g.save();g.translate(SL.w*.07,headH*.55);g.rotate(-.02);g.transform(1,0,-.08,1,0,0);text(g,head,0,0,{size:hs,weight:900,color:'#151515',baseline:'middle',spacing:-.02,maxWidth:hw});g.restore();
  if(pages>1)text(g,`${p+1} / ${pages}`,SL.w*.93,headH*.55,{size:hs*.55,weight:800,color:'#8a2a24',baseline:'middle',align:'right'});
  g.strokeStyle='#151515';g.lineWidth=Math.max(1.5,u*.003);g.lineCap='round';g.beginPath();g.moveTo(SL.w*.07,headH*.92);g.quadraticCurveTo(SL.w*.5,headH*.88,SL.w*.93,headH*.94);g.stroke();
  const fs=Math.min(rowH*.46,u*(portrait?.038:.027));
  for(let k=0;k<per;k++){const n=p*per+k;if(n>=N)break;const y=headH+rowH*(k+.55),rot=(r()-.5)*.025;g.save();g.translate(SL.w*.07,y);g.rotate(rot);g.transform(1,0,-.1,1,0,0);
   text(g,`${n+1}.`,0,0,{size:fs*.82,weight:900,color:'#3a3a3a',baseline:'middle'});text(g,tracks[n].title||'',fs*1.9,0,{size:fs,weight:800,color:'#141414',baseline:'middle',spacing:-.02,maxWidth:SL.w*.84-fs*1.9});g.restore();}
  for(const [x,y,a] of [[SL.w*.5,0,.04],[SL.w*.5,SL.h,-.03]]){g.save();g.translate(x,y);g.rotate(a);g.fillStyle='rgba(222,212,170,.85)';g.fillRect(-SL.w*.13,-u*.016,SL.w*.26,u*.032);g.restore();}
  return {c,fs};});
 function rowWidth(n,fs){setFont(measure,800,fs,-.02);return Math.min(SL.w*.84-fs*1.9,measure.measureText(ellipsize(measure,tracks[n].title||'',SL.w*.84-fs*1.9)).width)+fs*1.9;}

 function draw(ctx,time){
  const s=base.at(time),{i,local}=s;
  ctx.drawImage(room,0,0);
  // Body, reflection and shadow.
  drawShadow(ctx,shadow,bx,by+bh*.75,bw,bh*.35,{alpha:.9,offsetY:.1,spread:1.12});
  ctx.drawImage(reflection,bx-body.ox,floorY+bh*.02);
  // Keys behind the top edge: PLAY latched, FF punched at a song change.
  const punch=i>0?Math.sin(clamp(local/.38,0,1)*Math.PI):0,playUp=i>0?Math.sin(clamp((local-.12)/.4,0,1)*Math.PI):(local<.4?1-easeOut(local/.4):0);
  KEYS.forEach((k,n)=>{const x=keysX+n*(keyW+keyGap),down=k==='play'?1-playUp:k==='next'?punch:0,top=by-bh*.075+down*bh*.045;
   ctx.fillStyle='#0c0c0e';ctx.fillRect(x-bh*.006,by-bh*.02,keyW+bh*.012,bh*.03);
   const kg=ctx.createLinearGradient(0,top,0,top+bh*.09);kg.addColorStop(0,'#d7dbe0');kg.addColorStop(.35,'#9aa1aa');kg.addColorStop(1,'#4a4f56');ctx.fillStyle=kg;ctx.beginPath();ctx.roundRect(x,top,keyW,bh*.09,bh*.012);ctx.fill();
   ctx.fillStyle='rgba(0,0,0,.25)';ctx.fillRect(x,top+bh*.06,keyW,bh*.03);});
  ctx.drawImage(body.c,bx-body.ox,by-body.oy);
  // Woofers: the cone and its dust cap push out with the bass; tweeters with the highs.
  const low=s.energy.low,high=s.energy.high;
  for(const [cx,cy] of spk){
   const ex=Math.pow(low,1.3),cr=R*(.95+ex*.11);
   const sur=ctx.createRadialGradient(cx-R*.25,cy-R*.3-ex*R*.06,R*.7,cx,cy,R);sur.addColorStop(0,'#45484f');sur.addColorStop(.8,'#141518');sur.addColorStop(1,'#050506');ctx.fillStyle=sur;ctx.beginPath();ctx.arc(cx,cy,R,0,TAU);ctx.fill();
   const cone=ctx.createRadialGradient(cx-cr*.2-ex*R*.06,cy-cr*.25-ex*R*.1,cr*.05,cx,cy,cr*.86);cone.addColorStop(0,'#3a3c42');cone.addColorStop(.55,'#1c1d21');cone.addColorStop(1,'#0a0a0c');ctx.fillStyle=cone;ctx.beginPath();ctx.arc(cx,cy,cr*.86,0,TAU);ctx.fill();
   ctx.strokeStyle='rgba(255,255,255,.07)';ctx.lineWidth=Math.max(1,R*.012);for(const k of [.4,.55,.7]){ctx.beginPath();ctx.arc(cx,cy,cr*k,0,TAU);ctx.stroke();}
   ctx.strokeStyle=`rgba(255,226,180,${.12+ex*.18})`;ctx.lineWidth=Math.max(1,R*.03);ctx.beginPath();ctx.arc(cx,cy,cr*.84,Math.PI*1.1,Math.PI*1.55);ctx.stroke();
   const cap=R*.3*(1+ex*.2),cg=ctx.createRadialGradient(cx-cap*.35,cy-cap*.45,cap*.05,cx,cy,cap);cg.addColorStop(0,'#f2f4f7');cg.addColorStop(.3,'#9ba2ab');cg.addColorStop(1,'#2b2e33');ctx.fillStyle=cg;ctx.beginPath();ctx.arc(cx,cy,cap,0,TAU);ctx.fill();
   ctx.strokeStyle=chrome(ctx,cx-cap,cy-cap,cx+cap,cy+cap);ctx.lineWidth=Math.max(1,R*.03);ctx.stroke();
  }
  for(const [cx,cy] of tw){const rr=bh*.05*(1+high*.06),dm=ctx.createRadialGradient(cx-rr*.35,cy-rr*.4,rr*.05,cx,cy,rr);dm.addColorStop(0,'#ffffff');dm.addColorStop(.35,'#a5acb5');dm.addColorStop(1,'#1d1f23');ctx.fillStyle=dm;ctx.beginPath();ctx.arc(cx,cy,rr,0,TAU);ctx.fill();}
  // Volume dial (turning slowly), EQ sliders gliding to each song's preset, bass LED.
  {const px=bx+sp,pw=cw,kx=px+pw*.13,ky=by+bh*.77,kr=bh*.1,ang=-.4+Math.sin(s.t*.35)*.5+Math.sin(s.t*.13+1)*.35;
   ctx.fillStyle='rgba(0,0,0,.5)';ctx.beginPath();ctx.arc(kx+kr*.08,ky+kr*.12,kr*1.05,0,TAU);ctx.fill();
   for(let k=0;k<11;k++){const a=Math.PI*.75+k/10*Math.PI*1.5;ctx.fillStyle='rgba(230,235,242,.45)';ctx.fillRect(kx+Math.cos(a)*kr*1.3-1,ky+Math.sin(a)*kr*1.3-1,2,2);}
   ctx.fillStyle=chrome(ctx,kx-kr,ky-kr,kx+kr,ky+kr);ctx.beginPath();ctx.arc(kx,ky,kr,0,TAU);ctx.fill();
   ctx.save();ctx.translate(kx,ky);ctx.rotate(ang);ctx.fillStyle='#1a1b1f';ctx.beginPath();ctx.arc(0,0,kr*.78,0,TAU);ctx.fill();for(let k=0;k<20;k++){ctx.rotate(TAU/20);ctx.fillStyle='rgba(255,255,255,.08)';ctx.fillRect(kr*.6,-kr*.02,kr*.18,kr*.04);}ctx.fillStyle='#ff5a3c';ctx.fillRect(-kr*.04,-kr*.74,kr*.08,kr*.34);ctx.restore();
   const preset=n=>{const r=random(hash(`eq${n}`));return Array.from({length:5},()=>.2+r()*.6);},cur=preset(i),prev=i>0?preset(i-1):cur,mv=easeInOut((local-.2)/.9);
   for(let n=0;n<5;n++){const x=px+pw*(.36+n*.105),v=lerp(prev[n],cur[n],mv),y=by+bh*(.79-v*.11);ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(x-bh*.025,y-bh*.012+bh*.006,bh*.05,bh*.028);ctx.fillStyle=chrome(ctx,x-bh*.025,y-bh*.015,x+bh*.025,y+bh*.015);ctx.fillRect(x-bh*.025,y-bh*.015,bh*.05,bh*.03);ctx.fillStyle='#111';ctx.fillRect(x-bh*.025,y-bh*.002,bh*.05,bh*.004);}
   const lx=px+pw*.9,ly=by+bh*.72,on=clamp((low-.55)/.3,0,1);ctx.fillStyle=rgba(mix([60,10,8],[255,60,40],on));ctx.beginPath();ctx.arc(lx,ly,bh*.018,0,TAU);ctx.fill();if(on>0)radialGlow(ctx,lx,ly,bh*.07,[255,70,50],.5*on);}
  // VFD: flickers off and back at a song change, then shows the new number.
  const FLICK=[0,0,0,.7,0,.3,0,.9,.4,1,0,1],flick=i>0?(FLICK[Math.floor(local/.05)]??1):clamp((local-.15)/.35,0,1);
  display(s,flick);
  gg.clearRect(0,0,glowL.width,glowL.height);gg.drawImage(disp,0,0,glowL.width,glowL.height);
  ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.75;ctx.drawImage(glowL,D.x-D.w*.03,D.y-D.h*.06,D.w*1.06,D.h*1.12);ctx.globalAlpha=1;ctx.drawImage(disp,D.x,D.y);ctx.globalCompositeOperation='source-over';
  const glass=ctx.createLinearGradient(D.x,D.y,D.x+D.w*.5,D.y+D.h);glass.addColorStop(0,'rgba(255,255,255,.1)');glass.addColorStop(.4,'rgba(255,255,255,.02)');glass.addColorStop(.41,'rgba(255,255,255,0)');ctx.fillStyle=glass;ctx.fillRect(D.x,D.y,D.w,D.h);

  // Setlist: the page with the current song; at a new page the old sheet is pulled off to reveal it.
  const page=Math.floor(i/per),first=page*per,pull=page>0&&i===first?easeInOut(local/.9):1,tilt=portrait?-.012:.018;
  const drawSheet=(p,cur,dx,dy,rot,alpha)=>{const sh=sheetOf(p);ctx.save();ctx.globalAlpha=alpha;ctx.translate(SL.x+SL.w/2+dx,SL.y+SL.h/2+dy);ctx.rotate(tilt+rot);ctx.translate(-SL.w/2,-SL.h/2);
   drawShadow(ctx,shadow,0,0,SL.w,SL.h,{alpha:.55,offsetY:.015,spread:1.05});ctx.drawImage(sh.c,0,0);
   // Marker: strike played songs (the last one live), circle the playing song.
   ctx.lineCap='round';ctx.lineJoin='round';
   for(let k=0;k<per;k++){const n=p*per+k;if(n>=N||n>cur)break;const y=headH+rowH*(k+.55),wdt=rowWidth(n,sh.fs);
    if(n<cur){const q=n===cur-1&&p===Math.floor(cur/per)?easeOut((local-.2)/.5):1;if(q<=0)continue;ctx.strokeStyle='rgba(20,20,22,.85)';ctx.lineWidth=Math.max(2,sh.fs*.12);ctx.beginPath();ctx.moveTo(SL.w*.05,y+sh.fs*.05);ctx.lineTo(SL.w*.05+(wdt+SL.w*.04)*q,y-sh.fs*.08);ctx.stroke();}
    else{const q=easeInOut((local-.35)/.7);if(q<=0)continue;ctx.strokeStyle='rgba(206,36,40,.9)';ctx.lineWidth=Math.max(2,sh.fs*.1);ctx.beginPath();ctx.ellipse(SL.w*.07+wdt/2,y,wdt/2+sh.fs*.6,rowH*.46,-.03,-Math.PI*.6,-Math.PI*.6+TAU*1.05*q);ctx.stroke();
     if(q>=1){const ax=SL.w*.035,a=Math.sin(s.t*3)*sh.fs*.08;ctx.beginPath();ctx.moveTo(ax-sh.fs*.5+a,y);ctx.lineTo(ax+a,y);ctx.moveTo(ax-sh.fs*.18+a,y-sh.fs*.2);ctx.lineTo(ax+a,y);ctx.lineTo(ax-sh.fs*.18+a,y+sh.fs*.2);ctx.stroke();}}}
   ctx.restore();};
  if(pull<1){drawSheet(page,i,0,0,0,1);drawSheet(page-1,i-1+per,-pull*W*.06,-pull*H*.9,-pull*.25,1-pull*.3);}
  else drawSheet(page,i,0,0,0,1);
 }
 return {draw,duration:base.total};
}

import {sceneBase,createRoll,drawSpectrum,fitText,setFont,ellipsize,text,stamp,rgba,mix,layer,hash,random,clamp,lerp,easeOut,easeInOut} from '../canvas-kit.mjs';

/**
 * 벚꽃 길: a cherry-blossom avenue under a spring dusk sky. Two blossoming branches reach in from the top
 * corners and paper lanterns hang from them. Petals ride the wind in three depths — turning, flipping
 * and bending away every time a soft gust passes. Lyric glyphs drift down like petals and settle; the
 * previous line is blown off. A big gust of petals sweeps the frame between songs. Instrumental videos
 * list the songs on a frosted panel. Only the lanterns and the small spectrum answer the music.
 */
const TAU=Math.PI*2,PINK=[255,196,214],INK=[255,246,250],DUSK=[52,44,96];
// Wind: a gentle drift plus a raised-cosine gust every PG seconds; G is its closed-form integral.
const PG=11,GD=4.2;
const bump=t=>{const s=((t%PG)+PG)%PG;return s<GD?(1-Math.cos(s/GD*TAU))/2:0;};
const G=t=>{const k=Math.floor(t/PG),s=t-k*PG;return k*GD/2+(s<GD?s/2-GD/(4*Math.PI)*Math.sin(s/GD*TAU):GD/2);};
const lru=(limit,make)=>{const m=new Map();return key=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make(key);m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};};
function petalShape(g,s){g.beginPath();g.moveTo(0,s*.5);g.bezierCurveTo(-s*.42,s*.3,-s*.48,-s*.25,-s*.16,-s*.48);g.lineTo(0,-s*.36);g.lineTo(s*.16,-s*.48);g.bezierCurveTo(s*.48,-s*.25,s*.42,s*.3,0,s*.5);g.closePath();}
function petalSprite(size,blur,tint=1){
 const pad=Math.ceil(size*.25+blur*2),c=layer(size+pad*2,size+pad*2),g=c.getContext('2d');g.translate(c.width/2,c.height/2);if(blur)g.filter=`blur(${blur}px)`;
 petalShape(g,size);const f=g.createLinearGradient(0,size*.5,0,-size*.5);f.addColorStop(0,rgba(mix([236,120,160],PINK,1-tint*.6)));f.addColorStop(.55,rgba(mix(PINK,[255,232,240],.5)));f.addColorStop(1,'rgb(255,240,246)');g.fillStyle=f;g.fill();
 g.filter='none';if(!blur){g.strokeStyle='rgba(220,120,160,.35)';g.lineWidth=Math.max(.6,size*.025);g.stroke();g.strokeStyle='rgba(230,140,170,.3)';g.beginPath();g.moveTo(0,size*.42);g.lineTo(0,-size*.1);g.stroke();}
 return c;
}

export default function sakura(input){
 const base=sceneBase(input,{hue:330}),{width:W,height:H,portrait,u,vocal,tracks,offsets}=base;
 const L=portrait
  ?{head:H*.055,lyric:[W*.5,H*.62,W*.86],ls:u*.078,info:H*.94,spec:[W*.3,H*.885,W*.4,H*.025],panel:[W*.07,H*.555,W*.86,H*.33],row:u*.062,title:[W*.5,H*.47,W*.86],branches:[[-W*.06,H*.1,.5,W*.7],[W*1.06,H*.14,Math.PI-.6,W*.62]]}
  :{head:H*.075,lyric:[W*.5,H*.64,W*.76],ls:u*.074,info:H*.94,spec:[W*.4,H*.86,W*.2,H*.035],panel:[W*.58,H*.24,W*.35,H*.6],row:u*.054,title:[W*.07,H*.62,W*.46],branches:[[-W*.03,H*.02,.32,W*.46],[W*1.03,-H*.02,Math.PI-.42,W*.4]]};
 const measure=layer(8,8).getContext('2d');

 // ---- Sky, distant blossom avenue and path, painted once ----------------------------------------
 const horizon=H*(portrait?.78:.74);
 const sky=(()=>{
  const c=layer(W,H),g=c.getContext('2d'),r=random(hash('dusk'));
  const s=g.createLinearGradient(0,0,0,horizon);s.addColorStop(0,'#0f1638');s.addColorStop(.45,'#2a285a');s.addColorStop(.78,'#634a86');s.addColorStop(1,'#c08aa8');g.fillStyle=s;g.fillRect(0,0,W,H);
  const mx=W*(portrait?.8:.8),my=H*(portrait?.33:.28),mr=u*.055,halo=g.createRadialGradient(mx,my,mr*.8,mx,my,mr*7);halo.addColorStop(0,'rgba(255,232,240,.32)');halo.addColorStop(1,'rgba(255,232,240,0)');g.fillStyle=halo;g.fillRect(0,0,W,H);
  const moon=g.createRadialGradient(mx-mr*.3,my-mr*.3,0,mx,my,mr);moon.addColorStop(0,'#fffaf4');moon.addColorStop(1,'#f0d8e2');g.fillStyle=moon;g.beginPath();g.arc(mx,my,mr,0,TAU);g.fill();
  // Hills in three layers, each ridge dotted with blossoming trees; mist between them.
  const ridge=(y0,amp,seed)=>{const rr=random(hash(seed)),f1=1.5+rr()*2,f2=4+rr()*4,p1=rr()*TAU,p2=rr()*TAU;return x=>y0-amp*(.6*Math.sin(x/W*Math.PI*f1+p1)+.4*Math.sin(x/W*Math.PI*f2+p2));};
  const layers=[[horizon-H*.06,H*.035,[78,60,118],[190,142,186],.3],[horizon-H*.005,H*.045,[52,40,86],[214,154,196],.42],[horizon+H*.085,H*.075,[30,22,52],[236,170,206],.55]];
  layers.forEach(([y0,amp,hill,bloom,alpha],n)=>{const top=ridge(y0,amp,'ridge'+n),scale=.5+n*.45;
   g.fillStyle=rgba(hill);g.beginPath();g.moveTo(0,H);for(let x=0;x<=W;x+=W/80)g.lineTo(x,top(x));g.lineTo(W,H);g.closePath();g.fill();
   for(let x=-u*.02;x<W+u*.02;x+=u*(.02+r()*.05)*scale){if(Math.sin(x/W*17+n*2.1)+Math.sin(x/W*41+n)<-.2)continue;const rad=u*(.006+r()*.009)*scale,y=top(x)-rad*.6;for(let k=0;k<5;k++){const bx=x+(r()-.5)*rad*2.6,by=y-r()*rad*1.4,b=g.createRadialGradient(bx,by-rad*.3,0,bx,by,rad);b.addColorStop(0,rgba(mix(bloom,[255,236,244],.35),alpha));b.addColorStop(.75,rgba(bloom,alpha*.7));b.addColorStop(1,rgba(bloom,0));g.fillStyle=b;g.beginPath();g.ellipse(bx,by,rad*1.15,rad,0,0,TAU);g.fill();}}
   const mist=g.createLinearGradient(0,y0-amp,0,y0+H*.08);mist.addColorStop(0,'rgba(226,170,204,0)');mist.addColorStop(.6,`rgba(226,170,204,${.16-n*.04})`);mist.addColorStop(1,'rgba(226,170,204,0)');g.fillStyle=mist;g.fillRect(0,y0-amp,W,amp+H*.08);});
  const v=g.createRadialGradient(W/2,H*.5,u*.4,W/2,H*.5,Math.hypot(W,H)*.62);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(8,6,24,.5)');g.fillStyle=v;g.fillRect(0,0,W,H);
  return c;
 })();

 // ---- Branches: dark limbs, blossom clusters at the twigs, buds; lantern hooks. Painted once each. ---
 const branches=L.branches.map(([ax,ay,angle,len],b)=>{
  const c=layer(W,H),g=c.getContext('2d'),r=random(hash('branch'+b)),segs=[],flowers=[],hooks=[];
  const grow=(x,y,a,l,w,depth)=>{
   const bend=(r()-.5)*.6,x1=x+Math.cos(a)*l,y1=y+Math.sin(a)*l,cx=x+Math.cos(a+bend)*l*.5,cy=y+Math.sin(a+bend)*l*.5;segs.push({x,y,x1,y1,cx,cy,w});
   if(depth===2&&hooks.length<(b?1:2)&&r()<.55)hooks.push([lerp(x,x1,.55),lerp(y,y1,.55)+w*.4]);
   // Clusters sit on the young wood: a few along thin twigs, a heavy one at each tip.
   if(depth<=1){const n=depth?3:6;for(let k=0;k<n;k++){const t=depth?.35+r()*.6:.75+r()*.25,px=(1-t)*(1-t)*x+2*(1-t)*t*cx+t*t*x1,py=(1-t)*(1-t)*y+2*(1-t)*t*cy+t*t*y1,sp=u*.022;flowers.push([px+(r()-.5)*sp*2,py+(r()-.5)*sp*1.6,u*(.011+r()*.008),r()*TAU,r(),r()<.18]);}}
   if(depth>0){const n=depth>=3?2:2+(r()<.45?1:0);for(let k=0;k<n;k++)grow(x1,y1,a+(k-(n-1)/2)*(.5+r()*.4)+(r()-.5)*.35+.1*Math.sign(Math.cos(angle)),l*(.62+r()*.16),w*.6,depth-1);}
  };
  grow(ax,ay,angle,len*.3,u*.03,5);
  g.lineCap='round';g.lineJoin='round';
  for(const s of segs){g.strokeStyle='#170f1e';g.lineWidth=Math.max(1,s.w);g.beginPath();g.moveTo(s.x,s.y);g.quadraticCurveTo(s.cx,s.cy,s.x1,s.y1);g.stroke();
   if(s.w>u*.004){g.strokeStyle='rgba(170,130,170,.28)';g.lineWidth=Math.max(.6,s.w*.22);g.beginPath();g.moveTo(s.x-s.w*.18,s.y-s.w*.3);g.quadraticCurveTo(s.cx-s.w*.18,s.cy-s.w*.3,s.x1-s.w*.18,s.y1-s.w*.3);g.stroke();}}
  for(const [x,y,s,rot,tone,bud] of flowers){g.save();g.translate(x,y);g.rotate(rot);
   if(bud){g.fillStyle='#d8608c';g.beginPath();g.ellipse(0,0,s*.35,s*.55,0,0,TAU);g.fill();g.fillStyle='#4a6a34';g.beginPath();g.ellipse(0,s*.45,s*.25,s*.2,0,0,TAU);g.fill();g.restore();continue;}
   const col=mix([255,222,234],[244,168,198],tone*.7);
   for(let p=0;p<5;p++){g.save();g.rotate(p/5*TAU);g.translate(0,-s*.55);const pf=g.createLinearGradient(0,s*.5,0,-s*.5);pf.addColorStop(0,rgba(mix(col,[226,110,150],.35)));pf.addColorStop(1,rgba(mix(col,[255,246,250],.4)));g.fillStyle=pf;petalShape(g,s*1.05);g.fill();g.restore();}
   const heart=g.createRadialGradient(0,0,0,0,0,s*.5);heart.addColorStop(0,'rgba(206,60,110,.95)');heart.addColorStop(1,'rgba(206,60,110,0)');g.fillStyle=heart;g.beginPath();g.arc(0,0,s*.5,0,TAU);g.fill();
   g.fillStyle='rgba(255,236,200,.95)';for(let p=0;p<6;p++){const a=p/6*TAU;g.beginPath();g.arc(Math.cos(a)*s*.3,Math.sin(a)*s*.3,s*.065,0,TAU);g.fill();}g.restore();}
  return {c,ax,ay,hooks,phase:b*1.7,dir:b?-1:1};
 });
 const lantern=(()=>{const w=128,h=170,c=layer(w,h),g=c.getContext('2d'),cx=w/2;
  g.fillStyle='#2a1a1a';g.fillRect(cx-w*.22,0,w*.44,h*.08);g.fillRect(cx-w*.22,h*.92,w*.44,h*.08);
  const body=g.createRadialGradient(cx-w*.08,h*.45,0,cx,h*.5,w*.48);body.addColorStop(0,'#fff1d6');body.addColorStop(.5,'#f7a7a0');body.addColorStop(1,'#a23a4c');g.fillStyle=body;g.beginPath();g.ellipse(cx,h*.5,w*.42,h*.44,0,0,TAU);g.fill();
  g.strokeStyle='rgba(120,30,40,.45)';g.lineWidth=2;for(let k=1;k<7;k++){const y=h*.06+k*h*.125;const hw=Math.sqrt(Math.max(0,1-((y-h*.5)/(h*.44))**2))*w*.42;g.beginPath();g.moveTo(cx-hw,y);g.quadraticCurveTo(cx,y+h*.02,cx+hw,y);g.stroke();}
  return c;})();
 const glowDot=(()=>{const c=layer(96,96),g=c.getContext('2d'),o=g.createRadialGradient(48,48,0,48,48,48);o.addColorStop(0,'rgba(255,214,170,.9)');o.addColorStop(.35,'rgba(255,170,150,.3)');o.addColorStop(1,'rgba(255,150,150,0)');g.fillStyle=o;g.fillRect(0,0,96,96);return c;})();

 // ---- Petals: three depths, every path a function of time ------------------------------------------
 const sprites={far:petalSprite(Math.round(u*.016),0,.5),mid:petalSprite(Math.round(u*.026),0,1),near:petalSprite(Math.round(u*.06),u*.006,1)};
 const petals=(()=>{const r=random(hash('petals')),list=[];
  for(const [kind,count,depth] of [['far',80,.45],['mid',60,.75],['near',12,1.35]])for(let k=0;k<count;k++)list.push({kind,depth,x:r(),y:r(),fall:.035+r()*.04,sway:r()*TAU,swayF:.4+r()*.5,spin:(r()-.5)*2.4,flip:1.2+r()*2.2,ph:r()*TAU,size:.75+r()*.5});
  return list;})();
 function drawPetal(ctx,sprite,x,y,rot,flip,size,alpha){const w=sprite.width*size,h=sprite.height*size;ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.scale(1,Math.max(.12,Math.abs(flip)));ctx.globalAlpha=alpha;ctx.drawImage(sprite,-w/2,-h/2,w,h);ctx.restore();}
 function drawPetals(ctx,t,kinds){
  const gx=G(t),gust=bump(t),spanX=W*1.3,spanY=H*1.25;
  for(const p of petals){if(!kinds.includes(p.kind))continue;
   const dx=(t*.018+gx*.16)*W*p.depth,dy=(t*p.fall-gx*.012)*H*p.depth,x=((p.x*spanX+dx+Math.sin(t*p.swayF+p.sway)*W*.02)%spanX+spanX)%spanX-W*.15,y=((p.y*spanY+dy)%spanY+spanY)%spanY-H*.12;
   const rot=p.ph+t*p.spin+gust*.9,flip=Math.cos(t*p.flip*(1+gust)+p.ph);
   drawPetal(ctx,sprites[p.kind],x,y,rot,flip,p.size,p.kind==='far'?.55:p.kind==='mid'?.9:.85);}
  ctx.globalAlpha=1;
 }
 /** Song change: a dense band of large petals blows across the whole frame. */
 const STORM=(()=>{const r=random(hash('storm'));return Array.from({length:170},()=>({y:r(),d:r()*.7,lift:(r()-.5)*.25,rot:r()*TAU,spin:3+r()*5,flip:4+r()*5,size:.45+r()*.9,near:r()<.25}));})();
 function drawStorm(ctx,t){
  let tb=-1;for(let n=1;n<offsets.length;n++)if(Math.abs(t-offsets[n])<2.2){tb=offsets[n];break;}if(tb<0)return;
  const a=t-tb;for(const p of STORM){const k=(a+1.3-p.d)/1.5;if(k<0||k>1)continue;const x=lerp(-W*.25,W*1.25,easeInOut(k)),y=(p.y*1.1-.05)*H+Math.sin(k*Math.PI)*H*p.lift-k*H*.08;
   drawPetal(ctx,p.near?sprites.near:sprites.mid,x,y,p.rot+k*p.spin,Math.cos(k*p.flip*TAU*.3),p.near?p.size*1.2:p.size*2.4,.95);}
  ctx.globalAlpha=1;
 }

 // ---- Lyrics: glyphs float down and settle; the old line blows away ---------------------------------
 const [LX,LY,LW]=L.lyric,LS=L.ls;
 const blockOf=lru(40,key=>{const [i,n]=key.split(':').map(Number),str=n<0?tracks[i].title||' ':tracks[i].cues[n].text||' ',size=LS*(n<0?1.08:1);
  const b=fitText(measure,str,{size,minSize:size*.55,weight:n<0?700:600,lineHeight:1.3,maxWidth:n<0&&!vocal?L.title[2]:LW,maxHeight:size*2.7,spacing:.01,maxLines:2});setFont(measure,b.weight,b.font,b.spacing);
  b.rows=b.lines.map(line=>{const out=[];let pre='';for(const ch of line){const x=measure.measureText(pre).width,w=measure.measureText(pre+ch).width-x;out.push({ch,x:x+w/2});pre+=ch;}return {glyphs:out,w:measure.measureText(line).width};});return b;});
 function drawLine(ctx,b,cx,cy,{land=Infinity,blow=-1,seed=0,alpha=1,color=INK,left:flush=false}){
  setFont(ctx,b.weight,b.font,b.spacing);ctx.textAlign='center';ctx.textBaseline='middle';const lh=b.font*b.lineHeight,top=cy-(b.rows.length-1)*lh/2;let n=0;
  b.rows.forEach((row,k)=>{const y=top+k*lh,left=flush?cx:cx-row.w/2;for(const {ch,x} of row.glyphs){const r=random(hash(`${seed}:${n}`)),gi=n++;let gx=left+x,gy=y,rot=0,a=alpha;
    const e=easeOut((land-.25-gi*.045-r()*.1)/1.05);if(e<=0)continue;if(e<1){const f=1-e;gx+=Math.sin(f*5+r()*6)*LS*.5*f;gy-=f*LS*(1.6+r());rot=f*(r()-.5)*1.4;a*=e;}
    if(blow>=0){const f=easeOut((blow-gi*.012)/.6);if(f>=1)continue;gx+=f*W*(.16+r()*.2);gy-=f*LS*(1.5+r()*2.5);rot+=f*(r()-.3)*3.5;a*=Math.pow(1-f,1.6);}
    ctx.save();ctx.translate(gx,gy);ctx.rotate(rot);ctx.globalAlpha=a*.4;ctx.fillStyle='rgba(40,20,60,1)';ctx.fillText(ch,b.font*.03,b.font*.05);ctx.globalAlpha=a;ctx.fillStyle=rgba(color);ctx.fillText(ch,0,0);ctx.restore();}});
  ctx.globalAlpha=1;
 }

 // ---- Track list on a frosted panel (instrumental) ---------------------------------------------------
 const [QX,QY,QW,QMAX]=L.panel,RH=L.row,ROWS=Math.max(2,Math.floor((QMAX-u*.04)/RH)),QH=ROWS*RH+u*.04,roll=createRoll();
 const frost=(()=>{const c=layer(QW,QH),g=c.getContext('2d'),pad=QW*.1;g.filter=`blur(${u*.02}px)`;g.drawImage(sky,QX-pad,QY-pad,QW+pad*2,QH+pad*2,-pad,-pad,QW+pad*2,QH+pad*2);g.filter='none';
  g.globalCompositeOperation='destination-in';g.beginPath();g.roundRect(0,0,QW,QH,u*.022);g.fill();g.globalCompositeOperation='source-over';
  g.fillStyle='rgba(36,30,72,.42)';g.fillRect(0,0,QW,QH);const hl=g.createLinearGradient(0,0,0,QH*.3);hl.addColorStop(0,'rgba(255,230,240,.12)');hl.addColorStop(1,'rgba(255,230,240,0)');g.fillStyle=hl;g.fillRect(0,0,QW,QH);
  g.strokeStyle='rgba(255,200,222,.32)';g.lineWidth=Math.max(1,u*.0015);g.beginPath();g.roundRect(.5,.5,QW-1,QH-1,u*.022);g.stroke();return c;})();
 function trackLine(g,n,x,top,w,h,e,s){const cy=top+h/2,size=RH*.4,cur=n===s.i;
  if(cur){g.fillStyle='rgba(255,190,214,.18)';g.beginPath();g.roundRect(x,top+h*.12,w,h*.76,h*.2);g.fill();g.save();g.translate(x+size*.95,cy);g.rotate(s.t*.8);g.fillStyle=rgba(PINK);for(let p=0;p<5;p++){g.save();g.rotate(p/5*TAU);g.translate(0,-size*.28);petalShape(g,size*.42);g.fill();g.restore();}g.restore();}
  else text(g,String(n+1).padStart(2,'0'),x+size*.95,cy,{size:size*.82,weight:600,color:'rgba(255,214,228,.6)',align:'center',baseline:'middle'});
  g.globalAlpha=.55+.45*e;text(g,tracks[n].title||'',x+size*2.3,cy,{size,weight:cur?700:500,color:rgba(cur?INK:[236,214,230]),baseline:'middle',maxWidth:w-size*6.4});
  text(g,stamp(Number(tracks[n].duration)||0),x+w-size*.6,cy,{size:size*.8,weight:500,color:'rgba(236,214,230,.7)',baseline:'middle',align:'right'});g.globalAlpha=1;}

 function draw(ctx,time){
  const s=base.at(time),{i,local,energy}=s,gust=bump(s.t);
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.drawImage(sky,0,0);
  drawPetals(ctx,s.t,['far']);
  // Branches bend a little with each gust; lanterns swing under them and glow with the bass.
  for(const b of branches){const ang=b.dir*(Math.sin(s.t*.5+b.phase)*.006+gust*.018);ctx.save();ctx.translate(b.ax,b.ay);ctx.rotate(ang);ctx.translate(-b.ax,-b.ay);ctx.drawImage(b.c,0,0);
   for(const [hx,hy] of b.hooks){const swing=Math.sin(s.t*1.3+hx)*.06+gust*.14,len=u*.07,lw=u*.05,lh=lw*1.33;ctx.save();ctx.translate(hx,hy);ctx.rotate(-swing);ctx.strokeStyle='rgba(30,20,30,.9)';ctx.lineWidth=Math.max(1,u*.0016);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,len);ctx.stroke();
    ctx.globalCompositeOperation='lighter';const gs=lw*(3+2.2*energy.low);ctx.globalAlpha=.45+.45*energy.low;ctx.drawImage(glowDot,-gs/2,len+lh/2-gs/2,gs,gs);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.drawImage(lantern,-lw/2,len,lw,lh);ctx.restore();}
   ctx.restore();}
  if(base.headline){const size=u*(portrait?.03:.026);text(ctx,base.headline,W/2+size*.06,L.head+size*.08,{size,weight:700,color:'rgba(20,10,40,.5)',align:'center',baseline:'middle',spacing:.3,maxWidth:W*.6});text(ctx,base.headline,W/2,L.head,{size,weight:700,color:rgba(INK,.92),align:'center',baseline:'middle',spacing:.3,maxWidth:W*.6});}
  drawPetals(ctx,s.t,['mid']);
  drawStorm(ctx,s.t);const art=base.art(i);

  if(vocal){
   const {index}=base.rollState(s),cues=s.track.cues||[],start=index>=0?cues[index].start:.9,exit=clamp((s.duration-local-.2)/.8,0,1);
   const cur=blockOf(`${i}:${index}`);drawLine(ctx,cur,LX,LY,{land:local-start,seed:`${i}:${index}`,alpha:exit,color:index<0?mix(INK,PINK,.35):INK});
   if(index>=0){const prev=blockOf(`${i}:${index-1}`);drawLine(ctx,prev,LX,LY,{blow:local-start,seed:`${i}:${index-1}`});}
   if(index<0)text(ctx,`No. ${String(i+1).padStart(2,'0')}`,LX,LY-cur.height/2-LS*.55,{size:u*.022,weight:700,color:rgba(PINK,.85*clamp((local-.7)/.6,0,1)*exit),align:'center',baseline:'middle',spacing:.3});
  }else{
   const [tx,ty,tw]=L.title,align=portrait?'center':'left',title=blockOf(`${i}:-1`),show=easeOut((local-.6)/1.1)*clamp((s.duration-local-.3)/.8,0,1);
   setFont(ctx,700,title.font,title.spacing);ctx.globalAlpha=show;text(ctx,`No. ${String(i+1).padStart(2,'0')} / ${String(tracks.length).padStart(2,'0')}`,tx,ty-title.height/2-u*.03,{size:u*.02,weight:700,color:rgba(PINK,.85),align,baseline:'middle',spacing:.3});
   ctx.globalAlpha=1;drawLine(ctx,title,tx,ty,{land:local-.6,seed:`t${i}`,color:INK,left:!portrait});
   const py=ty+title.height/2+u*.04,pw=portrait?tw*.6:tw*.7,px=portrait?tx-pw/2:tx;ctx.globalAlpha=show;ctx.fillStyle='rgba(255,220,232,.25)';ctx.fillRect(px,py,pw,Math.max(2,u*.003));ctx.fillStyle=rgba(PINK,.95);ctx.fillRect(px,py,pw*s.progress,Math.max(2,u*.003));
   text(ctx,`${stamp(local)} / ${stamp(s.duration)}`,portrait?tx:px+pw,py+u*.035,{size:u*.02,weight:600,color:'rgba(255,230,240,.8)',align:portrait?'center':'right',baseline:'middle'});ctx.globalAlpha=1;
   ctx.drawImage(frost,QX,QY);const {index,ease}=base.rollState(s),rows=ROWS;
   roll(ctx,{x:QX+u*.02,y:QY+u*.02,w:QW-u*.04,h:rows*RH,rowH:RH,anchor:Math.min(2,rows-1),index,ease,count:tracks.length,pinTop:true,fade:.14,row:(g,n,x,top,w,h,e)=>trackLine(g,n,x,top,w,h,e,s)});
  }
  // A thin spectrum and the song line at the foot of the frame.
  {const [sx,sy,sw,sh]=L.spec;if(s.frame)drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:mix(PINK,art.soft,.25),alpha:.7,x:sx,y:sy,width:sw,height:sh});
   if(vocal){const size=u*.019;setFont(ctx,600,size,.12);text(ctx,`No.${String(i+1).padStart(2,'0')}  ·  ${ellipsize(ctx,tracks[i].title||'',W*.4)}  ·  ${stamp(local)} / ${stamp(s.duration)}`,W/2,L.info,{size,weight:600,color:'rgba(255,230,240,.72)',align:'center',baseline:'middle',spacing:.12});}}
  drawPetals(ctx,s.t,['near']);
 }
 return {draw,duration:base.total};
}

import {sceneBase,layer,rgba,mix,hash,random,clamp,easeInOut,text,fitText,wrap,setFont,drawBlock,drawCover,drawSpectrum,stamp} from '../canvas-kit.mjs';

/**
 * 무성영화: a 1920s picture palace. Between dark velvet curtains a silver screen shows the album art as a
 * black-and-white, high-contrast film still: the projector flickers, the frame weaves in the gate, and
 * every film frame (24 per second) carries its own scratches, dust and now and then a hair. Each lyric
 * line is an art-deco intertitle card: the film slips up a frame to bring a card in, and a splice cuts
 * back to the picture when the singer pauses. A song opens with a leader countdown and a chapter card,
 * irises into the picture and irises out at its end. Only the plaque spectrum and the card's optical
 * soundtrack move with the music.
 */
const TAU=Math.PI*2,FPS=24;
function lru(limit){const m=new Map();return (key,make)=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make();m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};}

/** fitText, then narrows the box while the line count holds so wrapped lines come out even. */
function balanced(measure,value,opts){
 const block=fitText(measure,value,opts);if(block.lines.length<2)return block;
 let lo=opts.maxWidth*.45,hi=opts.maxWidth;setFont(measure,block.weight,block.font,block.spacing);
 for(let k=0;k<12;k++){const mid=(lo+hi)/2,lines=wrap(measure,value,mid);if(lines.length<=block.lines.length)hi=mid;else lo=mid;}
 return {...block,lines:wrap(measure,value,hi)};
}

export default function silentfilm(input){
 const base=sceneBase(input,{hue:35}),{width:W,height:H,portrait,u,tracks}=base,N=tracks.length;
 const G=portrait?(()=>{const w=W*.88,h=w*1.3;return {x:(W-w)/2,y:H*.1,w,h};})():(()=>{const h=H*.72,w=h*4/3;return {x:(W-w)/2,y:H*.11,w,h};})();
 const M=Math.min(G.w,G.h),stageY=G.y+G.h+u*.03,valH=G.y-u*.035,measure=layer(8,8).getContext('2d');
 const cream=[234,226,206],gold=[206,172,112],velvet=[62,21,24];

 // ---- The theatre (static): side curtains, a swagged valance with the title phrase, the stage. ----
 const backdrop=(()=>{
  const c=layer(W,H),g=c.getContext('2d');g.fillStyle='#070605';g.fillRect(0,0,W,H);
  // Velvet: folds of uneven width and depth, each lit on its crest.
  const drape=(x0,x1,y0,y1,fold)=>{if(x1-x0<2)return;const r=random(hash('drape'+Math.round(x0))),grad=g.createLinearGradient(x0,0,x1,0),span=x1-x0;let x=0;
   grad.addColorStop(0,rgba([8,3,4]));while(x<span){const w=fold*(.55+r()*1.1),peak=.45+r()*.55;for(let k=1;k<=6;k++){const p=Math.min(1,(x+w*k/6)/span),v=Math.pow(Math.sin(k/6*Math.PI),1.7)*peak;grad.addColorStop(p,rgba(mix([8,3,4],velvet,v)));}x+=w;}
   g.fillStyle=grad;g.fillRect(x0,y0,x1-x0,y1-y0);};
  const gap=u*.025;drape(0,G.x-gap,0,stageY,u*.06);drape(G.x+G.w+gap,W,0,stageY,u*.06);
  for(const [x0,x1] of [[0,G.x-gap],[G.x+G.w+gap,W]]){if(x1-x0<2)continue;const sh=g.createLinearGradient(0,0,0,stageY);sh.addColorStop(0,'rgba(0,0,0,.7)');sh.addColorStop(.35,'rgba(0,0,0,.15)');sh.addColorStop(1,'rgba(0,0,0,.55)');g.fillStyle=sh;g.fillRect(x0,0,x1-x0,stageY);}
  // Valance: velvet band with swags hanging over the top of the screen and a gold fringe line.
  const swags=portrait?3:5,sw=W/swags;drape(0,W,0,valH,u*.04);
  g.fillStyle=g.createLinearGradient(0,0,0,valH);g.fillStyle.addColorStop(0,'rgba(0,0,0,.65)');g.fillStyle.addColorStop(1,'rgba(0,0,0,.05)');g.fillRect(0,0,W,valH);
  g.fillStyle='#070605';g.beginPath();g.moveTo(0,valH+u*.03);for(let k=0;k<swags;k++)g.quadraticCurveTo(k*sw+sw/2,valH-u*.025,(k+1)*sw,valH+u*.03);g.lineTo(W,valH+u*.06);g.lineTo(0,valH+u*.06);g.fill();
  g.strokeStyle=rgba(gold,.55);g.lineWidth=Math.max(1,u*.0022);g.beginPath();for(let k=0;k<swags;k++){g.moveTo(k*sw,valH+u*.03-u*.004);g.quadraticCurveTo(k*sw+sw/2,valH-u*.025-u*.004,(k+1)*sw,valH+u*.03-u*.004);}g.stroke();
  // Black masking around the screen.
  g.fillStyle='#020202';g.fillRect(G.x-u*.012,G.y-u*.012,G.w+u*.024,G.h+u*.024);
  // Stage apron and floor.
  const floor=g.createLinearGradient(0,stageY,0,H);floor.addColorStop(0,'#15110e');floor.addColorStop(1,'#050403');g.fillStyle=floor;g.fillRect(0,stageY,W,H-stageY);
  g.fillStyle=rgba(gold,.5);g.fillRect(0,stageY,W,Math.max(1,u*.002));g.fillStyle='rgba(0,0,0,.6)';g.fillRect(0,stageY+Math.max(1,u*.002),W,Math.max(1,u*.003));
  if(base.headline){const size=u*(portrait?.03:.026),y=valH*.5;setFont(g,700,size,.34);g.textAlign='center';g.textBaseline='middle';
   const label=fitText(g,base.headline,{size,minSize:size*.6,weight:700,lineHeight:1.1,maxWidth:W*.66,maxHeight:size*1.2,spacing:.34,maxLines:1}),tw=Math.min(W*.66,g.measureText(label.lines[0]).width);
   setFont(g,700,label.font,.34);g.fillStyle='rgba(0,0,0,.6)';g.fillText(label.lines[0],W/2,y+label.font*.08);g.fillStyle=rgba(gold,.92);g.fillText(label.lines[0],W/2,y);
   g.strokeStyle=rgba(gold,.6);g.lineWidth=Math.max(1,u*.0016);for(const dir of [-1,1]){const x0=W/2+dir*(tw/2+size*.9),x1=x0+dir*size*2.6;g.beginPath();g.moveTo(x0,y-size*.12);g.lineTo(x1,y-size*.12);g.moveTo(x0,y+size*.12);g.lineTo(x1-dir*size*.6,y+size*.12);g.stroke();g.beginPath();g.moveTo(x0-dir*size*.4,y);g.lineTo(x0-dir*size*.2,y-size*.2);g.lineTo(x0,y);g.lineTo(x0-dir*size*.2,y+size*.2);g.closePath();g.fillStyle=rgba(gold,.8);g.fill();}}
  return c;
 })();
 // Light the screen throws on the curtains and the stage (drawn additively, follows the projector).
 const spill=(()=>{const c=layer(W/4,H/4),g=c.getContext('2d'),cx=(G.x+G.w/2)/4,cy=(G.y+G.h/2)/4,r=Math.hypot(G.w,G.h)/4*.85,grad=g.createRadialGradient(cx,cy,r*.45,cx,cy,r);grad.addColorStop(0,'rgba(200,190,170,.5)');grad.addColorStop(1,'rgba(200,190,170,0)');g.fillStyle=grad;g.fillRect(0,0,c.width,c.height);return c;})();
 // Rounded projector aperture with soft corners, a hot spot and vignette.
 const gateMask=(()=>{const c=layer(G.w,G.h),g=c.getContext('2d'),e=u*.006;g.fillStyle='#000';g.fillRect(0,0,G.w,G.h);g.globalCompositeOperation='destination-out';g.filter=`blur(${e}px)`;g.beginPath();g.roundRect(e*1.5,e*1.5,G.w-e*3,G.h-e*3,u*.03);g.fill();g.filter='none';g.globalCompositeOperation='source-over';
  const v=g.createRadialGradient(G.w/2,G.h*.48,M*.18,G.w/2,G.h*.5,Math.hypot(G.w,G.h)*.56);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(.7,'rgba(0,0,0,.18)');v.addColorStop(1,'rgba(0,0,0,.62)');g.fillStyle=v;g.fillRect(0,0,G.w,G.h);return c;})();

 // ---- Film stock: grain tiles, dust and hair sprites (deterministic). ----
 const grain=Array.from({length:4},(_,k)=>{const c=layer(256,256),g=c.getContext('2d'),img=g.createImageData(256,256),r=random(hash('silver')+k);for(let p=0;p<img.data.length;p+=4){const v=r()<.5?0:255;img.data[p]=img.data[p+1]=img.data[p+2]=v;img.data[p+3]=Math.pow(r(),2.2)*70;}g.putImageData(img,0,0);return c;});
 const dust=Array.from({length:10},(_,k)=>{const c=layer(64,64),g=c.getContext('2d'),r=random(hash('dust'+k));g.fillStyle='#fff';g.strokeStyle='#fff';
  if(k<6){g.filter='blur(.8px)';g.beginPath();const n=9,base0=8+r()*12;for(let p=0;p<n;p++){const a=p/n*TAU,rad=base0*(.55+r()*.6);p?g.lineTo(32+Math.cos(a)*rad,32+Math.sin(a)*rad):g.moveTo(32+Math.cos(a)*rad,32+Math.sin(a)*rad);}g.closePath();g.fill();}
  else{g.lineWidth=1.6+r();g.lineCap='round';g.beginPath();g.moveTo(6+r()*10,10+r()*44);g.bezierCurveTo(r()*64,r()*64,r()*64,r()*64,44+r()*14,10+r()*44);g.stroke();}
  g.filter='none';return c;});
 const hairs=Array.from({length:3},(_,k)=>{const c=layer(256,256),g=c.getContext('2d'),r=random(hash('hair'+k));g.strokeStyle='#fff';g.lineWidth=2.2;g.lineCap='round';g.beginPath();let x=30+r()*40,y=40+r()*170;g.moveTo(x,y);for(let p=0;p<4;p++){const nx=x+40+r()*30,ny=40+r()*176;g.bezierCurveTo(x+r()*90-20,y+r()*120-60,nx-r()*60,ny+r()*120-60,nx,ny);x=nx;y=ny;}g.stroke();return c;});
 // Tinted sprites: dark dirt and the occasional bright speck (dust on the negative).
 const tint=(c,color)=>{const t=layer(c.width,c.height),g=t.getContext('2d');g.drawImage(c,0,0);g.globalCompositeOperation='source-in';g.fillStyle=color;g.fillRect(0,0,t.width,t.height);return t;};
 const darkDust=dust.map(d=>tint(d,'#0c0b09')),lightDust=dust.map(d=>tint(d,'#f4efe4')),darkHair=hairs.map(h=>tint(h,'#0a0908'));

 // ---- The picture: album art as silver black-and-white with halation, per song. ----
 const pictures=lru(3),ps=Math.min(1,1500/G.w);
 const picture=i=>pictures(i,()=>{
  const w=Math.round(G.w*1.18*ps),h=Math.round(G.h*1.18*ps),c=layer(w,h),g=c.getContext('2d'),art=base.art(i);
  // Generated art is soft gradients: it gets a harder grade so it still reads as a lit shot.
  g.filter=art.real?'grayscale(1) contrast(1.55) brightness(1.04)':'grayscale(1) contrast(2.3) brightness(.92)';drawCover(g,art.image,0,0,w,h);g.filter='none';
  g.globalCompositeOperation='multiply';g.fillStyle='rgb(240,232,214)';g.fillRect(0,0,w,h);
  const glow=layer(w/4,h/4),gg=glow.getContext('2d');gg.filter=`blur(${w*.006}px) grayscale(1) brightness(1.2)`;gg.drawImage(c,0,0,glow.width,glow.height);gg.filter='none';
  g.globalCompositeOperation='screen';g.globalAlpha=.32;g.drawImage(glow,0,0,w,h);g.globalAlpha=1;g.globalCompositeOperation='source-over';
  return c;
 });

 // ---- Intertitle cards: a black card with a double rule, stepped deco corners and a sunburst. ----
 const cardFrame=(()=>{
  const c=layer(G.w,G.h),g=c.getContext('2d'),w=G.w,h=G.h,b1=M*.05,b2=b1+M*.02,lw=Math.max(1,M*.0028);
  const bg=g.createRadialGradient(w/2,h*.46,M*.1,w/2,h/2,Math.hypot(w,h)*.55);bg.addColorStop(0,'#26241f');bg.addColorStop(1,'#0b0a09');g.fillStyle=bg;g.fillRect(0,0,w,h);
  g.strokeStyle=rgba(cream,.82);g.lineWidth=lw*1.4;g.strokeRect(b1,b1,w-b1*2,h-b1*2);g.lineWidth=lw;g.strokeRect(b2,b2,w-b2*2,h-b2*2);
  // Stepped corners.
  const st=M*.022;for(const [cx,cy,sx,sy] of [[b2,b2,1,1],[w-b2,b2,-1,1],[b2,h-b2,1,-1],[w-b2,h-b2,-1,-1]]){g.beginPath();for(let k=1;k<=3;k++){g.moveTo(cx+sx*st*k,cy);g.lineTo(cx+sx*st*k,cy+sy*st*k);g.lineTo(cx,cy+sy*st*k);}g.stroke();g.fillStyle=rgba(cream,.85);g.beginPath();g.moveTo(cx+sx*st*.5,cy+sy*st*.15);g.lineTo(cx+sx*st*.85,cy+sy*st*.5);g.lineTo(cx+sx*st*.5,cy+sy*st*.85);g.lineTo(cx+sx*st*.15,cy+sy*st*.5);g.closePath();g.fill();}
  // Sunburst fan hanging from the top rule.
  const fr=M*.075,fx=w/2,fy=b2;g.lineWidth=lw;g.beginPath();g.arc(fx,fy,fr,0,Math.PI);g.stroke();g.beginPath();g.arc(fx,fy,fr*.55,0,Math.PI);g.stroke();
  for(let k=1;k<10;k++){const a=k/10*Math.PI;g.moveTo(fx+Math.cos(a)*fr*.55,fy+Math.sin(a)*fr*.55);g.lineTo(fx+Math.cos(a)*fr,fy+Math.sin(a)*fr);}g.stroke();
  // Bottom rule pieces either side of the soundtrack window.
  const sy=h-b2-M*.055,half=w*.15;g.beginPath();for(const dir of [-1,1])for(let k=0;k<3;k++){const x0=w/2+dir*(half+M*.02),len=M*(.11-k*.03);g.moveTo(x0,sy-M*.012+k*M*.012);g.lineTo(x0+dir*len,sy-M*.012+k*M*.012);}g.stroke();
  return c;
 })();
 const card={inner:G.w-(M*.07+M*.055)*2,top:M*.16,height:G.h-M*.38,strip:{w:G.w*.28,h:M*.03,y:G.h-M*.07-M*.055}};
 const lineSize=u*(portrait?.08:.074),texts=lru(5);
 const cardText=(i,n)=>texts(`${i}:${n}`,()=>{
  const c=layer(G.w,G.h),g=c.getContext('2d'),cue=tracks[i].cues[n],block=balanced(measure,cue?.text||'',{size:lineSize,minSize:lineSize*.55,weight:700,lineHeight:1.42,maxWidth:card.inner,maxHeight:card.height,spacing:.04,maxLines:3});
  drawBlock(g,block,G.w/2,card.top+(card.height-block.height)/2,{color:rgba(cream),align:'center'});return c;});
 const titleCard=i=>texts(`t${i}`,()=>{
  const c=layer(G.w,G.h),g=c.getContext('2d'),cy=card.top+card.height*.5,size=lineSize*1.08;
  const block=balanced(measure,tracks[i].title||'',{size,minSize:size*.5,weight:700,lineHeight:1.32,maxWidth:card.inner*.92,maxHeight:card.height*.46,spacing:.03,maxLines:2});
  const top=cy-block.height/2+size*.18;
  text(g,`제 ${i+1} 장`,G.w/2,top-size*1.05,{size:size*.36,weight:700,color:rgba(gold,.95),align:'center',baseline:'middle',spacing:.5});
  g.strokeStyle=rgba(cream,.7);g.lineWidth=Math.max(1,M*.0024);g.beginPath();g.moveTo(G.w/2-size*1.6,top-size*.6);g.lineTo(G.w/2-size*.25,top-size*.6);g.moveTo(G.w/2+size*.25,top-size*.6);g.lineTo(G.w/2+size*1.6,top-size*.6);g.stroke();
  g.fillStyle=rgba(cream,.85);g.beginPath();g.moveTo(G.w/2,top-size*.72);g.lineTo(G.w/2+size*.12,top-size*.6);g.lineTo(G.w/2,top-size*.48);g.lineTo(G.w/2-size*.12,top-size*.6);g.closePath();g.fill();
  drawBlock(g,block,G.w/2,top,{color:rgba(cream),align:'center'});
  text(g,`${String(i+1).padStart(2,'0')}  ·  ${String(N).padStart(2,'0')}`,G.w/2,top+block.height+size*.62,{size:size*.3,weight:600,color:rgba(cream,.62),align:'center',baseline:'middle',spacing:.4});
  return c;});

 // ---- Cutting plan per song: leader, chapter card, picture, and a card for every line. ----
 const plans=lru(4);
 const plan=i=>plans(i,()=>{
  const tr=tracks[i],D=Number(tr.duration)||0,cues=(tr.cues||[]).map((c,n)=>({c,n})).filter(({c})=>Number.isFinite(c.start)&&c.start<D).sort((a,b)=>a.c.start-b.c.start);
  const list=[],push=(kind,from,enter,n=-1)=>{while(list.length&&list[list.length-1].from>=from-1e-3)list.pop();list.push({kind,from,enter,n});};
  const first=cues.length?cues[0].c.start:D,count=first>=8?3:first>=5?2:0;
  if(count)push('leader',0,'cut');
  const titleEnd=cues.length?Math.min(count+4.8,first-1.4):Math.min(D,count+5);
  if(titleEnd-count>=1.8){push('title',count,'cut');if(first-titleEnd>=.8||!cues.length)push('scene',titleEnd,'iris');}
  else if(first-count>=.8)push('scene',count,'iris');
  cues.forEach(({c,n},k)=>{const next=k+1<cues.length?cues[k+1].c.start:D,end=Math.min(c.start+8,Number.isFinite(c.end)&&c.end>c.start?c.end:next,next);
   const read=clamp(1.4+[...(c.text||'')].length*.08,2,4.2),hold=Math.min(next,Math.max(end,c.start+read));
   push('card',c.start,'roll',n);if(next-hold>=1.2)push('scene',hold,'splice');});
  if(!list.length)push('scene',0,'iris');
  return list;
 });
 const LUM={scene:.85,leader:.6,title:.2,card:.2,black:0};

 function leaderFrame(ctx,x,y,w,h,age,count){
  const n=Math.max(1,count-Math.floor(age)),p=age-Math.floor(age),cx=x+w/2,cy=y+h/2,rad=Math.min(w,h)*.36,lw=Math.max(1.5,M*.005);
  ctx.fillStyle='#8f8a81';ctx.fillRect(x,y,w,h);
  ctx.fillStyle='rgba(28,26,24,.42)';ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,Math.hypot(w,h),-TAU/4,-TAU/4+p*TAU);ctx.closePath();ctx.fill();
  ctx.strokeStyle='rgba(244,240,232,.92)';ctx.lineWidth=lw;ctx.beginPath();ctx.arc(cx,cy,rad,0,TAU);ctx.stroke();ctx.beginPath();ctx.arc(cx,cy,rad*.8,0,TAU);ctx.stroke();
  ctx.lineWidth=lw*.6;ctx.beginPath();ctx.moveTo(x,cy);ctx.lineTo(x+w,cy);ctx.moveTo(cx,y);ctx.lineTo(cx,y+h);ctx.stroke();
  text(ctx,String(n),cx,cy+rad*.04,{size:rad*1.15,weight:700,color:'#14120f',align:'center',baseline:'middle'});
 }
 function paint(ctx,shot,s,dy){
  const {i,local}=s,x=G.x,y=G.y+dy;
  if(shot.kind==='scene'){const pic=picture(i),z=1.03+.05*(.5-.5*Math.cos(local*.045)),w=G.w*1.12*z,h=G.h*1.12*z,px=Math.sin(local*.031)*G.w*.018,py=Math.cos(local*.023)*G.h*.012;ctx.drawImage(pic,x+(G.w-w)/2+px,y+(G.h-h)/2+py,w,h);}
  else if(shot.kind==='leader'){const count=Math.round(plan(i).find(p=>p.kind!=='leader')?.from||3);leaderFrame(ctx,x,y,G.w,G.h,local-shot.from,count);}
  else if(shot.kind==='title'||shot.kind==='card'){
   ctx.drawImage(cardFrame,x,y);ctx.drawImage(shot.kind==='title'?titleCard(i):cardText(i,shot.n),x,y);
   // Optical soundtrack: a variable-area strip drawn from the measured waveform.
   const {w,h,y:sy}=card.strip,sx=x+(G.w-w)/2;ctx.fillStyle='#050505';ctx.fillRect(sx,y+sy-h/2,w,h);
   if(s.frame?.waveform?.length){const v=s.frame.waveform,n=v.length;ctx.fillStyle=rgba(cream,.85);ctx.beginPath();ctx.moveTo(sx,y+sy);for(let k=0;k<n;k++)ctx.lineTo(sx+k/(n-1)*w,y+sy-Math.min(1,Math.abs(v[k])*1.6)*h*.46-h*.02);for(let k=n-1;k>=0;k--)ctx.lineTo(sx+k/(n-1)*w,y+sy+Math.min(1,Math.abs(v[k])*1.6)*h*.46+h*.02);ctx.closePath();ctx.fill();}
   ctx.strokeStyle=rgba(cream,.55);ctx.lineWidth=Math.max(1,M*.002);ctx.strokeRect(sx,y+sy-h/2,w,h);
  }
 }

 function defects(ctx,t,f){
  // Grain: one of four tiles per film frame, at a fresh offset.
  const r=random(hash('g'+f)),tile=grain[f&3],pattern=ctx.createPattern(tile,'repeat'),sc=Math.max(1,u/900);
  if(pattern){pattern.setTransform(new DOMMatrix().translateSelf(r()*256,r()*256).scaleSelf(sc,sc));ctx.fillStyle=pattern;ctx.globalAlpha=.75;ctx.fillRect(G.x-u*.01,G.y-u*.01,G.w+u*.02,G.h+u*.02);ctx.globalAlpha=1;}
  // Scratches: fresh hairlines each frame plus a long one that wanders for a few seconds.
  const sr=random(hash('s'+f)),count=sr()<.45?0:sr()<.75?1:2;
  for(let k=0;k<count;k++){const x=G.x+sr()*G.w,y0=G.y+(sr()<.6?0:sr()*G.h*.6),light=sr()<.75;ctx.fillStyle=light?`rgba(240,236,226,${.18+sr()*.3})`:`rgba(10,9,8,${.25+sr()*.3})`;ctx.fillRect(x,y0,Math.max(1,u*(.0006+sr()*.0014)),G.y+G.h-y0);}
  const q=Math.floor(t/6.7),lr=random(hash('L'+q));
  if(lr()<.6){const x0=G.x+G.w*(.12+lr()*.76),drift=(lr()-.5)*u*.012,jr=random(hash('j'+f)),x=x0+(t-q*6.7)*drift+(jr()-.5)*u*.0022,a=.14+jr()*.18;ctx.fillStyle=`rgba(236,232,222,${a})`;const segs=4;for(let k=0;k<segs;k++)ctx.fillRect(x+Math.sin(k*1.7+q)*u*.0012,G.y+k*G.h/segs,Math.max(1,u*.0011),G.h/segs+1);}
  // Dust: a few specks and fibres, mostly dark, sometimes bright.
  const dr=random(hash('d'+f)),dn=Math.floor(Math.pow(dr(),1.6)*4.2);
  for(let k=0;k<dn;k++){const idx=Math.floor(dr()*dust.length),light=dr()<.25,size=u*(idx<6?.006+dr()*.012:.02+dr()*.03),x=G.x+dr()*G.w,y=G.y+dr()*G.h;ctx.save();ctx.translate(x,y);ctx.rotate(dr()*TAU);ctx.globalAlpha=.55+dr()*.4;ctx.drawImage((light?lightDust:darkDust)[idx],-size/2,-size/2,size,size);ctx.restore();}
  // A hair caught in the gate for a moment, trembling.
  const hq=Math.floor(t/4.1),hr=random(hash('h'+hq));
  if(hr()<.32){const at=hq*4.1+hr()*3.2,len=.25+hr()*.6,x=G.x+G.w*(hr()<.5?.02+hr()*.2:.78+hr()*.18),y=G.y+G.h*(.1+hr()*.6),size=M*(.16+hr()*.12),k=Math.floor(hr()*3);
   if(t>=at&&t<at+len){const jr=random(hash('hj'+f));ctx.save();ctx.translate(x+(jr()-.5)*u*.003,y+(jr()-.5)*u*.003);ctx.rotate(hr()*TAU+(jr()-.5)*.04);ctx.globalAlpha=.8;ctx.drawImage(darkHair[k],-size/2,-size/2,size,size);ctx.restore();}}
  ctx.globalAlpha=1;
 }

 function draw(ctx,time){
  const s=base.at(time),{i,local,duration}=s,t=s.t,f=Math.floor(t*FPS),list=plan(i);
  let k=0;for(let n=list.length-1;n>=0;n--)if(list[n].from<=local){k=n;break;}
  const shot=list[k],age=local-shot.from;
  // Projector: flicker per film frame plus a slow breathing of the lamp; the odd overexposed frame.
  const fr=random(hash('f'+f)),dim=.04+fr()*.07+.03*Math.sin(t*1.9)+(fr()<.03?-.08:0);
  const irisIn=shot.enter==='iris'?clamp(age/.95,0,1):1,irisOut=duration>2?clamp((duration-local)/.95,0,1):1,iris=Math.min(irisIn,irisOut);
  const lum=(LUM[shot.kind]||0)*easeInOut(iris)*(1-dim*2);
  ctx.drawImage(backdrop,0,0);
  ctx.globalCompositeOperation='lighter';ctx.globalAlpha=clamp(lum*.55,0,1);ctx.drawImage(spill,0,0,W,H);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';

  ctx.save();ctx.beginPath();ctx.rect(G.x,G.y,G.w,G.h);ctx.clip();ctx.fillStyle='#050505';ctx.fillRect(G.x,G.y,G.w,G.h);
  // Gate weave: the film moves a hair in the aperture, a new offset each film frame.
  const wr=random(hash('w'+f));ctx.translate((wr()-.5)*u*.0018+Math.sin(t*.9)*u*.0007,(wr()-.5)*u*.0024+Math.sin(t*1.3+1)*u*.0009);
  if(shot.enter==='roll'&&age<.26&&k>0){
   // The frame slips: the old frame runs up out of the gate, the frame line passes, the card settles.
   const p=easeInOut(age/.26),bar=G.h*.07,off=p*(G.h+bar);paint(ctx,list[k-1],s,-off);paint(ctx,shot,s,G.h+bar-off);
   ctx.fillStyle='#030303';ctx.fillRect(G.x,G.y+G.h-off,G.w,bar);ctx.fillStyle='rgba(200,194,180,.18)';ctx.fillRect(G.x,G.y+G.h-off+bar*.5,G.w,Math.max(1,u*.0015));
  }else paint(ctx,shot,s,0);
  if(shot.enter==='splice'&&age<3/FPS){const n=Math.floor(age*FPS),sr=random(hash('sp'+i+':'+k));ctx.fillStyle=`rgba(248,244,236,${[.5,.22,.08][n]||0})`;ctx.fillRect(G.x,G.y,G.w,G.h);
   const by=G.y+G.h*(.15+sr()*.7);ctx.fillStyle='rgba(255,252,244,.16)';ctx.fillRect(G.x,by,G.w,G.h*.035);ctx.fillStyle='rgba(0,0,0,.4)';ctx.fillRect(G.x,by,G.w,Math.max(1,u*.0016));ctx.fillRect(G.x,by+G.h*.035,G.w,Math.max(1,u*.0016));}
  ctx.fillStyle=`rgba(0,0,0,${clamp(dim,0,.2)})`;ctx.fillRect(G.x-u*.01,G.y-u*.01,G.w+u*.02,G.h+u*.02);
  if(fr()<.025){ctx.fillStyle='rgba(255,250,240,.07)';ctx.fillRect(G.x,G.y,G.w,G.h);}
  defects(ctx,t,f);
  if(iris<1){const cx=G.x+G.w/2,cy=G.y+G.h/2,R=Math.hypot(G.w,G.h)/2*1.04*easeInOut(iris),grad=ctx.createRadialGradient(cx,cy,Math.max(0,R*.86),cx,cy,Math.max(1,R));grad.addColorStop(0,'rgba(0,0,0,0)');grad.addColorStop(1,'#000');ctx.fillStyle=grad;ctx.fillRect(G.x-u*.01,G.y-u*.01,G.w+u*.02,G.h+u*.02);}
  ctx.restore();
  ctx.drawImage(gateMask,G.x,G.y,G.w,G.h);

  // Plaque on the stage: chapter, title, the spectrum and the running time.
  const show=Math.min(s.enter,s.exit*.6+.4),title=s.track.title||'',clock=`${stamp(local)} / ${stamp(duration)}`,specColor=mix(gold,cream,.35);
  const spectrum=(x,y,w,h)=>{if(s.frame)drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:specColor,alpha:.85*show,amp:.9,x,y,width:w,height:h});};
  if(portrait){
   const y0=stageY+u*.06;
   text(ctx,`제 ${i+1} 장  ·  ${String(i+1).padStart(2,'0')} / ${String(N).padStart(2,'0')}`,W/2,y0,{size:u*.024,weight:700,color:rgba(gold,.9*show),align:'center',baseline:'middle',spacing:.3});
   text(ctx,title,W/2,y0+u*.075,{size:u*.048,weight:700,color:rgba(cream,show),align:'center',baseline:'middle',spacing:.02,maxWidth:W*.84});
   spectrum(W/2-u*.32,y0+u*.12,u*.64,u*.085);
   text(ctx,clock,W/2,y0+u*.255,{size:u*.024,weight:600,color:rgba(cream,.6*show),align:'center',baseline:'middle',spacing:.12});
  }else{
   const y=stageY+(H-stageY)*.5,x0=G.x,x1=G.x+G.w;
   text(ctx,`제 ${i+1} 장`,x0,y,{size:u*.022,weight:700,color:rgba(gold,.9*show),baseline:'middle',spacing:.3});
   setFont(measure,700,u*.022,.3);const lw=measure.measureText(`제 ${i+1} 장`).width+u*.03;
   text(ctx,title,x0+lw,y,{size:u*.03,weight:700,color:rgba(cream,show),baseline:'middle',spacing:.01,maxWidth:G.w*.5-lw});
   spectrum(x0+G.w*.55,y-u*.034,G.w*.26,u*.062);
   text(ctx,clock,x1,y,{size:u*.021,weight:600,color:rgba(cream,.6*show),align:'right',baseline:'middle',spacing:.12});
  }
 }
 return {draw,duration:base.total};
}

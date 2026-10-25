import {sceneBase,layer,rgba,mix,hash,random,clamp,lerp,easeOut,easeInOut,text,fitText,wrap,setFont,drawBlock,drawCover,drawSpectrum,stamp} from '../canvas-kit.mjs';

/**
 * 눈 내리는 가로등: an empty winter street at night. One cast-iron lamp throws a sodium cone into the
 * falling snow; flakes only catch fire inside the cone and all but vanish in the dark around it. The
 * sung line is lit in the cone (letters reaching past it sink into the dark); when the next line comes,
 * the old one sinks to the ground and is snowed over. A bus-stop board across the street rolls its
 * poster to each song's art (instrumental: the board is the timetable of the whole playlist). Between
 * songs the lamp goes out and warms up again; now and then it falters on its own. The board's small
 * LED strip carries the spectrum.
 */
const TAU=Math.PI*2,HALF=.7,SODIUM=[255,176,96];
function lru(limit){const m=new Map();return (key,make)=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make();m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};}
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
/** fitText, then narrows the box while the line count holds so wrapped lines come out even. */
function balanced(measure,value,opts){
 const block=fitText(measure,value,opts);if(block.lines.length<2)return block;
 let lo=opts.maxWidth*.45,hi=opts.maxWidth;setFont(measure,block.weight,block.font,block.spacing);
 for(let k=0;k<12;k++){const mid=(lo+hi)/2,lines=wrap(measure,value,mid);if(lines.length<=block.lines.length)hi=mid;else lo=mid;}
 return {...block,lines:wrap(measure,value,hi)};
}

export default function streetlamp(input){
 const base=sceneBase(input,{hue:215}),{width:W,height:H,portrait,u,vocal,tracks}=base,N=tracks.length;
 const groundY=H*(portrait?.72:.75),B=portrait?{x:W*.46,y:H*.125}:{x:W*.27,y:H*.15},pole=portrait?{x:W*.1,top:H*.075,foot:H*.765}:{x:W*.065,top:H*.1,foot:H*.81};
 const S=portrait?{x:W*.5,y:vocal?H*.4:H*.36,w:W*.8,h:H*.17,sink:H*.13,size:u*.075}:{x:W*.3,y:H*.54,w:W*.36,h:H*.22,sink:H*.19,size:u*.066};
 const BD=portrait?(vocal?{x:W*.52,y:H*.635,w:W*.4,h:H*.285}:{x:W*.08,y:H*.545,w:W*.84,h:H*.385}):(vocal?{x:W*.665,y:H*.33,w:W*.24,h:H*.42}:{x:W*.58,y:H*.12,w:W*.35,h:H*.66});
 const measure=layer(8,8).getContext('2d'),cream=[255,232,196],navy=[22,30,48],amber=[255,170,70];

 /** Light at a point (0..1): the glow round the bulb plus the cone, falling off with distance. */
 function inten(x,y){const dx=x-B.x,dy=y-B.y,d=Math.hypot(dx,dy);let v=Math.exp(-d/(u*.05))*.8;if(dy>0){const a=Math.abs(Math.atan2(dx,dy));v+=smooth((HALF-a)/(HALF*.32))/(1+Math.pow(d/(u*.7),2));}return Math.min(1,v);}

 /** Light pool on the snow: an ellipse under the lantern, foreshortened by the ground plane. */
 const pool=(x,y)=>{const rx=portrait?u*.5:W*.26,ry=(H-groundY)*(portrait?.32:.42),dx=(x-B.x)/rx,dy=(y-(pole.foot+(H-groundY)*.04))/ry;return Math.exp(-(dx*dx+dy*dy)*1.3)*1.05*clamp((y-groundY)/(u*.03),0,1);};

 // ---- Static layers: night, far houses, snow ground (bg) and the lamp, plate and board frame (fg). ----
 const bg=(()=>{
  const c=layer(W,H),g=c.getContext('2d'),r=random(hash('winter-street'));
  const sky=g.createLinearGradient(0,0,0,groundY);sky.addColorStop(0,'#05070d');sky.addColorStop(.7,'#0b1120');sky.addColorStop(1,'#141b2b');g.fillStyle=sky;g.fillRect(0,0,W,groundY);
  // Far houses: flat roofs and gables in a row, a few windows still lit, softened by the snowfall.
  const far=layer(W/2,H/2),fg2=far.getContext('2d');let x=-r()*W*.05;
  while(x<W){const w=u*(.12+r()*.2),h=u*(.08+r()*.22),top=groundY-h-u*.02;fg2.fillStyle=`rgb(${9+r()*5|0},${12+r()*5|0},${20+r()*6|0})`;fg2.beginPath();fg2.moveTo(x/2,groundY/2);fg2.lineTo(x/2,top/2);if(r()<.5){fg2.lineTo((x+w/2)/2,(top-u*.05)/2);}fg2.lineTo((x+w)/2,top/2);fg2.lineTo((x+w)/2,groundY/2);fg2.fill();
   if(r()<.55){const n=1+Math.floor(r()*2);for(let k=0;k<n;k++){const wx=x+w*(.18+r()*.55),wy=top+h*(.2+r()*.4),ww=u*(.014+r()*.012),wh=u*(.018+r()*.01),warm=r()<.8;fg2.fillStyle=warm?`rgba(255,${190+r()*30|0},${110+r()*40|0},${.5+r()*.4})`:'rgba(170,200,255,.4)';fg2.fillRect(wx/2,wy/2,ww/2,wh/2);}}
   x+=w+u*(.005+r()*.03);}
  g.filter=`blur(${u*.0035}px)`;g.drawImage(far,0,0,W,H);g.filter='none';
  const haze=g.createLinearGradient(0,groundY-u*.3,0,groundY);haze.addColorStop(0,'rgba(60,72,98,0)');haze.addColorStop(1,'rgba(60,72,98,.28)');g.fillStyle=haze;g.fillRect(0,groundY-u*.3,W,u*.3);
  // Snow ground: blue-grey, lighter toward the viewer, with soft drifts and a lonely line of footprints.
  const snow=g.createLinearGradient(0,groundY,0,H);snow.addColorStop(0,'#2a3242');snow.addColorStop(1,'#3a4456');g.fillStyle=snow;g.fillRect(0,groundY,W,H-groundY);
  for(let k=0;k<26;k++){const y=groundY+Math.pow(r(),.8)*(H-groundY),rx=u*(.1+r()*.3),ry=rx*.08,grad=g.createRadialGradient(0,0,0,0,0,rx);g.save();g.translate(r()*W,y);g.scale(1,ry/rx);grad.addColorStop(0,`rgba(${r()<.5?'210,222,240':'8,12,22'},${.06+r()*.06})`);grad.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=grad;g.fillRect(-rx,-rx,rx*2,rx*2);g.restore();}
  g.fillStyle='rgba(10,14,24,.5)';g.fillRect(0,groundY,W,Math.max(1,u*.003));
  const fx0=portrait?W*.78:W*.5,fx1=portrait?W*.62:W*.58;for(let k=0;k<16;k++){const p=k/16,y=lerp(H*1.02,groundY+u*.02,Math.pow(p,.7)),sc=lerp(1,.18,Math.pow(p,.7)),x=lerp(fx0,fx1,p)+(k%2?1:-1)*u*.014*sc;g.fillStyle=`rgba(8,12,22,${.32*sc+.08})`;g.beginPath();g.ellipse(x,y,u*.009*sc,u*.02*sc*.45,(k%2?.15:-.15),0,TAU);g.fill();}
  return c;
 })();
 // Sodium light in the falling snow (faint) and on the ground (strong), computed per pixel at quarter size.
 const light=(()=>{const q=4,w=Math.ceil(W/q),h=Math.ceil(H/q),c=layer(w,h),g=c.getContext('2d'),img=g.createImageData(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const X=x*q,Y=y*q,p=(y*w+x)*4,a=clamp(inten(X,Y)*.3+(Y>groundY?pool(X,Y):0),0,1);img.data[p]=SODIUM[0];img.data[p+1]=SODIUM[1];img.data[p+2]=SODIUM[2];img.data[p+3]=a*255;}
  g.putImageData(img,0,0);return c;})();
 // How lit the lyric box is: words stay readable but go dark where they leave the cone.
 const box={x:S.x-S.w/2-S.size*.3,y:S.y-S.h/2,w:S.w+S.size*.6,h:S.h+S.sink+S.size*.4};
 const mask=(()=>{const q=2,w=Math.ceil(box.w/q),h=Math.ceil(box.h/q),c=layer(w,h),g=c.getContext('2d'),img=g.createImageData(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=inten(box.x+x*q,box.y+y*q);img.data[(y*w+x)*4+3]=clamp(.3+v*1.5,0,1)*255;}g.putImageData(img,0,0);return c;})();
 const scratch=layer(box.w,box.h),sg=scratch.getContext('2d');

 const fg=(()=>{
  const c=layer(W,H),g=c.getContext('2d'),pw=u*(portrait?.016:.014),iron='#0b0d12',edge='rgba(255,190,120,.22)';
  // Pole with a fluted base and the crook arm out to the lantern.
  g.fillStyle=iron;g.fillRect(pole.x-pw/2,pole.top,pw,pole.foot-pole.top);g.fillStyle=edge;g.fillRect(pole.x+pw*.2,pole.top+u*.04,pw*.18,pole.foot-pole.top-u*.1);
  g.beginPath();g.moveTo(pole.x-pw*1.6,pole.foot);g.lineTo(pole.x-pw*1.1,pole.foot-u*.09);g.lineTo(pole.x+pw*1.1,pole.foot-u*.09);g.lineTo(pole.x+pw*1.6,pole.foot);g.closePath();g.fillStyle=iron;g.fill();
  g.fillStyle='rgba(220,230,245,.55)';g.beginPath();g.ellipse(pole.x,pole.foot,pw*2.6,u*.008,0,0,TAU);g.fill();
  const headY=B.y-u*.035;g.strokeStyle=iron;g.lineWidth=pw*.7;g.lineCap='round';g.beginPath();g.moveTo(pole.x,pole.top+u*.01);g.bezierCurveTo(pole.x,pole.top-u*.05,B.x-u*.02,pole.top-u*.06,B.x,headY);g.stroke();
  g.lineWidth=pw*.3;g.beginPath();g.moveTo(pole.x,pole.top+u*.06);g.quadraticCurveTo(pole.x+(B.x-pole.x)*.2,pole.top-u*.01,pole.x+(B.x-pole.x)*.5,pole.top-u*.035);g.stroke();
  // Shade: a wide iron hat with snow lying on it.
  const sw=u*.065;g.fillStyle=iron;g.beginPath();g.moveTo(B.x-sw,B.y-u*.006);g.quadraticCurveTo(B.x,headY-u*.025,B.x+sw,B.y-u*.006);g.lineTo(B.x+sw*.9,B.y);g.lineTo(B.x-sw*.9,B.y);g.closePath();g.fill();
  g.fillStyle='rgba(226,234,246,.82)';g.beginPath();g.moveTo(B.x-sw*.8,B.y-u*.014);g.quadraticCurveTo(B.x,headY-u*.034,B.x+sw*.8,B.y-u*.014);g.quadraticCurveTo(B.x,headY-u*.012,B.x-sw*.8,B.y-u*.014);g.fill();
  g.fillStyle=edge;g.fillRect(B.x-sw*.9,B.y-u*.002,sw*1.8,Math.max(1,u*.002));
  // Snow on the arm.
  g.strokeStyle='rgba(220,230,244,.55)';g.lineWidth=pw*.35;g.beginPath();g.moveTo(pole.x+u*.005,pole.top-u*.02);g.bezierCurveTo(pole.x+u*.01,pole.top-u*.062,B.x-u*.03,pole.top-u*.07,B.x-u*.012,headY-u*.01);g.stroke();
  // Board: two posts in the snow, a steel case with a snow cap.
  const {x,y,w,h}=BD,fr=u*.01;g.fillStyle='#0a0c11';for(const px of [x+w*.15,x+w*.85])g.fillRect(px-u*.006,y+h,u*.012,Math.min(H,Math.max(y+h+u*.025,groundY+u*.06))-(y+h));
  g.fillStyle='#10141c';g.beginPath();g.roundRect(x-fr,y-fr,w+fr*2,h+fr*2,u*.008);g.fill();g.strokeStyle='rgba(150,165,190,.25)';g.lineWidth=Math.max(1,u*.0015);g.stroke();
  g.fillStyle='rgba(228,236,248,.85)';g.beginPath();g.moveTo(x-fr*1.3,y-fr);g.quadraticCurveTo(x+w*.3,y-fr-u*.022,x+w*.55,y-fr-u*.012);g.quadraticCurveTo(x+w*.8,y-fr-u*.02,x+w+fr*1.3,y-fr);g.closePath();g.fill();
  const spill=g.createRadialGradient(x+w/2,groundY+u*.02,0,x+w/2,groundY+u*.02,w*.8);spill.addColorStop(0,'rgba(170,200,240,.12)');spill.addColorStop(1,'rgba(170,200,240,0)');g.save();g.translate(0,0);g.fillStyle=spill;g.fillRect(x-w*.4,groundY-u*.05,w*1.8,u*.2);g.restore();
  return c;
 })();
 // Street-name plate with the title phrase, hung on the pole under the arm.
 const plate=(()=>{if(!base.headline)return null;const size=u*(portrait?.026:.022);setFont(measure,700,size,.12);const label=ellipsize2(base.headline,portrait?W*.32:W*.14,size);
  const pw=label.w+size*1.6,ph=size*1.9,c=layer(pw+4,ph+size*.6),g=c.getContext('2d');g.translate(2,size*.4);
  g.fillStyle='#1d3561';g.beginPath();g.roundRect(0,0,pw,ph,size*.25);g.fill();g.strokeStyle='rgba(235,240,250,.85)';g.lineWidth=Math.max(1,size*.07);g.beginPath();g.roundRect(size*.18,size*.18,pw-size*.36,ph-size*.36,size*.14);g.stroke();
  setFont(g,700,size,.12);g.fillStyle='#f2f4f8';g.textAlign='center';g.textBaseline='middle';g.fillText(label.text,pw/2,ph/2+size*.04);
  g.fillStyle='rgba(228,236,248,.9)';g.beginPath();g.moveTo(-1,0);g.quadraticCurveTo(pw*.4,-size*.38,pw+1,0);g.closePath();g.fill();
  return {c,w:pw,h:ph};})();
 function ellipsize2(value,maxW,size){setFont(measure,700,size,.12);let v=String(value);if(measure.measureText(v).width>maxW){while(v&&measure.measureText(v+'…').width>maxW)v=v.slice(0,-1);v+='…';}return {text:v,w:measure.measureText(v).width};}

 // ---- Snow: deterministic flakes in depth; brightness comes from the light at each flake. ----
 const flakeSprite=(color,soft)=>{const n=64,c=layer(n,n),g=c.getContext('2d'),grad=g.createRadialGradient(n/2,n/2,0,n/2,n/2,n/2);grad.addColorStop(0,rgba(color,1));grad.addColorStop(soft?.2:.45,rgba(color,soft?.5:.9));grad.addColorStop(1,rgba(color,0));g.fillStyle=grad;g.fillRect(0,0,n,n);return c;};
 const warmFlake=[flakeSprite([255,214,160],false),flakeSprite([255,206,150],true)],coldFlake=[flakeSprite([190,206,236],false),flakeSprite([180,198,232],true)];
 const flakes=(()=>{const r=random(hash('flakes')),n=Math.round(W*H/(u*u)*(portrait?300:230));return Array.from({length:n},()=>{const z=Math.pow(r(),2);return {x:r(),y:r(),z,ph:r()*TAU,sw:.6+r()*.8,v:.55+r()*.45};});})();
 function snow(ctx,t,I,front){
  const span=W*1.2,hh=H*1.1;ctx.globalCompositeOperation='lighter';
  for(const f of flakes){if(front!==(f.z>.72))continue;
   const speed=u*(.025+f.z*.11)*f.v,y=((f.y*hh+t*speed)%hh)-H*.05,drift=u*(.012+f.z*.03)*t+Math.sin(t*.12+f.ph)*u*.04*(.4+f.z),x=((f.x*span+drift+Math.sin(t*f.sw+f.ph)*u*.01*(.3+f.z))%span+span)%span-W*.1;
   if(y>H||x<-u*.05||x>W+u*.05)continue;
   const lit=inten(x,y)*I,size=u*(.0015+f.z*f.z*.008),near=f.z>.88,a=clamp((.05+f.z*.08)+lit*(.55+f.z*.4),0,1)*(near?.55:1);
   ctx.globalAlpha=a;ctx.drawImage((lit>.12?warmFlake:coldFlake)[near?1:0],x-size*2,y-size*2,size*4,size*4);}
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
 }

 // ---- Lamp behaviour: warms up at each song, goes out at its end, falters now and then. ----
 function lamp(s){
  const {local,duration,t}=s;let I=1;
  if(local<1.7){I=local<.25?0:local<.33?.5:local<.5?.05:local<.56?.6:local<.66?.12:.25+.75*easeOut((local-.66)/1.05);}
  if(duration>3){const left=duration-local;if(left<.75)I*=left<.45?0:left<.52?.55:left<.6?.1:.85;}
  const slot=Math.floor(t/6.3),r=random(hash('falter'+slot));if(r()<.2){const at=slot*6.3+r()*5.5,len=.25+r()*.3,dt=t-at;if(dt>=0&&dt<len)I*=Math.floor(dt*28+r()*4)%3===0?.45:.88;}
  return I;
 }

 // ---- Words in the light: crisp text, a soft bloom, and the snow-crust they wear while sinking. ----
 const items=lru(6);
 const speck=(()=>{const n=256,c=layer(n,n),g=c.getContext('2d'),r=random(hash('crust'));for(let k=0;k<2600;k++){g.fillStyle=`rgba(236,242,252,${.4+r()*.6})`;const s=.8+r()*2.4;g.beginPath();g.arc(r()*n,r()*n,s,0,TAU);g.fill();}return c;})();
 function wordLayers(key,value,{size,weight=700,head=null}){
  return items(key,()=>{
   const block=balanced(measure,value||' ',{size,minSize:size*.55,weight,lineHeight:1.3,maxWidth:S.w,maxHeight:S.h*(head?.72:1),spacing:.01,maxLines:3}),pad=size*.5,headH=head?size*.62:0;
   const w=Math.ceil(S.w+pad*2),h=Math.ceil(block.height+headH+pad*2),c=layer(w,h),g=c.getContext('2d');
   if(head)text(g,head,w/2,pad+headH*.4,{size:size*.3,weight:700,color:rgba(cream,.75),align:'center',baseline:'middle',spacing:.35});
   drawBlock(g,block,w/2,pad+headH,{color:rgba(cream),align:'center'});
   const glow=layer(w/2,h/2),gg=glow.getContext('2d');gg.filter=`blur(${size*.18}px)`;gg.drawImage(c,0,0,w/2,h/2);gg.filter='none';
   const crust=layer(w,h),cg=crust.getContext('2d');setFont(cg,block.weight,block.font,block.spacing);cg.textAlign='center';cg.textBaseline='top';cg.strokeStyle='#fff';cg.lineWidth=block.font*.1;cg.lineJoin='round';
   block.lines.forEach((line,k)=>{const y=pad+headH+k*block.font*block.lineHeight+block.font*(block.lineHeight-1)/2;cg.strokeText(line,w/2,y);cg.fillStyle='#fff';cg.fillText(line,w/2,y);});
   cg.globalCompositeOperation='source-in';for(let y=0;y<h;y+=256)for(let x=0;x<w;x+=256)cg.drawImage(speck,x,y);
   return {c,glow,crust,w,h};
  });
 }
 // Per song: when each line lights and when it sinks.
 const plans=lru(4);
 const plan=i=>plans(i,()=>{
  const tr=tracks[i],D=Number(tr.duration)||0,head=`${String(i+1).padStart(2,'0')}  /  ${String(N).padStart(2,'0')}`;
  if(!vocal)return [{key:`t${i}`,value:tr.title||'',size:S.size*1.12,head,start:1.1,sink:Infinity}];
  const cues=(tr.cues||[]).map((c,n)=>({c,n})).filter(({c})=>Number.isFinite(c.start)&&c.start<D).sort((a,b)=>a.c.start-b.c.start),list=[];
  const first=cues.length?cues[0].c.start:Infinity;
  if(first>3)list.push({key:`t${i}`,value:tr.title||'',size:S.size*1.12,head,start:1.1,sink:Math.max(1.2,first-.2)});
  cues.forEach(({c,n},k)=>{const next=k+1<cues.length?cues[k+1].c.start:D+5,end=Math.min(c.start+8,Number.isFinite(c.end)&&c.end>c.start?c.end:next,next);list.push({key:`${i}:${n}`,value:c.text||'',size:S.size,start:c.start,sink:next-end>4?end+1.6:next});});
  return list;
 });

 // ---- Bus-stop board: poster (vocal) or timetable page (instrumental), rolled like a scrolling ad. ----
 const P=portrait?10:12,pages=Math.max(1,Math.ceil(N/P)),hdr=BD.h*(portrait&&vocal?.11:.075),led=BD.h*(portrait&&vocal?.15:.085),panel={x:BD.x,y:BD.y+hdr,w:BD.w,h:BD.h-hdr-led};
 const rowH=panel.h/P,rowSize=Math.min(rowH*.46,u*(portrait?.03:.024));
 const posters=lru(4);
 const content=key=>posters(key,()=>{
  const c=layer(panel.w,panel.h),g=c.getContext('2d');
  if(vocal){const i=key,art=base.art(i),th=panel.h*.24,ah=panel.h-th;g.fillStyle='#0d1018';g.fillRect(0,0,panel.w,panel.h);drawCover(g,art.image,0,0,panel.w,ah);
   g.fillStyle='rgba(12,18,34,.22)';g.fillRect(0,0,panel.w,ah);const shade=g.createLinearGradient(0,ah*.6,0,ah);shade.addColorStop(0,'rgba(8,10,16,0)');shade.addColorStop(1,'rgba(8,10,16,.55)');g.fillStyle=shade;g.fillRect(0,0,panel.w,ah);
   g.fillStyle='#b9c2d0';g.fillRect(0,ah,panel.w,th);const block=balanced(measure,tracks[i].title||'',{size:Math.min(th*.36,u*.03),minSize:th*.2,weight:800,lineHeight:1.18,maxWidth:panel.w*.86,maxHeight:th*.8,spacing:-.01,maxLines:2});
   drawBlock(g,block,panel.w/2,ah+(th-block.height)/2,{color:rgba(navy),align:'center'});
  }else{const page=key;g.fillStyle='#a8b1c0';g.fillRect(0,0,panel.w,panel.h);
   for(let k=0;k<P;k++){const n=page*P+k,y=k*rowH;if(k%2){g.fillStyle='rgba(30,44,70,.05)';g.fillRect(0,y,panel.w,rowH);}if(n>=N)continue;const cy=y+rowH/2,px=panel.w*.05;
    text(g,String(n+1).padStart(2,'0'),px,cy,{size:rowSize*.9,weight:800,color:'rgba(40,60,100,.7)',baseline:'middle',spacing:.04});
    text(g,tracks[n].title||'',px+rowSize*2.1,cy,{size:rowSize,weight:600,color:rgba(navy),baseline:'middle',maxWidth:panel.w-px*2-rowSize*5.6});
    text(g,stamp(tracks[n].duration),panel.w-px,cy,{size:rowSize*.88,weight:600,color:'rgba(40,52,76,.75)',align:'right',baseline:'middle'});}}
  // Backlight falloff toward the case edges.
  const v=g.createRadialGradient(panel.w/2,panel.h*.45,Math.min(panel.w,panel.h)*.2,panel.w/2,panel.h/2,Math.hypot(panel.w,panel.h)*.6);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(4,8,18,.28)');g.fillStyle=v;g.fillRect(0,0,panel.w,panel.h);
  return c;});
 function board(ctx,s){
  const {i,local,duration}=s,{x,y,w}=BD;
  // Header strip.
  ctx.fillStyle='#161b26';ctx.fillRect(x,y,w,hdr);const hs=Math.min(hdr*.42,u*.022);
  text(ctx,vocal?'지금 흐르는 곡':'곡 목록',x+w*.05,y+hdr/2,{size:hs,weight:700,color:'rgba(226,232,242,.88)',baseline:'middle',spacing:.08});
  text(ctx,vocal?`${String(i+1).padStart(2,'0')} / ${String(N).padStart(2,'0')}`:`${Math.floor(i/P)*P+1}–${Math.min(N,Math.floor(i/P)*P+P)} / ${N}`,x+w*.95,y+hdr/2,{size:hs*.9,weight:700,color:'rgba(226,232,242,.7)',align:'right',baseline:'middle',spacing:.06});
  // Panel: the poster rolls up to the next one.
  const key=vocal?i:Math.floor(i/P),prevKey=vocal?i-1:Math.floor(Math.max(0,i-1)/P),roll=i>0&&key!==prevKey?easeInOut((local-.4)/1.3):1;
  ctx.save();ctx.beginPath();ctx.rect(panel.x,panel.y,panel.w,panel.h);ctx.clip();
  if(roll<1)ctx.drawImage(content(prevKey),panel.x,panel.y-roll*panel.h);ctx.drawImage(content(key),panel.x,panel.y+(1-roll)*panel.h);
  if(!vocal&&roll>=1){const k=i%P,from=i>0&&Math.floor((i-1)/P)===key?(i-1)%P:k,yy=panel.y+lerp(from,k,easeInOut(local/.9))*rowH;
   ctx.globalCompositeOperation='multiply';ctx.fillStyle='rgb(255,196,120)';ctx.fillRect(panel.x,yy,panel.w,rowH);ctx.globalCompositeOperation='source-over';
   ctx.fillStyle=rgba(amber);ctx.fillRect(panel.x,yy,panel.w*.012,rowH);
   const dot=.5+.5*Math.sin(local*4);ctx.fillStyle=`rgba(200,90,20,${.5+dot*.5})`;ctx.beginPath();ctx.arc(panel.x+panel.w*.032,yy+rowH/2,rowH*.09,0,TAU);ctx.fill();}
  if(roll<1){ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(panel.x,panel.y+(1-roll)*panel.h-u*.004,panel.w,u*.008);}
  ctx.restore();
  // LED strip: the measured spectrum and the clock in amber dots.
  const ly=y+BD.h-led;ctx.fillStyle='#07080b';ctx.fillRect(x,ly,w,led);
  if(s.frame)drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:amber,alpha:.92,amp:.9,x:x+w*.04,y:ly+led*.16,width:w*.52,height:led*.68});
  text(ctx,`${stamp(local)} / ${stamp(duration)}`,x+w*.96,ly+led/2,{size:Math.min(led*.36,u*.022),weight:700,color:rgba(amber,.95),align:'right',baseline:'middle',spacing:.08});
 }

 function draw(ctx,time){
  const s=base.at(time),{i,local,t}=s,I=lamp(s);
  ctx.drawImage(bg,0,0);
  if(I>0){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=I;ctx.drawImage(light,0,0,W,H);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';}
  snow(ctx,t,I,false);
  ctx.drawImage(fg,0,0);
  // Glass bowl under the shade: deep orange while warming, then sodium gold.
  {const warm=clamp((local-.6)/1.2,0,1),glass=mix([255,96,60],[255,214,150],warm),r=u*.03;ctx.fillStyle=rgba(mix([30,26,24],glass,I));ctx.beginPath();ctx.ellipse(B.x,B.y+r*.2,r*1.15,r*.75,0,0,Math.PI);ctx.fill();
   if(I>0){ctx.globalCompositeOperation='lighter';const halo=ctx.createRadialGradient(B.x,B.y+r*.3,0,B.x,B.y+r*.3,u*.14);halo.addColorStop(0,rgba(glass,.55*I));halo.addColorStop(.25,rgba(glass,.16*I));halo.addColorStop(1,rgba(glass,0));ctx.fillStyle=halo;ctx.fillRect(B.x-u*.14,B.y-u*.14,u*.28,u*.28);ctx.globalCompositeOperation='source-over';}}
  if(plate){const px=pole.x+u*.006,py=portrait?H*.19:H*.27;ctx.drawImage(plate.c,px,py);ctx.fillStyle=`rgba(4,6,12,${(1-I)*.55})`;ctx.fillRect(px,py,plate.c.width,plate.c.height);ctx.fillStyle='#0b0d12';ctx.fillRect(px-u*.006,py+plate.h*.2,u*.012,u*.006);ctx.fillRect(px-u*.006,py+plate.h*.75,u*.012,u*.006);}
  board(ctx,s);

  // Words: lit inside the cone; the line before sinks to the snow and is crusted over.
  sg.clearRect(0,0,scratch.width,scratch.height);const glows=[];
  for(const it of plan(i)){
   const age=local-it.start,sunk=(local-it.sink)/1.9;if(age<0||sunk>=1)continue;
   const L=wordLayers(it.key,it.value,{size:it.size,head:it.head}),cx=S.x-box.x,cy=S.y-box.y;
   if(sunk<0){const a=easeOut((age-.42)/.8),rise=-(1-easeOut((age-.42)/1.1))*u*.025;if(a<=0)continue;sg.globalAlpha=a;sg.drawImage(L.c,cx-L.w/2,cy-L.h/2+rise);glows.push([L,S.x-L.w/2,S.y-L.h/2+rise,.18+.55*Math.sin(Math.PI*clamp(age/1.4,0,1))]);}
   else{const p=sunk,q=clamp(p*1.9/.9,0,1),dy=(1-Math.pow(1-q,2.2))*S.sink+p*u*.01,sy=1-.45*easeOut(q);sg.save();sg.translate(cx,cy+dy);sg.scale(1,sy);sg.globalAlpha=clamp(1-p*1.6,0,1);sg.drawImage(L.c,-L.w/2,-L.h/2);sg.globalAlpha=clamp(Math.sin(Math.PI*Math.min(1,p*1.15))*.95,0,1);sg.drawImage(L.crust,-L.w/2,-L.h/2);sg.restore();}
  }
  sg.globalAlpha=1;sg.globalCompositeOperation='destination-in';sg.drawImage(mask,0,0,box.w,box.h);sg.globalCompositeOperation='source-over';
  ctx.globalAlpha=clamp(.08+I*.92,0,1);ctx.drawImage(scratch,box.x,box.y);ctx.globalAlpha=1;
  if(I>0){ctx.globalCompositeOperation='lighter';for(const [L,x,y,a] of glows){ctx.globalAlpha=clamp(a*I*.5,0,1);ctx.drawImage(L.glow,x,y,L.w,L.h);}ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';}
  snow(ctx,t,I,true);
  const v=ctx.createRadialGradient(W/2,H*.5,u*.35,W/2,H*.5,Math.hypot(W,H)*.6);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,4,.45)');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
 }
 return {draw,duration:base.total};
}

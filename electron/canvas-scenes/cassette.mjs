import {sceneBase,layer,rgba,mix,hsl,hash,random,clamp,lerp,easeOut,easeInOut,text,fitText,setFont,drawSpectrum,shadowSprite,drawShadow,drawCover,stamp,radialGlow,vignette} from '../canvas-kit.mjs';

/**
 * 카세트 테이프: a smoky clear cassette in a brushed-metal deck. The tape really travels — the left pack
 * shrinks, the right one grows, and both hubs turn faster as their pack gets smaller (constant tape
 * speed). Between songs the cassette pops out and a new one drops in. A J-card lists the whole tape
 * (SIDE A / B, the playing song marked with a highlighter); lyrics are punched out on label-maker tape.
 */
const TAU=Math.PI*2;
const LINEAR=['bars','round-bars','mirror','blocks','dots','reflection','wave','double-wave','area','mirror-area','ribbon'];
function lru(limit){const m=new Map();return (key,make)=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make();m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};}
function noiseTile(size,seed,{alpha=.08,mono=true}={}){
 const c=layer(size,size),g=c.getContext('2d'),img=g.createImageData(size,size),r=random(seed);
 for(let k=0;k<img.data.length;k+=4){const v=r()*255;img.data[k]=v;img.data[k+1]=mono?v:r()*255;img.data[k+2]=mono?v:r()*255;img.data[k+3]=alpha*255*(.4+r()*.6);}
 g.putImageData(img,0,0);return c;
}
function brushed(g,x,y,w,h,seed,{light=.05,dark=.07}={}){
 const r=random(seed);g.save();g.beginPath();g.rect(x,y,w,h);g.clip();g.lineWidth=1;
 for(let k=0;k<h*1.6;k++){const yy=y+r()*h,xx=x-w*.2+r()*w,len=w*(.15+r()*.7);g.strokeStyle=r()<.5?`rgba(255,255,255,${r()*light})`:`rgba(0,0,0,${r()*dark})`;g.beginPath();g.moveTo(xx,yy);g.lineTo(xx+len,yy);g.stroke();}
 g.restore();
}
function screw(g,x,y,r,angle){
 const m=g.createRadialGradient(x-r*.3,y-r*.3,0,x,y,r);m.addColorStop(0,'#e8eaee');m.addColorStop(.6,'#9aa0a8');m.addColorStop(1,'#4c5058');
 g.fillStyle=m;g.beginPath();g.arc(x,y,r,0,TAU);g.fill();g.strokeStyle='rgba(0,0,0,.45)';g.lineWidth=Math.max(1,r*.12);g.stroke();
 g.save();g.translate(x,y);g.rotate(angle);g.strokeStyle='rgba(30,32,36,.8)';g.lineWidth=r*.22;g.beginPath();g.moveTo(-r*.6,0);g.lineTo(r*.6,0);g.moveTo(0,-r*.6);g.lineTo(0,r*.6);g.stroke();g.restore();
}

export default function cassette(input){
 const base=sceneBase(input,{hue:24}),{width:W,height:H,portrait,u,vocal,tracks}=base,N=tracks.length;
 const nA=Math.ceil(N/2),sideOf=n=>n<nA?['A',n+1]:['B',n-nA+1],sideLabel=n=>sideOf(n).join('');
 const total=tracks.reduce((sum,t)=>sum+(Number(t.duration)||0),0);
 const D=portrait?[u*.055,H*.045,u*.89,H*.355]:[W*.045,H*.07,W*.5,H*.6];
 const J=portrait?[u*.055,H*.645,u*.89,H*.305]:[W*.585,H*.075,W*.37,H*.59];
 const Z=portrait?[u*.055,H*.415,u*.89,H*.205]:[W*.06,H*.715,W*.88,H*.23];
 const [dx,dy,dw,dh]=D,bayH=dh*.69,cw=Math.min(dw*.8,bayH*.9/.635),ch=cw*.635;
 const bay=[dx+(dw-cw*1.08)/2,dy+dh*.075,cw*1.08,bayH],casX=bay[0]+(bay[2]-cw)/2,casY=bay[1]+(bayH-ch)/2;
 const mh=dh*.13,meter=[dx+dw*.06,bay[1]+bayH+dh*.05,dw*.88,mh],gap=mh*.22,counterW=mh*2.05,lampW=mh*2.9;
 const led=[meter[0]+counterW+gap,meter[1],meter[2]-counterW-lampW-gap*2,mh],lamp=[meter[0]+meter[2]-lampW,meter[1],lampW,mh];
 const measure=layer(8,8).getContext('2d'),shadow=shadowSprite(256,{alpha:.75}),stripShadow=shadowSprite(128,{alpha:.55});
 const grainTile=noiseTile(256,hash('cassette-desk'),{alpha:.07}),paperTile=noiseTile(192,hash('cassette-paper'),{alpha:.05});

 // ---- Static deck, background grain and cassette shell layers -------------------------------------
 const grain=layer(W,H);{const g=grain.getContext('2d');g.fillStyle=g.createPattern(grainTile,'repeat');g.fillRect(0,0,W,H);}
 const deck=layer(dw+u*.04,dh+u*.04);{
  const g=deck.getContext('2d'),o=u*.02;g.translate(o,o);
  const body=g.createLinearGradient(0,0,0,dh);body.addColorStop(0,'#4a4d54');body.addColorStop(.08,'#3b3e45');body.addColorStop(1,'#232529');
  g.fillStyle=body;g.beginPath();g.roundRect(0,0,dw,dh,u*.014);g.fill();g.save();g.clip();brushed(g,0,0,dw,dh,hash('deck'),{light:.06,dark:.08});g.restore();
  g.strokeStyle='rgba(255,255,255,.22)';g.lineWidth=Math.max(1,u*.0016);g.beginPath();g.moveTo(u*.014,1);g.lineTo(dw-u*.014,1);g.stroke();
  g.strokeStyle='rgba(0,0,0,.6)';g.lineWidth=Math.max(1,u*.002);g.beginPath();g.roundRect(0,0,dw,dh,u*.014);g.stroke();
  const recess=(x,y,w,h,r,fill)=>{x-=dx;y-=dy;g.fillStyle=fill;g.beginPath();g.roundRect(x,y,w,h,r);g.fill();const sh=g.createLinearGradient(0,y,0,y+h);sh.addColorStop(0,'rgba(0,0,0,.55)');sh.addColorStop(.12,'rgba(0,0,0,0)');sh.addColorStop(.92,'rgba(0,0,0,0)');sh.addColorStop(1,'rgba(255,255,255,.06)');g.fillStyle=sh;g.fill();g.strokeStyle='rgba(255,255,255,.14)';g.lineWidth=Math.max(1,u*.0014);g.beginPath();g.moveTo(x+r,y+h+.5);g.lineTo(x+w-r,y+h+.5);g.stroke();};
  recess(...bay,u*.012,'#0c0d10');
  // Bay floor: the tape guides and the head the cassette sits on.
  const bx=bay[0]-dx,by=bay[1]-dy;g.fillStyle='#16181c';g.fillRect(bx+bay[2]*.38,by+bayH*.93,bay[2]*.24,bayH*.05);
  recess(meter[0],meter[1],counterW,mh,u*.006,'#08090b');recess(...led,u*.006,'#050607');recess(...lamp,u*.006,'#101114');
  // Unlit LED cells under the live spectrum.
  {const [lx,ly,lw,lh]=led,cols=Math.max(16,Math.round(lw/(lh*.16))),rows=10,cwid=(lw-lh*.24)/cols,chgt=(lh-lh*.24)/rows;g.fillStyle='rgba(120,255,170,.055)';
   for(let a=0;a<cols;a++)for(let b=0;b<rows;b++)g.fillRect(lx-dx+lh*.12+a*cwid+cwid*.14,ly-dy+lh*.12+b*chgt+chgt*.2,cwid*.72,chgt*.6);}
  const engrave=(value,x,y,size,align='left')=>{text(g,value,x+1,y+1,{size,weight:700,color:'rgba(0,0,0,.55)',spacing:.28,align,baseline:'middle'});text(g,value,x,y,{size,weight:700,color:'rgba(225,230,238,.5)',spacing:.28,align,baseline:'middle'});};
  engrave('STEREO CASSETTE DECK',dw*.06,dh*.04,u*.0125);engrave('AUTO REVERSE · 3 HEAD',dw*.94,dh*.04,u*.0115,'right');
  engrave('COUNTER',meter[0]-dx,meter[1]-dy+mh+dh*.03,u*.0105);engrave('LEVEL',led[0]-dx,led[1]-dy+mh+dh*.03,u*.0105);
  // Side controls: eject key and power on the left, two knobs on the right.
  const side=(bay[0]-dx)/2,kx=dw-side,ky=by+bayH*.28;
  g.fillStyle='#2b2d32';g.beginPath();g.roundRect(side-side*.42,by+bayH*.18,side*.84,bayH*.16,u*.006);g.fill();g.strokeStyle='rgba(255,255,255,.12)';g.stroke();
  {const ex=side,ey=by+bayH*.25,es=u*.012;g.fillStyle='rgba(225,230,238,.6)';g.beginPath();g.moveTo(ex-es,ey);g.lineTo(ex+es,ey);g.lineTo(ex,ey-es*1.1);g.closePath();g.fill();g.fillRect(ex-es,ey+es*.35,es*2,es*.4);}
  engrave('EJECT',side,by+bayH*.38,u*.0105,'center');
  for(const [k,label] of [[0,'REC LEVEL'],[1,'BALANCE']]){const y=ky+k*bayH*.42,r=Math.min(side*.36,bayH*.12);
   const cap=g.createRadialGradient(kx-r*.3,y-r*.35,0,kx,y,r);cap.addColorStop(0,'#5a5e66');cap.addColorStop(1,'#1b1c20');g.fillStyle='rgba(0,0,0,.5)';g.beginPath();g.arc(kx,y+r*.12,r*1.05,0,TAU);g.fill();g.fillStyle=cap;g.beginPath();g.arc(kx,y,r,0,TAU);g.fill();
   g.strokeStyle='rgba(255,255,255,.18)';g.lineWidth=Math.max(1,r*.05);g.beginPath();g.arc(kx,y,r*.92,Math.PI*1.1,Math.PI*1.7);g.stroke();
   for(let n=0;n<11;n++){const a=Math.PI*.75+n/10*Math.PI*1.5;g.strokeStyle='rgba(225,230,238,.35)';g.lineWidth=Math.max(1,u*.0012);g.beginPath();g.moveTo(kx+Math.cos(a)*r*1.18,y+Math.sin(a)*r*1.18);g.lineTo(kx+Math.cos(a)*r*1.32,y+Math.sin(a)*r*1.32);g.stroke();}
   const a=Math.PI*(1.35+k*.3);g.strokeStyle='#e9ecf1';g.lineWidth=Math.max(1.5,r*.1);g.beginPath();g.moveTo(kx+Math.cos(a)*r*.35,y+Math.sin(a)*r*.35);g.lineTo(kx+Math.cos(a)*r*.82,y+Math.sin(a)*r*.82);g.stroke();
   engrave(label,kx,y+r*1.62,u*.0098,'center');}
  for(const [x,y] of [[dw*.02,dh*.04],[dw*.98,dh*.04],[dw*.02,dh*.96],[dw*.98,dh*.96]])screw(g,x,y,u*.007,x*.01+y*.02);
 }
 // Counter drums: 0–9 and a second 0 so the last digit rolls over smoothly.
 const cell=mh*.62,digitW=(counterW-mh*.3)/3,drum=layer(digitW,cell*11);{
  const g=drum.getContext('2d');for(let n=0;n<11;n++){const y=n*cell,f=g.createLinearGradient(0,y,0,y+cell);f.addColorStop(0,'#0c0c0e');f.addColorStop(.5,'#26272b');f.addColorStop(1,'#0c0c0e');g.fillStyle=f;g.fillRect(0,y,digitW,cell);
   text(g,String(n%10),digitW/2,y+cell*.54,{size:cell*.72,weight:700,color:'#eef0f2',align:'center',baseline:'middle'});g.fillStyle='rgba(0,0,0,.6)';g.fillRect(digitW-1,y,1,cell);}
 }
 const ledGlass=layer(led[2],led[3]);{
  const g=ledGlass.getContext('2d'),[,,lw,lh]=led,rows=10,chgt=(lh-lh*.24)/rows;g.fillStyle='rgba(5,6,7,.82)';
  for(let b=0;b<=rows;b++)g.fillRect(0,lh*.12+b*chgt-chgt*.2,lw,chgt*.4);
  const cols=Math.max(16,Math.round(lw/(lh*.16))),cwid=(lw-lh*.24)/cols;for(let a=0;a<=cols;a++)g.fillRect(lh*.12+a*cwid-cwid*.14,0,cwid*.28,lh);
  const sheen=g.createLinearGradient(0,0,0,lh);sheen.addColorStop(0,'rgba(255,255,255,.1)');sheen.addColorStop(.45,'rgba(255,255,255,.02)');sheen.addColorStop(.46,'rgba(255,255,255,0)');g.fillStyle=sheen;g.fillRect(0,0,lw,lh);
 }
 const ledLayer=layer(led[2],led[3]);
 // Cassette geometry (in cassette pixels).
 const R={lx:cw*.285,rx:cw*.715,y:ch*.585,max:cw*.172,min:cw*.094},rollerY=ch*.865;
 const shellPath=(g)=>{g.beginPath();g.roundRect(0,0,cw,ch,cw*.034);};
 const back=layer(cw,ch);{
  const g=back.getContext('2d');shellPath(g);const f=g.createLinearGradient(0,0,cw,ch);f.addColorStop(0,'rgba(58,60,68,.97)');f.addColorStop(1,'rgba(30,31,36,.97)');g.fillStyle=f;g.fill();
  g.fillStyle='rgba(0,0,0,.35)';for(const x of [R.lx,R.rx]){g.beginPath();g.arc(x,R.y,R.max*1.06,0,TAU);g.fill();}
  // Guide rollers and the felt pressure pad.
  for(const x of [cw*.115,cw*.885]){g.fillStyle='#d9dbe0';g.beginPath();g.arc(x,rollerY,cw*.017,0,TAU);g.fill();g.fillStyle='#55585f';g.beginPath();g.arc(x,rollerY,cw*.007,0,TAU);g.fill();}
  g.fillStyle='#7d6a55';g.fillRect(cw*.475,ch*.905,cw*.05,ch*.035);g.fillStyle='#b8bcc4';g.fillRect(cw*.455,ch*.94,cw*.09,ch*.012);
 }
 const pack=layer(R.max*2,R.max*2);{
  const g=pack.getContext('2d'),r=R.max;g.translate(r,r);const f=g.createRadialGradient(0,0,r*.5,0,0,r);f.addColorStop(0,'#2a1f19');f.addColorStop(.92,'#3a2a20');f.addColorStop(1,'#241914');g.fillStyle=f;g.beginPath();g.arc(0,0,r,0,TAU);g.fill();
  const rng=random(hash('pack'));for(let rad=r*.5;rad<r;rad+=Math.max(1,r*.012)){g.strokeStyle=`rgba(${rng()<.5?'255,220,190':'0,0,0'},${.03+rng()*.05})`;g.lineWidth=Math.max(.6,r*.006);g.beginPath();g.arc(0,0,rad,0,TAU);g.stroke();}
 }
 const hub=layer(R.min*2,R.min*2);{
  const g=hub.getContext('2d'),r=R.min;g.translate(r,r);const f=g.createRadialGradient(-r*.3,-r*.3,0,0,0,r);f.addColorStop(0,'#fbfaf6');f.addColorStop(1,'#c9c6bd');g.fillStyle=f;g.beginPath();g.arc(0,0,r,0,TAU);g.fill();
  g.strokeStyle='rgba(0,0,0,.25)';g.lineWidth=Math.max(1,r*.03);g.stroke();
  // Three windows and a red index mark make the turning visible.
  g.fillStyle='#3a3530';for(let k=0;k<3;k++){g.save();g.rotate(k*TAU/3);g.beginPath();g.roundRect(-r*.16,-r*.86,r*.32,r*.3,r*.08);g.fill();g.restore();}
  g.fillStyle='#d23b2f';g.beginPath();g.arc(r*.66,r*.2,r*.07,0,TAU);g.fill();
  g.fillStyle='#17171a';g.beginPath();g.arc(0,0,r*.46,0,TAU);g.fill();g.fillStyle='#ece9e2';
  for(let k=0;k<6;k++){g.save();g.rotate(k*TAU/6);g.beginPath();g.moveTo(-r*.07,-r*.47);g.lineTo(r*.07,-r*.47);g.lineTo(r*.04,-r*.3);g.lineTo(-r*.04,-r*.3);g.closePath();g.fill();g.restore();}
 }
 const front=layer(cw,ch);{
  const g=front.getContext('2d');shellPath(g);g.fillStyle='rgba(150,155,168,.08)';g.fill();
  g.strokeStyle='rgba(0,0,0,.7)';g.lineWidth=Math.max(1,cw*.004);g.stroke();
  g.strokeStyle='rgba(255,255,255,.16)';g.lineWidth=Math.max(1,cw*.002);g.beginPath();g.roundRect(cw*.012,cw*.012,cw-cw*.024,ch-cw*.024,cw*.026);g.stroke();
  // Hub rings molded in the front shell.
  for(const x of [R.lx,R.rx]){g.strokeStyle='rgba(255,255,255,.18)';g.lineWidth=Math.max(1,cw*.003);g.beginPath();g.arc(x,R.y,R.min*1.12,0,TAU);g.stroke();}
  // The lower trapezoid in front of the tape path, with its openings.
  g.beginPath();g.moveTo(cw*.17,ch);g.lineTo(cw*.22,ch*.79);g.lineTo(cw*.78,ch*.79);g.lineTo(cw*.83,ch);g.closePath();g.fillStyle='rgba(72,75,84,.62)';g.fill();g.strokeStyle='rgba(255,255,255,.12)';g.stroke();
  g.fillStyle='rgba(8,8,10,.9)';for(const [a,b] of [[.43,.57],[.3,.355],[.645,.7]])g.fillRect(cw*a,ch*.955,cw*(b-a),ch*.045);
  for(const x of [.33,.67]){g.beginPath();g.arc(cw*x,ch*.885,cw*.016,0,TAU);g.fill();}
  for(const [x,y] of [[.035,.06],[.965,.06],[.035,.94],[.965,.94],[.5,.83]])screw(g,cw*x,ch*y,cw*.013,x*7+y*3);
 }
 const gloss=layer(cw,ch);{
  const g=gloss.getContext('2d');shellPath(g);g.save();g.clip();const f=g.createLinearGradient(0,0,cw*.7,ch);f.addColorStop(0,'rgba(255,255,255,.2)');f.addColorStop(.3,'rgba(255,255,255,.05)');f.addColorStop(.31,'rgba(255,255,255,0)');f.addColorStop(.62,'rgba(255,255,255,0)');f.addColorStop(.7,'rgba(255,255,255,.07)');f.addColorStop(.78,'rgba(255,255,255,0)');g.fillStyle=f;g.fillRect(0,0,cw,ch);g.restore();
 }
 const labelBox=[cw*.06,ch*.05,cw*.88,ch*.275];
 const labels=lru(3),cards=lru(3),strips=lru(12);
 function makeLabel(i){
  const [,,lw,lh]=labelBox,c=layer(lw,lh),g=c.getContext('2d'),art=base.art(i),[side,num]=sideOf(i);
  const p=g.createLinearGradient(0,0,0,lh);p.addColorStop(0,'#f6f2e7');p.addColorStop(1,'#e7e0cf');g.fillStyle=p;g.beginPath();g.roundRect(0,0,lw,lh,lh*.06);g.fill();g.save();g.clip();
  g.fillStyle=g.createPattern(paperTile,'repeat');g.fillRect(0,0,lw,lh);
  g.fillStyle=rgba(hsl(art.hue,.55,.46));g.fillRect(0,lh*.83,lw,lh*.17);g.fillStyle=rgba(hsl(art.hue,.6,.62));g.fillRect(0,lh*.81,lw,lh*.025);
  text(g,'TYPE I · NORMAL POSITION',lw*.97,lh*.915,{size:lh*.075,weight:700,color:'rgba(255,255,255,.85)',spacing:.22,align:'right',baseline:'middle'});
  g.restore();
  const box=lh*.4;g.strokeStyle='#2a2d36';g.lineWidth=Math.max(1,lh*.018);g.strokeRect(lh*.12,lh*.12,box,box);text(g,side,lh*.12+box/2,lh*.12+box*.54,{size:box*.78,weight:800,color:'#2a2d36',align:'center',baseline:'middle'});
  const x0=lh*.12+box+lh*.16,x1=lw-lh*.12;
  text(g,`${String(num).padStart(2,'0')} / ${String(side==='A'?nA:N-nA).padStart(2,'0')}`,x1,lh*.22,{size:lh*.1,weight:700,color:'#5b6070',spacing:.1,align:'right',baseline:'middle'});
  if(base.headline)text(g,base.headline,x0,lh*.22,{size:lh*.105,weight:700,color:'#3a3f4c',spacing:.18,baseline:'middle',maxWidth:x1-x0-lh*1.1});
  g.strokeStyle='rgba(60,90,150,.35)';g.lineWidth=Math.max(1,lh*.01);g.beginPath();g.moveTo(x0,lh*.69);g.lineTo(x1,lh*.69);g.stroke();
  // Title in ballpoint: slanted, slightly rotated, with a quick wavy underline.
  const fit=fitText(measure,tracks[i].title||'',{size:lh*.34,minSize:lh*.2,weight:700,lineHeight:1.1,maxWidth:(x1-x0)*.94,maxHeight:lh*.4,maxLines:1});
  g.save();g.translate(x0+lh*.06,lh*.64);g.rotate(-.022);g.transform(1,0,-.2,1,0,0);setFont(g,700,fit.font,0);g.fillStyle='#1f2a66';g.textAlign='left';g.textBaseline='alphabetic';g.fillText(fit.lines[0],0,0);
  const tw=Math.min(g.measureText(fit.lines[0]).width,x1-x0);g.restore();
  g.strokeStyle='rgba(31,42,102,.8)';g.lineWidth=Math.max(1.2,lh*.016);g.lineCap='round';g.beginPath();
  for(let k=0;k<=40;k++){const x=x0+k/40*tw*.96,y=lh*.735-k/40*lh*.03+Math.sin(k*.9)*lh*.008;k?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();
  return c;
 }
 const label=i=>labels(i,()=>makeLabel(i));

 // ---- J-card ---------------------------------------------------------------------------------------
 const [jx,jy,jw,jh]=J,spine=portrait?jh*.11:jw*.085,pad=u*.026;
 const box=portrait?[pad,spine+pad*.8,jw-pad*2,jh-spine-pad*1.6]:[spine+pad,pad,jw-spine-pad*2,jh-pad*2];
 const artSize=portrait?Math.min(box[3]*.36,box[2]*.22):Math.min(box[3]*.3,box[2]*.32);
 const listTop=box[1]+artSize+pad*.9,hr=u*.038,rowH=u*(portrait?.044:.042),rows=Math.max(2,Math.floor((box[1]+box[3]-listTop-hr)/rowH)),colGap=u*.03,colW=(box[2]-colGap)/2;
 const anchor=Math.floor((rows-1)/2),nB=N-nA;
 const offsetOf=(len,pos)=>clamp(pos-anchor,0,Math.max(0,len-rows));
 const rowRect=(n,i)=>{const b=n>=nA,pos=b?n-nA:n,off=b?offsetOf(nB,Math.max(0,i-nA)):offsetOf(nA,Math.min(i,nA-1));return [box[0]+(b?colW+colGap:0),listTop+hr+(pos-off)*rowH,colW,rowH,pos-off>=0&&pos-off<rows];};
 function makeCard(i){
  const c=layer(jw,jh),g=c.getContext('2d'),art=base.art(i),ink='#262b3a',size=rowH*.47;
  const p=g.createLinearGradient(0,0,jw,jh);p.addColorStop(0,'#f4eedf');p.addColorStop(1,'#e6dcc6');g.fillStyle=p;g.beginPath();g.roundRect(0,0,jw,jh,u*.004);g.fill();g.save();g.clip();g.fillStyle=g.createPattern(paperTile,'repeat');g.fillRect(0,0,jw,jh);
  // Spine with the headline, and the fold.
  const sc=hsl(art.hue,.42,.3);g.fillStyle=rgba(sc);portrait?g.fillRect(0,0,jw,spine):g.fillRect(0,0,spine,jh);
  g.save();if(portrait)g.translate(pad,spine/2);else{g.translate(spine/2,jh-pad);g.rotate(-Math.PI/2);}
  const sl=portrait?jw-pad*2:jh-pad*2,ss=spine*(portrait?.34:.36);text(g,'C-60 · STEREO',sl,0,{size:ss*.72,weight:700,color:'rgba(255,255,255,.7)',spacing:.2,align:'right',baseline:'middle'});
  if(base.headline)text(g,base.headline,0,0,{size:ss,weight:800,color:'#fff',spacing:.12,baseline:'middle',maxWidth:sl*.66});g.restore();
  g.fillStyle='rgba(0,0,0,.12)';portrait?g.fillRect(0,spine,jw,Math.max(1,u*.002)):g.fillRect(spine,0,Math.max(1,u*.002),jh);
  g.restore();
  const [bx,by,bw]=box;
  g.fillStyle='rgba(0,0,0,.25)';g.fillRect(bx+u*.003,by+u*.004,artSize,artSize);drawCover(g,art.image,bx,by,artSize,artSize);g.strokeStyle='rgba(0,0,0,.25)';g.lineWidth=1;g.strokeRect(bx,by,artSize,artSize);
  const tx=bx+artSize+pad*.8,tw=bw-artSize-pad*.8,ty=by+artSize*.06;
  text(g,'TRACK LIST',tx,ty+u*.012,{size:u*.0145,weight:800,color:rgba(hsl(art.hue,.5,.35)),spacing:.3,baseline:'middle'});
  text(g,`${N}곡 · ${stamp(total)}`,tx,ty+artSize*.36,{size:u*.03,weight:800,color:ink,baseline:'middle',maxWidth:tw});
  text(g,`SIDE A  ${nA}곡   ·   SIDE B  ${nB}곡`,tx,ty+artSize*.62,{size:u*.0165,weight:600,color:'#5b6070',baseline:'middle',maxWidth:tw});
  g.fillStyle='rgba(38,43,58,.5)';for(let k=0;k<Math.min(42,tw/(u*.006));k++)g.fillRect(tx+k*u*.006,ty+artSize*.8,u*(k%3===0?.0035:.0018),artSize*.12);
  for(const [col,len,letter] of [[0,nA,'A'],[1,nB,'B']]){
   const x=bx+col*(colW+colGap),off=col?offsetOf(nB,Math.max(0,i-nA)):offsetOf(nA,Math.min(i,nA-1));
   g.fillStyle=ink;g.beginPath();g.roundRect(x,listTop,hr*.82,hr*.82,hr*.12);g.fill();text(g,letter,x+hr*.41,listTop+hr*.44,{size:hr*.6,weight:800,color:'#f4eedf',align:'center',baseline:'middle'});
   text(g,'SIDE',x+hr,listTop+hr*.44,{size:hr*.4,weight:800,color:ink,spacing:.3,baseline:'middle'});
   if(len>rows)text(g,`${String(off+1).padStart(2,'0')}–${String(Math.min(len,off+rows)).padStart(2,'0')} / ${len}${off>0?' ▲':''}${off+rows<len?' ▼':''}`,x+colW,listTop+hr*.44,{size:hr*.36,weight:700,color:'#6a6f7d',align:'right',baseline:'middle'});
   g.fillStyle='rgba(70,110,170,.28)';for(let r=0;r<=rows;r++)g.fillRect(x,listTop+hr+r*rowH-1,colW,Math.max(1,u*.001));
   if(!len)text(g,'—',x+size,listTop+hr+rowH/2,{size,color:'#8a8e99',baseline:'middle'});
   for(let r=0;r<Math.min(rows,len);r++){
    const n=col?nA+off+r:off+r,y=listTop+hr+r*rowH+rowH*.52,played=n<i;
    text(g,String(n-(col?nA:0)+1).padStart(2,'0'),x+size*1.15,y,{size:size*.86,weight:800,color:rgba(hsl(art.hue,.45,.36)),baseline:'middle'});
    text(g,tracks[n].title||'',x+size*2.6,y,{size,weight:n===i?800:500,color:played?'#6d7280':ink,baseline:'middle',maxWidth:colW-size*6});
    text(g,stamp(Number(tracks[n].duration)||0),x+colW-size*.2,y,{size:size*.84,weight:600,color:'#5b6070',align:'right',baseline:'middle'});
    if(played){g.strokeStyle='rgba(60,62,70,.7)';g.lineWidth=Math.max(1,size*.09);g.lineCap='round';g.beginPath();g.moveTo(x+size*.05,y);g.lineTo(x+size*.3,y+size*.28);g.lineTo(x+size*.72,y-size*.3);g.stroke();}
   }
  }
  return c;
 }
 const card=i=>cards(i,()=>makeCard(i)),tilt=portrait?.006:-.012;

 // ---- Label-maker strips -----------------------------------------------------------------------------
 const [zx,zy,zw,zh]=Z,fontSize=u*(portrait?.056:.052),nextScale=.42;
 function makeStrips(value,color,seed){
  const fit=fitText(measure,value||' ',{size:fontSize,minSize:fontSize*.62,weight:800,lineHeight:1,maxWidth:zw*.9-fontSize*1.2,maxHeight:fontSize*2.1,spacing:.04,maxLines:2});
  const out=fit.lines.map((line,k)=>{
   setFont(measure,800,fit.font,0);const chars=[...line],sp=fit.font*.05,widths=chars.map(c=>measure.measureText(c).width+sp),tw=widths.reduce((a,b)=>a+b,0)-sp;
   const h=fit.font*1.6,px=fit.font*.62,w=tw+px*2,c=layer(w,h),hot=layer(w,h),g=c.getContext('2d'),gh=hot.getContext('2d'),r=random(seed+k*977);
   g.beginPath();g.moveTo(h*.07,0);g.lineTo(w,0);g.lineTo(w-h*.09,h);g.lineTo(0,h);g.closePath();
   const f=g.createLinearGradient(0,0,0,h);f.addColorStop(0,rgba(mix(color,[255,255,255],.22)));f.addColorStop(.18,rgba(color));f.addColorStop(.8,rgba(mix(color,[0,0,0],.18)));f.addColorStop(1,rgba(mix(color,[0,0,0],.4)));g.fillStyle=f;g.fill();
   g.save();g.clip();g.globalAlpha=.6;g.fillStyle=g.createPattern(paperTile,'repeat');g.fillRect(0,0,w,h);g.globalAlpha=1;g.fillStyle='rgba(255,255,255,.14)';g.fillRect(0,h*.06,w,h*.16);g.restore();
   let x=px;
   for(let n=0;n<chars.length;n++){
    const jy=(r()-.5)*fit.font*.06,rot=(r()-.5)*.035,cx=x+widths[n]/2-sp/2,cy=h*.53+jy;
    for(const [ctx2,fill,shadow] of [[g,'rgba(255,255,255,.58)',true],[gh,'#ffffff',false]]){ctx2.save();ctx2.translate(cx,cy);ctx2.rotate(rot);setFont(ctx2,800,fit.font,0);ctx2.textAlign='center';ctx2.textBaseline='middle';
     if(shadow){ctx2.fillStyle='rgba(0,0,0,.38)';ctx2.fillText(chars[n],fit.font*.025,fit.font*.04);}ctx2.fillStyle=fill;ctx2.fillText(chars[n],0,0);ctx2.restore();}
    x+=widths[n];
   }
   return {c,hot,w,h,px,tw};
  });
  const gapY=fontSize*.16;return {lines:out,h:out.reduce((a,l)=>a+l.h,0)+gapY*(out.length-1),gapY,tw:out.reduce((a,l)=>a+l.tw,0)};
 }
 const dymo=(i,n)=>strips(vocal?`${i}:${n}`:`t${n}`,()=>{
  if(!vocal){const art=base.art(n);return makeStrips(`${sideLabel(n)}  ${tracks[n].title||''}`,hsl(art.hue,.56,.33),hash(`t${n}`));}
  if(n<0)return makeStrips(tracks[i].title||'',[30,31,35],hash(`title${i}`));
  return makeStrips(tracks[i].cues[n].text||'',hsl(base.art(i).hue,.56,.33),hash(`${i}:${n}`));
 });
 function drawStrips(ctx,set,cx,top,scale,alpha,rot,wipe){
  if(alpha<=.01)return;let y=top,done=wipe*set.tw;
  for(const s of set.lines){
   ctx.save();ctx.globalAlpha=alpha;ctx.translate(cx,y+s.h*scale/2);ctx.rotate(rot);ctx.scale(scale,scale);
   drawShadow(ctx,stripShadow,-s.w/2,-s.h/2,s.w,s.h,{offsetY:.1,spread:1.18,alpha:.9});
   ctx.drawImage(s.c,-s.w/2,-s.h/2);
   const part=clamp(done/s.tw,0,1);done-=s.tw;
   if(part>0){ctx.beginPath();ctx.rect(-s.w/2,-s.h/2,part>=1?s.w:s.px+s.tw*part,s.h);ctx.clip();ctx.drawImage(s.hot,-s.w/2,-s.h/2);}
   ctx.restore();y+=(s.h+set.gapY)*scale;
  }
 }
 // Stack layout when line k is current: current full size, the next one small below, the rest hidden.
 function slot(n,k,i,count){
  const cur=dymo(i,k),nxt=k+1<count?dymo(i,k+1):null,stackH=cur.h+(nxt?fontSize*.5+nxt.h*nextScale:0),top=zy+(zh-stackH)/2;
  if(n===k)return {top,scale:1,alpha:1};
  if(n===k+1)return {top:top+cur.h+fontSize*.5,scale:nextScale,alpha:.55};
  if(n<k)return {top:top-dymo(i,n).h*nextScale-fontSize*.6,scale:nextScale,alpha:0};
  return {top:top+cur.h+fontSize*.5+(nxt?nxt.h*nextScale:0)+fontSize*.4,scale:nextScale*.8,alpha:0};
 }

 function draw(ctx,time){
  const s=base.at(time),{i,local}=s,art=base.art(i),dur=s.duration||1;
  // Desk: the song's deep tone under a warm lamp, fine grain.
  const desk=mix(art.deep,[24,22,21],.55);ctx.fillStyle=rgba(desk);ctx.fillRect(0,0,W,H);
  radialGlow(ctx,W*(portrait?.5:.32),H*(portrait?.22:.3),u*1.1,mix(art.glow,[255,214,170],.6),.14);radialGlow(ctx,W*(portrait?.5:.78),H*(portrait?.82:.42),u*.8,art.glow,.07);
  ctx.globalAlpha=.9;ctx.drawImage(grain,0,0);ctx.globalAlpha=1;
  // Deck.
  drawShadow(ctx,shadow,dx,dy,dw,dh,{alpha:.9,offsetY:.04,spread:1.08});ctx.drawImage(deck,dx-u*.02,dy-u*.02);
  // Tape transport: runs between insertion and eject, constant tape speed.
  const run=Math.max(1,dur-1.6),played=clamp(local-.95,0,run),p=played/run,b=R.max*R.max-R.min*R.min;
  const rl=Math.sqrt(R.max*R.max-b*p),rr=Math.sqrt(R.min*R.min+b*p),v=cw*TAU*.5*.135,k=2*v*run/b,thL=-k*(R.max-rl),thR=-k*(rr-R.min);
  const lift=1-Math.min(s.enter,s.exit),playing=local>.95&&played<run&&lift<.05;
  // Counter: take-up reel turns, rolling like an odometer.
  const count=k*(rr-R.min)/TAU,snap=Math.floor(count)+easeInOut((count%1-.7)/.3),[mx,my]=meter,inset=mh*.15,dyc=(mh-cell)/2;
  ctx.save();ctx.beginPath();ctx.rect(mx+inset,my+dyc,digitW*3,cell);ctx.clip();
  [Math.floor(count/100)%10+Math.max(0,snap%100-99),Math.floor(count/10)%10+Math.max(0,snap%10-9),snap%10].forEach((d,n)=>ctx.drawImage(drum,0,d*cell,digitW,cell,mx+inset+n*digitW,my+dyc,digitW,cell));
  const cyl=ctx.createLinearGradient(0,my+dyc,0,my+dyc+cell);cyl.addColorStop(0,'rgba(0,0,0,.7)');cyl.addColorStop(.3,'rgba(0,0,0,0)');cyl.addColorStop(.7,'rgba(0,0,0,0)');cyl.addColorStop(1,'rgba(0,0,0,.7)');ctx.fillStyle=cyl;ctx.fillRect(mx+inset,my+dyc,digitW*3,cell);ctx.restore();
  // LED level display: the measured spectrum lit through the cell grid.
  const [lx,ly,lw,lh]=led;
  if(s.frame){const g=ledLayer.getContext('2d');g.clearRect(0,0,lw,lh);const kind=LINEAR.includes(base.options.spectrum)?base.options.spectrum:'blocks';
   drawSpectrum(g,{kind,bins:s.frame.bins.map(v=>Math.min(1,v*1.3)),waveform:s.frame.waveform,color:base.options.color,tint:[255,255,255],alpha:1,amp:1,x:lh*.12,y:lh*.1,width:lw-lh*.24,height:lh*.8});
   if(base.options.color==='mono'||!base.options.color){g.globalCompositeOperation='source-in';const f=g.createLinearGradient(0,lh,0,0);f.addColorStop(0,'#5dff9a');f.addColorStop(.6,'#c8ff5a');f.addColorStop(.8,'#ffc23d');f.addColorStop(1,'#ff4a3a');g.fillStyle=f;g.fillRect(0,0,lw,lh);g.globalCompositeOperation='source-over';}
   ctx.globalAlpha=.95*(1-lift*.7);ctx.drawImage(ledLayer,lx,ly);ctx.globalAlpha=1;}
  ctx.drawImage(ledGlass,lx,ly);
  // Transport lamp and time.
  const [ax,ay,aw,ah]=lamp,lampOn=playing?1:.15+.15*Math.max(0,Math.sin(local*12));
  radialGlow(ctx,ax+ah*.42,ay+ah*.32,ah*.38,[110,255,150],.5*lampOn);ctx.fillStyle=rgba(mix([30,60,40],[150,255,180],lampOn));ctx.beginPath();ctx.arc(ax+ah*.42,ay+ah*.32,ah*.08,0,TAU);ctx.fill();
  text(ctx,playing?'PLAY':local<dur/2?'LOAD':'EJECT',ax+ah*.66,ay+ah*.33,{size:ah*.2,weight:800,color:playing?'#bfffd0':'rgba(225,230,238,.55)',spacing:.2,baseline:'middle'});
  text(ctx,`${stamp(local)} / ${stamp(dur)}`,ax+ah*.3,ay+ah*.7,{size:ah*.22,weight:700,color:'rgba(235,238,242,.86)',baseline:'middle',maxWidth:aw-ah*.4});
  // Cassette: pops out toward the viewer between songs, drops back with the new tape.
  const sc=1+lift*.05,ox=casX+cw/2,oy=casY+ch/2-lift*ch*.07;
  drawShadow(ctx,shadow,ox-cw/2,oy-ch/2,cw,ch,{alpha:.75+lift*.25,offsetY:.03+lift*.1,spread:1.08+lift*.08});
  ctx.save();ctx.translate(ox,oy);ctx.scale(sc,sc);ctx.translate(-cw/2,-ch/2);
  ctx.drawImage(back,0,0);
  ctx.drawImage(pack,R.lx-rl,R.y-rl,rl*2,rl*2);ctx.drawImage(pack,R.rx-rr,R.y-rr,rr*2,rr*2);
  // Tape path from the supply pack, along the guides, onto the take-up pack.
  ctx.strokeStyle='#3a291f';ctx.lineWidth=Math.max(1.2,cw*.0045);ctx.beginPath();ctx.moveTo(R.lx-rl*.7,R.y+rl*.71);ctx.lineTo(cw*.1,rollerY+cw*.012);ctx.lineTo(cw*.9,rollerY+cw*.012);ctx.lineTo(R.rx+rr*.7,R.y+rr*.71);ctx.stroke();
  const seed=i*1.7;for(const [x,a] of [[R.lx,thL+seed],[R.rx,thR+seed*1.3]]){ctx.save();ctx.translate(x,R.y);ctx.rotate(a);ctx.drawImage(hub,-R.min,-R.min);ctx.restore();}
  ctx.drawImage(front,0,0);
  ctx.drawImage(label(i),labelBox[0],labelBox[1]);
  ctx.drawImage(gloss,0,0);ctx.restore();

  // J-card: lies on the desk, the playing song marked with a highlighter.
  const swap=i>0?easeInOut(local/.55):1;
  drawShadow(ctx,shadow,jx,jy,jw,jh,{alpha:.7,offsetY:.025,spread:1.06});
  ctx.save();ctx.translate(jx+jw/2,jy+jh/2);ctx.rotate(tilt);ctx.translate(-jw/2,-jh/2);
  if(swap<1)ctx.drawImage(card(i-1),0,0);ctx.globalAlpha=swap;ctx.drawImage(card(i),0,0);ctx.globalAlpha=1;
  const [hx,hy,hw,hh,visible]=rowRect(i,i),mark=easeOut((local-.5)/.9);
  if(visible&&mark>0){ctx.save();ctx.globalCompositeOperation='multiply';ctx.fillStyle='rgba(255,224,64,.82)';ctx.beginPath();const x0=hx-rowH*.1,x1=x0+(hw+rowH*.2)*mark;ctx.moveTo(x0,hy+hh*.14);ctx.lineTo(x1,hy+hh*.1);ctx.lineTo(x1-rowH*.06,hy+hh*.92);ctx.lineTo(x0+rowH*.04,hy+hh*.95);ctx.closePath();ctx.fill();ctx.restore();}
  ctx.restore();

  // Label-maker strips: lyrics (or the tape's songs) stuck on the desk, the sung part brighter.
  const fade=Math.min(s.enter,s.exit);
  if(vocal){
   const cues=s.track.cues||[],{index,ease}=base.rollState(s),line=base.lineState(s),from=Math.max(-1,index-1),cur=Math.max(-1,index);
   for(let n=Math.max(-1,cur-1);n<=Math.min(cues.length-1,cur+2);n++){
    const a=slot(n,from,i,cues.length),b=slot(n,cur,i,cues.length),e=index<0?1:ease;
    const top=lerp(a.top,b.top,e),scale=lerp(a.scale,b.scale,e),alpha=lerp(a.alpha,b.alpha,e)*fade;
    const wipe=n<0||n<line.index?1:n===line.index?line.progress:0;
    drawStrips(ctx,dymo(i,n),W/2+(n%2?1:-1)*zw*.004,top,scale,alpha,(hash(`${i}r${n}`)%7-3)*.0025,wipe);
   }
  }else{
   const {ease}=base.rollState(s),from=Math.max(0,i-1);
   for(let n=Math.max(0,i-1);n<=Math.min(N-1,i+2);n++){
    const a=slot(n,i>0?from:i,i,N),b=slot(n,i,i,N),e=i>0?ease:1;
    drawStrips(ctx,dymo(i,n),W/2+(n%2?1:-1)*zw*.004,lerp(a.top,b.top,e),lerp(a.scale,b.scale,e),lerp(a.alpha,b.alpha,e)*(n===i?1:fade),(hash(`r${n}`)%7-3)*.0025,n<i?1:n===i?s.progress:0);
   }
  }
  vignette(ctx,W,H,{alpha:.42,inner:.55});
 }
 return {draw,duration:base.total};
}

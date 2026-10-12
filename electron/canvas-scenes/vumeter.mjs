import {sceneBase,layer,rgba,mix,hash,random,clamp,lerp,easeOut,easeInOut,text,fitText,drawBlock,setFont,drawSpectrum,shadowSprite,drawShadow,stamp,radialGlow} from '../canvas-kit.mjs';

/**
 * 스튜디오 콘솔 (instrumental): a recording console. Two backlit VU meters swing with the music (needles
 * with weight: they average the last few hundred milliseconds and overshoot a little), a spectrum
 * analyzer and a timecode LCD sit in the meter bridge. Every song is a channel strip with its title on
 * the scribble strip; the playing channel lights up and its fader is pushed up while the previous one
 * is pulled down. Long playlists page through banks of channels.
 */
const TAU=Math.PI*2;
const LINEAR=['bars','round-bars','mirror','blocks','dots','reflection','wave','double-wave','area','mirror-area','ribbon'];
function lru(limit){const m=new Map();return (key,make)=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make();m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};}
function brushed(g,x,y,w,h,seed,amount=1){const r=random(seed);g.save();g.beginPath();g.rect(x,y,w,h);g.clip();g.lineWidth=1;for(let k=0;k<h*1.2;k++){const yy=y+r()*h,xx=x-w*.2+r()*w;g.strokeStyle=r()<.5?`rgba(255,255,255,${r()*.05*amount})`:`rgba(0,0,0,${r()*.07*amount})`;g.beginPath();g.moveTo(xx,yy);g.lineTo(xx+w*(.1+r()*.6),yy);g.stroke();}g.restore();}
// Seven-segment digits: segments a..g as [x0,y0,x1,y1] in a 1 x 2 box.
const SEG={a:[.12,0,.88,0],b:[1,.08,1,.92],c:[1,1.08,1,1.92],d:[.12,2,.88,2],e:[0,1.08,0,1.92],f:[0,.08,0,.92],g:[.12,1,.88,1]};
const DIGITS=['abcdef','bc','abged','abgcd','fgbc','afgcd','afgedc','abc','abcdefg','abcdfg'];
function segDigit(w,h,lit,{on,ghost}){
 const c=layer(w,h),g=c.getContext('2d'),sx=w*.62,sy=h*.42,ox=w*.2,oy=h*.08,th=Math.max(2,w*.14);g.lineCap='round';g.lineWidth=th;
 g.translate(ox,oy);g.transform(1,0,-.1,1,sy*.2,0);
 for(const [name,[x0,y0,x1,y1]] of Object.entries(SEG)){g.strokeStyle=lit.includes(name)?on:ghost;g.beginPath();g.moveTo(x0*sx,y0*sy);g.lineTo(x1*sx,y1*sy);g.stroke();}
 return c;
}

export default function vumeter(input){
 const base=sceneBase(input,{hue:205}),{width:W,height:H,portrait,u,tracks}=base,N=tracks.length,fps=base.fps||30;
 const P=portrait?5:8,banks=Math.max(1,Math.ceil(N/P));
 const B=portrait?[u*.03,H*.03,u*.94,H*.37]:[W*.03,H*.04,W*.94,H*.35];
 const S=portrait?[u*.03,H*.415,u*.94,H*.49]:[W*.03,H*.405,W*.94,H*.495];
 const [bx,by,bw,bh]=B,[stx,sty,stw,sth]=S,sw=stw/P,rail=bh*(portrait?.085:.13),gap=u*.018;
 const shadow=shadowSprite(256,{alpha:.75}),measure=layer(8,8).getContext('2d');
 // Bridge modules.
 let vuL,vuR,spec,lcd;
 if(portrait){const top=by+rail+gap,vw=(bw-gap*3)/2,vh=Math.min(vw/1.32,bh*.4);vuL=[bx+gap,top,vw,vh];vuR=[bx+gap*2+vw,top,vw,vh];spec=[bx+gap,top+vh+gap,bw-gap*2,bh*.17];lcd=[bx+gap,spec[1]+spec[3]+gap,bw-gap*2,by+bh-gap-(spec[1]+spec[3]+gap)];}
 else{const top=by+rail+gap,mh=bh-rail-gap*2,vw=mh*1.3,lw=(bw-gap*5-vw*2)*.4;vuL=[bx+gap,top,vw,mh];vuR=[bx+gap*2+vw,top,vw,mh];spec=[bx+gap*3+vw*2,top,bw-gap*5-vw*2-lw,mh];lcd=[spec[0]+spec[2]+gap,top,lw,mh];}
 // Strip rows (fractions of the strip height).
 const row={num:.022,scribble:[.045,.15],knobs:[.21,.29,.37,.45],knobR:Math.min(sw*.13,sth*.031),buttons:[.505,.545],fader:[.6,.965]};
 const fTop=sty+sth*row.fader[0],fLen=sth*(row.fader[1]-row.fader[0]),capW=sw*.4,capH=Math.min(sw*.2,fLen*.085);
 const faderY=pos=>fTop+capH/2+(1-pos)*(fLen-capH);
 const DB=[[10,1],[5,.875],[0,.75],[-5,.64],[-10,.53],[-20,.37],[-30,.24],[-40,.13],[-Infinity,0]];

 // ---- Static scene: wall, console frame, bridge panels, armrest ------------------------------------
 const scene=layer(W,H);{
  const g=scene.getContext('2d'),wall=g.createLinearGradient(0,0,0,H);wall.addColorStop(0,'#0f1218');wall.addColorStop(1,'#07080b');g.fillStyle=wall;g.fillRect(0,0,W,H);
  const r=random(hash('panels'));for(let x=0;x<W;x+=u*.12){g.fillStyle=`rgba(255,255,255,${.012+r()*.012})`;g.fillRect(x,0,u*.118,by+bh*.4);g.fillStyle='rgba(0,0,0,.4)';g.fillRect(x+u*.118,0,u*.002,by+bh*.4);}
  // Console body behind both sections.
  drawShadow(g,shadow,bx-u*.01,by,bw+u*.02,sty+sth-by,{alpha:.9,offsetY:.02,spread:1.04});
  const body=g.createLinearGradient(0,by,0,H);body.addColorStop(0,'#1d2026');body.addColorStop(1,'#121418');g.fillStyle=body;g.beginPath();g.roundRect(bx-u*.012,by-u*.006,bw+u*.024,H,u*.014);g.fill();
  // Meter bridge: dark powder-coat with a brushed aluminium rail.
  const br=g.createLinearGradient(0,by,0,by+bh);br.addColorStop(0,'#2a2e35');br.addColorStop(1,'#1a1d22');g.fillStyle=br;g.beginPath();g.roundRect(bx,by,bw,bh,u*.01);g.fill();
  const rl=g.createLinearGradient(0,by,0,by+rail);rl.addColorStop(0,'#c9ced6');rl.addColorStop(.5,'#9aa1ab');rl.addColorStop(1,'#6f7680');g.fillStyle=rl;g.beginPath();g.roundRect(bx,by,bw,rail,[u*.01,u*.01,0,0]);g.fill();brushed(g,bx,by,bw,rail,hash('rail'),2.2);
  g.fillStyle='rgba(0,0,0,.45)';g.fillRect(bx,by+rail,bw,Math.max(1,u*.002));
  const mod=([x,y,w,h])=>{g.fillStyle='rgba(0,0,0,.6)';g.beginPath();g.roundRect(x-u*.004,y-u*.004,w+u*.008,h+u*.008,u*.008);g.fill();g.strokeStyle='rgba(255,255,255,.08)';g.lineWidth=1;g.stroke();};
  [vuL,vuR,spec,lcd].forEach(mod);
  for(const [x,y] of [[bx+u*.012,by+bh-u*.012],[bx+bw-u*.012,by+bh-u*.012]]){g.fillStyle='#8c939d';g.beginPath();g.arc(x,y,u*.005,0,TAU);g.fill();}
  // Channel section frame and the padded armrest.
  const sf=g.createLinearGradient(0,sty,0,sty+sth);sf.addColorStop(0,'#323a47');sf.addColorStop(1,'#262c36');g.fillStyle=sf;g.fillRect(stx,sty,stw,sth);
  const ay=sty+sth+u*.008,ah=Math.min(H-ay-u*.004,u*.07);
  const arm=g.createLinearGradient(0,ay,0,ay+ah);arm.addColorStop(0,'#3a3634');arm.addColorStop(.35,'#1e1b1a');arm.addColorStop(1,'#0c0b0b');g.fillStyle=arm;g.beginPath();g.roundRect(bx-u*.012,ay,bw+u*.024,ah,ah*.45);g.fill();
  g.save();g.clip();const lr=random(hash('leather'));for(let k=0;k<bw*ah/60;k++){g.fillStyle=`rgba(255,255,255,${lr()*.035})`;g.fillRect(bx+lr()*bw,ay+lr()*ah,1.5,1.5);}g.restore();
  g.setLineDash([u*.008,u*.006]);g.strokeStyle='rgba(255,255,255,.14)';g.lineWidth=Math.max(1,u*.0012);g.beginPath();g.moveTo(bx,ay+ah*.22);g.lineTo(bx+bw,ay+ah*.22);g.stroke();g.setLineDash([]);
 }
 // VU meter faces.
 function vuFace(w,h,label){
  const c=layer(w,h),g=c.getContext('2d'),f=g.createRadialGradient(w/2,h*.35,0,w/2,h*.5,w*.75);f.addColorStop(0,'#fff3c8');f.addColorStop(.7,'#efd796');f.addColorStop(1,'#c9a95c');g.fillStyle=f;g.fillRect(0,0,w,h);
  const cx=w/2,cy=h*1.02,R=h*.82,a0=-Math.PI/2-.86,a1=-Math.PI/2+.86,at=p=>lerp(a0,a1,p),vu=d=>(Math.pow(10,d/20)-.1)/(Math.pow(10,3/20)-.1);
  g.strokeStyle='#2a2216';g.lineWidth=Math.max(1,h*.008);g.beginPath();g.arc(cx,cy,R,at(0),at(vu(0)));g.stroke();
  g.strokeStyle='#c4231a';g.lineWidth=Math.max(3,h*.03);g.beginPath();g.arc(cx,cy,R+h*.012,at(vu(0)),at(1));g.stroke();
  for(const d of [-20,-10,-7,-5,-3,-2,-1,0,1,2,3]){const a=at(vu(d)),red=d>0;g.strokeStyle=red?'#c4231a':'#2a2216';g.lineWidth=Math.max(1,h*.01);g.beginPath();g.moveTo(cx+Math.cos(a)*R,cy+Math.sin(a)*R);g.lineTo(cx+Math.cos(a)*(R+h*.06),cy+Math.sin(a)*(R+h*.06));g.stroke();
   text(g,d>0?`+${d}`:String(Math.abs(d)),cx+Math.cos(a)*(R+h*.13),cy+Math.sin(a)*(R+h*.13),{size:h*.075,weight:700,color:red?'#c4231a':'#2a2216',align:'center',baseline:'middle'});}
  for(let p=0;p<=10;p++){const a=at(p/10*.686);g.strokeStyle='#2a2216';g.lineWidth=Math.max(1,h*.006);g.beginPath();g.moveTo(cx+Math.cos(a)*(R-h*.05),cy+Math.sin(a)*(R-h*.05));g.lineTo(cx+Math.cos(a)*R,cy+Math.sin(a)*R);g.stroke();}
  text(g,'VU',w/2,h*.6,{size:h*.16,weight:800,color:'#2a2216',align:'center',baseline:'middle',spacing:.06});
  text(g,label,w*.08,h*.88,{size:h*.075,weight:800,color:'#5a4a2c',baseline:'middle'});text(g,'−   +',w*.92,h*.88,{size:h*.075,weight:800,color:'#5a4a2c',align:'right',baseline:'middle'});
  const sh=g.createLinearGradient(0,0,0,h);sh.addColorStop(0,'rgba(0,0,0,.25)');sh.addColorStop(.1,'rgba(0,0,0,0)');sh.addColorStop(.85,'rgba(0,0,0,0)');sh.addColorStop(1,'rgba(0,0,0,.35)');g.fillStyle=sh;g.fillRect(0,0,w,h);
  return {c,cx,cy,R,at};
 }
 const faces=[vuFace(vuL[2],vuL[3],'L'),vuFace(vuR[2],vuR[3],'R')];
 const vuGlass=layer(vuL[2],vuL[3]);{const [,,w,h]=vuL,g=vuGlass.getContext('2d'),f=g.createLinearGradient(0,0,w*.6,h);f.addColorStop(0,'rgba(255,255,255,.22)');f.addColorStop(.35,'rgba(255,255,255,.04)');f.addColorStop(.36,'rgba(255,255,255,0)');g.fillStyle=f;g.fillRect(0,0,w,h);
  g.fillStyle='#16181c';g.beginPath();g.ellipse(w/2,h*1.02,w*.14,h*.13,0,0,TAU);g.fill();g.strokeStyle='rgba(0,0,0,.6)';g.lineWidth=Math.max(2,u*.004);g.strokeRect(0,0,w,h);}
 const specGrid=layer(spec[2],spec[3]);
 const specBox=[spec[2]*.05,spec[3]*.16,spec[2]*.9,spec[3]*.62];
 {const [,,w,h]=spec,g=specGrid.getContext('2d'),[gx,gy,gw,gh]=specBox;g.strokeStyle='rgba(120,220,255,.12)';g.lineWidth=1;
  for(let k=0;k<=4;k++){const y=gy+gh*k/4;g.beginPath();g.moveTo(gx,y);g.lineTo(gx+gw,y);g.stroke();}
  for(const [hz,label] of [[50,'50'],[100,'100'],[250,'250'],[500,'500'],[1000,'1k'],[2500,'2.5k'],[5000,'5k']]){const b=64*Math.log2(hz/11.7)/9,x=gx+(b-8+.5)/56*gw;if(x<gx||x>gx+gw)continue;g.beginPath();g.moveTo(x,gy);g.lineTo(x,gy+gh);g.stroke();text(g,label,x,gy+gh+h*.08,{size:Math.max(h*.065,u*.012),weight:700,color:'rgba(150,220,245,.6)',align:'center',baseline:'middle'});}
  text(g,'SPECTRUM ANALYZER',gx,h*.08,{size:Math.max(h*.065,u*.012),weight:800,color:'rgba(150,220,245,.7)',spacing:.25,baseline:'middle'});text(g,'Hz',gx+gw,h*.08,{size:Math.max(h*.065,u*.012),weight:700,color:'rgba(150,220,245,.6)',align:'right',baseline:'middle'});
  const sheen=g.createLinearGradient(0,0,0,h);sheen.addColorStop(0,'rgba(255,255,255,.07)');sheen.addColorStop(.4,'rgba(255,255,255,0)');g.fillStyle=sheen;g.fillRect(0,0,w,h);}
 // LCD: reflective yellow-green with dark segments.
 const [lx,ly,lw,lh]=lcd,lcdInk='#1d2414',lcdGhost='rgba(29,36,20,.09)';
 const tcH=portrait?Math.min(lh*.62,lw*.46/5.3):Math.min(lh*.26,lw*.88/5.3),dgW=tcH*.58,dgH=tcH,colW=tcH*.22;
 const digits=Array.from({length:10},(_,n)=>segDigit(dgW,dgH,DIGITS[n],{on:lcdInk,ghost:lcdGhost}));
 const tcW=dgW*8+colW*3;
 const lcdBack=layer(lw,lh);{const g=lcdBack.getContext('2d'),f=g.createLinearGradient(0,0,0,lh);f.addColorStop(0,'#b5c58f');f.addColorStop(1,'#93a46e');g.fillStyle=f;g.fillRect(0,0,lw,lh);
  const r=random(hash('lcd'));for(let k=0;k<lw*lh/90;k++){g.fillStyle=`rgba(0,0,0,${r()*.04})`;g.fillRect(r()*lw,r()*lh,1,1);}
  const sh=g.createLinearGradient(0,0,0,lh);sh.addColorStop(0,'rgba(0,0,0,.22)');sh.addColorStop(.12,'rgba(0,0,0,0)');g.fillStyle=sh;g.fillRect(0,0,lw,lh);}

 // ---- Channel banks --------------------------------------------------------------------------------
 const bankCache=lru(3);
 function makeBank(bank){
  const c=layer(stw,sth),g=c.getContext('2d');
  for(let k=0;k<P;k++){
   const ch=bank*P+k,x=k*sw,used=ch<N,r=random(hash(`strip${ch}`));
   const pf=g.createLinearGradient(x,0,x+sw,0);pf.addColorStop(0,'#3a4351');pf.addColorStop(.5,'#333b48');pf.addColorStop(1,'#2a313c');g.fillStyle=pf;g.fillRect(x,0,sw,sth);brushed(g,x,0,sw,sth,hash(`b${k}`),.8);
   g.fillStyle='rgba(0,0,0,.55)';g.fillRect(x+sw-Math.max(1,u*.002),0,Math.max(1,u*.002),sth);g.fillStyle='rgba(255,255,255,.07)';g.fillRect(x,0,Math.max(1,u*.0012),sth);
   // Channel number window and scribble strip.
   const nw=sw*.5,nh=sth*.032;g.fillStyle='#0c0d0f';g.beginPath();g.roundRect(x+(sw-nw)/2,sth*row.num-nh/2+sth*.004,nw,nh,u*.003);g.fill();
   text(g,used?`CH ${String(ch+1).padStart(2,'0')}`:'CH --',x+sw/2,sth*row.num+sth*.0045,{size:nh*.62,weight:800,color:'rgba(255,190,90,.22)',spacing:.12,align:'center',baseline:'middle'});
   const [s0,s1]=row.scribble,sx=x+sw*.07,sy=sth*s0,sW=sw*.86,sH=sth*(s1-s0);g.fillStyle='#e9e6dc';g.save();g.translate(sx+sW/2,sy+sH/2);g.rotate((r()-.5)*.025);g.fillRect(-sW/2,-sH/2,sW,sH);
   g.fillStyle='rgba(0,0,0,.05)';for(let n=0;n<sW;n+=3)g.fillRect(-sW/2+n,-sH/2,1,sH);
   if(used){const fit=fitText(measure,tracks[ch].title||'',{size:Math.min(sw*.1,sH*.3),minSize:Math.min(sw*.075,sH*.24),weight:800,lineHeight:1.15,maxWidth:sW*.88,maxHeight:sH*.84,spacing:-.01,maxLines:2});
    g.transform(1,0,-.12,1,0,0);drawBlock(g,fit,0,-fit.height/2,{color:'#1b2a6a',align:'center'});}
   else text(g,'—',0,0,{size:sH*.3,weight:700,color:'#9a978c',align:'center',baseline:'middle'});
   g.restore();
   // EQ and pan knobs.
   const caps=[['#c8382e','HF'],['#2f8f57','MF'],['#2f62b8','LF'],['#9aa0aa','PAN']];
   row.knobs.forEach((ky,n)=>{const cx=x+sw*.42,cy=sth*ky,R=row.knobR;
    for(let t=0;t<11;t++){const a=Math.PI*.75+t/10*Math.PI*1.5;g.fillStyle='rgba(230,235,242,.4)';g.fillRect(cx+Math.cos(a)*R*1.35-1,cy+Math.sin(a)*R*1.35-1,2,2);}
    g.fillStyle='rgba(0,0,0,.45)';g.beginPath();g.arc(cx+R*.08,cy+R*.16,R*1.02,0,TAU);g.fill();
    const k=g.createRadialGradient(cx-R*.3,cy-R*.35,0,cx,cy,R);k.addColorStop(0,'#5d636c');k.addColorStop(1,'#16181c');g.fillStyle=k;g.beginPath();g.arc(cx,cy,R,0,TAU);g.fill();
    g.fillStyle=caps[n][0];g.beginPath();g.arc(cx,cy,R*.55,0,TAU);g.fill();
    const a=Math.PI*(1.5+(used?(r()-.5)*1.1:0)),pr=R*.9;g.strokeStyle='#f2f2f2';g.lineWidth=Math.max(1.2,R*.12);g.lineCap='round';g.beginPath();g.moveTo(cx+Math.cos(a)*pr*.45,cy+Math.sin(a)*pr*.45);g.lineTo(cx+Math.cos(a)*pr,cy+Math.sin(a)*pr);g.stroke();
    text(g,caps[n][1],x+sw*.86,cy,{size:Math.min(sw*.07,R*.6),weight:800,color:'rgba(230,235,242,.6)',align:'center',baseline:'middle'});});
   // Buttons (lit per frame) and the fader slot with its scale.
   for(const [n,label] of [[0,'SEL'],[1,'MUTE']]){const bwid=sw*.36,bx2=x+sw*(n?.55:.09),by2=sth*row.buttons[0],bh2=sth*(row.buttons[1]-row.buttons[0]);g.fillStyle='rgba(0,0,0,.5)';g.fillRect(bx2+1,by2+2,bwid,bh2);g.fillStyle='#4a525e';g.beginPath();g.roundRect(bx2,by2,bwid,bh2,u*.003);g.fill();
    text(g,label,bx2+bwid/2,by2+bh2/2,{size:bh2*.38,weight:800,color:'rgba(230,235,242,.55)',align:'center',baseline:'middle',spacing:.1});}
   const slotX=x+sw*.44,y0=fTop-sty;g.fillStyle='#08090b';g.beginPath();g.roundRect(slotX-sw*.018,y0,sw*.036,fLen,sw*.018);g.fill();g.fillStyle='rgba(255,255,255,.08)';g.fillRect(slotX+sw*.018,y0,1,fLen);
   for(const [d,pos] of DB){const y=faderY(pos)-sty;g.fillStyle='rgba(230,235,242,.5)';g.fillRect(slotX-sw*.2,y,sw*.08,Math.max(1,u*.0012));text(g,d===-Infinity?'∞':String(Math.abs(d)),slotX-sw*.25,y,{size:Math.min(sw*.065,u*.013),weight:700,color:'rgba(230,235,242,.55)',align:'right',baseline:'middle'});}
   // Strip level meter (unlit cells).
   const mx=x+sw*.8,mw=sw*.07;for(let n=0;n<12;n++){const y=y0+fLen*(1-(n+1)/12)+fLen*.008;g.fillStyle=n>9?'rgba(255,60,50,.12)':n>7?'rgba(255,200,60,.12)':'rgba(90,255,140,.1)';g.fillRect(mx,y,mw,fLen/12-fLen*.016);}
  }
  return c;
 }
 const bankOf=b=>bankCache(b,()=>makeBank(b));
 const capSprite=layer(capW,capH*1.6);{const g=capSprite.getContext('2d'),f=g.createLinearGradient(0,0,0,capH);f.addColorStop(0,'#e7eaee');f.addColorStop(.45,'#9ba2ac');f.addColorStop(.5,'#2b2f35');f.addColorStop(.55,'#9ba2ac');f.addColorStop(1,'#59606a');g.fillStyle=f;g.beginPath();g.roundRect(0,0,capW,capH,capH*.18);g.fill();
  g.fillStyle='#ffffff';g.fillRect(capW*.08,capH*.47,capW*.84,Math.max(1.5,capH*.07));for(let n=1;n<5;n++){g.fillStyle='rgba(0,0,0,.18)';g.fillRect(0,capH*n/5,capW,1);}}

 function needle(ctx,box,face,p,peak){
  const [x,y,w,h]=box;ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.drawImage(face.c,x,y);
  radialGlow(ctx,x+w/2,y+h*.4,w*.7,[255,214,140],.12);
  const a=face.at(clamp(p,-.02,1.04)),cx=x+face.cx,cy=y+face.cy,len=face.R+h*.04;
  ctx.strokeStyle='rgba(0,0,0,.25)';ctx.lineWidth=Math.max(1.5,h*.012);ctx.beginPath();ctx.moveTo(cx+h*.02,cy);ctx.lineTo(cx+Math.cos(a)*len+h*.02,cy+Math.sin(a)*len+h*.025);ctx.stroke();
  ctx.strokeStyle='#14110c';ctx.lineWidth=Math.max(1.2,h*.009);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(a)*len,cy+Math.sin(a)*len);ctx.stroke();
  const lx2=x+w*.84,ly2=y+h*.64;ctx.fillStyle=peak?'#ff3b2f':'#5a1a14';ctx.beginPath();ctx.arc(lx2,ly2,h*.025,0,TAU);ctx.fill();if(peak)radialGlow(ctx,lx2,ly2,h*.09,[255,70,50],.6);
  text(ctx,'PEAK',lx2,ly2+h*.06,{size:h*.045,weight:800,color:'#5a4a2c',align:'center',baseline:'middle'});
  ctx.drawImage(vuGlass,x,y);ctx.restore();
 }
 function seg(ctx,value,x,y){let cx=x;for(const ch of value){if(ch===':'){ctx.fillStyle=lcdInk;const r=dgH*.05;ctx.fillRect(cx+colW*.3,y+dgH*.32,r*1.6,r*1.6);ctx.fillRect(cx+colW*.3-dgH*.04,y+dgH*.68,r*1.6,r*1.6);cx+=colW;}else{ctx.drawImage(digits[+ch],cx,y);cx+=dgW;}}}

 function draw(ctx,time){
  const s=base.at(time),{i,local}=s,dur=s.duration||1;
  ctx.drawImage(scene,0,0);
  // Rail: nameplate with the headline, bank indicator.
  const bank=Math.floor(i/P),first=bank*P;
  if(base.headline){const pw=Math.min(bw*.42,u*.62),ph=rail*.62,px=bx+gap,py=by+(rail-ph)/2;ctx.fillStyle='#16181c';ctx.beginPath();ctx.roundRect(px,py,pw,ph,ph*.2);ctx.fill();
   text(ctx,base.headline,px+ph*.4,py+ph*.54,{size:ph*.52,weight:800,color:'#e8ecf1',spacing:.16,baseline:'middle',maxWidth:pw-ph*.8});}
  text(ctx,`BANK ${bank+1}/${banks}  ·  CH ${String(first+1).padStart(2,'0')}–${String(Math.min(N,first+P)).padStart(2,'0')}`,bx+bw-gap,by+rail*.54,{size:rail*.3,weight:800,color:'#23262b',spacing:.14,align:'right',baseline:'middle'});
  // VU meters: needles with weight — an average of the recent envelope plus a little overshoot.
  const past=[0,.06,.12,.18,.24,.3].map(dt=>dt?base.at(Math.max(0,time-dt)).energy:s.energy),env=(k,e)=>e.level*.75+(k?e.high:e.low)*.25;
  for(const k of [0,1]){let sum=0,ws=0;past.forEach((e,n)=>{const w=Math.pow(.72,n);sum+=env(k,e)*w;ws+=w;});const now=env(k,past[0]),v=Math.max(0,sum/ws+(now-(env(k,past[2])+env(k,past[3]))/2)*.28);
   needle(ctx,k?vuR:vuL,faces[k],Math.pow(v,.6)*.92,now>.88);}
  // Spectrum analyzer.
  const [px,py,pw,ph]=spec;ctx.fillStyle='#050b10';ctx.fillRect(px,py,pw,ph);radialGlow(ctx,px+pw/2,py+ph/2,pw*.6,[60,160,220],.08);
  if(s.frame){const kind=LINEAR.includes(base.options.spectrum)?base.options.spectrum:'bars',[gx,gy,gw,gh]=specBox;drawSpectrum(ctx,{kind,bins:s.frame.bins.map(v=>Math.min(1,v*1.2)),waveform:s.frame.waveform,color:base.options.color,tint:[110,225,255],alpha:.92,x:px+gx,y:py+gy,width:gw,height:gh});}
  ctx.drawImage(specGrid,px,py);
  // LCD: SMPTE timecode, song number, title, position.
  ctx.drawImage(lcdBack,lx,ly);const lp=lw*.06,small=Math.min(lh*.075,u*.016),tc=`${String(Math.floor(local/3600)).padStart(2,'0')}${String(Math.floor(local/60)%60).padStart(2,'0')}${String(Math.floor(local)%60).padStart(2,'0')}${String(Math.floor((local%1)*fps)).padStart(2,'0')}`.replace(/(\d\d)(\d\d)(\d\d)(\d\d)/,'$1:$2:$3:$4');
  const fit=fitText(measure,tracks[i].title||'',{size:portrait?Math.min(lh*.2,u*.036):Math.min(lh*.13,u*.03),minSize:u*.018,weight:800,lineHeight:1.2,maxWidth:portrait?lw-tcW-lp*3:lw-lp*2,maxHeight:portrait?lh*.48:lh*.32,maxLines:2});
  if(portrait){const ty=ly+(lh-dgH)/2;seg(ctx,tc,lx+lp,ty);const tx=lx+lp*2+tcW;
   text(ctx,`SONG ${String(i+1).padStart(2,'0')} / ${String(N).padStart(2,'0')}`,tx,ly+lh*.2,{size:small,weight:800,color:lcdInk,spacing:.14,baseline:'middle'});drawBlock(ctx,fit,tx,ly+lh*.3,{color:lcdInk});
   ctx.fillStyle='rgba(29,36,20,.2)';ctx.fillRect(tx,ly+lh*.84,lx+lw-lp-tx,Math.max(2,lh*.03));ctx.fillStyle=lcdInk;ctx.fillRect(tx,ly+lh*.84,(lx+lw-lp-tx)*s.progress,Math.max(2,lh*.03));}
  else{text(ctx,'TIMECODE',lx+lp,ly+lh*.09,{size:small,weight:800,color:lcdInk,spacing:.2,baseline:'middle'});text(ctx,`SONG ${String(i+1).padStart(2,'0')} / ${String(N).padStart(2,'0')}`,lx+lw-lp,ly+lh*.09,{size:small,weight:800,color:lcdInk,spacing:.1,align:'right',baseline:'middle'});
   seg(ctx,tc,lx+(lw-tcW)/2,ly+lh*.17);ctx.fillStyle='rgba(29,36,20,.35)';ctx.fillRect(lx+lp,ly+lh*.5,lw-lp*2,1);
   drawBlock(ctx,fit,lx+lp,ly+lh*.54,{color:lcdInk});
   const yb=ly+lh*.9;ctx.fillStyle='rgba(29,36,20,.2)';ctx.fillRect(lx+lp,yb,lw-lp*2,Math.max(2,lh*.016));ctx.fillStyle=lcdInk;ctx.fillRect(lx+lp,yb,(lw-lp*2)*s.progress,Math.max(2,lh*.016));
   text(ctx,stamp(local),lx+lp,yb-lh*.045,{size:small,weight:700,color:lcdInk,baseline:'middle'});text(ctx,stamp(dur),lx+lw-lp,yb-lh*.045,{size:small,weight:700,color:lcdInk,align:'right',baseline:'middle'});}
  // Channel strips: the bank slides over when the playlist moves past it; faders crossfade.
  const prev=Math.max(0,i-1),prevBank=Math.floor(prev/P),slide=prevBank!==bank&&i>0?easeInOut(local/.85):1;
  const down=i>0?easeInOut(local/1.1):1,up=i>0?easeInOut((local-(prevBank!==bank?.75:.35))/1.1):easeInOut((local-.3)/1.1),litNew=easeOut((local-(i>0&&prevBank!==bank?.7:.3))/.5);
  ctx.save();ctx.beginPath();ctx.rect(stx,sty,stw,sth);ctx.clip();
  const drawBank=(b,ox)=>{
   ctx.drawImage(bankOf(b),stx+ox,sty);
   for(let k=0;k<P;k++){const ch=b*P+k,x=stx+ox+k*sw;if(ch>=N)continue;
    const cur=ch===i,was=i>0&&ch===prev,pos=cur?.75*up:was?.75*(1-down):0,lit=cur?litNew:was?1-easeOut(local/.4):0;
    if(lit>0){const nw=sw*.5,nh=sth*.032;text(ctx,`CH ${String(ch+1).padStart(2,'0')}`,x+sw/2,sty+sth*row.num+sth*.0045,{size:nh*.62,weight:800,color:'#ffbe5a',spacing:.12,align:'center',baseline:'middle',alpha:lit});radialGlow(ctx,x+sw/2,sty+sth*row.num,nw*.6,[255,170,60],.25*lit);
     const [s0,s1]=row.scribble;ctx.globalAlpha=.22*lit;ctx.fillStyle='#fff3d0';ctx.fillRect(x+sw*.05,sty+sth*s0-sth*.006,sw*.9,sth*(s1-s0)+sth*.012);ctx.globalAlpha=1;
     const bwid=sw*.36,by2=sty+sth*row.buttons[0],bh2=sth*(row.buttons[1]-row.buttons[0]),bx2=x+sw*.09;ctx.globalAlpha=lit;ctx.fillStyle='#5dff9a';ctx.beginPath();ctx.roundRect(bx2,by2,bwid,bh2,u*.003);ctx.fill();ctx.globalAlpha=1;
     radialGlow(ctx,bx2+bwid/2,by2+bh2/2,bwid*.9,[90,255,150],.35*lit);text(ctx,'SEL',bx2+bwid/2,by2+bh2/2,{size:bh2*.38,weight:800,color:'#0d2a18',align:'center',baseline:'middle',spacing:.1,alpha:lit});
     // Strip meter follows the music on the live channel.
     const lvl=clamp(s.energy.level*1.05,0,1)*lit,cells=Math.round(lvl*12),mx=x+sw*.8,mw=sw*.07,y0=fTop;
     for(let n=0;n<cells;n++){const y=y0+fLen*(1-(n+1)/12)+fLen*.008;ctx.fillStyle=n>9?'#ff4a3a':n>7?'#ffc23d':'#5dff9a';ctx.fillRect(mx,y,mw,fLen/12-fLen*.016);}}
    else{const bwid=sw*.36,by2=sty+sth*row.buttons[0],bh2=sth*(row.buttons[1]-row.buttons[0]),bx2=x+sw*.55;ctx.fillStyle='rgba(255,70,55,.32)';ctx.beginPath();ctx.roundRect(bx2,by2,bwid,bh2,u*.003);ctx.fill();text(ctx,'MUTE',bx2+bwid/2,by2+bh2/2,{size:bh2*.38,weight:800,color:'#2a0c08',align:'center',baseline:'middle',spacing:.1});}
    const fy=faderY(pos),fx=x+sw*.44-capW/2;drawShadow(ctx,shadow,fx,fy-capH/2,capW,capH,{alpha:.7,offsetY:.35,spread:1.3});ctx.drawImage(capSprite,fx,fy-capH/2);
   }
   for(let k=Math.max(0,N-b*P);k<P;k++){const x=stx+ox+k*sw,fy=faderY(0),fx=x+sw*.44-capW/2;ctx.globalAlpha=.6;ctx.drawImage(capSprite,fx,fy-capH/2);ctx.globalAlpha=1;}
  };
  if(slide<1)drawBank(prevBank,-slide*stw*(bank>prevBank?1:-1));
  drawBank(bank,(1-slide)*stw*(bank>prevBank||slide>=1?1:-1)*(slide<1?1:0));
  ctx.restore();
  ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(stx,sty,stw,Math.max(2,u*.003));
 }
 return {draw,duration:base.total};
}

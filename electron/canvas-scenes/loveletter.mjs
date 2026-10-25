import {sceneBase,drawSpectrum,fitText,setFont,ellipsize,stamp,rgba,layer,hash,random,clamp,lerp,easeOut,easeInOut,drawCover,shadowSprite} from '../canvas-kit.mjs';

/**
 * 러브 레터: a dark walnut desk at night lit by one candle whose flame wavers and whose light breathes
 * across the paper. Each song is a letter: a fountain pen writes "Dear, <title>" and then every lyric
 * line in slanted ink that is glossy while wet and dries to a muted burgundy; the nib follows the
 * stroke. A full sheet is laid aside under a fresh one. When the song ends the letter is folded in
 * thirds and slipped into the waiting envelope (with the album photo inside), the flap closes, and at
 * the next song a red heart wax seal is pressed before the envelope slides away.
 */
const lru=(limit,make)=>{const m=new Map();return key=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make(key);m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};};
const TAU=Math.PI*2,SLANT=-.17,DRY=1.7;
const INK=[110,30,54],WET=[34,2,30],GLOSS=[255,236,226],BURGUNDY=[132,30,50],GOLD=[156,108,40];

/** Candle flicker around 1: layered sines plus an occasional gutter dip. */
function flicker(t){
 const f=.55*Math.sin(t*9.3)+.3*Math.sin(t*15.1+1.3)+.15*Math.sin(t*27.7+.4);
 const slot=Math.floor(t/3.1),r=random(hash('gutter'+slot));let dip=0;
 if(r()<.32){const d=t-slot*3.1-r()*2.4;if(d>0&&d<.55)dip=Math.sin(d/.55*Math.PI)*.17;}
 return 1+f*.05-dip;
}
function heartPath(g,cx,cy,s){g.beginPath();g.moveTo(cx,cy+s*.62);g.bezierCurveTo(cx-s*.2,cy+s*.4,cx-s,cy+s*.02,cx-s*.92,cy-s*.38);g.bezierCurveTo(cx-s*.82,cy-s*.86,cx-s*.18,cy-s*.86,cx,cy-s*.42);g.bezierCurveTo(cx+s*.18,cy-s*.86,cx+s*.82,cy-s*.86,cx+s*.92,cy-s*.38);g.bezierCurveTo(cx+s,cy+s*.02,cx+s*.2,cy+s*.4,cx,cy+s*.62);g.closePath();}
function fibers(g,w,h,seed,count,dark=[110,80,50]){const r=random(hash(seed));for(let k=0;k<count;k++){const x=r()*w,y=r()*h,l=2+r()*7,a=r()*Math.PI;g.strokeStyle=r()<.55?`rgba(${dark},${.035+r()*.05})`:`rgba(255,255,248,${.08+r()*.12})`;g.lineWidth=.6+r()*.7;g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke();}}

export default function loveletter(input){
 const base=sceneBase(input,{hue:350}),{width:W,height:H,portrait,u,tracks}=base;
 const L=portrait
  ?{paper:[W*.5,H*.4,Math.round(W*.88),Math.round(H*.64),-.006],candle:[W*.17,H*.962,u*.14,u*.19],env:[W*.675,H*.888,W*.42,-.045],lyric:u*.06,off:[W*1.45,H*1.08]}
  :{paper:[W*.5,H*.5,Math.round(W*.46),Math.round(H*.9),-.008],candle:[W*.135,H*.75,u*.105,u*.2],env:[W*.858,H*.64,W*.2,.07],lyric:u*.05,off:[W*1.3,H*.82]};
 const [PX,PY,PW,PH,PA]=L.paper,LS=L.lyric,RULE=LS*1.72,TX=PW*.1,TW=PW*.8,R0=PH*.27,ROWS=Math.max(3,Math.floor((PH*.85-R0)/RULE)),HS=LS*1.08,HY=PH*.205;
 const ruleY=n=>R0+(n+1)*RULE,[CX,CY,CW,CH]=L.candle,FX=CX,FY=CY-CH-CW*.02;
 const EWC=PW*.8,EHC=EWC*.62,CENTER={x:PX,y:PY+EHC*.3,w:EWC,rot:0},REST={x:L.env[0],y:L.env[1],w:L.env[2],rot:L.env[3]},OFF={x:L.off[0],y:L.off[1],w:L.env[2],rot:.35};
 const LW=EWC*.86,LH=LW*(PH/3)/PW;
 const measure=layer(8,8).getContext('2d'),shadow=shadowSprite(256,{alpha:.7});

 // ---- Desk, light and vignette, painted once ---------------------------------------------------
 const desk=(()=>{
  const c=layer(W,H),g=c.getContext('2d'),r=random(hash('walnut'));
  const fill=g.createLinearGradient(0,0,W*.3,H);fill.addColorStop(0,'#26150d');fill.addColorStop(1,'#140a06');g.fillStyle=fill;g.fillRect(0,0,W,H);
  const step=Math.max(2,u*.0042);
  for(let y=-u*.05;y<H+u*.05;y+=step*(.5+r()*1.1)){
   const amp=u*(.003+r()*.014),freq=(1.2+r()*2.6)/W*TAU,ph=r()*TAU,light=r()<.34;
   g.strokeStyle=light?`rgba(156,98,60,${.035+r()*.06})`:`rgba(6,2,0,${.12+r()*.22})`;g.lineWidth=Math.max(.7,step*(.2+r()*.9));
   g.beginPath();for(let x=-W*.02;x<=W*1.02;x+=W/56){const yy=y+Math.sin(x*freq+ph)*amp+Math.sin(x*freq*3.3+ph*2)*amp*.28;x<0?g.moveTo(x,yy):g.lineTo(x,yy);}g.stroke();
  }
  const warm=g.createRadialGradient(FX,FY,0,FX,FY,u*1.25);warm.addColorStop(0,'rgba(255,150,70,.2)');warm.addColorStop(.45,'rgba(200,90,40,.06)');warm.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=warm;g.fillRect(0,0,W,H);
  const fall=g.createRadialGradient(FX,FY,u*.25,FX,FY,Math.hypot(W,H)*.9);fall.addColorStop(0,'rgba(0,0,0,0)');fall.addColorStop(1,'rgba(0,0,0,.72)');g.fillStyle=fall;g.fillRect(0,0,W,H);
  return c;
 })();
 const glow=(()=>{const q=4,c=layer(W/q,H/q),g=c.getContext('2d'),x=FX/q,y=FY/q,rad=u*1.05/q,o=g.createRadialGradient(x,y,0,x,y,rad);o.addColorStop(0,'rgba(255,176,96,.9)');o.addColorStop(.25,'rgba(255,140,70,.32)');o.addColorStop(1,'rgba(255,120,60,0)');g.fillStyle=o;g.fillRect(0,0,c.width,c.height);return c;})();
 const halo=(()=>{const c=layer(128,128),g=c.getContext('2d'),o=g.createRadialGradient(64,64,0,64,64,64);o.addColorStop(0,'rgba(255,214,150,.85)');o.addColorStop(.3,'rgba(255,160,80,.28)');o.addColorStop(1,'rgba(255,120,50,0)');g.fillStyle=o;g.fillRect(0,0,128,128);return c;})();
 // Candle falloff: everything away from the flame sinks into warm dark.
 const shade=(()=>{const c=layer(W,H),g=c.getContext('2d'),o=g.createRadialGradient(FX,FY,u*.15,FX,FY,Math.hypot(W,H)*.85);o.addColorStop(0,'rgba(20,8,2,0)');o.addColorStop(.35,'rgba(20,8,2,.22)');o.addColorStop(1,'rgba(14,5,1,.62)');g.fillStyle=o;g.fillRect(0,0,W,H);return c;})();
 const edge=(()=>{const c=layer(W,H),g=c.getContext('2d'),v=g.createRadialGradient(W/2,H/2,u*.42,W/2,H/2,Math.hypot(W,H)*.58);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(8,3,1,.5)');g.fillStyle=v;g.fillRect(0,0,W,H);return c;})();

 // ---- Candle: brass dish, ivory pillar with drips (the flame is drawn per frame) --------------------
 const candle=(()=>{
  const sw=Math.ceil(CW*2),sh=Math.ceil(CH+CW*.7),c=layer(sw,sh),g=c.getContext('2d'),bx=sw/2,by=sh-CW*.28,top=by-CH,rx=CW/2,ry=CW*.16;
  const dish=g.createLinearGradient(bx-CW,0,bx+CW,0);dish.addColorStop(0,'#3a2610');dish.addColorStop(.35,'#c99a4e');dish.addColorStop(.6,'#7a5420');dish.addColorStop(1,'#2a1a08');
  g.fillStyle='rgba(0,0,0,.5)';g.beginPath();g.ellipse(bx+CW*.12,by+CW*.12,CW*.98,CW*.26,0,0,TAU);g.fill();
  g.fillStyle=dish;g.beginPath();g.ellipse(bx,by+CW*.04,CW*.92,CW*.23,0,0,TAU);g.fill();g.fillStyle='rgba(30,18,6,.65)';g.beginPath();g.ellipse(bx,by,CW*.76,CW*.17,0,0,TAU);g.fill();
  const body=g.createLinearGradient(bx-rx,0,bx+rx,0);body.addColorStop(0,'#f6e8cc');body.addColorStop(.35,'#efdcb8');body.addColorStop(.75,'#bfa47c');body.addColorStop(1,'#7c6446');
  g.fillStyle=body;g.beginPath();g.moveTo(bx-rx,top);g.lineTo(bx-rx,by);g.ellipse(bx,by,rx,ry,0,Math.PI,0,true);g.lineTo(bx+rx,top);g.closePath();g.fill();
  const lit=g.createLinearGradient(0,top,0,top+CH*.45);lit.addColorStop(0,'rgba(255,190,110,.42)');lit.addColorStop(1,'rgba(255,190,110,0)');g.fillStyle=lit;g.fillRect(bx-rx,top,CW,CH*.45);
  const r=random(hash('drips'));for(let k=0;k<4;k++){const x=bx-rx*.8+r()*rx*1.4,len=CH*(.08+r()*.26),w=CW*(.05+r()*.05);g.fillStyle='rgba(250,240,220,.85)';g.beginPath();g.moveTo(x-w,top);g.lineTo(x-w*.8,top+len);g.arc(x,top+len,w*.85,Math.PI,0,true);g.lineTo(x+w,top);g.closePath();g.fill();g.fillStyle='rgba(120,90,60,.18)';g.fillRect(x+w*.4,top+ry,w*.4,len);}
  const pool=g.createRadialGradient(bx,top,0,bx,top,rx);pool.addColorStop(0,'#fff1cf');pool.addColorStop(.6,'#f1d7a4');pool.addColorStop(1,'#c9a676');g.fillStyle=pool;g.beginPath();g.ellipse(bx,top,rx,ry,0,0,TAU);g.fill();
  g.strokeStyle='rgba(255,250,236,.75)';g.lineWidth=Math.max(1,CW*.025);g.beginPath();g.ellipse(bx,top,rx*.97,ry*.92,0,Math.PI*.05,Math.PI*.95);g.stroke();
  g.strokeStyle='#1c120a';g.lineWidth=Math.max(1.2,CW*.03);g.lineCap='round';g.beginPath();g.moveTo(bx,top);g.quadraticCurveTo(bx+CW*.02,top-CW*.08,bx+CW*.035,top-CW*.13);g.stroke();
  return {c,x:CX-bx,y:CY-by};
 })();
 function drawFlame(ctx,t,fl){
  const sway=Math.sin(t*2.1)*.5+Math.sin(t*5.3+1)*.3+Math.sin(t*11.7)*.15,fh=CW*.62*fl*(1+.05*Math.sin(t*13.3)),fw=CW*.19,bx=FX+CW*.03,by=FY-CW*.1,tip=sway*fw*.55;
  ctx.globalCompositeOperation='lighter';ctx.globalAlpha=clamp(.55*fl,0,1);ctx.drawImage(halo,bx-CW*1.6+tip*.4,by-fh*.45-CW*1.6,CW*3.2,CW*3.2);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  const path=()=>{ctx.beginPath();ctx.moveTo(bx+tip,by-fh);ctx.bezierCurveTo(bx+tip*.4+fw*.55,by-fh*.55,bx+fw*.62,by-fh*.12,bx,by+fw*.36);ctx.bezierCurveTo(bx-fw*.62,by-fh*.12,bx+tip*.4-fw*.55,by-fh*.55,bx+tip,by-fh);ctx.closePath();};
  const o=ctx.createRadialGradient(bx,by-fh*.18,0,bx,by-fh*.3,fh*.78);o.addColorStop(0,'rgba(255,252,236,1)');o.addColorStop(.3,'rgba(255,224,140,.98)');o.addColorStop(.62,'rgba(250,150,50,.85)');o.addColorStop(1,'rgba(200,70,20,0)');ctx.fillStyle=o;path();ctx.fill();
  ctx.fillStyle='rgba(80,110,255,.4)';ctx.beginPath();ctx.ellipse(bx,by+fw*.05,fw*.32,fw*.3,0,0,TAU);ctx.fill();
 }

 // ---- Paper: cream sheet, fibers, faint rules, edge shade, the headline as letterhead -----------
 const paperSheet=(written)=>{
  const c=layer(PW,PH),g=c.getContext('2d'),fill=g.createLinearGradient(0,0,PW,PH);fill.addColorStop(0,'#f6ecd8');fill.addColorStop(1,'#e8d9bc');g.fillStyle=fill;g.fillRect(0,0,PW,PH);
  fibers(g,PW,PH,'paper'+written,Math.round(PW*PH/260));
  for(let n=0;n<ROWS;n++){g.fillStyle='rgba(176,118,112,.26)';g.fillRect(TX-PW*.02,ruleY(n),TW+PW*.04,Math.max(1,u*.0012));}
  for(const [x0,y0,x1,y1] of [[0,0,PW*.05,0],[PW,0,PW*.95,0],[0,0,0,PH*.04],[0,PH,0,PH*.96]]){const e=g.createLinearGradient(x0,y0,x1,y1);e.addColorStop(0,'rgba(110,70,36,.18)');e.addColorStop(1,'rgba(110,70,36,0)');g.fillStyle=e;g.fillRect(0,0,PW,PH);}
  const side=g.createLinearGradient(portrait?0:0,portrait?PH:0,portrait?PW*.3:PW,portrait?0:PH*.2);side.addColorStop(0,'rgba(255,214,160,.12)');side.addColorStop(1,'rgba(60,30,10,.1)');g.fillStyle=side;g.fillRect(0,0,PW,PH);
  if(written){const r=random(hash('scribble'));for(let n=0;n<ROWS;n++){let x=TX;const y=ruleY(n)-RULE*.28,end=TX+TW*(.55+r()*.42);g.strokeStyle='rgba(84,36,48,.22)';g.lineWidth=Math.max(1,LS*.07);g.beginPath();g.moveTo(x,y);while(x<end){x+=LS*(.3+r()*.4);g.lineTo(x,y-LS*(.15+r()*.45));}g.stroke();}}
  else if(base.headline){const size=Math.max(10,PW*.024);setFont(g,700,size,.34);g.textAlign='center';g.textBaseline='middle';g.fillStyle=rgba(BURGUNDY,.82);g.fillText(ellipsize(g,base.headline.toUpperCase(),PW*.7),PW/2,PH*.062);
   g.fillStyle=rgba(BURGUNDY,.45);for(const dy of [0,size*.22])g.fillRect(PW*.4,PH*.062+size*1.05+dy,PW*.2,Math.max(1,u*.001));heartPath(g,PW/2,PH*.062+size*1.95,size*.32);g.fill();}
  return c;
 };
 const paper=paperSheet(false),under=paperSheet(true);
 const back=(()=>{const c=layer(PW,Math.ceil(PH/3)),g=c.getContext('2d'),f=g.createLinearGradient(0,0,0,c.height);f.addColorStop(0,'#eadbbd');f.addColorStop(1,'#dccaa6');g.fillStyle=f;g.fillRect(0,0,PW,c.height);fibers(g,PW,c.height,'back',Math.round(PW*c.height/300));g.strokeStyle='rgba(120,84,50,.25)';g.lineWidth=Math.max(1,u*.0015);g.strokeRect(.5,.5,PW-1,c.height-1);return c;})();
 const sheetLayer=layer(PW,PH),sg=sheetLayer.getContext('2d');

 // ---- Pen: gold nib with slit and breather hole, black grip, burgundy lacquer barrel -------------
 const PL=u*.5,NW=u*.0125,A=.72;
 const pen=(()=>{
  const w=Math.ceil(PL),h=Math.ceil(NW*3.6),c=layer(w,h),g=c.getContext('2d'),n=PL*.12,s1=n+PL*.13,b0=s1+PL*.016;g.translate(0,h/2);
  const gold=g.createLinearGradient(0,-NW*1.1,0,NW*1.1);gold.addColorStop(0,'#fde9b0');gold.addColorStop(.38,'#d8a646');gold.addColorStop(.62,'#94661f');gold.addColorStop(1,'#e2bb68');
  g.beginPath();g.moveTo(0,0);g.quadraticCurveTo(n*.35,-NW*.32,n*.72,-NW*.95);g.quadraticCurveTo(n*.9,-NW*1.1,n,-NW*1.05);g.lineTo(n,NW*1.05);g.quadraticCurveTo(n*.9,NW*1.1,n*.72,NW*.95);g.quadraticCurveTo(n*.35,NW*.32,0,0);g.closePath();g.fillStyle=gold;g.fill();
  g.strokeStyle='rgba(60,34,6,.8)';g.lineWidth=Math.max(1,NW*.08);g.beginPath();g.moveTo(NW*.15,0);g.lineTo(n*.56,0);g.stroke();g.fillStyle='#3a2408';g.beginPath();g.arc(n*.6,0,NW*.14,0,TAU);g.fill();
  g.strokeStyle='rgba(110,70,20,.55)';g.lineWidth=Math.max(.6,NW*.05);g.beginPath();g.arc(n*.86,0,NW*.5,-1.1,1.1);g.stroke();
  const grip=g.createLinearGradient(0,-NW*1.4,0,NW*1.4);grip.addColorStop(0,'#09090a');grip.addColorStop(.24,'#55555c');grip.addColorStop(.4,'#141416');grip.addColorStop(1,'#040404');g.fillStyle=grip;g.beginPath();g.moveTo(n,-NW*1.12);g.lineTo(s1,-NW*1.36);g.lineTo(s1,NW*1.36);g.lineTo(n,NW*1.12);g.closePath();g.fill();
  g.fillStyle=gold;g.fillRect(s1,-NW*1.5,PL*.016,NW*3);
  const barrel=g.createLinearGradient(0,-NW*1.5,0,NW*1.5);barrel.addColorStop(0,'#2a0610');barrel.addColorStop(.2,'#a8304a');barrel.addColorStop(.34,'#5c0c1e');barrel.addColorStop(1,'#14030a');g.fillStyle=barrel;g.beginPath();g.roundRect(b0,-NW*1.46,PL-b0,NW*2.92,NW*.5);g.fill();
  g.fillStyle='rgba(255,226,226,.22)';g.fillRect(b0+PL*.02,-NW*1.02,PL-b0-PL*.04,NW*.16);
  return c;
 })();
 const penShadow=(()=>{const pad=Math.ceil(NW*2),c=layer(pen.width+pad*2,pen.height+pad*2),g=c.getContext('2d');g.filter=`blur(${NW*.55}px)`;g.drawImage(pen,pad,pad);g.filter='none';g.globalCompositeOperation='source-in';g.fillStyle='rgba(20,8,2,.42)';g.fillRect(0,0,c.width,c.height);return {c,pad};})();
 function drawPen(ctx,x,y,lift,fl){
  const k=1+.05*lift,off=u*(.006+.03*lift),sx=Math.sign(PX-FX)||1;
  ctx.save();ctx.translate(x+off*sx,y+off*1.3);ctx.rotate(A);ctx.scale(k,k);ctx.drawImage(penShadow.c,-penShadow.pad,-pen.height/2-penShadow.pad);ctx.restore();
  ctx.save();ctx.translate(x,y);ctx.rotate(A);ctx.scale(k,k);ctx.drawImage(pen,0,-pen.height/2);
  ctx.globalCompositeOperation='lighter';ctx.fillStyle=`rgba(255,220,150,${clamp(.22*(fl-.88)/.2,0,.3)})`;ctx.beginPath();ctx.ellipse(PL*.07,-NW*.45,PL*.035,NW*.14,0,0,TAU);ctx.fill();ctx.restore();
 }

 // ---- Wax seal and envelope ------------------------------------------------------------------------
 const seal=(()=>{
  const S=256,c=layer(S,S),g=c.getContext('2d'),R=S*.4,r=random(hash('wax'));g.translate(S/2,S/2);
  g.beginPath();for(let k=0;k<=36;k++){const a=k/36*TAU,rad=R*(1+.05*Math.sin(a*5+1)+.035*Math.sin(a*11)+(r()-.5)*.03);k?g.lineTo(Math.cos(a)*rad,Math.sin(a)*rad):g.moveTo(Math.cos(a)*rad,Math.sin(a)*rad);}g.closePath();
  const wax=g.createRadialGradient(-R*.35,-R*.35,R*.05,0,0,R*1.08);wax.addColorStop(0,'#d8394c');wax.addColorStop(.45,'#9c1428');wax.addColorStop(1,'#4a0510');g.fillStyle=wax;g.fill();
  g.lineWidth=S*.022;g.strokeStyle='rgba(40,0,6,.55)';g.beginPath();g.arc(S*.008,S*.01,R*.7,0,TAU);g.stroke();g.strokeStyle='rgba(255,140,150,.35)';g.beginPath();g.arc(-S*.006,-S*.008,R*.7,Math.PI*.9,Math.PI*1.7);g.stroke();
  heartPath(g,S*.01,S*.012,R*.4);g.fillStyle='rgba(50,0,8,.6)';g.fill();heartPath(g,-S*.006,-S*.006,R*.4);g.fillStyle='rgba(255,150,160,.5)';g.fill();heartPath(g,0,0,R*.4);const hf=g.createLinearGradient(-R*.4,-R*.4,R*.4,R*.4);hf.addColorStop(0,'#c22a40');hf.addColorStop(1,'#7c0c1e');g.fillStyle=hf;g.fill();
  return c;
 })();
 const glint=(()=>{const c=layer(64,64),g=c.getContext('2d'),o=g.createRadialGradient(32,32,0,32,32,32);o.addColorStop(0,'rgba(255,240,230,1)');o.addColorStop(.2,'rgba(255,190,190,.5)');o.addColorStop(1,'rgba(255,120,120,0)');g.fillStyle=o;g.fillRect(0,0,64,64);return c;})();
 const liner=(()=>{const c=layer(64,64),g=c.getContext('2d');g.fillStyle='#6a1426';g.fillRect(0,0,64,64);g.fillStyle='rgba(214,150,110,.28)';for(const [x,y] of [[16,16],[48,48]]){heartPath(g,x,y,7);g.fill();}g.strokeStyle='rgba(214,150,110,.16)';g.lineWidth=1;g.beginPath();g.moveTo(0,32);g.lineTo(32,0);g.moveTo(32,64);g.lineTo(64,32);g.stroke();return c;})();
 /** An envelope seen from its back: open (o=1) to closed (o=-1) flap, contents between lining and pocket. */
 function drawEnvelope(ctx,{x,y,w,rot,o=1,photo=null,inside=null,sealK=0,shine=0}){
  const h=w*.62,tipAt=o=>-h/2-h*.6*o;ctx.save();ctx.translate(x,y);ctx.rotate(rot);
  ctx.drawImage(shadow,-w*.62+w*.04,-h*.62+h*.08,w*1.24,h*1.24);
  const flap=()=>{const tip=tipAt(o);ctx.beginPath();ctx.moveTo(-w/2,-h/2);ctx.lineTo(-w*.07,tip+(tip+h/2)*-.06);ctx.quadraticCurveTo(0,tip,w*.07,tip+(tip+h/2)*-.06);ctx.lineTo(w/2,-h/2);ctx.closePath();};
  if(o>0){flap();ctx.fillStyle='#e9dbbf';ctx.fill();ctx.save();flap();ctx.clip();ctx.beginPath();ctx.moveTo(-w*.43,-h/2);ctx.lineTo(0,-h/2-h*.6*o*.84);ctx.lineTo(w*.43,-h/2);ctx.closePath();ctx.fillStyle=ctx.createPattern(liner,'repeat');ctx.fill();ctx.fillStyle=`rgba(20,0,4,${.35*(1-o)})`;ctx.fill();ctx.restore();}
  const inner=ctx.createLinearGradient(0,-h/2,0,h/2);inner.addColorStop(0,'#bfa784');inner.addColorStop(.4,'#d6c3a0');inner.addColorStop(1,'#d6c3a0');ctx.fillStyle=inner;ctx.fillRect(-w/2,-h/2,w,h);
  if(photo){const p=w*.36;ctx.save();ctx.translate(-w*.12,-h*.2);ctx.rotate(-.09);ctx.fillStyle='rgba(0,0,0,.22)';ctx.fillRect(-p/2+w*.006,-p/2+w*.01,p,p*1.06);ctx.fillStyle='#f7f2e8';ctx.fillRect(-p/2,-p/2,p,p*1.06);drawCover(ctx,photo,-p/2+p*.06,-p/2+p*.06,p*.88,p*.88);ctx.restore();}
  if(inside)inside(ctx,w,h);
  ctx.beginPath();ctx.moveTo(-w/2,-h/2);ctx.lineTo(0,h*.07);ctx.lineTo(w/2,-h/2);ctx.lineTo(w/2,h/2);ctx.lineTo(-w/2,h/2);ctx.closePath();
  const pocket=ctx.createLinearGradient(0,-h/2,0,h/2);pocket.addColorStop(0,'#f4e9d3');pocket.addColorStop(1,'#e3d1b0');ctx.fillStyle=pocket;ctx.fill();
  ctx.strokeStyle='rgba(120,86,54,.35)';ctx.lineWidth=Math.max(1,w*.003);ctx.beginPath();ctx.moveTo(-w/2,-h/2);ctx.lineTo(0,h*.07);ctx.lineTo(w/2,-h/2);ctx.stroke();
  ctx.strokeStyle='rgba(120,86,54,.18)';ctx.beginPath();ctx.moveTo(-w/2,h/2);ctx.lineTo(-w*.1,h*.05);ctx.moveTo(w/2,h/2);ctx.lineTo(w*.1,h*.05);ctx.stroke();
  if(o<=0){const tip=tipAt(o);ctx.fillStyle='rgba(60,36,18,.16)';ctx.beginPath();ctx.moveTo(-w/2,-h/2);ctx.lineTo(0,tip+h*.03);ctx.lineTo(w/2,-h/2);ctx.closePath();ctx.fill();flap();const f=ctx.createLinearGradient(0,-h/2,0,tip);f.addColorStop(0,`rgb(${lerp(196,242,-o)|0},${lerp(178,231,-o)|0},${lerp(150,210,-o)|0})`);f.addColorStop(1,'#eadcbf');ctx.fillStyle=f;ctx.fill();ctx.strokeStyle='rgba(120,86,54,.35)';ctx.stroke();}
  ctx.strokeStyle='rgba(90,60,36,.3)';ctx.lineWidth=Math.max(1,w*.003);ctx.strokeRect(-w/2,-h/2,w,h);
  if(sealK>0){const k=easeOut(sealK),sz=w*.24*(1+(1-k)*.55),sy=tipAt(-1)-h*.02;ctx.globalAlpha=clamp(sealK*3,0,1);ctx.fillStyle='rgba(30,0,4,.35)';ctx.beginPath();ctx.ellipse(w*.008,sy+w*.012,sz*.42,sz*.4,0,0,TAU);ctx.fill();ctx.drawImage(seal,-sz/2,sy-sz/2,sz,sz);ctx.globalAlpha=1;
   if(shine>0){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=clamp(shine,0,1);const gs=sz*.32;ctx.drawImage(glint,-sz*.2-gs/2,sy-sz*.2-gs/2,gs,gs);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';}}
  ctx.restore();
 }
 const envAt=(a,b,k)=>({x:lerp(a.x,b.x,k),y:lerp(a.y,b.y,k),w:lerp(a.w,b.w,k),rot:lerp(a.rot,b.rot,k)});

 // ---- Letter layout per song: strokes (heading, lyric lines), pages and page-turn times -------------
 const layoutOf=lru(4,i=>{
  const cues=(tracks[i].cues||[]).filter(c=>Number.isFinite(c.start)),strokes=[],r=random(hash('hand'+i)),duration=Number(tracks[i].duration)||0;
  const first=cues[0]?.start??Infinity,hs=i>0?2.05:1.2,he=Math.max(hs+.6,Math.min(hs+2.1,first-.3));
  setFont(measure,600,HS,0);const dear='Dear,',dw=measure.measureText(dear).width,title=ellipsize(measure,tracks[i].title||'',TW-dw-HS*.4),tw=measure.measureText(title).width;
  strokes.push({start:hs,dur:he-hs,page:0,total:dw+tw,segs:[{text:dear,x:TX,y:HY,w:dw,c0:0,size:HS,weight:600,tilt:0,dry:BURGUNDY,alpha:.92},{text:title,x:TX+dw+HS*.4,y:HY,w:tw,c0:dw,size:HS,weight:600,tilt:-.004,dry:INK,alpha:.95}]});
  let page=0,used=0;
  cues.forEach((cue,n)=>{
   const block=fitText(measure,cue.text||' ',{size:LS,minSize:LS*.76,weight:400,lineHeight:1,maxWidth:TW-LS*.4,maxHeight:LS*2.2,maxLines:2});setFont(measure,400,block.font,0);
   if(used+block.lines.length>ROWS&&used>0){page++;used=0;}
   const next=cues[n+1]?.start,end=Math.min(cue.start+8,Number.isFinite(cue.end)&&cue.end>cue.start?cue.end:(next??duration),next??Infinity,duration||Infinity);
   const dx=(r()-.5)*PW*.012,tilt=(r()-.5)*.012;let c0=0;
   const segs=block.lines.map((text,k)=>{const w=measure.measureText(text).width,seg={text,x:TX+dx+(k?LS*.3:0),y:ruleY(used+k)-RULE*.2,w,c0,size:block.font,weight:400,tilt,dry:INK,alpha:.9};c0+=w;return seg;});
   strokes.push({start:cue.start,dur:clamp((end-cue.start)*.8,.45,6),page,total:c0,segs});used+=block.lines.length;
  });
  // A new sheet is laid down after the last line of the full one has been written, before the next line starts.
  const turns=[-Infinity];
  for(let n=2;n<strokes.length;n++)if(strokes[n].page!==strokes[n-1].page){const prev=strokes[n-1],at=clamp(Math.max(prev.start+prev.dur+.25,strokes[n].start-.9),prev.start+.3,strokes[n].start-.3);prev.dur=Math.max(.25,Math.min(prev.dur,at-prev.start-.1));turns.push(at);}
  return {strokes,turns,pages:turns.length};
 });
 const pageAt=(data,local)=>{let p=0;while(p+1<data.turns.length&&data.turns[p+1]<=local)p++;return p;};
 /** Point on a stroke after `p` of its total width (line-local baseline). */
 function front(st,p){let seg=st.segs[0];for(const s of st.segs)if(p>=s.c0)seg=s;const x=clamp(p-seg.c0,0,seg.w);return {x:seg.x+x*Math.cos(seg.tilt),y:seg.y+x*Math.sin(seg.tilt),size:seg.size};}
 function drawSeg(g,seg,vis,st,local){
  if(vis<=0)return;g.save();g.translate(seg.x,seg.y);g.rotate(seg.tilt);g.transform(1,0,SLANT,1,0,0);
  if(vis<seg.w){g.beginPath();g.rect(-seg.size*.4,-seg.size*1.3,vis+seg.size*.4,seg.size*1.8);g.clip();}
  setFont(g,seg.weight,seg.size,0);g.textAlign='left';g.textBaseline='alphabetic';
  // Wetness falls linearly from the nib back: ink written DRY seconds ago is dry.
  const p1=(local-st.start)/st.dur*st.total,p0=p1-DRY/st.dur*st.total;
  if(p0<seg.c0+seg.w){const x0=p0-seg.c0,x1=Math.max(x0+1,p1-seg.c0);
   const gl=g.createLinearGradient(x0,0,x1,0);gl.addColorStop(0,rgba(GLOSS,0));gl.addColorStop(1,rgba(GLOSS,.95));g.fillStyle=gl;g.fillText(seg.text,-seg.size*.045,-seg.size*.055);
   const gi=g.createLinearGradient(x0,0,x1,0);gi.addColorStop(0,rgba(seg.dry,seg.alpha));gi.addColorStop(1,rgba(WET,1));g.fillStyle=gi;
   // Fresh ink pools: a thin stroke thickens the wet part of the line.
   const gp=g.createLinearGradient(x0,0,x1,0);gp.addColorStop(0,rgba(WET,0));gp.addColorStop(1,rgba(WET,.85));g.strokeStyle=gp;g.lineWidth=seg.size*.035;g.lineJoin='round';g.strokeText(seg.text,0,0);}
  else g.fillStyle=rgba(seg.dry,seg.alpha);
  g.fillText(seg.text,0,0);g.restore();
 }
 function paintSheet(g,i,page,s,data){
  g.drawImage(paper,0,0);
  const small=Math.max(9,LS*.36);setFont(g,600,small,.14);g.textBaseline='alphabetic';g.fillStyle='rgba(110,78,60,.62)';
  if(page===0){g.textAlign='right';g.fillText(`No. ${String(i+1).padStart(2,'0')} / ${String(tracks.length).padStart(2,'0')}`,TX+TW,PH*.135);}
  else{g.textAlign='right';g.fillText(`— ${page+1} —`,TX+TW,PH*.135);}
  for(const st of data.strokes){if(st.page!==page||st.start>s.local)continue;const shown=clamp((s.local-st.start)/st.dur,0,1)*st.total;for(const seg of st.segs)drawSeg(g,seg,shown-seg.c0,st,s.local);}
  const fy=PH*.925;
  if(s.frame)drawSpectrum(g,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:GOLD,alpha:.9,x:PW*.34,y:fy-PH*.052,width:PW*.32,height:PH*.06});
  setFont(g,600,small,.12);g.textAlign='right';g.fillStyle='rgba(110,78,60,.62)';g.fillText(`${stamp(s.local)} / ${stamp(s.duration)}`,TX+TW,fy);
  g.textAlign='left';g.fillText(data.pages>1?`${page+1} / ${data.pages}`:'',TX,fy);
 }
 function penAt(data,local){
  const rest={x:PW*.9,y:PH*.955,lift:1};let cur=null,prev=null;
  for(const st of data.strokes){if(st.start>local)break;prev=cur;cur=st;}
  if(!cur)return rest;
  const end=st=>{const f=front(st,st.total);return {x:f.x+f.size*.55,y:f.y-f.size*.7,lift:1};};
  const q=(local-cur.start)/cur.dur;let pos;
  if(q<1){const f=front(cur,q*cur.total),w=local*21;pos={x:f.x+f.size*.06*(.35+.3*Math.sin(w))*-SLANT*3+Math.sin(local*9.7)*f.size*.05,y:f.y-f.size*(.32+.28*Math.sin(w)+.08*Math.sin(local*13.1)),lift:0};}
  else{const e=end(cur),k=easeOut((local-cur.start-cur.dur)/.35),idle=easeInOut((local-cur.start-cur.dur-2.6)/1.2),f=front(cur,cur.total);pos={x:lerp(lerp(f.x,e.x,k),rest.x,idle),y:lerp(lerp(f.y-f.size*.3,e.y,k),rest.y,idle),lift:k};}
  const from=prev?(()=>{const pe=end(prev),gap=cur.start-prev.start-prev.dur;return gap>3.8?rest:pe;})():rest,a=easeOut((local-cur.start)/.2);
  return {x:lerp(from.x,pos.x,a),y:lerp(from.y,pos.y,a),lift:lerp(from.lift,pos.lift,a)};
 }

 function draw(ctx,time){
  const s=base.at(time),{i,local,duration}=s,fl=flicker(s.t),data=layoutOf(i),art=base.art(i),last=i===tracks.length-1;
  const END=Math.min(last?3.1:2.7,duration*.3),e=local-(duration-END),opening=i>0?local:Infinity;
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.drawImage(desk,0,0);
  const page=pageAt(data,local),turnK=page>0?easeOut((local-data.turns[page])/.6):1;
  const arrive=easeOut((local-(i>0?1.0:.15))/.85),shine=clamp(s.energy.high*1.3,0,1)*.9;
  const toPaper=(g,dx=0,dy=0,da=0)=>{g.translate(PX+dx,PY+dy);g.rotate(PA+da);g.translate(-PW/2,-PH/2);};
  const sheetShadow=(g,a=1)=>{const sx=(Math.sign(PX-FX)||1)*u*.012*fl;g.globalAlpha=.85*a;g.drawImage(shadow,-PW*.07+sx,-PH*.07+u*.016,PW*1.14,PH*1.14);g.globalAlpha=1;};
  const waiting=envAt(OFF,REST,easeOut((local-(i>0?1.25:.4))/.85));
  if(e<0){
   drawEnvelope(ctx,{...waiting,o:1,photo:art.image});
   // Earlier sheets of this letter lie under the current one; a fresh sheet slides in when one is full.
   const offs=[[u*.014,u*.01,.022],[-u*.016,u*.006,-.024]],paperY=(1-arrive)*(portrait?-(PY+PH*.6):H-PY+PH*.6);
   for(let k=Math.min(page-(turnK<1?1:0),2);k>=1;k--){const [dx,dy,da]=offs[k-1];ctx.save();toPaper(ctx,dx,dy+paperY,da);sheetShadow(ctx,.7);ctx.drawImage(under,0,0);ctx.restore();}
   if(turnK<1){const [dx,dy,da]=offs[0];ctx.save();toPaper(ctx,dx*turnK,dy*turnK,da*turnK);sheetShadow(ctx);paintSheet(ctx,i,page-1,s,data);ctx.restore();}
   ctx.save();toPaper(ctx,(1-turnK)*PW*.3,paperY+(1-turnK)*PH*.45,(1-arrive)*.07+(1-turnK)*.08);sheetShadow(ctx);paintSheet(ctx,i,page,s,data);
   const penIn=easeOut((local-(i>0?1.6:.8))/.55),p=penAt(data,local);if(penIn>0)drawPen(ctx,p.x+(1-penIn)*PW*.6,p.y+(1-penIn)*PH*.5,Math.max(p.lift,1-penIn),fl);ctx.restore();
  }else{
   // End of the song: fold in thirds, slip into the envelope, close the flap (the last song is also sealed).
   const f1=easeInOut((e-.2)/.6),f2=easeInOut((e-.7)/.6),move=easeInOut((e-.55)/.75),lift=easeInOut((e-1.3)/.45),ins=easeInOut((e-1.75)/.4),close=easeInOut((e-2.15)/.45);
   const env={...envAt(REST,CENTER,move),o:1-2*close,photo:art.image,sealK:last?clamp((e-2.62)/.35,0,1):0,shine:last?shine:0};
   const above=-EHC/2-LH/2-EHC*.03,inside=-EHC/2+EHC*.07+LH/2,ly=lerp(above,inside,ins);
   const letter=(g,w)=>{const k=w/EWC;g.save();g.scale(k,k);g.fillStyle='rgba(0,0,0,.2)';g.fillRect(-LW/2+u*.004,ly-LH/2+u*.006,LW,LH);g.drawImage(back,-LW/2,ly-LH/2,LW,LH);g.restore();};
   if(lift>=1)drawEnvelope(ctx,{...env,inside:letter});
   else{
    drawEnvelope(ctx,env);
    if(lift>0){const cx=lerp(PX,CENTER.x,lift),cy=lerp(PY,CENTER.y+above,lift),w=lerp(PW,LW,lift),h=w*LH/LW;ctx.save();ctx.translate(cx,cy);ctx.rotate(PA*(1-lift));ctx.drawImage(shadow,-w*.6,-h*.6+u*.02,w*1.2,h*1.2);ctx.drawImage(back,-w/2,-h/2,w,h);ctx.restore();}
    else{
     sg.setTransform(1,0,0,1,0,0);sg.clearRect(0,0,PW,PH);paintSheet(sg,i,page,s,data);
     const t3=PH/3,panel=(sy,hinge,angle,flipBelow)=>{const c=Math.cos(angle);if(Math.abs(c)<.01)return;ctx.save();ctx.translate(0,hinge);ctx.scale(1,c);
      if(c>0)ctx.drawImage(sheetLayer,0,sy,PW,t3,0,flipBelow?0:-t3,PW,t3);else{ctx.drawImage(back,0,flipBelow?0:-t3,PW,t3);}
      ctx.fillStyle=`rgba(40,20,6,${(1-Math.abs(c))*.3})`;ctx.fillRect(0,flipBelow?0:-t3,PW,t3);ctx.restore();};
     ctx.save();toPaper(ctx);const top=f2>0?t3:0,bottom=f1>0?PH-t3:PH;ctx.drawImage(shadow,-PW*.07+u*.01,top-PH*.07+u*.016,PW*1.14,(bottom-top)+PH*.14);
     ctx.drawImage(sheetLayer,0,t3,PW,t3,0,t3,PW,t3);panel(PH-t3,PH-t3,f1*Math.PI,true);panel(0,t3,f2*Math.PI,false);
     const away=easeInOut(e/.5),p=penAt(data,local);if(away<1)drawPen(ctx,p.x+away*PW*.7,p.y+away*PH*.6,Math.max(p.lift,away),fl);ctx.restore();
    }
   }
  }
  // The previous song's envelope: the heart seal is pressed, then it slides away.
  if(opening<1.75){const stampK=clamp((local-.1)/.35,0,1),go=easeInOut((local-.9)/.75),flash=Math.max(0,1-Math.abs(local-.5)/.35);
   drawEnvelope(ctx,{...envAt(CENTER,{x:OFF.x,y:OFF.y+H*.1,w:EWC*.7,rot:.3},go),o:-1,sealK:stampK,shine:Math.max(flash,shine)});}
  // Candle on top; its light breathes over desk and paper.
  ctx.drawImage(shade,0,0);ctx.drawImage(candle.c,candle.x,candle.y);drawFlame(ctx,s.t,fl);
  ctx.globalCompositeOperation='lighter';ctx.globalAlpha=clamp(.24*fl,0,1);ctx.drawImage(glow,Math.sin(s.t*2.1)*u*.004,0,W,H);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  ctx.drawImage(edge,0,0);
 }
 return {draw,duration:base.total};
}

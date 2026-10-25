import {sceneBase,drawSpectrum,text,fitText,setFont,stamp,rgba,mix,layer,hash,random,clamp,lerp,easeOut,easeInOut,radialGlow} from '../canvas-kit.mjs';

/**
 * 용광로 각인: a scorched, scratched black iron plate runs through a press between a riveted top beam and
 * the furnace housing. Each lyric line is punched into the plate the moment it is sung: the letters
 * flash white-hot, throw a burst of sparks and cool over several seconds through orange and crimson to
 * dull iron, while the plate feeds upward one row before every new line and carries the cooled lines
 * away. The furnace mouth flickers, the chosen spectrum burns behind its grate and a bellows gauge
 * follows the music. Between songs the plate is quenched: it slides out under a cloud of steam.
 */
const TAU=Math.PI*2;
const LINEAR=['bars','round-bars','mirror','blocks','dots','reflection','wave','double-wave','area','mirror-area','ribbon'];
// Glow colors from barely red to white hot; a line's temperature 0..1 blends between them.
const HEAT=[[92,14,8],[190,30,14],[255,104,22],[255,190,100],[255,246,228]];
function lru(limit){const m=new Map();return (key,make)=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make();m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};}
function tinted(mask,color,w=mask.width,h=mask.height){const c=layer(w,h),g=c.getContext('2d');g.drawImage(mask,0,0,w,h);g.globalCompositeOperation='source-in';g.fillStyle=rgba(color);g.fillRect(0,0,w,h);return c;}

/** Vertically tileable iron plate: mottling, temper rings, rust, hammer dents, scratches, a weld seam, rivets. */
function plateTile(W,T,u){
 const c=layer(W,T),g=c.getContext('2d'),r=random(hash('forge-plate'));
 const wrapped=(y,reach,fn)=>{fn(y);if(y-reach<0)fn(y+T);if(y+reach>T)fn(y-T);};
 g.fillStyle='#141110';g.fillRect(0,0,W,T);
 for(let k=0;k<46;k++){const x=r()*W,y=r()*T,rad=u*(.08+r()*.32),dark=r()<.55,a=dark?.22+r()*.3:.05+r()*.08;
  wrapped(y,rad,yy=>{const gr=g.createRadialGradient(x,yy,0,x,yy,rad);gr.addColorStop(0,dark?`rgba(0,0,0,${a})`:`rgba(92,80,66,${a})`);gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(x-rad,yy-rad,rad*2,rad*2);});}
 // Heat-tint rings (straw, bronze, purple, blue) where the plate was once torched.
 for(let k=0;k<3;k++){const x=W*(.12+r()*.76),y=r()*T,rx=u*(.16+r()*.14),ry=rx*(.35+r()*.25),rot=(r()-.5)*.8;
  wrapped(y,rx,yy=>{g.save();g.translate(x,yy);g.rotate(rot);g.scale(1,ry/rx);const gr=g.createRadialGradient(0,0,0,0,0,rx);
   for(const [at,col,a] of [[0,[205,176,96],0],[.4,[205,176,96],.07],[.55,[176,108,46],.08],[.68,[118,58,112],.07],[.8,[52,82,150],.07],[1,[52,82,150],0]])gr.addColorStop(at,rgba(col,a));
   g.fillStyle=gr;g.fillRect(-rx,-rx,rx*2,rx*2);g.restore();});}
 // Rust: a soft stain, fine flakes and a few drips running down.
 for(let k=0;k<8;k++){const cx=r()*W,cy=r()*T,spread=u*(.03+r()*.07),flakes=Array.from({length:90},()=>{const a=r()*TAU,d=Math.pow(r(),1.6)*spread;return [cx+Math.cos(a)*d,Math.sin(a)*d*.8,u*(.0012+r()*.004),r()];}),drips=Array.from({length:1+Math.floor(r()*3)},()=>[cx+(r()-.5)*spread,u*(.05+r()*.18),u*(.002+r()*.004)]);
  wrapped(cy,spread+u*.25,yy=>{const st=g.createRadialGradient(cx,yy,0,cx,yy,spread*1.3);st.addColorStop(0,'rgba(104,40,14,.32)');st.addColorStop(1,'rgba(104,40,14,0)');g.fillStyle=st;g.fillRect(cx-spread*1.3,yy-spread*1.3,spread*2.6,spread*2.6);
   for(const [x,len,w] of drips){const d=g.createLinearGradient(0,yy,0,yy+len);d.addColorStop(0,'rgba(110,44,16,.3)');d.addColorStop(1,'rgba(110,44,16,0)');g.fillStyle=d;g.fillRect(x-w/2,yy,w,len);}
   for(const [x,dy,rad,v] of flakes){g.fillStyle=v<.7?`rgba(${130+v*50|0},${50+v*24|0},18,${.12+v*.22})`:`rgba(12,7,4,${.3+v*.3})`;g.fillRect(x-rad/2,yy+dy-rad/2,rad,rad*(.6+v*.6));}});}
 // Hammer dents: a dark dish with a lit lower lip.
 for(let k=0;k<150;k++){const x=r()*W,y=r()*T,rad=u*(.006+r()*.018),sq=.6+r()*.4;
  wrapped(y,rad,yy=>{g.save();g.translate(x,yy);g.scale(1,sq);const gr=g.createRadialGradient(0,-rad*.2,0,0,0,rad);gr.addColorStop(0,'rgba(0,0,0,.34)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.beginPath();g.arc(0,0,rad,0,TAU);g.fill();
   g.strokeStyle='rgba(255,236,214,.07)';g.lineWidth=Math.max(1,rad*.18);g.beginPath();g.arc(0,0,rad*.8,.35,Math.PI-.35);g.stroke();g.restore();});}
 // Scratches, mostly in one working direction, and a few deep gouges.
 for(let k=0;k<260;k++){const x=r()*W,y=r()*T,len=u*(.02+Math.pow(r(),2)*.3),a=-.25+(r()-.5)*.5+(r()<.2?1.4:0),deep=r()<.06,alpha=.025+r()*.07;
  wrapped(y,len,yy=>{const dx=Math.cos(a)*len,dy=Math.sin(a)*len;if(deep){g.strokeStyle='rgba(0,0,0,.5)';g.lineWidth=Math.max(1.5,u*.002);g.beginPath();g.moveTo(x,yy);g.lineTo(x+dx,yy+dy);g.stroke();g.strokeStyle='rgba(255,240,224,.09)';g.lineWidth=1;g.beginPath();g.moveTo(x,yy+1.5);g.lineTo(x+dx,yy+dy+1.5);g.stroke();}
   else{g.strokeStyle=`rgba(214,202,190,${alpha})`;g.lineWidth=1;g.beginPath();g.moveTo(x,yy);g.lineTo(x+dx,yy+dy);g.stroke();}});}
 for(let k=0;k<W*T/160;k++){const v=r();g.fillStyle=v<.5?`rgba(0,0,0,${.1+v*.2})`:`rgba(200,186,170,${(v-.5)*.08})`;g.fillRect(r()*W,r()*T,1+r()*1.6,1+r()*1.6);}
 // A horizontal weld seam with its bluish heat-affected band (shows the plate moving).
 {const y=T*.37,bead=u*.011;const band=g.createLinearGradient(0,y-u*.06,0,y+u*.06);for(const [at,col,a] of [[0,[0,0,0],0],[.25,[52,82,150],.1],[.4,[176,108,46],.12],[.5,[30,22,16],.4],[.6,[176,108,46],.12],[.75,[52,82,150],.1],[1,[0,0,0],0]])band.addColorStop(at,rgba(col,a));g.fillStyle=band;g.fillRect(0,y-u*.06,W,u*.12);
  for(let x=-bead;x<W+bead;x+=bead*.62){const yy=y+(r()-.5)*bead*.25,gr=g.createRadialGradient(x-bead*.2,yy-bead*.3,0,x,yy,bead);gr.addColorStop(0,'rgba(120,108,96,.7)');gr.addColorStop(.6,'rgba(40,34,30,.9)');gr.addColorStop(1,'rgba(8,6,5,.9)');g.fillStyle=gr;g.beginPath();g.ellipse(x,yy,bead*.75,bead,0,0,TAU);g.fill();}}
 // Rivet columns along both edges beside a seam groove.
 const step=T/7;for(const side of [0,1]){const x=side?W-u*.045:u*.045,gx=side?W-u*.085:u*.085;
  g.fillStyle='rgba(0,0,0,.55)';g.fillRect(gx-u*.002,0,u*.004,T);g.fillStyle='rgba(255,236,214,.06)';g.fillRect(gx+u*.002,0,1,T);
  for(let k=0;k<7;k++){const y=(k+.5)*step,rad=u*.013;g.fillStyle='rgba(0,0,0,.6)';g.beginPath();g.arc(x+rad*.25,y+rad*.35,rad*1.12,0,TAU);g.fill();
   const dome=g.createRadialGradient(x-rad*.35,y-rad*.4,0,x,y,rad);dome.addColorStop(0,'#6a6056');dome.addColorStop(.45,'#2c2620');dome.addColorStop(1,'#0c0a08');g.fillStyle=dome;g.beginPath();g.arc(x,y,rad,0,TAU);g.fill();
   g.fillStyle=`rgba(130,60,24,${.15+r()*.25})`;g.beginPath();g.arc(x+rad*.3,y+rad*.2,rad*.45,0,TAU);g.fill();}}
 return c;
}

export default function forge(input){
 const base=sceneBase(input,{hue:20}),{width:W,height:H,portrait,u,tracks}=base,N=tracks.length;
 const L=portrait
  ?{top:H*.085,bot:H*.835,lintel:H*.026,cy:H*.6,rowH:H*.14,size:u*.092,maxW:u*.8,title:u*.11,mouth:[W/2,H*.982,u*.42,H*.1],gauge:[u*.15,H*.917,u*.072],temp:[u*.85,H*.917,u*.19,H*.05],head:u*.05,info:u*.03,sparks:56}
  :{top:H*.11,bot:H*.8,lintel:H*.04,cy:H*.585,rowH:H*.21,size:u*.084,maxW:W*.78,title:u*.1,mouth:[W/2,H*.988,W*.25,H*.145],gauge:[W*.27,H*.905,H*.062],temp:[W*.73,H*.905,W*.1,H*.065],head:u*.048,info:u*.025,sparks:70};
 const measure=layer(8,8).getContext('2d'),plate=plateTile(W,H,u);
 const [mx,mb,mw,mh]=L.mouth,mTop=mb-mh,mR=Math.min(mw/2,mh*.62);
 // The mouth: straight jambs under an elliptical arch.
 const archPath=(g,inset=0)=>{const rx=mw/2-inset,ry=mR-inset,ay=mTop+mR;g.beginPath();g.moveTo(mx-rx,mb);g.lineTo(mx-rx,ay);g.ellipse(mx,ay,rx,ry,0,Math.PI,TAU);g.lineTo(mx+rx,mb);g.closePath();};

 // ---- Fixed frame: top beam with the headline cast in relief, furnace housing, gauge face -----------
 const rivet=(g,x,y,rad)=>{g.fillStyle='rgba(0,0,0,.55)';g.beginPath();g.arc(x+rad*.2,y+rad*.3,rad*1.1,0,TAU);g.fill();const d=g.createRadialGradient(x-rad*.35,y-rad*.4,0,x,y,rad);d.addColorStop(0,'#7a7064');d.addColorStop(.5,'#302a24');d.addColorStop(1,'#0e0c0a');g.fillStyle=d;g.beginPath();g.arc(x,y,rad,0,TAU);g.fill();};
 const ironFill=(g,y0,y1,seed,light='#2b2622',dark='#100e0c')=>{const f=g.createLinearGradient(0,y0,0,y1);f.addColorStop(0,light);f.addColorStop(1,dark);g.fillStyle=f;g.fillRect(0,y0,W,y1-y0);const r=random(hash(seed));for(let k=0;k<W*(y1-y0)/110;k++){const v=r();g.fillStyle=v<.5?`rgba(0,0,0,${.15+v*.25})`:`rgba(210,196,180,${(v-.5)*.07})`;g.fillRect(r()*W,y0+r()*(y1-y0),1+r()*1.8,1+r()*1.8);}
  for(let k=0;k<6;k++){const x=r()*W,rad=u*(.04+r()*.1),gr=g.createRadialGradient(x,y0+r()*(y1-y0),0,x,(y0+y1)/2,rad);gr.addColorStop(0,`rgba(120,52,20,${.08+r()*.1})`);gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(x-rad,y0,rad*2,y1-y0);}};
 const frame=layer(W,H);{
  const g=frame.getContext('2d');
  // Shade the plate under the beam and above the housing.
  let sh=g.createLinearGradient(0,L.top,0,L.top+u*.07);sh.addColorStop(0,'rgba(0,0,0,.7)');sh.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=sh;g.fillRect(0,L.top,W,u*.07);
  sh=g.createLinearGradient(0,L.bot-u*.05,0,L.bot);sh.addColorStop(0,'rgba(0,0,0,0)');sh.addColorStop(1,'rgba(0,0,0,.55)');g.fillStyle=sh;g.fillRect(0,L.bot-u*.05,W,u*.05);
  const side=g.createLinearGradient(0,0,W,0);side.addColorStop(0,'rgba(0,0,0,.5)');side.addColorStop(.12,'rgba(0,0,0,0)');side.addColorStop(.88,'rgba(0,0,0,0)');side.addColorStop(1,'rgba(0,0,0,.5)');g.fillStyle=side;g.fillRect(0,L.top,W,L.bot-L.top);
  // Top beam.
  ironFill(g,0,L.top,'beam','#2e2925','#151210');
  g.fillStyle='rgba(255,236,214,.1)';g.fillRect(0,L.top-u*.012,W,Math.max(1,u*.0015));g.fillStyle='#070605';g.fillRect(0,L.top-u*.004,W,u*.004);
  for(let x=u*.045;x<W;x+=u*.12)rivet(g,x,L.top*.2,u*.009);
  if(base.headline){const block=fitText(measure,base.headline,{size:L.head,minSize:L.head*.5,weight:800,lineHeight:1.1,maxWidth:W*.66,maxHeight:L.head*1.2,spacing:.18,maxLines:1}),y=L.top*.58,d=block.font*.06;
   const put=(dx,dy,col)=>{setFont(g,800,block.font,.18);g.textAlign='center';g.textBaseline='middle';g.fillStyle=col;g.fillText(block.lines[0],W/2+dx,y+dy);};
   put(d*.8,d*1.6,'rgba(0,0,0,.8)');put(-d*.4,-d*.6,'rgba(255,232,206,.22)');
   const face=g.createLinearGradient(0,y-block.font/2,0,y+block.font/2);face.addColorStop(0,'#5d544b');face.addColorStop(.5,'#3a332d');face.addColorStop(1,'#221d19');put(0,0,face);}
  // Housing: lintel band and cast-iron body around the furnace mouth.
  ironFill(g,L.bot,H,'housing','#24201c','#0c0a09');
  g.fillStyle='#070605';g.fillRect(0,L.bot,W,u*.004);g.fillStyle='rgba(255,236,214,.12)';g.fillRect(0,L.bot+u*.004,W,Math.max(1,u*.0015));
  const ly=L.bot+L.lintel;g.fillStyle='rgba(0,0,0,.6)';g.fillRect(0,ly,W,u*.003);g.fillStyle='rgba(255,236,214,.07)';g.fillRect(0,ly+u*.003,W,1);
  for(let x=u*.03;x<W;x+=u*.1){rivet(g,x,ly+u*.016,u*.007);}
  // Firebrick arch around the mouth (lit per frame from inside).
  const brick=mw*.09,r=random(hash('bricks'));archPath(g,-brick);g.fillStyle='#160805';g.fill();
  g.save();archPath(g,-brick);archPath(g,0);g.clip('evenodd');
  const nb=Math.round(mw/brick*1.1);for(let k=0;k<nb;k++){const a=Math.PI+(k+.5)/nb*Math.PI,x=mx+Math.cos(a)*(mw/2+brick/2),y=mTop+mR+Math.sin(a)*(mR+brick/2),n=Math.atan2(Math.sin(a)*(mw/2),Math.cos(a)*mR);g.fillStyle=`rgb(${70+r()*30|0},${26+r()*14|0},${14+r()*8|0})`;g.save();g.translate(x,y);g.rotate(n+Math.PI/2);const bw=Math.PI*(mw/2+mR+brick)/2/nb*.86;g.fillRect(-bw/2,-brick*.6,bw,brick*1.2);g.restore();}
  for(const sx of [-1,1])for(let y=mTop+mR;y<H;y+=brick*.55){g.fillStyle=`rgba(${70+r()*30},${26+r()*14},${14+r()*8},1)`;g.fillRect(mx+sx*(mw/2+brick*.5)-brick*.48,y+brick*.04,brick*.96,brick*.47);}
  g.restore();
  g.save();archPath(g,0);g.globalCompositeOperation='destination-out';g.fill();g.restore();
  // Grate bars in front of the fire.
  const bars=portrait?6:8;for(let k=1;k<bars;k++){const x=mx-mw/2+mw*k/bars,bw=mw*.022;const f=g.createLinearGradient(x-bw,0,x+bw,0);f.addColorStop(0,'#3a1608');f.addColorStop(.35,'#0d0907');f.addColorStop(.7,'#060504');f.addColorStop(1,'#4a1a08');g.fillStyle=f;g.fillRect(x-bw/2,mTop+mh*.18,bw,mh*.82);}
  g.fillStyle='#0a0807';g.fillRect(mx-mw/2,mTop+mh*.62,mw,mh*.04);
  // Gauge bezel and face.
  const [gx,gy,gr]=L.gauge;g.fillStyle='rgba(0,0,0,.6)';g.beginPath();g.arc(gx+gr*.06,gy+gr*.1,gr*1.2,0,TAU);g.fill();
  const bz=g.createLinearGradient(gx-gr,gy-gr,gx+gr,gy+gr);bz.addColorStop(0,'#6e655b');bz.addColorStop(.5,'#2a2420');bz.addColorStop(1,'#0e0c0a');g.fillStyle=bz;g.beginPath();g.arc(gx,gy,gr*1.16,0,TAU);g.fill();
  const face=g.createRadialGradient(gx,gy-gr*.3,0,gx,gy,gr);face.addColorStop(0,'#d8ccb0');face.addColorStop(.75,'#a89a7c');face.addColorStop(1,'#5a4e3c');g.fillStyle=face;g.beginPath();g.arc(gx,gy,gr,0,TAU);g.fill();
  const a0=Math.PI*.75,a1=Math.PI*2.25;g.strokeStyle='#a82416';g.lineWidth=gr*.09;g.beginPath();g.arc(gx,gy,gr*.78,lerp(a0,a1,.78),a1);g.stroke();
  for(let k=0;k<=20;k++){const a=lerp(a0,a1,k/20),big=k%5===0;g.strokeStyle='#241c14';g.lineWidth=Math.max(1,gr*(big?.035:.018));g.beginPath();g.moveTo(gx+Math.cos(a)*gr*(big?.62:.7),gy+Math.sin(a)*gr*(big?.62:.7));g.lineTo(gx+Math.cos(a)*gr*.84,gy+Math.sin(a)*gr*.84);g.stroke();
   if(big)text(g,String(k/2),gx+Math.cos(a)*gr*.46,gy+Math.sin(a)*gr*.46,{size:gr*.16,weight:800,color:'#2a2016',align:'center',baseline:'middle'});}
  text(g,'BELLOWS',gx,gy+gr*.38,{size:gr*.13,weight:800,color:'#3a2c1c',align:'center',baseline:'middle',spacing:.12});text(g,'kPa',gx,gy+gr*.58,{size:gr*.12,weight:700,color:'#3a2c1c',align:'center',baseline:'middle'});
  const soot=g.createRadialGradient(gx,gy,gr*.5,gx,gy,gr);soot.addColorStop(0,'rgba(20,12,6,0)');soot.addColorStop(1,'rgba(20,12,6,.45)');g.fillStyle=soot;g.beginPath();g.arc(gx,gy,gr,0,TAU);g.fill();
  for(let k=0;k<4;k++){const a=Math.PI/4+k*Math.PI/2;rivet(g,gx+Math.cos(a)*gr*1.08,gy+Math.sin(a)*gr*1.08,gr*.05);}
  // Pyrometer window.
  const [tx,ty,tw,th]=L.temp;g.fillStyle='rgba(0,0,0,.6)';g.beginPath();g.roundRect(tx-tw/2+u*.003,ty-th/2+u*.004,tw,th,u*.006);g.fill();
  const tb=g.createLinearGradient(0,ty-th/2,0,ty+th/2);tb.addColorStop(0,'#4c443c');tb.addColorStop(1,'#1a1612');g.fillStyle=tb;g.beginPath();g.roundRect(tx-tw/2-u*.006,ty-th/2-u*.006,tw+u*.012,th+u*.012,u*.008);g.fill();
  g.fillStyle='#0b0504';g.beginPath();g.roundRect(tx-tw/2,ty-th/2,tw,th,u*.004);g.fill();
  text(g,'TEMP °C',tx,ty-th/2-u*.02,{size:u*.017,weight:800,color:'rgba(214,196,170,.55)',align:'center',baseline:'middle',spacing:.2});
 }
 const glass=layer(L.gauge[2]*2,L.gauge[2]*2);{const g=glass.getContext('2d'),r=L.gauge[2],f=g.createLinearGradient(0,0,r*1.2,r*2);f.addColorStop(0,'rgba(255,255,255,.28)');f.addColorStop(.4,'rgba(255,255,255,.04)');f.addColorStop(.41,'rgba(255,255,255,0)');g.fillStyle=f;g.beginPath();g.arc(r,r,r,0,TAU);g.fill();}

 // Coal bed seen through the mouth: dark lumps over glowing gaps; the hot layer is the gaps alone and flickers.
 const coals=[layer(mw,mh),layer(mw,mh)];{
  const r=random(hash('coals')),lumps=[];
  for(let row=0;row<4;row++){const y=mh*(.66+row*.1),size=u*(.022+row*.006);for(let x=-size;x<mw+size;x+=size*(1.3+r()*.5)){const n=5+Math.floor(r()*3),pts=[];for(let k=0;k<n;k++){const a=k/n*TAU+r()*.5,d=size*(.6+r()*.45);pts.push([Math.cos(a)*d,Math.sin(a)*d*.7]);}lumps.push([x+(r()-.5)*size*.4,y+(r()-.5)*size*.5,pts,r()]);}}
  const lumpPath=(g,[x,y,pts])=>{g.beginPath();pts.forEach(([px,py],k)=>k?g.lineTo(x+px,y+py):g.moveTo(x+px,y+py));g.closePath();};
  const g0=coals[0].getContext('2d'),back=g0.createLinearGradient(0,0,0,mh);back.addColorStop(0,'#140503');back.addColorStop(.55,'#4a1206');back.addColorStop(1,'#7a2408');g0.fillStyle=back;g0.fillRect(0,0,mw,mh);
  for(const lump of lumps){lumpPath(g0,lump);const v=lump[3];g0.fillStyle=`rgb(${16+v*14|0},${7+v*5|0},${5+v*3|0})`;g0.fill();g0.strokeStyle=`rgba(255,${90+v*60|0},30,${.35+v*.3})`;g0.lineWidth=Math.max(1,u*.002);g0.stroke();}
  const g1=coals[1].getContext('2d'),hotg=g1.createLinearGradient(0,mh*.3,0,mh);hotg.addColorStop(0,'rgba(255,110,30,.2)');hotg.addColorStop(.5,'rgba(255,170,70,.7)');hotg.addColorStop(1,'rgba(255,226,150,.95)');g1.fillStyle=hotg;g1.fillRect(0,0,mw,mh);
  for(let k=0;k<7;k++)radialGlow(g1,r()*mw,mh*(.62+r()*.3),mw*(.05+r()*.08),[255,240,200],.5);
  g1.globalCompositeOperation='destination-out';for(const lump of lumps){lumpPath(g1,lump);g1.fill();}
 }
 const ember=layer(48,48);{const g=ember.getContext('2d'),gr=g.createRadialGradient(24,24,0,24,24,24);gr.addColorStop(0,'rgba(255,240,200,1)');gr.addColorStop(.25,'rgba(255,150,50,.6)');gr.addColorStop(1,'rgba(255,80,20,0)');g.fillStyle=gr;g.fillRect(0,0,48,48);}
 const steam=layer(192,192);{const g=steam.getContext('2d'),r=random(hash('steam'));g.filter='blur(7px)';for(let k=0;k<16;k++){const a=r()*TAU,d=r()*44,x=96+Math.cos(a)*d,y=96+Math.sin(a)*d*.8,rad=14+r()*26;g.fillStyle=`rgba(218,216,212,${.12+r()*.22})`;g.beginPath();g.arc(x,y,rad,0,TAU);g.fill();}g.filter='none';}
 const puffs=(()=>{const r=random(hash('puffs'));return Array.from({length:26},()=>({x:r(),y:.85+r()*.45,rise:.6+r()*.8,size:.22+r()*.4,delay:r()*.5,sway:r()*TAU}));})();

 // ---- Rows: the title (stamped first when there is time) and the sung lines --------------------------
 const rowsOf=lru(4),engraved=lru(10),hot=lru(4);
 function rows(i){return rowsOf(i,()=>{
  const cues=(tracks[i].cues||[]).filter(c=>Number.isFinite(c.start)),first=cues.length?cues[0].start:Infinity,list=[];
  if(first>2.6)list.push({text:tracks[i].title||' ',start:Math.min(.55,first-2),title:true});
  for(const c of cues)list.push({text:c.text||' ',start:c.start,title:false});
  // Each row after the first is preceded by a one-row plate feed that ends just before it is punched.
  list.forEach((row,k)=>{const gap=k?row.start-list[k-1].start:1;row.lead=clamp(gap*.45,.12,.42);});
  return list;});}
 const finalFeed=i=>Math.max(0,rows(i).length-1);
 const prefix=[0];for(let n=1;n<N;n++)prefix.push(prefix[n-1]+finalFeed(n-1)+3);
 function feedOf(list,local){let f=0;for(let k=1;k<list.length;k++){const row=list[k],a=row.start-row.lead-.03;if(local<a)break;f+=easeInOut((local-a)/row.lead);}return f;}
 function sprites(i,k){return engraved(`${i}:${k}`,()=>{
  const row=rows(i)[k],size=row.title?L.title:L.size,block=fitText(measure,row.text,{size,minSize:size*.45,weight:row.title?900:800,lineHeight:1.18,maxWidth:L.maxW,maxHeight:L.rowH*.9,spacing:row.title?.06:.01,maxLines:2});
  const pad=Math.ceil(block.font*.6),lh=block.font*block.lineHeight,w=Math.ceil(L.maxW+pad*2),h=Math.ceil(block.lines.length*lh+pad*2),d=block.font*.045;
  const put=(g,dx,dy)=>{setFont(g,block.weight,block.font,block.spacing);g.textAlign='center';g.textBaseline='middle';block.lines.forEach((line,n)=>g.fillText(line,w/2+dx,pad+lh*(n+.5)+dy));};
  const c=layer(w,h),g=c.getContext('2d');
  g.fillStyle='rgba(0,0,0,.45)';put(g,0,-d*.8);g.fillStyle='rgba(255,226,196,.26)';put(g,0,d);g.fillStyle='#060504';put(g,0,0);
  g.globalCompositeOperation='source-atop';g.fillStyle='rgba(58,50,44,.6)';put(g,0,d*1.5);
  const mask=layer(w,h),mg=mask.getContext('2d');mg.fillStyle='#fff';put(mg,0,0);
  let width=0;setFont(measure,block.weight,block.font,block.spacing);for(const line of block.lines)width=Math.max(width,measure.measureText(line).width);
  return {c,mask,w,h,width,height:block.lines.length*lh,font:block.font};});}
 function heat(i,k){return hot(`${i}:${k}`,()=>{
  const sp=sprites(i,k),hw=Math.ceil(sp.w/2),hh=Math.ceil(sp.h/2),halo=layer(hw,hh),g=halo.getContext('2d');g.filter=`blur(${sp.font*.09}px)`;g.drawImage(sp.mask,0,0,hw,hh);g.filter='none';
  return {core:HEAT.map(col=>tinted(sp.mask,col)),halo:HEAT.map((col,n)=>tinted(halo,HEAT[Math.max(0,n-1)]))};});}
 // Temperature: white hot at the blow, then cooling through orange and crimson over ~6 s.
 const tempOf=age=>age<0?0:Math.exp(-age/2.1)*(age<.06?1:.97);
 function drawHot(ctx,i,k,x,y,T){
  if(T<=.004)return;const h=heat(i,k),sp=sprites(i,k),v=T*5,lo=v<1?-1:Math.min(4,Math.floor(v)-1),f=v<1?v:v-Math.floor(v),hi=Math.min(4,lo+1);
  ctx.globalCompositeOperation='lighter';
  const put=(n,a)=>{if(n<0||a<=0)return;ctx.globalAlpha=a*(.45+.55*T);ctx.drawImage(h.halo[n],x-sp.w/2,y-sp.h/2,sp.w,sp.h);ctx.globalAlpha=a;ctx.drawImage(h.core[n],x-sp.w/2,y-sp.h/2);};
  if(lo===hi)put(lo,1);else{put(lo,1-f);put(hi,f);}
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
 }
 function sparks(ctx,i,k,cx,cy,age,sp){
  if(age<0||age>1.6)return;const r=random(hash(`spark${i}:${k}`)),drag=2.2,grav=u*2.2;
  ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
  for(let n=0;n<L.sparks;n++){
   const x0=cx+(r()-.5)*sp.width*.95,y0=cy+(r()-.3)*sp.height*.55,vx=(r()-.5)*u*1.6,vy=-(.15+r()*.9)*u*1.1,life=.3+r()*1.1,big=r()<.18,delay=r()*.05;
   const a=age-delay;if(a<=0||a>life)continue;
   const pos=t=>{const e=(1-Math.exp(-drag*t))/drag;return [x0+vx*e,y0+(vy+grav/drag)*e-grav*t/drag];};
   const [x,y]=pos(a),[px,py]=pos(Math.max(0,a-.022)),fade=a/life,col=HEAT[Math.max(1,3-Math.floor(fade*2.4))];
   ctx.strokeStyle=rgba(col,1-fade*.6);ctx.lineWidth=u*(big?.0034:.002)*(1-fade*.5);ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(x,y);ctx.stroke();
   if(big){const s=u*.02*(1-fade*.6);ctx.globalAlpha=.6*(1-fade);ctx.drawImage(ember,x-s/2,y-s/2,s,s);ctx.globalAlpha=1;}
  }
  ctx.globalCompositeOperation='source-over';
 }

 function draw(ctx,time){
  const s=base.at(time),{i,local,duration}=s,list=rows(i),quench=s.exit,out=3*(1-s.exit);
  const feed=feedOf(list,local),off=((prefix[i]+feed+out)*L.rowH)%H;
  ctx.drawImage(plate,0,-off);ctx.drawImage(plate,0,H-off);
  // Engraved rows: the newest at the press line, older ones carried upward and fading.
  const t0=L.top-L.rowH;
  for(let k=list.length-1;k>=0;k--){
   const row=list[k],age=local-row.start;if(age<0)continue;
   const y=L.cy+(k-feed-out)*L.rowH;if(y<t0)break;if(y>H)continue;
   const sp=sprites(i,k),slam=age<.1?1+.05*(1-age/.1):1,dist=feed+out-k;
   ctx.globalAlpha=clamp(1-(dist-1.5)*.28,.2,1);
   if(slam!==1){ctx.save();ctx.translate(W/2,y);ctx.scale(slam,slam);ctx.drawImage(sp.c,-sp.w/2,-sp.h/2);ctx.restore();}else ctx.drawImage(sp.c,W/2-sp.w/2,y-sp.h/2);
   ctx.globalAlpha=1;
   const T=tempOf(age)*quench;
   if(T>.004){ctx.save();ctx.translate(W/2,y);ctx.scale(1,.32);radialGlow(ctx,0,0,sp.width*.62+u*.05,HEAT[2],.2*T);ctx.restore();drawHot(ctx,i,k,W/2,y,T);}
   if(age<.4){const p=age/.4;ctx.save();ctx.translate(W/2,y);ctx.scale(1,.3);radialGlow(ctx,0,0,sp.width*(.4+p*.5),[255,240,214],.5*(1-p)*(1-p));ctx.restore();}
  }
  // Furnace light spilling up the plate.
  const fl=.74+.12*Math.sin(s.t*2.3)+.08*Math.sin(s.t*5.9+1.3)+.06*Math.sin(s.t*11.7+.4)*Math.sin(s.t*.7);
  ctx.save();ctx.translate(mx,L.bot);ctx.scale(1.9,1);radialGlow(ctx,0,0,(L.bot-L.top)*.7,[255,96,24],.16*fl);ctx.restore();
  // Mouth interior: coals, flickering heat and the spectrum as flames behind the grate.
  ctx.save();archPath(ctx,0);ctx.clip();ctx.drawImage(coals[0],mx-mw/2,mTop);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=clamp(fl,0,1);ctx.drawImage(coals[1],mx-mw/2,mTop);ctx.globalAlpha=1;
  if(s.frame){const kind=LINEAR.includes(base.options.spectrum)?base.options.spectrum:'bars';drawSpectrum(ctx,{kind,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:[255,150,44],alpha:.9*s.show,amp:1,x:mx-mw*.44,y:mTop+mh*.1,width:mw*.88,height:mh*.56});}
  ctx.globalCompositeOperation='source-over';ctx.restore();
  ctx.drawImage(frame,0,0);
  // The arch bricks and grate catch the fire.
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.translate(mx,mb-mh*.3);ctx.scale(1.3,1);radialGlow(ctx,0,0,mw*.62,[255,90,20],.22*fl);ctx.restore();
  // Bellows gauge: the needle follows a weighted recent average of the loudness.
  {const [gx,gy,gr]=L.gauge;let sum=0,ws=0;[0,.07,.14,.21,.28].forEach((dt,n)=>{const e=dt?base.at(Math.max(0,time-dt)).energy:s.energy,w=Math.pow(.7,n);sum+=e.level*w;ws+=w;});
   const v=clamp(sum/ws,0,1)*s.show,a=lerp(Math.PI*.75,Math.PI*2.25,.06+v*.86);
   ctx.strokeStyle='rgba(0,0,0,.3)';ctx.lineWidth=gr*.05;ctx.beginPath();ctx.moveTo(gx+gr*.04,gy+gr*.06);ctx.lineTo(gx+Math.cos(a)*gr*.8+gr*.04,gy+Math.sin(a)*gr*.8+gr*.06);ctx.stroke();
   ctx.strokeStyle='#8e1a0e';ctx.lineWidth=gr*.04;ctx.beginPath();ctx.moveTo(gx-Math.cos(a)*gr*.15,gy-Math.sin(a)*gr*.15);ctx.lineTo(gx+Math.cos(a)*gr*.8,gy+Math.sin(a)*gr*.8);ctx.stroke();
   ctx.fillStyle='#1a1410';ctx.beginPath();ctx.arc(gx,gy,gr*.08,0,TAU);ctx.fill();ctx.drawImage(glass,gx-gr,gy-gr);}
  // Pyrometer: the temperature of the line just punched.
  {const [tx,ty,,th]=L.temp;let T=0;for(let k=list.length-1;k>=0;k--){const age=local-list[k].start;if(age>=0){T=tempOf(age)*quench;break;}}
   const deg=Math.round((22+T*1240+(T>.01?Math.sin(s.t*3.7)*3:0))/2)*2;text(ctx,String(deg),tx,ty+th*.04,{size:th*.62,weight:800,color:rgba(mix([150,40,16],[255,170,70],clamp(T*1.5,0,1))),align:'center',baseline:'middle',spacing:.08});}
  // Lintel: song number, title and time, stencilled.
  {const y=L.bot+L.lintel*.55,pad=W*.05,info=L.info,col='rgba(222,206,182,.78)';
   const num=`${String(i+1).padStart(2,'0')} / ${String(N).padStart(2,'0')}`,tm=`${stamp(local)} / ${stamp(duration)}`;
   text(ctx,num,pad,y,{size:info,weight:800,color:'rgba(255,150,70,.85)',baseline:'middle',spacing:.12});
   setFont(measure,800,info,.12);const nw=measure.measureText(num).width;setFont(measure,700,info*.92,.06);const tw=measure.measureText(tm).width;
   text(ctx,tracks[i].title||'',pad+nw+info*1.2,y,{size:info,weight:700,color:col,baseline:'middle',spacing:.02,maxWidth:W-pad*2-nw-tw-info*2.4});
   text(ctx,tm,W-pad,y,{size:info*.92,weight:700,color:col,align:'right',baseline:'middle',spacing:.06});}
  // Sparks from the latest blows fly over everything.
  for(let k=list.length-1;k>=Math.max(0,list.length-40);k--){const age=local-list[k].start;if(age<0)continue;if(age>1.6)break;sparks(ctx,i,k,W/2,L.cy,age,sprites(i,k));}
  // Quench between songs: steam rolls up as the old plate slides out and the new one comes in.
  const tau=i>0&&local<1.2?local+.75:duration-local<.75&&i<N-1?.75-(duration-local):-1;
  if(tau>=0){ctx.globalCompositeOperation='screen';for(const p of puffs){const q=clamp((tau-p.delay)/1.45,0,1);if(q<=0||q>=1)continue;const a=.3*Math.pow(Math.sin(Math.PI*q),.8),sz=u*p.size*(1+q*1.1),x=p.x*W+Math.sin(p.sway+q*2)*u*.05,y=H*(p.y-q*p.rise);ctx.globalAlpha=a;ctx.drawImage(steam,x-sz/2,y-sz/2,sz,sz);}ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';}
 }
 return {draw,duration:base.total};
}

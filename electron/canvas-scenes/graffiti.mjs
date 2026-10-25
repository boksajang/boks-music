import {sceneBase,layer,rgba,mix,hash,random,clamp,lerp,easeOut,easeInOut,setFont,fitText,text,stamp,drawSpectrum,shadowSprite,drawShadow} from '../canvas-kit.mjs';

/**
 * 그래피티 월: a concrete alley wall at night under one fluorescent wall-pack, covered with faded tags,
 * cracks and torn posters. Every song opens with a cardboard stencil pressed on the wall: a spray can
 * sweeps over it and the sheet is peeled away, leaving the stenciled title. Each lyric line is then
 * sprayed on with the can following the paint: a hand-done throw-up built glyph by glyph (leaning,
 * bouncing, overlapping, swollen and warped), with a faded fill, uneven dark outline, 3D block, cloud
 * outline and overspray; tapered paint runs with beads creep out of the letters. When the next line starts a paint roller
 * buffs the previous piece out with a fresh grey coat, so buffed patches pile up across the song.
 * The music only moves a stenciled spectrum near the ground.
 */
const TAU=Math.PI*2;
// Fill fade (top a, middle m, bottom b), cloud outline x and the 3D block k.
const PAINTS=[{a:[238,255,120],m:[168,244,44],b:[52,196,84],x:[255,58,162],k:[38,10,46]},{a:[255,250,170],m:[255,212,40],b:[255,128,26],x:[44,150,255],k:[10,22,58]},{a:[255,198,104],m:[255,112,40],b:[222,34,74],x:[150,72,255],k:[34,10,52]},{a:[255,186,228],m:[255,74,172],b:[186,30,138],x:[60,228,255],k:[8,34,48]}];
const OLD_TAGS=['KAOS','DUSK','REKS','NOVA','SOLO','ZERO','MIKE','RUNE','OKAY','VEX'];
function lru(limit){const m=new Map();return (key,make)=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make();m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};}

export default function graffiti(input){
 const base=sceneBase(input,{hue:80}),{width:W,height:H,portrait,u,tracks}=base;
 const groundY=Math.round(H*(portrait?.915:.9));
 const Z=portrait?{cx:W/2,cy:H*.43,w:u*.86,h:H*.36,size:u*.145}:{cx:W/2,cy:H*.425,w:W*.78,h:H*.46,size:u*.122};
 const INFO=portrait?{x:u*.08,y:H*.705,w:u*.84}:{x:W*.06,y:H*.745,w:W*.46};
 const SPEC=portrait?[u*.08,H*.765,u*.84,H*.095]:[W*.6,H*.73,W*.34,H*.115];
 const LAMP=[W/2,portrait?H*.028:H*.04];
 const measure=layer(8,8).getContext('2d');
 const paintOf=(i,n)=>PAINTS[(i*2+n+5)%PAINTS.length];

 // ---- The wall (unlit), lighting and grain -----------------------------------------------------
 const backdrop=(()=>{
  const c=layer(W,H),g=c.getContext('2d'),r=random(hash('graffiti-wall'));
  g.fillStyle='#5c5a57';g.fillRect(0,0,W,groundY);
  const noise=layer(256,256),ng=noise.getContext('2d');for(let k=0;k<5200;k++){const v=r()<.5?0:255;ng.fillStyle=`rgba(${v},${v},${v},${.03+r()*.09})`;ng.fillRect(r()*256,r()*256,1+r()*2,1+r()*2);}
  g.fillStyle=g.createPattern(noise,'repeat');g.fillRect(0,0,W,groundY);
  for(let k=0;k<46;k++){const x=r()*W,y=r()*groundY,rad=u*(.05+r()*.3),dark=r()<.65,b=g.createRadialGradient(x,y,0,x,y,rad);b.addColorStop(0,dark?`rgba(20,18,16,${.12+r()*.2})`:`rgba(200,196,186,${.05+r()*.08})`);b.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=b;g.fillRect(x-rad,y-rad,rad*2,rad*2);}
  // Formwork panels: seams and tie holes with rust runs.
  const pw=portrait?W/1.6:W/3.3,ph=groundY/2.15;
  for(let x=-pw*.3;x<W;x+=pw){g.fillStyle='rgba(0,0,0,.35)';g.fillRect(x,0,Math.max(1,u*.002),groundY);g.fillStyle='rgba(255,255,255,.06)';g.fillRect(x+Math.max(1,u*.002),0,1,groundY);
   for(let y=ph*.5;y<groundY;y+=ph)for(const fx of [.2,.8]){const hx=x+pw*fx,hy=y+(r()-.5)*u*.01;const run=g.createLinearGradient(0,hy,0,hy+u*(.08+r()*.18));run.addColorStop(0,`rgba(120,62,24,${.2+r()*.2})`);run.addColorStop(1,'rgba(120,62,24,0)');g.fillStyle=run;g.fillRect(hx-u*.004,hy,u*.008,u*.26);
    g.fillStyle='rgba(18,16,14,.8)';g.beginPath();g.arc(hx,hy,u*.006,0,TAU);g.fill();g.fillStyle='rgba(255,255,255,.08)';g.beginPath();g.arc(hx+u*.001,hy+u*.003,u*.006,0,Math.PI);g.fill();}}
  for(let y=ph;y<groundY;y+=ph){g.fillStyle='rgba(0,0,0,.28)';g.fillRect(0,y,W,Math.max(1,u*.0016));}
  for(let k=0;k<9;k++){const x=r()*W,w=u*(.03+r()*.1),st=g.createLinearGradient(0,0,0,groundY*(.3+r()*.6));st.addColorStop(0,'rgba(12,10,8,.4)');st.addColorStop(1,'rgba(12,10,8,0)');g.fillStyle=st;g.fillRect(x,0,w,groundY);}
  // Old work: faded throw-ups, scribbled tags and their runs.
  for(let k=0;k<(portrait?7:11);k++){
   const word=OLD_TAGS[Math.floor(r()*OLD_TAGS.length)],size=u*(.07+r()*.11),x=r()*W,y=size+r()*(groundY-size*1.6),hue=[[200,60,70],[60,110,190],[210,190,170],[90,150,90],[170,90,180]][Math.floor(r()*5)];
   g.save();g.translate(x,y);g.rotate((r()-.5)*.3);g.transform(1,0,-.18,1,0,0);setFont(g,900,size,-.02);g.textAlign='center';g.textBaseline='middle';g.lineJoin='round';
   g.globalAlpha=.06+r()*.07;g.fillStyle=rgba(hue);g.fillText(word,0,0);g.globalAlpha=.07+r()*.08;g.strokeStyle=r()<.5?'#111':'#ddd';g.lineWidth=size*.06;g.strokeText(word,0,0);g.restore();
  }
  for(let k=0;k<(portrait?14:22);k++){
   const x=r()*W,y=u*.05+r()*(groundY-u*.15),s=u*(.03+r()*.06);g.strokeStyle=r()<.6?`rgba(10,10,12,${.25+r()*.25})`:`rgba(230,230,235,${.15+r()*.2})`;g.lineWidth=Math.max(1,u*(.002+r()*.003));g.lineCap='round';g.beginPath();g.moveTo(x,y);
   let px=x,py=y;for(let n=0;n<5+r()*6;n++){const nx=px+s*(.2+r()*.6),ny=y+(r()-.5)*s*1.1;g.bezierCurveTo(px+s*.3,py-s*(r()*.8),nx-s*.3,ny+s*(r()*.8),nx,ny);px=nx;py=ny;}g.stroke();
   if(r()<.5){g.lineWidth=Math.max(1,u*.0016);g.beginPath();g.moveTo(px,py);g.lineTo(px,py+s*(.3+r()*.8));g.stroke();}
  }
  // Cracks: branching random walks with a light lip.
  for(let k=0;k<(portrait?4:6);k++){let x=r()*W,y=r()<.5?groundY:r()*groundY,a=-Math.PI/2+(r()-.5)*1.4;const seg=[];for(let n=0;n<26;n++){a+=(r()-.5)*.8;const nx=x+Math.cos(a)*u*.018,ny=y+Math.sin(a)*u*.018;seg.push([x,y,nx,ny]);x=nx;y=ny;}
   for(const [ox,oy,col,lw] of [[u*.0012,u*.0012,'rgba(230,226,216,.12)',1.4],[0,0,'rgba(12,10,9,.75)',1]]){g.strokeStyle=col;g.lineWidth=Math.max(1,u*.0016*lw);g.beginPath();seg.forEach(([x0,y0,x1,y1],n)=>{if(!n)g.moveTo(x0+ox,y0+oy);g.lineTo(x1+ox,y1+oy);});g.stroke();}}
  // Torn wheatpaste posters near the edges.
  for(let k=0;k<(portrait?3:4);k++){
   const pw2=u*(.16+r()*.12),ph2=pw2*(1.3+r()*.3),left=k%2===0,x=left?W*(.01+r()*.06):W*(.86+r()*.08)-pw2*.3,y=groundY*(.12+r()*.5),tear=.35+r()*.45;
   g.save();g.translate(x,y);g.rotate((r()-.5)*.08);g.beginPath();g.moveTo(0,ph2*(1-tear));
   for(let n=0;n<=12;n++)g.lineTo(pw2*n/12,ph2*(1-tear)+(r()-.5)*ph2*.12+Math.sin(n)*ph2*.04);
   g.lineTo(pw2,ph2);for(let n=12;n>=0;n--)g.lineTo(pw2*n/12,ph2+(r()-.5)*u*.004);g.closePath();
   g.fillStyle=`rgba(${200+r()*20},${190+r()*14},${168+r()*14},.72)`;g.fill();g.clip();
   g.fillStyle=`rgba(${r()<.5?170:30},${r()<.5?40:30},${r()<.5?40:60},.55)`;g.fillRect(0,ph2*.55,pw2,ph2*.12);
   g.fillStyle='rgba(40,36,30,.35)';for(let n=0;n<7;n++)g.fillRect(pw2*.1,ph2*(.72+n*.04),pw2*(.4+r()*.45),ph2*.014);
   for(let n=0;n<6;n++){g.strokeStyle='rgba(0,0,0,.08)';g.lineWidth=u*.002;g.beginPath();g.moveTo(r()*pw2,ph2*(1-tear));g.lineTo(r()*pw2,ph2);g.stroke();}
   g.restore();
  }
  // Wall foot grime, curb and wet asphalt.
  const grime=g.createLinearGradient(0,groundY-u*.12,0,groundY);grime.addColorStop(0,'rgba(10,9,8,0)');grime.addColorStop(1,'rgba(10,9,8,.6)');g.fillStyle=grime;g.fillRect(0,groundY-u*.12,W,u*.12);
  const curbH=u*.024;g.fillStyle='#4a4846';g.fillRect(0,groundY,W,curbH);g.fillStyle='rgba(255,255,255,.08)';g.fillRect(0,groundY,W,Math.max(1,u*.002));
  const asphalt=g.createLinearGradient(0,groundY+curbH,0,H);asphalt.addColorStop(0,'#1d1c1c');asphalt.addColorStop(1,'#0e0e0f');g.fillStyle=asphalt;g.fillRect(0,groundY+curbH,W,H-groundY-curbH);
  for(let k=0;k<W*(H-groundY)/220;k++){g.fillStyle=`rgba(${r()<.5?0:220},${r()<.5?0:220},${r()<.5?0:220},${.04+r()*.07})`;g.fillRect(r()*W,groundY+curbH+r()*(H-groundY-curbH),1+r()*2,1+r()*1.5);}
  return c;
 })();
 const lighting=(()=>{
  const c=layer(W,H),g=c.getContext('2d'),cx=Z.cx,cy=H*.4,rx=portrait?W*.78:W*.5,ry=portrait?H*.42:H*.62;
  g.save();g.translate(cx,cy);g.scale(rx/ry,1);const pool=g.createRadialGradient(0,-ry*.25,ry*.08,0,0,ry*1.05);pool.addColorStop(0,'rgba(4,5,8,0)');pool.addColorStop(.55,'rgba(4,5,8,.42)');pool.addColorStop(1,'rgba(4,5,8,.9)');g.fillStyle=pool;g.fillRect(-ry*3,-cy-ry,ry*6,H+ry*2);g.restore();
  const top=g.createLinearGradient(0,0,0,H*.18);top.addColorStop(0,'rgba(4,5,8,.35)');top.addColorStop(1,'rgba(4,5,8,0)');g.fillStyle=top;g.fillRect(0,0,W,H*.18);
  const bottom=g.createLinearGradient(0,groundY,0,H);bottom.addColorStop(0,'rgba(2,2,4,.15)');bottom.addColorStop(1,'rgba(2,2,4,.6)');g.fillStyle=bottom;g.fillRect(0,groundY,W,H-groundY);
  // The fluorescent cast: slightly green-cool near the lamp.
  g.globalCompositeOperation='lighter';const cast=g.createRadialGradient(LAMP[0],LAMP[1],0,LAMP[0],LAMP[1],u*.55);cast.addColorStop(0,'rgba(120,150,150,.16)');cast.addColorStop(1,'rgba(120,150,150,0)');g.fillStyle=cast;g.fillRect(0,0,W,H);
  return c;
 })();
 const grain=Array.from({length:3},(_,k)=>{const c=layer(256,256),g=c.getContext('2d'),r=random(hash('gr-grain')+k);for(let n=0;n<2400;n++){const v=r()<.55?0:255;g.fillStyle=`rgba(${v},${v},${v},${.05+r()*.09})`;g.fillRect(r()*256,r()*256,1+r()*1.6,1+r()*1.6);}return c;});
 // Fresh buff coat: grey with horizontal roller streaks, used as a pattern inside patch outlines.
 const coat=(()=>{const c=layer(512,512),g=c.getContext('2d'),r=random(hash('coat'));g.fillStyle='#6a6967';g.fillRect(0,0,512,512);
  for(let k=0;k<900;k++){g.fillStyle=r()<.5?`rgba(255,255,255,${r()*.035})`:`rgba(0,0,0,${r()*.045})`;g.fillRect(r()*512-60,r()*512,60+r()*260,1+r()*3);}
  for(let k=0;k<2600;k++){const v=r()<.5?0:255;g.fillStyle=`rgba(${v},${v},${v},${.03+r()*.05})`;g.fillRect(r()*512,r()*512,1+r(),1+r());}return c;})();
 const speck=(()=>{const c=layer(128,64),g=c.getContext('2d'),r=random(hash('speck'));g.fillStyle='#000';for(let k=0;k<1500;k++){const x=Math.pow(r(),1.6)*128;g.globalAlpha=.4+r()*.6;g.beginPath();g.arc(x,r()*64,.4+r()*1.3,0,TAU);g.fill();}return c;})();
 const shadow=shadowSprite(256,{alpha:.7});

 // ---- Lettering plans: every glyph leans, bounces and overlaps its neighbour ------------------------
 function plan(rowsSpec,seed,wild=1){
  const r=random(seed),rows=[];let y=0,maxW=0;
  for(const {line,font,lh} of rowsSpec){setFont(measure,900,font,-.02);const chars=[];let x=0,k=0;
   for(const ch of line){const w=measure.measureText(ch).width,adv=ch===' '?w*.75:w*(1-.06*wild);chars.push({ch,x,w,adv,rot:(r()-.5)*.26*wild,dy:((k++%2?1:-1)*.045+(r()-.5)*.06)*font*wild,sc:1+(r()-.5)*.2*wild,skew:-.06-r()*.16*wild});x+=adv;}
   const tail=chars.length?chars[chars.length-1].w-chars[chars.length-1].adv:0;rows.push({chars,w:x+tail,font,lh,top:y});y+=lh;maxW=Math.max(maxW,x+tail);}
  return {rows,maxW,height:y};
 }
 /** Glyph shapes; `swell` strokes each glyph in its own color with round joins so it puffs up. */
 function shape(g,p,pad,mode,{swell=0}={}){
  g.textAlign='center';g.textBaseline='middle';g.lineJoin='round';g.lineCap='round';
  p.rows.forEach(row=>{const left=pad+(p.maxW-row.w)/2,cy=pad+row.top+row.lh/2;setFont(g,900,row.font,0);
   for(const c of row.chars){if(c.ch===' ')continue;g.save();g.translate(left+c.x+c.w/2,cy+c.dy);g.rotate(c.rot);g.transform(1,0,c.skew,1,0,0);g.scale(c.sc,c.sc);
    if(mode==='fill'){g.fillText(c.ch,0,0);if(swell){g.lineWidth=row.font*swell;g.strokeText(c.ch,0,0);}}else g.strokeText(c.ch,0,0);g.restore();}});
 }
 // Mask helpers (build time only).
 const tintOf=(src,color,alpha=1)=>{const c=layer(src.width,src.height),g=c.getContext('2d');g.drawImage(src,0,0);g.globalCompositeOperation='source-in';g.fillStyle=rgba(color,alpha);g.fillRect(0,0,c.width,c.height);return c;};
 /** Grows a mask by about r in every direction, unevenly (like a hand-held can or marker). */
 function dilate(src,r,seed,irregular=.3){const c=layer(src.width,src.height),g=c.getContext('2d'),q=random(seed),ph=q()*TAU,n=20;g.drawImage(src,0,0);
  for(const f of [.5,1])for(let k=0;k<n;k++){const a=k/n*TAU,rr=r*f*(1+irregular*(Math.sin(a*2+ph)*.6+(q()-.5)*.8));g.drawImage(src,Math.cos(a)*rr,Math.sin(a)*rr);}return c;}
 /** Low-frequency strip displacement, horizontal then vertical, so no edge stays geometric. */
 function warp(src,f,seed){
  const q=random(seed),w=src.width,h=src.height,A=f*.026,p1=q()*TAU,p2=q()*TAU,p3=q()*TAU,p4=q()*TAU,n1=y=>Math.sin(y/f*2.1+p1)*.65+Math.sin(y/f*5.3+p2)*.35,n2=x=>Math.sin(x/f*1.7+p3)*.6+Math.sin(x/f*4.4+p4)*.4;
  const a=layer(w,h),ag=a.getContext('2d'),st=Math.max(2,Math.round(f*.025));for(let y=0;y<h;y+=st)ag.drawImage(src,0,y,w,st,n1(y)*A,y,w,st);
  const b=layer(w,h),bg=b.getContext('2d');for(let x=0;x<w;x+=st)bg.drawImage(a,x,0,st,h,x,n2(x)*A*.8,st,h);return b;
 }
 /**
  * A sprayed piece in two cached layers: `back` (overspray mist and dots, cloud outline, 3D block, dark
  * outline) and `front` (the faded fill with spray speckle and shine). Drips are drawn between them.
  */
 function pieceSprite(p,paint,seed,{stencil=false}={}){
  const f=p.rows[p.rows.length-1].font,pad=f*.75,w=Math.ceil(p.maxW+pad*2),h=Math.ceil(p.height+pad*2),r=random(seed);
  const back=layer(w,h),bg=back.getContext('2d'),front=layer(w,h),fg=front.getContext('2d');
  let mask;
  if(stencil){
   mask=layer(w,h);const mg=mask.getContext('2d');mg.fillStyle='#fff';shape(mg,p,pad,'fill');
   bg.filter=`blur(${f*.07}px)`;bg.drawImage(tintOf(mask,paint.m,.5),0,0);bg.filter=`blur(${f*.22}px)`;bg.drawImage(tintOf(mask,paint.m,.2),0,0);bg.filter='none';
   fg.drawImage(tintOf(mask,paint.m),0,0);
  }else{
   const raw=layer(w,h),rg=raw.getContext('2d');rg.fillStyle=rg.strokeStyle='#fff';shape(rg,p,pad,'fill',{swell:.05});
   mask=warp(raw,f,seed+1);
   const line=dilate(mask,f*.065,seed+2,.45),block=layer(w,h),kg=block.getContext('2d');
   for(let k=1;k<=7;k++)kg.drawImage(line,k*f*.011,k*f*.015);kg.drawImage(line,0,0);
   const cloud=dilate(block,f*.075,seed+3,.6);
   // Overspray: a soft mist of the cloud color, a closer one of the fill, and loose dots past the edge.
   const mist=dilate(cloud,f*.12,seed+4,.8);bg.filter=`blur(${f*.16}px)`;bg.drawImage(tintOf(mist,paint.x,.32),0,0);bg.filter=`blur(${f*.07}px)`;bg.drawImage(tintOf(line,paint.m,.35),0,0);bg.filter='none';
   const md=mist.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;bg.fillStyle=rgba(paint.x,.55);
   for(let k=0,n=Math.round(w*h/220);k<n;k++){const x=r()*w,y=r()*h,o=((y|0)*w+(x|0))*4+3;if(md[o]>10&&md[o]<250){bg.globalAlpha=.2+r()*.6;bg.beginPath();bg.arc(x,y,.4+r()*f*.008,0,TAU);bg.fill();}}bg.globalAlpha=1;
   bg.drawImage(tintOf(cloud,paint.x),0,0);
   bg.drawImage(tintOf(block,paint.k),0,0);
   bg.drawImage(tintOf(line,[12,10,16]),0,0);
   // Fill: a three-color fade per row.
   p.rows.forEach((row,k)=>{const t=pad+row.top,y0=k?t:0,y1=k===p.rows.length-1?h:t+row.lh,gr=fg.createLinearGradient(0,t+row.lh*.12,0,t+row.lh*.88);gr.addColorStop(0,rgba(paint.a));gr.addColorStop(.5,rgba(paint.m));gr.addColorStop(1,rgba(paint.b));fg.fillStyle=gr;fg.fillRect(0,y0,w,y1-y0);});
   fg.globalCompositeOperation='destination-in';fg.drawImage(mask,0,0);
  }
  // Spray texture on the paint: uneven density patches, speckle and white shine marks upper left.
  fg.globalCompositeOperation='source-atop';
  for(let k=0;k<Math.max(4,w*h/(f*f*1.2));k++){const x=r()*w,y=r()*h,rad=f*(.2+r()*.5),cl=fg.createRadialGradient(x,y,0,x,y,rad);cl.addColorStop(0,r()<.5?'rgba(0,0,0,.14)':'rgba(255,255,255,.14)');cl.addColorStop(1,'rgba(0,0,0,0)');fg.fillStyle=cl;fg.fillRect(x-rad,y-rad,rad*2,rad*2);}
  for(let k=0;k<w*h/150;k++){fg.fillStyle=r()<.5?`rgba(0,0,0,${r()*.2})`:`rgba(255,255,255,${r()*.2})`;fg.fillRect(r()*w,r()*h,1+r()*1.8,1+r()*1.8);}
  if(!stencil){fg.strokeStyle='rgba(255,255,255,.85)';fg.fillStyle='rgba(255,255,255,.9)';fg.lineCap='round';
   p.rows.forEach(row=>{const left=pad+(p.maxW-row.w)/2,cy=pad+row.top+row.lh/2;for(const c of row.chars){if(c.ch===' '||r()<.35)continue;const x=left+c.x+c.w*(.18+r()*.12),y=cy+c.dy-row.font*(.22+r()*.08);
    fg.lineWidth=row.font*(.03+r()*.02);fg.beginPath();fg.moveTo(x,y+row.font*.1);fg.quadraticCurveTo(x+row.font*.01,y,x+row.font*.1,y-row.font*.03);fg.stroke();if(r()<.6){fg.beginPath();fg.arc(x+row.font*.17,y-row.font*.05,row.font*.016,0,TAU);fg.fill();}}});}
  fg.globalCompositeOperation='source-over';
  if(stencil){fg.globalCompositeOperation='destination-out';p.rows.forEach(row=>fg.fillRect(0,pad+row.top+row.lh*.5+row.font*.02,w,row.font*.05));fg.globalCompositeOperation='source-over';}
  // Drip candidates: bottom edges of the fill (opaque pixel with clear wall below), picked apart.
  const mp=mask.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data,cands=[],step=Math.max(2,Math.round(f*.04));
  p.rows.forEach((row,k)=>{const top=Math.round(pad+row.top),bot=Math.min(h-2,Math.round(pad+row.top+row.lh+f*.15)),left=Math.round(pad+(p.maxW-row.w)/2);
   for(let x=left;x<left+row.w;x+=step){let y=-1;for(let yy=bot;yy>=top;yy--)if(mp[(yy*w+x)*4+3]>200){y=yy;break;}
    // A run needs paint above it and clear wall below it (no letter of the next row in the way).
    let clear=y>0&&mp[((y-Math.round(f*.06))*w+x)*4+3]>200;for(let yy=y+Math.round(f*.12);clear&&yy<Math.min(h,y+f*.9);yy+=3)if(mp[(yy*w+x)*4+3]>40)clear=false;
    if(clear)cands.push({x,y,row:k,depth:y-top});}});
  cands.sort((a,b)=>b.depth-a.depth);
  const drips=[],want=stencil?2:3+Math.floor(r()*4);
  for(const c of cands){if(drips.length>=want)break;if(r()<.35||drips.some(d=>Math.abs(d.x-c.x)<f*.45))continue;const long=r()<.55;
   drips.push({x:c.x,y:c.y-f*.02,row:c.row,len:f*(long?.55+r()*.45:.12+r()*.2),w0:f*(.075+r()*.05),dur:1.4+r()*2.2,delay:.2+r()*1.4,wave:(r()-.5)*f*.05,ph:r()*TAU});}
  return {back,front,w,h,pad,drips,color:stencil?paint.m:paint.b};
 }
 /** A paint run grown to fraction g of its length: tapered, a little wavy, ending in a bead. */
 function drawDrip(g,d,grow,color){
  const len=d.len*grow;if(len<d.w0*.4)return;const seg=8,L=[],R=[];
  for(let k=0;k<=seg;k++){const t=k/seg,y=d.y+len*t,x=d.x+Math.sin(t*3+d.ph)*d.wave*t,half=d.w0*lerp(.62,.3,Math.pow(t,.5));L.push([x-half,y]);R.push([x+half,y]);}
  const end=L[seg],ex=(end[0]+R[seg][0])/2,ey=end[1],bead=d.w0*.62;
  g.fillStyle=rgba(color);g.beginPath();g.moveTo(L[0][0]-d.w0*.25,L[0][1]-d.w0*.3);L.forEach(([x,y])=>g.lineTo(x,y));g.arc(ex,ey,bead*.62,Math.PI,0,true);for(let k=seg;k>=0;k--)g.lineTo(R[k][0],R[k][1]);g.lineTo(R[0][0]+d.w0*.25,R[0][1]-d.w0*.3);g.closePath();g.fill();
  g.beginPath();g.ellipse(ex,ey+bead*.25,bead*.78,bead,0,0,TAU);g.fill();
  g.strokeStyle=rgba(mix(color,[0,0,0],.45),.85);g.lineWidth=Math.max(1,d.w0*.16);g.beginPath();R.slice(1).forEach(([x,y],k)=>k?g.lineTo(x,y):g.moveTo(x,y));g.stroke();
  g.beginPath();g.arc(ex,ey+bead*.25,bead*.9,-.2,Math.PI*.7);g.stroke();
  g.strokeStyle='rgba(255,255,255,.55)';g.lineWidth=Math.max(1,d.w0*.1);g.beginPath();L.slice(2,seg).forEach(([x,y],k)=>k?g.lineTo(x+d.w0*.18,y):g.moveTo(x+d.w0*.18,y));g.stroke();
  g.fillStyle='rgba(255,255,255,.6)';g.beginPath();g.arc(ex-bead*.3,ey,bead*.18,0,TAU);g.fill();
 }
 /** Gravity-like run: quick, slowing, a pause, then a last small creep. */
 const runOf=q=>q<.62?.86*easeOut(q/.62):q<.8?.86:.86+.14*easeInOut((q-.8)/.2);

 // ---- Items: the stenciled title (n = -1) and the lyric lines --------------------------------------
 const layouts=lru(160),sprites=lru(10),sheets=lru(3);
 const cuesOf=i=>tracks[i]?.cues||[];
 function layoutOf(i,n){return layouts(`${i}:${n}`,()=>{
  const r=random(hash(`gl${i}:${n}`));
  if(n<0){
   const label=`TRACK ${String(i+1).padStart(2,'0')} / ${String(tracks.length).padStart(2,'0')}`,lf=Z.size*.32;
   const fit=fitText(measure,tracks[i].title||' ',{size:Z.size*1.08,minSize:Z.size*.45,weight:900,lineHeight:1.12,maxWidth:Z.w*.9,maxHeight:Z.h*.68,spacing:-.03,maxLines:portrait?3:2});
   const p=plan([{line:label,font:lf,lh:lf*1.7},...fit.lines.map(line=>({line,font:fit.font,lh:fit.font*1.12}))],hash(`tp${i}`),.35);
   p.rows[0].chars.forEach(c=>{c.rot*=.3;c.dy*=.3;});
   return {p,cx:Z.cx,cy:Z.cy,rot:-.025,content:!!(tracks[i].title||'').trim(),font:fit.font};
  }
  const t=String(cuesOf(i)[n]?.text||'').trim(),fit=fitText(measure,t||' ',{size:Z.size,minSize:Z.size*.42,weight:900,lineHeight:1.22,maxWidth:Z.w*.86,maxHeight:Z.h*.82,spacing:-.03,maxLines:3});
  const p=plan(fit.lines.map(line=>({line,font:fit.font,lh:fit.font*1.22})),hash(`lp${i}:${n}`));
  return {p,cx:Z.cx+(r()-.5)*Z.w*.05,cy:Z.cy+(r()-.5)*Z.h*.07,rot:(r()-.5)*.07,content:!!t,font:fit.font};
 });}
 const spriteOf=(i,n)=>sprites(`${i}:${n}`,()=>{const L=layoutOf(i,n);return pieceSprite(L.p,paintOf(i,n),hash(`gs${i}:${n}`),{stencil:n<0});});
 /** Axis-aligned box the roller has to cover (lettering plus its runs), in screen space. */
 function boundsOf(i,n){const L=layoutOf(i,n),f=L.font,hw=L.p.maxW/2+f*.42,top=-L.p.height/2-f*.3,bottom=L.p.height/2+f*(n<0?.7:1.15),cs=Math.abs(Math.cos(L.rot)),sn=Math.abs(Math.sin(L.rot));
  const ex=hw*cs+Math.max(-top,bottom)*sn,x0=Math.max(W*.03,L.cx-ex-u*.02),x1=Math.min(W*.97,L.cx+ex+u*.02);return {x:x0,y:L.cy+top-hw*sn-u*.015,w:x1-x0,h:bottom-top+hw*sn*2+u*.03};}
 function introOf(i){
  const first=cuesOf(i).find(c=>Number.isFinite(c.start))?.start??Infinity,t0=(i>0?.85:0)+.1,room=first-t0;
  if(room<.9)return null;const k=clamp((room-.4)/3.4,.3,1);
  return {t0,slide:.45*k,spray:1.6*k,hold:.25*k,peel:.65*k};
 }
 const titleShown=i=>!!introOf(i)&&layoutOf(i,-1).content;
 const has=(i,n)=>n<0?titleShown(i):layoutOf(i,n).content;
 /** How long a line takes to spray: its sung length, stretched for very short cue timings. */
 function sprayTime(i,n){const cues=cuesOf(i),cue=cues[n],next=cues.slice(n+1).find(c=>Number.isFinite(c.start))?.start,own=Number.isFinite(cue.end)&&cue.end>cue.start?cue.end-cue.start:0,room=(next??cue.start+4)-cue.start;return Math.max(.7,Math.min(Math.max(own,Math.min(3.2,room)*.8),room*.92));}
 const rollTime=(i,n)=>{const cues=cuesOf(i),next=cues.slice(n+1).find(c=>Number.isFinite(c.start))?.start;return clamp(((next??cues[n].start+3)-cues[n].start)*.28,.32,.72);};

 // Reveal scratch layers (grown on demand).
 let S=layer(8,8),M=layer(8,8);
 const fitScratch=(w,h)=>{if(S.width<w||S.height<h){S=layer(Math.max(S.width,w),Math.max(S.height,h));M=layer(S.width,S.height);}};
 /** Head position of a reveal 0..1 through the rows: [row index, x in sprite]. */
 function headOf(p,pad,rv){const total=p.rows.reduce((n,row)=>n+row.w,0)||1;let d=rv*total;for(let k=0;k<p.rows.length;k++){const row=p.rows[k];if(d<=row.w||k===p.rows.length-1)return [k,pad+(p.maxW-row.w)/2+Math.min(d,row.w)];d-=row.w;}return [0,0];}
 function revealAt(p,pad,k,x){let before=0;for(let n=0;n<k;n++)before+=p.rows[n].w;const total=p.rows.reduce((n,row)=>n+row.w,0)||1;return clamp((before+x-(pad+(p.maxW-p.rows[k].w)/2))/total,0,1);}
 /** Draws an item at reveal rv (0..1) with its runs `age` seconds after the reveal began. */
 function drawItem(ctx,i,n,rv,age,dur){
  const L=layoutOf(i,n);if(!L.content||rv<=0)return null;
  const sp=spriteOf(i,n),{p}=L,pad=sp.pad;let head=null;
  ctx.save();ctx.translate(L.cx,L.cy);ctx.rotate(L.rot);ctx.translate(-sp.w/2,-sp.h/2);
  // Back layer, the runs (out of the fill, over the outline), then the fill on top.
  const paint=paintOf(i,n),compose=g=>{g.drawImage(sp.back,0,0);for(const d of sp.drips){const at=revealAt(p,pad,d.row,d.x)*dur+d.delay,a=age-at;if(a>0)drawDrip(g,d,runOf(clamp(a/d.dur,0,1)),sp.color);}g.drawImage(sp.front,0,0);};
  if(rv>=1)compose(ctx);
  else{
   fitScratch(sp.w,sp.h);const [k,hx]=headOf(p,pad,rv),row=p.rows[k],E=row.font*.9,band=y=>y===0?0:pad+p.rows[y].top,bandEnd=y=>y===p.rows.length-1?sp.h:pad+p.rows[y].top+p.rows[y].lh;
   const m=M.getContext('2d'),sg=S.getContext('2d');m.clearRect(0,0,sp.w,sp.h);m.fillStyle='#000';
   for(let y=0;y<k;y++)m.fillRect(0,band(y),sp.w,bandEnd(y)-band(y));
   const t0=band(k),bh=bandEnd(k)-t0;m.fillRect(0,t0,Math.max(0,hx-E*.5),bh);
   const edge=m.createLinearGradient(hx-E*.5,0,hx+E*.25,0);edge.addColorStop(0,'#000');edge.addColorStop(1,'rgba(0,0,0,0)');m.fillStyle=edge;m.fillRect(hx-E*.5,t0,E*.75,bh);
   m.drawImage(speck,hx-E*.25,t0,E*1.1,bh);
   sg.clearRect(0,0,sp.w,sp.h);compose(sg);sg.globalCompositeOperation='destination-in';sg.drawImage(M,0,0);sg.globalCompositeOperation='source-over';
   ctx.drawImage(S,0,0,sp.w,sp.h,0,0,sp.w,sp.h);
   head=[hx,pad+row.top+row.lh/2,row];
  }
  ctx.restore();
  if(!head)return null;
  const [hx,hy]=head,lx=hx-sp.w/2,ly=hy-sp.h/2,cs=Math.cos(L.rot),sn=Math.sin(L.rot);
  return {x:L.cx+lx*cs-ly*sn,y:L.cy+lx*sn+ly*cs,rowH:head[2].lh,paint};
 }
 // Patches: rough-edged buffed rectangles (the roller's own edges are straight, its ends ragged).
 const patchPaths=lru(80);
 function patchPath(b,seed){return patchPaths(`${seed}:${Math.round(b.w)}x${Math.round(b.h)}`,()=>{const r=random(hash(seed)),P=new Path2D(),j=u*.006;P.moveTo(0,0);
  for(let n=1;n<=24;n++)P.lineTo(b.w*n/24,(r()-.5)*j);for(let n=1;n<=10;n++)P.lineTo(b.w+(r()-.3)*u*.018,b.h*n/10);for(let n=23;n>=0;n--)P.lineTo(b.w*n/24,b.h+(r()-.5)*j);for(let n=9;n>=1;n--)P.lineTo((r()-.7)*u*.018,b.h*n/10);P.closePath();return P;});}
 function drawPatch(g,b,seed){
  const r=random(hash(seed+'t')),P=patchPath(b,seed);g.save();g.translate(b.x,b.y);
  const pat=g.createPattern(coat,'repeat');pat.setTransform?.(new DOMMatrix([1,0,0,1,-r()*512,-r()*512]));g.fillStyle=pat;g.fill(P);
  g.fillStyle=r()<.5?`rgba(255,250,240,${.02+r()*.05})`:`rgba(0,0,0,${.03+r()*.08})`;g.fill(P);
  g.fillStyle='rgba(0,0,0,.18)';g.fillRect(0,0,b.w,Math.max(1,u*.002));g.fillRect(0,b.h-Math.max(1,u*.003),b.w,Math.max(1,u*.003));
  g.fillStyle='rgba(255,255,255,.06)';g.fillRect(0,b.h*(.3+r()*.4),b.w,Math.max(1,u*.0015));
  g.restore();
 }
 /** The whole wall area the previous song used, buffed at a song change. */
 const zoneOf=lru(4);
 function songZone(i){return zoneOf(i,()=>{let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;const add=b=>{x0=Math.min(x0,b.x);y0=Math.min(y0,b.y);x1=Math.max(x1,b.x+b.w);y1=Math.max(y1,b.y+b.h);};
  for(let n=-1;n<cuesOf(i).length;n++)if(has(i,n))add(boundsOf(i,n));if(!Number.isFinite(x0))return null;return {x:x0-u*.01,y:y0-u*.01,w:x1-x0+u*.02,h:y1-y0+u*.02};});}
 const covers=lru(2);
 /** All buff coats of song i that are finished before line c's roller (zone, title, lines < c-1). */
 function coverLayer(i,c){if(!(i>0&&songZone(i-1))&&c<1)return null;return covers(`${i}:${c}`,()=>{const l=layer(W,H),g=l.getContext('2d');if(i>0&&songZone(i-1))drawPatch(g,songZone(i-1),`z${i}`);for(let n=-1;n<=c-2;n++)if(has(i,n))drawPatch(g,boundsOf(i,n),`p${i}:${n}`);return l;});}

 // ---- Props ----------------------------------------------------------------------------------------
 function drawRoller(ctx,x,top,h){
  const rw=clamp(h*.17,u*.04,u*.075),bottom=top+h,phase=x/(Math.PI*rw)*TAU;
  ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.roundRect(x-rw*.25,top+rw*.15,rw,h,rw*.3);ctx.fill();
  // Frame and pole running out of the frame at the bottom right.
  const hx=x+rw*1.1,hy=bottom+rw*1.2;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.strokeStyle='#8d9196';ctx.lineWidth=u*.006;ctx.beginPath();ctx.moveTo(x,top-rw*.08);ctx.lineTo(x+rw*.7,top-rw*.08);ctx.lineTo(x+rw*.7,bottom+rw*.5);ctx.lineTo(hx,hy);ctx.stroke();
  ctx.strokeStyle='#c8a62a';ctx.lineWidth=u*.02;ctx.beginPath();ctx.moveTo(hx,hy);ctx.lineTo(hx+u*.05,hy+u*.14);ctx.stroke();
  ctx.strokeStyle='#9da3aa';ctx.lineWidth=u*.014;ctx.beginPath();ctx.moveTo(hx+u*.05,hy+u*.14);ctx.lineTo(hx+u*.05+H*.35,hy+u*.14+H);ctx.stroke();
  const body=ctx.createLinearGradient(x-rw/2,0,x+rw/2,0);body.addColorStop(0,'#2a2a2b');body.addColorStop(.32,'#8f8e8b');body.addColorStop(.5,'#7a7976');body.addColorStop(1,'#232324');
  ctx.fillStyle=body;ctx.beginPath();ctx.roundRect(x-rw/2,top,rw,h,rw*.16);ctx.fill();
  // Nap ridges turning with the travel.
  for(let k=0;k<9;k++){const a=phase+k*TAU/9,cs=Math.cos(a);if(cs<=0)continue;const xs=x+Math.sin(a)*rw*.46;ctx.fillStyle=`rgba(20,20,20,${.35*cs})`;ctx.fillRect(xs-rw*.03,top+rw*.06,rw*.06,h-rw*.12);ctx.fillStyle=`rgba(230,228,222,${.12*cs})`;ctx.fillRect(xs+rw*.03,top+rw*.06,rw*.025,h-rw*.12);}
  ctx.fillStyle='rgba(255,255,255,.14)';ctx.fillRect(x-rw*.2,top+rw*.08,rw*.08,h-rw*.16);
  ctx.fillStyle='#1b1b1c';for(const y of [top,bottom])ctx.fillRect(x-rw*.5,y-rw*.04,rw,rw*.08);
 }
 function drawCan(ctx,x,y,paint,alpha,away){
  const cw=u*.048,ch=u*.13,ang=.5+away*.4;ctx.save();ctx.globalAlpha=alpha;
  ctx.globalCompositeOperation='lighter';const mist=ctx.createRadialGradient(x,y,0,x,y,u*.07);mist.addColorStop(0,rgba(paint.m,.5*(1-away)));mist.addColorStop(1,rgba(paint.m,0));ctx.fillStyle=mist;ctx.fillRect(x-u*.07,y-u*.07,u*.14,u*.14);ctx.globalCompositeOperation='source-over';
  ctx.translate(x+u*.012+away*u*.25,y+u*.01+away*u*.2);ctx.rotate(-ang);
  drawShadow(ctx,shadow,-cw/2+u*.01,cw*.2,cw,ch,{alpha:.45*alpha,offsetY:.05,spread:1.25});
  ctx.fillStyle='#e8e8e4';ctx.fillRect(-cw*.16,0,cw*.32,cw*.3);ctx.fillStyle='#111';ctx.fillRect(-cw*.06,cw*.06,cw*.12,cw*.08);
  ctx.fillStyle=rgba(paint.m);ctx.beginPath();ctx.roundRect(-cw*.42,cw*.26,cw*.84,cw*.5,[cw*.4,cw*.4,cw*.05,cw*.05]);ctx.fill();
  const b=ctx.createLinearGradient(-cw/2,0,cw/2,0);b.addColorStop(0,'#3a3b3e');b.addColorStop(.3,'#d9dade');b.addColorStop(.55,'#9a9ca2');b.addColorStop(1,'#2c2d30');ctx.fillStyle=b;ctx.beginPath();ctx.roundRect(-cw/2,cw*.72,cw,ch,cw*.12);ctx.fill();
  ctx.globalAlpha=alpha*.85;ctx.fillStyle=rgba(paint.m);ctx.fillRect(-cw/2,cw*.72+ch*.28,cw,ch*.42);ctx.fillStyle='#111';ctx.fillRect(-cw/2,cw*.72+ch*.46,cw,ch*.05);ctx.fillStyle=rgba(paint.x);ctx.fillRect(-cw/2,cw*.72+ch*.58,cw,ch*.04);
  ctx.globalAlpha=alpha*.35;ctx.fillStyle='#fff';ctx.fillRect(-cw*.24,cw*.75,cw*.08,ch*.94);ctx.restore();
 }
 // Fluorescent wall-pack: steady, with a seeded stutter now and then.
 function tube(t){const slot=Math.floor(t/3.7),r=random(hash(`tube${slot}`));if(r()>.2)return 1;const at=r()*2.6,len=.18+r()*.4,dt=t-slot*3.7-at;if(dt<0||dt>len)return 1;return Math.floor(dt*28+r()*4)%3===0?.25:.85;}
 function drawLamp(ctx,t){
  const [x,y]=LAMP,w=u*.17,h=u*.034,on=tube(t);
  ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(x-w/2+u*.004,y-h*.6+u*.008,w,h*1.2);
  ctx.fillStyle='#1d1f22';ctx.beginPath();ctx.roundRect(x-w/2,y-h*.6,w,h*.9,u*.004);ctx.fill();ctx.fillStyle='rgba(255,255,255,.08)';ctx.fillRect(x-w/2,y-h*.6,w,Math.max(1,u*.002));
  ctx.fillStyle=`rgba(${lerp(70,228,on)},${lerp(80,246,on)},${lerp(84,240,on)},1)`;ctx.beginPath();ctx.roundRect(x-w*.45,y+h*.2,w*.9,h*.32,h*.12);ctx.fill();
  ctx.globalCompositeOperation='lighter';const gl=ctx.createRadialGradient(x,y+h*.4,0,x,y+h*.4,u*.2);gl.addColorStop(0,`rgba(190,230,220,${.38*on})`);gl.addColorStop(1,'rgba(190,230,220,0)');ctx.fillStyle=gl;ctx.fillRect(x-u*.2,y-u*.2,u*.4,u*.4);ctx.globalCompositeOperation='source-over';
  // When the tube drops out the wall falls a little darker.
  if(on<1){ctx.fillStyle=`rgba(3,4,6,${(1-on)*.3})`;ctx.fillRect(0,0,W,H);}
 }
 const sticker=(()=>{if(!base.headline)return null;const size=u*(portrait?.034:.03);setFont(measure,800,size,.02);const tw=Math.min(measure.measureText(base.headline).width,(portrait?u*.8:W*.38)),pw=tw+size*1.6,ph=size*2.1,c=layer(pw+u*.02,ph+u*.02),g=c.getContext('2d');
  g.fillStyle='rgba(0,0,0,.45)';g.beginPath();g.roundRect(u*.006,u*.009,pw,ph,size*.25);g.fill();
  g.fillStyle='#f1efe8';g.beginPath();g.moveTo(size*.25,0);g.lineTo(pw-size*.6,0);g.lineTo(pw,size*.6);g.lineTo(pw,ph-size*.25);g.quadraticCurveTo(pw,ph,pw-size*.25,ph);g.lineTo(size*.25,ph);g.quadraticCurveTo(0,ph,0,ph-size*.25);g.lineTo(0,size*.25);g.quadraticCurveTo(0,0,size*.25,0);g.fill();
  g.fillStyle='#c9c5b8';g.beginPath();g.moveTo(pw-size*.6,0);g.lineTo(pw-size*.6,size*.6);g.lineTo(pw,size*.6);g.fill();
  g.fillStyle='#e8323c';g.fillRect(0,ph-size*.32,pw,size*.14);
  text(g,base.headline,size*.8,ph*.47,{size,weight:800,color:'#141414',baseline:'middle',spacing:.02,maxWidth:tw});
  const r=random(hash('stk'));for(let k=0;k<pw*ph/90;k++){g.fillStyle=`rgba(0,0,0,${r()*.06})`;g.fillRect(r()*pw,r()*ph,1.5,1.5);}
  return c;})();
 const infos=lru(3);
 const infoOf=i=>infos(i,()=>{const paint=paintOf(i,-1),nf=u*(portrait?.085:.075),tf=u*(portrait?.036:.031),c=layer(INFO.w,nf*1.5),g=c.getContext('2d'),num=String(i+1).padStart(2,'0');
  setFont(g,900,nf,-.04);const nw=g.measureText(num).width;g.filter=`blur(${nf*.08}px)`;text(g,num,nf*.1,nf*.72,{size:nf,weight:900,color:rgba(paint.m,.5),baseline:'middle',spacing:-.04});g.filter='none';
  text(g,num,nf*.1,nf*.72,{size:nf,weight:900,color:rgba(paint.m),baseline:'middle',spacing:-.04});g.fillStyle='rgba(0,0,0,1)';g.globalCompositeOperation='destination-out';g.fillRect(0,nf*.74,nw+nf*.2,nf*.05);g.globalCompositeOperation='source-over';
  const tx=nf*.1+nw+nf*.3;text(g,tracks[i].title||'',tx,nf*.5,{size:tf,weight:800,color:'#f2f2ee',baseline:'middle',maxWidth:INFO.w-tx-u*.01});
  return {c,tx,nf,tf};});
 const progressStrip=lru(3);
 const stripOf=i=>progressStrip(i,()=>{const paint=paintOf(i,0),x0=INFO.x,x1=W-INFO.x,h=u*.03,c=layer(x1-x0+h*2,h*2),g=c.getContext('2d'),r=random(hash(`ps${i}`));
  g.filter=`blur(${h*.25}px)`;g.strokeStyle=rgba(paint.m,.55);g.lineWidth=h*.5;g.lineCap='round';g.beginPath();g.moveTo(h,h);for(let x=0;x<=x1-x0;x+=u*.05)g.lineTo(h+x,h+(r()-.5)*h*.25);g.stroke();g.filter='none';
  g.strokeStyle=rgba(mix(paint.m,[255,255,255],.25));g.lineWidth=h*.2;g.beginPath();g.moveTo(h,h);for(let x=0;x<=x1-x0;x+=u*.05)g.lineTo(h+x,h+(r()-.5)*h*.12);g.stroke();return {c,x0,h};});
 const specLayer=layer(Math.max(2,SPEC[2]),Math.max(2,SPEC[3])),specGlow=layer(Math.max(2,SPEC[2]/6),Math.max(2,SPEC[3]/6));

 // ---- One song's wall at a moment -------------------------------------------------------------------
 function songState(i,local){const cues=cuesOf(i);let c=-1;for(let n=cues.length-1;n>=0;n--)if(Number.isFinite(cues[n].start)&&cues[n].start<=local){c=n;break;}return c;}
 /** Draws song i's paint; returns the props (can, roller) to draw above the lighting. */
 function drawSong(ctx,i,local){
  const props={};const c=songState(i,local),cues=cuesOf(i);
  const cov=coverLayer(i,c);if(cov)ctx.drawImage(cov,0,0);
  else if(i>0&&songZone(i-1))drawPatch(ctx,songZone(i-1),`z${i}`);
  if(c<0){
   const intro=introOf(i);if(!intro||!layoutOf(i,-1).content)return props;
   const {t0,slide,spray,hold,peel}=intro,a=local-t0,rv=clamp((a-slide)/spray,0,1);
   const head=drawItem(ctx,i,-1,rv,a-slide,spray);
   // The cardboard stencil over the paint, then peeled off toward the viewer.
   const L=layoutOf(i,-1),sp=spriteOf(i,-1),sheet=sheetOf(i),qIn=easeOut(a/Math.max(.05,slide)),qOut=clamp((a-slide-spray-hold)/peel,0,1),qo=easeInOut(qOut);
   if(a>=0&&qOut<1){
    ctx.save();ctx.translate(L.cx+(1-qIn)*-u*.25+qo*u*.2,L.cy+(1-qIn)*u*.08-qo*u*.3);ctx.rotate(L.rot+(1-qIn)*-.12+qo*.32);const sc=1+qo*.18;ctx.scale(sc,sc);ctx.globalAlpha=qIn*Math.pow(1-qOut,1.6);
    drawShadow(ctx,shadow,-sheet.w/2,-sheet.h/2,sheet.w,sheet.h,{alpha:.5+qo*.4,offsetY:.04+qo*.12,spread:1.08+qo*.12});
    ctx.drawImage(sheet.c,-sheet.w/2,-sheet.h/2);
    // Overspray left on the cardboard behind the can.
    const cover=rv>=1?sheet.w:(head?((head.x-L.cx)/Math.cos(L.rot))+sheet.w/2:0);
    if(cover>0){const paint=paintOf(i,-1),gr=ctx.createLinearGradient(-sheet.w/2+cover-u*.08,0,-sheet.w/2+cover,0);gr.addColorStop(0,rgba(paint.m,.2));gr.addColorStop(1,rgba(paint.m,0));ctx.fillStyle=gr;ctx.fillRect(-sheet.w/2,-sheet.h/2,cover,sheet.h);}
    ctx.restore();
   }
   if(rv>0&&rv<1&&head)props.can={...head,alpha:1,away:0};
   else if(rv>=1&&a-slide-spray<.4)props.can={x:L.cx+sp.w*.38,y:L.cy,paint:paintOf(i,-1),alpha:1-clamp((a-slide-spray)/.4,0,1),away:easeOut((a-slide-spray)/.4)};
   return props;
  }
  // Roller over the previous piece at the start of the line.
  const start=cues[c].start,age=local-start,R=rollTime(i,c),rp=age/R;let rollX=Infinity;
  if(has(i,c-1)){
   const b=boundsOf(i,c-1);
   if(rp<1){rollX=lerp(b.x-u*.05,b.x+b.w+u*.05,easeInOut(rp));
    ctx.save();ctx.beginPath();ctx.rect(rollX,0,W-rollX,H);ctx.clip();drawPrev(ctx,i,c-1,local);ctx.restore();
    ctx.save();ctx.beginPath();ctx.rect(0,0,rollX,H);ctx.clip();drawPatch(ctx,b,`p${i}:${c-1}`);ctx.restore();props.roller={x:rollX,top:b.y,h:b.h};}
   else drawPatch(ctx,b,`p${i}:${c-1}`);
  }
  const dur=sprayTime(i,c),rv=clamp(age/dur,0,1);
  ctx.save();if(rollX<Infinity){ctx.beginPath();ctx.rect(0,0,rollX-u*.03,H);ctx.clip();}
  const head=drawItem(ctx,i,c,rv,age,dur);ctx.restore();
  if(head&&rv<1)props.can={...head,alpha:clamp(age/.2,0,1),away:0};
  else if(rv>=1&&age-dur<.45&&layoutOf(i,c).content){const L=layoutOf(i,c),sp=spriteOf(i,c),k=clamp((age-dur)/.45,0,1);props.can={x:L.cx+sp.w/2-sp.pad*1.2,y:L.cy+sp.h*.12,paint:paintOf(i,c),alpha:1-k,away:easeOut(k)};}
  return props;
 }
 /** A finished piece as it looked at `local` (the title stencil or a line, with its runs). */
 function drawPrev(ctx,i,n,local){if(n<0){const intro=introOf(i);drawItem(ctx,i,-1,1,local-intro.t0-intro.slide,intro.spray);}else drawItem(ctx,i,n,1,local-cuesOf(i)[n].start,sprayTime(i,n));}
 function sheetOf(i){return sheets(i,()=>{
  const L=layoutOf(i,-1),sp=spriteOf(i,-1),m=sp.pad*.2,w=Math.ceil(sp.w+m*2),h=Math.ceil(sp.h+m*2),c=layer(w,h),g=c.getContext('2d'),r=random(hash(`sheet${i}`));
  g.fillStyle='#6f5c45';g.beginPath();g.moveTo(0,0);for(let n=1;n<=10;n++)g.lineTo(w*n/10,(r()-.5)*u*.006);for(let n=1;n<=6;n++)g.lineTo(w+(r()-.5)*u*.006,h*n/6);for(let n=9;n>=0;n--)g.lineTo(w*n/10,h+(r()-.5)*u*.006);g.closePath();g.fill();
  for(let y=0;y<h;y+=u*.012){g.fillStyle=`rgba(0,0,0,${.03+r()*.03})`;g.fillRect(0,y,w,Math.max(1,u*.003));}
  for(let k=0;k<14;k++){const x=r()*w,y=r()*h,rad=u*(.03+r()*.1),st=g.createRadialGradient(x,y,0,x,y,rad);st.addColorStop(0,`rgba(${r()<.5?60:200},${r()<.5?30:60},${r()<.5?20:150},${.06+r()*.08})`);st.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=st;g.fillRect(x-rad,y-rad,rad*2,rad*2);}
  g.save();g.translate(m,m);g.globalCompositeOperation='destination-out';g.fillStyle='#000';shape(g,L.p,sp.pad,'fill');g.restore();
  g.fillStyle='#6f5c45';L.p.rows.forEach(row=>g.fillRect(0,m+sp.pad+row.top+row.lh*.5+row.font*.02,w,row.font*.05));
  g.strokeStyle='rgba(40,28,16,.5)';g.lineWidth=Math.max(1,u*.002);g.strokeRect(1,1,w-2,h-2);
  // Masking tape on two corners.
  for(const [x,y,a] of [[w*.04,h*.06,-.6],[w*.96,h*.94,-.6]]){g.save();g.translate(x,y);g.rotate(a);g.fillStyle='rgba(226,214,170,.85)';g.fillRect(-u*.045,-u*.012,u*.09,u*.024);g.restore();}
  return {c,w,h};});}

 function draw(ctx,time){
  const s=base.at(time),{i,local}=s;
  ctx.drawImage(backdrop,0,0);
  // Song change: the roller buffs the whole area the last song used, then the next stencil goes up.
  let props,changeRoll=null;const zone=i>0?songZone(i-1):null,RS=.85;
  if(zone&&local<RS){
   const x=lerp(zone.x-u*.06,zone.x+zone.w+u*.06,easeInOut(local/RS)),prevDur=Number(tracks[i-1].duration)||0;
   ctx.save();ctx.beginPath();ctx.rect(x,0,W-x,H);ctx.clip();const last=songState(i-1,prevDur),old=coverLayer(i-1,last);if(old)ctx.drawImage(old,0,0);else if(i>1&&songZone(i-2))drawPatch(ctx,songZone(i-2),`z${i-1}`);
   if(last>=0){if(has(i-1,last-1))drawPatch(ctx,boundsOf(i-1,last-1),`p${i-1}:${last-1}`);drawPrev(ctx,i-1,last,prevDur);}else if(has(i-1,-1))drawPrev(ctx,i-1,-1,prevDur);ctx.restore();
   ctx.save();ctx.beginPath();ctx.rect(0,0,x,H);ctx.clip();drawPatch(ctx,zone,`z${i}`);ctx.restore();
   changeRoll={x,top:zone.y,h:zone.h};props={};
  }else props=drawSong(ctx,i,local);
  ctx.drawImage(lighting,0,0);
  // Stenciled spectrum near the ground: measured bins, cut into stencil segments.
  if(s.frame){const [x,y,w,h]=SPEC,g=specLayer.getContext('2d'),paint=paintOf(i,1);g.clearRect(0,0,specLayer.width,specLayer.height);
   drawSpectrum(g,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:paint.m,alpha:1,amp:1,x:0,y:0,width:specLayer.width,height:specLayer.height});
   g.globalCompositeOperation='destination-out';const step=Math.max(4,h/9);for(let yy=step*.78;yy<h;yy+=step)g.fillRect(0,yy,w,Math.max(1.5,step*.22));g.globalCompositeOperation='source-over';
   const gg=specGlow.getContext('2d');gg.clearRect(0,0,specGlow.width,specGlow.height);gg.drawImage(specLayer,0,0,specGlow.width,specGlow.height);
   ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.55;ctx.drawImage(specGlow,x-w*.03,y-h*.06,w*1.06,h*1.12);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.globalAlpha=.92;ctx.drawImage(specLayer,x,y);ctx.globalAlpha=1;}
  // Track tag: number stencil and title, sprayed in left to right at each song.
  {const info=infoOf(i),reveal=clamp(local/.7,0,1);ctx.save();ctx.beginPath();ctx.rect(INFO.x,INFO.y-info.nf,info.c.width*reveal,info.c.height+info.nf);ctx.clip();ctx.drawImage(info.c,INFO.x,INFO.y-info.nf*.72);ctx.restore();
   text(ctx,`${stamp(local)} / ${stamp(s.duration)}`,INFO.x+info.tx,INFO.y+info.nf*.3,{size:info.tf*.66,weight:700,color:'rgba(236,236,230,.72)',baseline:'middle',spacing:.08});}
  // Progress: a line sprayed along the foot of the wall.
  {const st=stripOf(i),len=(W-INFO.x*2)*clamp(s.progress,0,1),y=groundY-u*.035;ctx.save();ctx.beginPath();ctx.rect(st.x0-st.h,y-st.h,len+st.h,st.h*2);ctx.clip();ctx.drawImage(st.c,st.x0-st.h,y-st.h);ctx.restore();
   ctx.globalCompositeOperation='lighter';const hx=st.x0+len,gl=ctx.createRadialGradient(hx,y,0,hx,y,u*.03);gl.addColorStop(0,rgba(paintOf(i,0).a,.45));gl.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gl;ctx.fillRect(hx-u*.03,y-u*.03,u*.06,u*.06);ctx.globalCompositeOperation='source-over';}
  drawLamp(ctx,s.t);
  if(sticker){ctx.save();if(portrait){ctx.translate(W/2,H*.1);ctx.rotate(-.035);ctx.drawImage(sticker,-sticker.width/2,-sticker.height/2);}else{ctx.translate(W*.06,H*.075);ctx.rotate(-.04);ctx.drawImage(sticker,0,-sticker.height/2);}ctx.restore();}
  // Props above everything on the wall.
  if(props.can&&props.can.alpha>0){const wob=Math.sin(s.t*13)*props.can.rowH*.22||0;drawCan(ctx,props.can.x,props.can.y+wob*(1-props.can.away),props.can.paint,props.can.alpha,props.can.away);}
  const roll=changeRoll||props.roller;if(roll)drawRoller(ctx,roll.x,roll.top,roll.h);
  // Film grain at 12 plates a second.
  const f=Math.floor(s.t*12),plate=grain[f%3],off=(f*89)%256;ctx.globalAlpha=.5;for(let y=-off;y<H;y+=256)for(let x=-((off*3)%256);x<W;x+=256)ctx.drawImage(plate,x,y);ctx.globalAlpha=1;
 }
 return {draw,duration:base.total};
}

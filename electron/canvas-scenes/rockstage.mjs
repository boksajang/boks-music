import {sceneBase,drawSpectrum,text,fitText,drawBlock,setFont,stamp,rgba,mix,layer,hash,random,clamp,lerp,easeOut,easeInOut,radialGlow} from '../canvas-kit.mjs';

/**
 * 록 콘서트 무대 (instrumental): a smoky rock stage seen from the crowd. Moving heads on the truss and two
 * floor units sweep volumetric beams through the haze on their own programmes, crossing in front of
 * the LED wall at the back, which shows the current song and the numbered set list. Every song is a
 * new lighting cue: the beams glide into a new pattern while the palette crossfades and the LED wall
 * wipes over to the next page. Amp heads carry small level meters, the drum kit carries the title on
 * its kick drum head, and the crowd's raised hands sway slowly in silhouette (no strobes, nothing
 * pulses with the music except the meters and the spectrum on the screen).
 */
const TAU=Math.PI*2;
const LINEAR=['bars','round-bars','mirror','blocks','dots','reflection','wave','double-wave','area','mirror-area','ribbon'];
// Lighting cues: two beam colors each; songs step through them.
const CUES=[[[48,96,255],[255,44,170]],[[255,150,34],[255,236,206]],[[255,36,40],[44,214,255]],[[150,64,255],[60,255,170]],[[255,96,24],[255,206,70]],[[34,196,255],[240,244,255]]];
function lru(limit){const m=new Map();return (key,make)=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make();m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};}

export default function rockstage(input){
 const base=sceneBase(input,{hue:220}),{width:W,height:H,portrait,u,tracks}=base,N=tracks.length;
 const L=portrait
  ?{truss:H*.06,fixY:H*.085,screen:[u*.06,H*.115,u*.88,H*.43],floor:H*.73,amps:[[u*.03,u*.24],[u*.73,u*.24]],ampTop:H*.57,drum:[W/2,H*.705,H*.05],crowd:H*.81,rows:8,fixtures:5}
  :{truss:H*.095,fixY:H*.13,screen:[W*.22,H*.145,W*.56,H*.44],floor:H*.74,amps:[[W*.035,W*.15],[W*.815,W*.15]],ampTop:H*.37,drum:[W/2,H*.715,H*.075],crowd:H*.81,rows:7,fixtures:7};
 const [sx,sy,sw,sh]=L.screen,measure=layer(8,8).getContext('2d'),q=2;

 // ---- Static set: back wall, truss, stage, amps, drum kit -----------------------------------------
 const set=layer(W,H);{
  const g=set.getContext('2d'),r=random(hash('stage'));
  const wall=g.createLinearGradient(0,0,0,L.floor);wall.addColorStop(0,'#040508');wall.addColorStop(1,'#0b0c12');g.fillStyle=wall;g.fillRect(0,0,W,L.floor);
  // Back drape folds.
  for(let x=0;x<W;x+=u*.03){const f=g.createLinearGradient(x,0,x+u*.03,0);f.addColorStop(0,'rgba(255,255,255,0)');f.addColorStop(.5,`rgba(255,255,255,${.012+r()*.014})`);f.addColorStop(1,'rgba(0,0,0,.2)');g.fillStyle=f;g.fillRect(x,0,u*.03,L.floor);}
  // LED wall frame (the picture is drawn per frame).
  g.fillStyle='#020203';g.fillRect(sx-u*.012,sy-u*.012,sw+u*.024,sh+u*.024);g.strokeStyle='rgba(160,170,190,.14)';g.lineWidth=Math.max(1,u*.002);g.strokeRect(sx-u*.012,sy-u*.012,sw+u*.024,sh+u*.024);
  // Stage deck and its front edge.
  const deck=g.createLinearGradient(0,L.floor,0,H);deck.addColorStop(0,'#14151b');deck.addColorStop(.15,'#08090c');deck.addColorStop(1,'#030304');g.fillStyle=deck;g.fillRect(0,L.floor,W,H-L.floor);
  for(let k=0;k<12;k++){g.fillStyle=`rgba(255,255,255,${.015+r()*.02})`;g.fillRect(0,L.floor+(H-L.floor)*k/12*.4,W,1);}
  g.fillStyle='rgba(200,210,230,.12)';g.fillRect(0,L.floor,W,Math.max(1,u*.0016));
  // Amp stacks: two cabinets and a head on each side.
  const cab=(x,y,w,h)=>{g.fillStyle='#0b0b0d';g.beginPath();g.roundRect(x,y,w,h,u*.006);g.fill();g.strokeStyle='rgba(220,220,225,.35)';g.lineWidth=Math.max(1,u*.002);g.beginPath();g.roundRect(x+u*.004,y+u*.004,w-u*.008,h-u*.008,u*.005);g.stroke();
   const gx=x+w*.07,gy=y+h*.08,gw=w*.86,gh=h*.84;g.fillStyle='#16151a';g.fillRect(gx,gy,gw,gh);g.save();g.beginPath();g.rect(gx,gy,gw,gh);g.clip();g.strokeStyle='rgba(120,110,100,.12)';g.lineWidth=1;for(let d=-gh;d<gw;d+=Math.max(2,u*.004)){g.beginPath();g.moveTo(gx+d,gy);g.lineTo(gx+d+gh,gy+gh);g.stroke();}g.restore();
   g.fillStyle='rgba(200,200,205,.4)';g.fillRect(x+w*.4,gy+gh*.06,w*.2,h*.035);};
  for(const [ax,aw] of L.amps){const ch=(L.floor-L.ampTop)*.4,hh=(L.floor-L.ampTop)*.2;cab(ax,L.floor-ch,aw,ch);cab(ax,L.floor-ch*2-u*.004,aw,ch);
   const hy=L.floor-ch*2-u*.008-hh;g.fillStyle='#0d0d10';g.beginPath();g.roundRect(ax,hy,aw,hh,u*.006);g.fill();g.fillStyle='#c9a85a';g.fillRect(ax+aw*.04,hy+hh*.62,aw*.92,hh*.22);
   for(let k=0;k<6;k++){const kx=ax+aw*(.12+k*.11),ky=hy+hh*.73;g.fillStyle='#111';g.beginPath();g.arc(kx,ky,hh*.08,0,TAU);g.fill();}}
  // Mic stands.
  g.strokeStyle='#0a0a0c';g.lineWidth=Math.max(2,u*.004);for(const fx of portrait?[.3,.7]:[.33,.67]){const x=W*fx;g.beginPath();g.moveTo(x,L.floor+u*.04);g.lineTo(x,L.floor-H*.14);g.lineTo(x+u*.04*(fx<.5?1:-1),L.floor-H*.17);g.stroke();}
 }
 // Kick drum head (headline or an emblem) and the kit around it.
 const kit=layer(W,H);{
  const g=kit.getContext('2d'),[dx,dy,dr]=L.drum;
  const shell=(x,y,rx,ry,h)=>{g.fillStyle='#0a0a0d';g.fillRect(x-rx,y-h,rx*2,h);g.beginPath();g.ellipse(x,y-h,rx,ry,0,0,TAU);g.fillStyle='#1c1d22';g.fill();g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI);g.fillStyle='#0a0a0d';g.fill();};
  shell(dx-dr*1.75,dy-dr*.55,dr*.55,dr*.16,dr*.5);shell(dx+dr*1.8,dy-dr*.2,dr*.65,dr*.18,dr*.75);shell(dx-dr*.55,dy-dr*1.1,dr*.38,dr*.1,dr*.32);shell(dx+dr*.55,dy-dr*1.1,dr*.42,dr*.11,dr*.35);
  g.strokeStyle='#08080a';g.lineWidth=Math.max(2,u*.003);for(const [x,top] of [[dx-dr*2.5,dy-dr*1.6],[dx+dr*2.6,dy-dr*1.75],[dx-dr*1.4,dy-dr*1.45]]){g.beginPath();g.moveTo(x,dy+dr*.1);g.lineTo(x,top);g.stroke();}
  for(const [x,y,rx] of [[dx-dr*2.5,dy-dr*1.6,dr*.6],[dx+dr*2.6,dy-dr*1.75,dr*.75],[dx-dr*1.4,dy-dr*1.45,dr*.45]]){const c=g.createLinearGradient(x-rx,0,x+rx,0);c.addColorStop(0,'#5a4418');c.addColorStop(.45,'#d8b45a');c.addColorStop(.55,'#8a6a28');c.addColorStop(1,'#3a2a0c');g.fillStyle=c;g.beginPath();g.ellipse(x,y,rx,rx*.12,-.08,0,TAU);g.fill();}
  g.fillStyle='#0b0b0e';g.beginPath();g.arc(dx,dy,dr*1.06,0,TAU);g.fill();
  const head=g.createRadialGradient(dx-dr*.3,dy-dr*.3,0,dx,dy,dr);head.addColorStop(0,'#2a2c33');head.addColorStop(1,'#111216');g.fillStyle=head;g.beginPath();g.arc(dx,dy,dr,0,TAU);g.fill();
  g.strokeStyle='rgba(220,224,232,.55)';g.lineWidth=Math.max(1,dr*.025);g.beginPath();g.arc(dx,dy,dr*.86,0,TAU);g.stroke();
  if(base.headline){const fit=fitText(measure,base.headline,{size:dr*.3,minSize:dr*.12,weight:900,lineHeight:1.05,maxWidth:dr*1.5,maxHeight:dr*.75,spacing:.04,maxLines:2});drawBlock(g,fit,dx,dy-fit.height/2,{color:'#e8e9ee',align:'center'});}
  else{g.fillStyle='#e8e9ee';g.beginPath();for(let k=0;k<10;k++){const a=-Math.PI/2+k*Math.PI/5,rr=k%2?dr*.2:dr*.5;g.lineTo(dx+Math.cos(a)*rr,dy+Math.sin(a)*rr);}g.closePath();g.fill();}
  for(let k=0;k<12;k++){const a=k/12*TAU;g.fillStyle='#8a8d96';g.beginPath();g.arc(dx+Math.cos(a)*dr*1.03,dy+Math.sin(a)*dr*1.03,dr*.035,0,TAU);g.fill();}
 }
 // Truss: a lattice band across the top.
 const truss=layer(W,Math.ceil(L.truss+u*.02));{const g=truss.getContext('2d'),th=L.truss*.62,ty=L.truss*.2,metal='rgba(150,156,168,.55)';g.strokeStyle=metal;g.lineWidth=Math.max(1.5,u*.003);
  for(const y of [ty,ty+th]){g.beginPath();g.moveTo(0,y);g.lineTo(W,y);g.stroke();}g.lineWidth=Math.max(1,u*.0018);for(let x=0;x<W;x+=th){g.beginPath();g.moveTo(x,ty);g.lineTo(x+th/2,ty+th);g.lineTo(x+th,ty);g.stroke();}
  g.fillStyle='rgba(0,0,0,.4)';g.fillRect(0,ty+th+u*.003,W,u*.006);}
 // Crowd: two rows of heads and raised hands, black against the stage glow.
 const crowds=[0,1].map(n=>{const ch=Math.ceil(H-L.crowd+u*.15),c=layer(Math.ceil(W*1.06),ch),g=c.getContext('2d'),r=random(hash(`crowd${n}`)),cw=c.width;g.fillStyle=n?'#010102':'#050508';
  const top=n?u*.1:u*.02,step=u*(n?.075:.055);
  for(let x=-step;x<cw+step;x+=step*(.7+r()*.6)){const hy=top+r()*u*.04+(n?u*.04:0),hr=u*(n?.042:.03)*(.85+r()*.3);g.beginPath();g.ellipse(x,hy,hr*.82,hr,0,0,TAU);g.fill();g.beginPath();g.ellipse(x,hy+hr*2.6,hr*2.1,hr*1.9,0,0,TAU);g.fill();g.fillRect(x-hr*2.1,hy+hr*2.6,hr*4.2,ch);
   if(r()<(n?.3:.4)){const side=r()<.5?-1:1,ax=x+side*hr*1.6,ay=hy+hr*1.8,len=u*(n?.17:.12)*(.8+r()*.4),ang=-Math.PI/2+side*(.15+r()*.3),hx=ax+Math.cos(ang)*len,hy2=ay+Math.sin(ang)*len;
    g.lineWidth=hr*.62;g.lineCap='round';g.strokeStyle=g.fillStyle;g.beginPath();g.moveTo(ax,ay);g.quadraticCurveTo(ax+side*hr*.5,ay-len*.5,hx,hy2);g.stroke();
    const horns=r()<.5;g.beginPath();g.ellipse(hx,hy2-hr*.25,hr*.42,hr*.5,0,0,TAU);g.fill();if(horns){g.lineWidth=hr*.18;for(const f of [-1,1]){g.beginPath();g.moveTo(hx+f*hr*.25,hy2-hr*.5);g.lineTo(hx+f*hr*.35,hy2-hr*1.3);g.stroke();}}else{g.lineWidth=hr*.2;g.beginPath();g.moveTo(hx,hy2-hr*.5);g.lineTo(hx,hy2-hr*1.2);g.stroke();}}}
  return c;});

 // ---- Light: beam sprite, haze, fixtures -----------------------------------------------------------
 const BL=Math.ceil(H*1.25/q),BW=Math.ceil(u*.44/q),beam=layer(BW,BL);{const g=beam.getContext('2d'),r=random(hash('beam'));
  // A soft cone with a brighter core, fading with distance from the lens.
  for(let k=0;k<BL;k+=1){const p=k/BL,w=lerp(BW*.035,BW,Math.pow(p,.9)),a=Math.pow(1-p,1.15)*.95+.04;const gr=g.createLinearGradient(BW/2-w/2,0,BW/2+w/2,0);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.2,`rgba(255,255,255,${a*.35})`);gr.addColorStop(.5,`rgba(255,255,255,${a})`);gr.addColorStop(.8,`rgba(255,255,255,${a*.35})`);gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(BW/2-w/2,k,w,1.2);}
  // Faint haze streaks along the cone.
  g.globalCompositeOperation='destination-out';for(let k=0;k<12;k++){const x=BW*(.1+r()*.8),w=BW*(.015+r()*.03);g.fillStyle=`rgba(0,0,0,${.05+r()*.1})`;g.beginPath();g.moveTo(BW/2,0);g.lineTo(x-w,BL);g.lineTo(x+w,BL);g.fill();}}
 const HW=Math.ceil(W/q),HH=Math.ceil(H/q);
 const haze=layer(HW*1.5,HH);{const g=haze.getContext('2d'),r=random(hash('haze'));g.fillStyle='rgba(0,0,0,.12)';g.fillRect(0,0,haze.width,HH);g.filter=`blur(${u*.03/q}px)`;
  for(let k=0;k<90;k++){const x=r()*haze.width,y=HH*(.1+r()*.85),rad=u*(.05+r()*.14)/q;g.fillStyle=`rgba(0,0,0,${.08+r()*.18})`;const put=xx=>{g.beginPath();g.ellipse(xx,y,rad*1.8,rad,0,0,TAU);g.fill();};put(x);if(x+rad*1.8>haze.width)put(x-haze.width);if(x-rad*1.8<0)put(x+haze.width);}g.filter='none';}
 const groups=[layer(HW,HH),layer(HW,HH)];
 const fixtures=(()=>{const list=[],n=L.fixtures;for(let k=0;k<n;k++)list.push({x:W*(.08+.84*k/(n-1)),y:L.fixY,up:false,g:k%2});for(const fx of portrait?[.18,.82]:[.27,.73])list.push({x:W*fx,y:L.floor+u*.005,up:true,g:fx<.5?0:1});return list;})();
 // A programme per song: unison fan, mirrored crossing or a slow ballyhoo.
 function program(i){const r=random(hash(`prog${i}`)),mode=i%3;return fixtures.map((f,k)=>{const side=f.x<W/2?-1:1;
  if(f.up)return {base:Math.PI+side*(.35+r()*.2),amp:.25+r()*.15,freq:.21+r()*.08,phase:r()*TAU};
  if(mode===0)return {base:(r()-.5)*.2,amp:.42,freq:.17,phase:k*.35};
  if(mode===1)return {base:side*.32,amp:.36,freq:.19,phase:(k%2)*Math.PI};
  return {base:(r()-.5)*.5,amp:.22+r()*.25,freq:.12+r()*.16,phase:r()*TAU};});}
 const programs=lru(4);const prog=i=>programs(i,()=>program(i));
 const angleOf=(p,t)=>p.base+p.amp*Math.sin(t*p.freq*TAU+p.phase);

 // ---- LED wall ----------------------------------------------------------------------------------
 const grid=layer(sw,sh);{const g=grid.getContext('2d'),pitch=Math.max(2,Math.round(u*.0032));g.fillStyle='rgba(0,0,0,.36)';for(let y=0;y<sh;y+=pitch)g.fillRect(0,y,sw,1);for(let x=0;x<sw;x+=pitch)g.fillRect(x,0,1,sh);
  g.fillStyle='rgba(0,0,0,.55)';const cols=portrait?4:6,rows=portrait?5:3;for(let k=1;k<cols;k++)g.fillRect(sw*k/cols-1,0,2,sh);for(let k=1;k<rows;k++)g.fillRect(0,sh*k/rows-1,sw,2);}
 const P=L.rows,pages=Math.ceil(N/P),pad=u*.03;
 const titleFit=lru(4),fitTitle=(k,w,size,maxH)=>titleFit(`${k}`,()=>fitText(measure,tracks[k].title||'',{size,minSize:size*.5,weight:900,lineHeight:1.12,maxWidth:w,maxHeight:maxH,spacing:-.02,maxLines:2}));
 function screen(g,k,local,colors,frame){
  const dur=Number(tracks[k].duration)||0,[ca,cb]=colors,bg=g.createLinearGradient(0,0,sw,sh);bg.addColorStop(0,rgba(mix(ca,[0,0,0],.84)));bg.addColorStop(1,rgba(mix(cb,[0,0,0],.86)));g.fillStyle=bg;g.fillRect(0,0,sw,sh);
  const banner=sh*(portrait?.07:.11);g.fillStyle=rgba(mix(ca,[0,0,0],.4));g.fillRect(0,0,sw,banner);
  text(g,base.headline||'LIVE',pad,banner/2,{size:banner*.5,weight:900,color:'#fff',baseline:'middle',spacing:.14,maxWidth:sw*.6});
  text(g,`SET  ${String(k+1).padStart(2,'0')} / ${String(N).padStart(2,'0')}`,sw-pad,banner/2,{size:banner*.42,weight:800,color:'rgba(255,255,255,.85)',align:'right',baseline:'middle',spacing:.14});
  // Now playing.
  const np=portrait?[pad,banner+pad*.8,sw-pad*2,sh*.32]:[pad,banner+pad,sw*.44-pad,sh-banner-pad*2];const [nx,ny,nw,nh]=np;
  text(g,'NOW PLAYING',nx,ny+nh*(portrait?.06:.05),{size:u*.017,weight:800,color:rgba(mix(cb,[255,255,255],.4)),baseline:'middle',spacing:.3});
  const fit=fitTitle(k,nw,portrait?u*.07:u*.052,nh*(portrait?.36:.36));drawBlock(g,fit,nx,ny+nh*(portrait?.14:.13),{color:'#fff'});
  const ty=ny+nh*(portrait?.6:.58);text(g,`${stamp(local)} / ${stamp(dur)}`,nx,ty,{size:u*.026,weight:800,color:'#fff',baseline:'middle',spacing:.06});
  const by=ty+u*.026;g.fillStyle='rgba(255,255,255,.18)';g.fillRect(nx,by,nw,Math.max(2,u*.005));g.fillStyle=rgba(mix(ca,[255,255,255],.25));g.fillRect(nx,by,nw*clamp(dur?local/dur:0,0,1),Math.max(2,u*.005));
  if(frame){const kind=LINEAR.includes(base.options.spectrum)?base.options.spectrum:'bars';drawSpectrum(g,{kind,bins:frame.bins,waveform:frame.waveform,color:base.options.color,tint:mix(cb,[255,255,255],.3),alpha:.95,x:nx,y:by+u*.02,width:nw,height:ny+nh-by-u*.025});}
  // Set list page.
  const lx=portrait?pad:sw*.47,ly=portrait?ny+nh+pad*.6:banner+pad*.7,lw=portrait?sw-pad*2:sw*.53-pad,lh=sh-ly-pad*.6,rowH=lh/P,page=Math.floor(k/P),size=rowH*.46;
  g.fillStyle='rgba(255,255,255,.12)';g.fillRect(lx,ly-pad*.3,lw,1);
  for(let n=0;n<P;n++){const idx=page*P+n;if(idx>=N)break;const y=ly+n*rowH,cy=y+rowH/2,cur=idx===k;
   if(cur){g.fillStyle=rgba(mix(ca,[0,0,0],.25),.9);g.fillRect(lx,y+rowH*.08,lw,rowH*.84);}
   const col=cur?'#fff':idx<k?'rgba(255,255,255,.4)':'rgba(255,255,255,.72)';
   text(g,String(idx+1).padStart(2,'0'),lx+size*.4,cy,{size:size*.9,weight:800,color:cur?'#fff':rgba(mix(cb,[255,255,255],.3),.8),baseline:'middle'});
   text(g,stamp(tracks[idx].duration),lx+lw-size*.4,cy,{size:size*.85,weight:700,color:col,align:'right',baseline:'middle'});
   text(g,tracks[idx].title||'',lx+size*2.4,cy,{size,weight:cur?800:500,color:col,baseline:'middle',maxWidth:lw-size*6.2});}
  if(pages>1)text(g,`${page+1} / ${pages}`,lx+lw,sh-pad*.35,{size:u*.014,weight:800,color:'rgba(255,255,255,.5)',align:'right',baseline:'middle',spacing:.2});
 }
 const scr=layer(sw,sh),sg=scr.getContext('2d'),old=layer(sw,sh),og=old.getContext('2d');

 function draw(ctx,time){
  const s=base.at(time),{i,local,duration}=s,t=s.t;
  // Cue crossfade at the start of each song.
  const cueMix=i>0?easeInOut(local/1.6):1,cur=CUES[i%CUES.length],prev=CUES[(i+CUES.length-1)%CUES.length],colors=[mix(prev[0],cur[0],cueMix),mix(prev[1],cur[1],cueMix)];
  ctx.drawImage(set,0,0);
  // LED wall: the new page wipes in behind a bright bar.
  screen(sg,i,local,colors,s.frame);
  const wipe=i>0?easeInOut(local/.9):1;
  if(wipe<1){screen(og,i-1,Number(tracks[i-1].duration)||0,colors,undefined);ctx.drawImage(old,sx,sy);const wx=sw*wipe;ctx.save();ctx.beginPath();ctx.rect(sx,sy,wx,sh);ctx.clip();ctx.drawImage(scr,sx,sy);ctx.restore();
   ctx.fillStyle=rgba(mix(colors[1],[255,255,255],.6),.9);ctx.fillRect(sx+wx-u*.006,sy,u*.012,sh);}
  else ctx.drawImage(scr,sx,sy);
  ctx.drawImage(grid,sx,sy);
  ctx.save();ctx.globalCompositeOperation='lighter';radialGlow(ctx,sx+sw/2,sy+sh/2,Math.max(sw,sh)*.75,colors[0],.07);ctx.restore();
  ctx.drawImage(kit,0,0);
  // Amp head meters (the only parts that follow the music besides the screen).
  {const e=s.energy,segs=10;for(const [ax,aw] of L.amps){const ch=(L.floor-L.ampTop)*.4,hh=(L.floor-L.ampTop)*.2,hy=L.floor-ch*2-u*.008-hh,mw=aw*.5,mx=ax+aw*.25,mh=hh*.14;
   [e.level,e.low*.9+e.level*.1].forEach((v,row)=>{const y=hy+hh*(.14+row*.22),lit=Math.round(clamp(v,0,1)*segs);for(let k=0;k<segs;k++){const on=k<lit,col=k>=8?[255,60,50]:k>=6?[255,196,60]:[80,255,120];ctx.fillStyle=rgba(col,on?.95:.12);ctx.fillRect(mx+k*mw/segs,y,mw/segs*.72,mh);}});}}
  // Beams: drawn white into two half-res color groups, thinned by the drifting haze, then tinted and added.
  const pnow=prog(i),pold=i>0?prog(i-1):pnow,blend=i>0?easeInOut(local/1.6):1;
  for(const [n,g2] of groups.entries()){const g=g2.getContext('2d');g.globalCompositeOperation='source-over';g.clearRect(0,0,HW,HH);
   fixtures.forEach((f,k)=>{if(f.g!==n)return;const a=lerp(angleOf(pold[k],t),angleOf(pnow[k],t),blend);g.save();g.translate(f.x/q,f.y/q);g.rotate(a);g.globalAlpha=f.up?.7:1;g.drawImage(beam,-BW/2,0);g.restore();});
   g.globalAlpha=1;g.globalCompositeOperation='destination-out';const hx=-((t*u*.012/q)%haze.width);g.drawImage(haze,hx,0);g.drawImage(haze,hx+haze.width,0);
   g.globalCompositeOperation='source-in';g.fillStyle=rgba(colors[n]);g.fillRect(0,0,HW,HH);}
  ctx.save();ctx.globalCompositeOperation='lighter';for(const c of groups)ctx.drawImage(c,0,0,W,H);ctx.restore();
  // Pools of light where the truss beams meet the stage deck.
  {ctx.save();ctx.globalCompositeOperation='lighter';fixtures.forEach((f,k)=>{if(f.up)return;const a=lerp(angleOf(pold[k],t),angleOf(pnow[k],t),blend),hx=f.x-Math.tan(a)*(L.floor-f.y);if(hx<-W*.2||hx>W*1.2)return;
   ctx.save();ctx.translate(hx,L.floor+u*.03);ctx.scale(3.2,1);radialGlow(ctx,0,0,u*.05,colors[f.g],.28);ctx.restore();});ctx.restore();}
  // Fixture heads on the truss, tilted with their beams; lenses glow.
  ctx.drawImage(truss,0,0);
  fixtures.forEach((f,k)=>{const a=lerp(angleOf(pold[k],t),angleOf(pnow[k],t),blend),col=colors[f.g],s2=u*.022;ctx.save();ctx.translate(f.x,f.y);
   if(!f.up){ctx.fillStyle='#16171c';ctx.fillRect(-s2*.9,-s2*1.2,s2*1.8,s2*.5);}ctx.rotate(a);ctx.fillStyle='#1d1f25';ctx.beginPath();ctx.roundRect(-s2*.7,-s2*.6,s2*1.4,s2*1.3,s2*.25);ctx.fill();ctx.restore();
   const lx=f.x-Math.sin(a)*s2*.7,ly=f.y+Math.cos(a)*s2*.7;ctx.save();ctx.globalCompositeOperation='lighter';radialGlow(ctx,lx,ly,s2*1.6,mix(col,[255,255,255],.5),.75);ctx.restore();});
  // Haze at the stage lip, lit by the cue.
  {ctx.save();ctx.globalCompositeOperation='lighter';ctx.translate(W/2,L.floor);ctx.scale(2.4,1);radialGlow(ctx,0,0,H*.22,mix(colors[0],colors[1],.5),.12);ctx.restore();}
  // Crowd, swaying slowly (its own slow rhythm, never the music's).
  crowds.forEach((c,n)=>{const sway=Math.sin(t*TAU/(n?9:7)+n)*u*.006,y=L.crowd+(n?u*.03:0)-u*.02;ctx.drawImage(c,-W*.03+sway,y);});
 }
 return {draw,duration:base.total};
}

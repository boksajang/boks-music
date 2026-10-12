import {sceneBase,drawSpectrum,text,fitText,setFont,ellipsize,stamp,rgba,mix,layer,hash,random,hsl,clamp,lerp,easeOut} from '../canvas-kit.mjs';

/**
 * 네온 사인: a dark brick wall at night. The title phrase hangs on top as an outlined neon sign; each
 * lyric line is a bent glass tube that sputters on in its own pattern when the line begins, then goes
 * dark and grey when the next line lights, and the following line's unlit glass slides into its place.
 * Now and then a tube buzzes. The lit signs reflect, rippling, in the wet pavement below.
 */
const NEON_HUES=[330,285,195,45,150,12];
export default function neon(input){
 const base=sceneBase(input,{hue:330}),{width:W,height:H,portrait,u,vocal,tracks}=base;
 const floorY=Math.round(H*(portrait?.8:.785));
 const L=portrait
  ?{head:[W/2,H*.105,u*.8,u*.085],slots:[H*.44,H*.035],slotW:u*.86,slotH:H*.11,lyric:u*.088,intro:[H*.435,u*.11],sign:[u*.075,H*.685,u*.56,u*.042],number:[W-u*.075,H*.685,u*.036],spectrum:[u*.1,floorY-H*.072,u*.8,H*.058],rail:[u*.075,W-u*.075]}
  :{head:[W/2,H*.145,W*.62,u*.092],slots:[H*.475,H*.04],slotW:W*.8,slotH:H*.15,lyric:u*.092,intro:[H*.475,u*.12],sign:[W*.06,H*.725,W*.3,u*.04],number:[W*.94,H*.725,u*.036],spectrum:[W*.35,floorY-H*.098,W*.3,H*.082],rail:[W*.06,W*.94]};
 const measure=layer(8,8).getContext('2d');
 const hueOf=h=>NEON_HUES.reduce((best,n)=>Math.abs(((n-h+540)%360)-180)<Math.abs(((best-h+540)%360)-180)?n:best,NEON_HUES[0]);
 const neonColor=h=>hsl(h,1,h>30&&h<170?.56:.62);
 // Each song gets the neon hue nearest its album color, but never the same tube color as the song before.
 const hues=[];const songHue=i=>{for(let n=hues.length;n<=i;n++){let h=hueOf(base.art(n).hue);if(n>0&&h===hues[n-1])h=NEON_HUES[(NEON_HUES.indexOf(h)+1)%NEON_HUES.length];hues.push(h);}return hues[i];};
 const headColor=neonColor(NEON_HUES[(NEON_HUES.indexOf(songHue(0))+2)%NEON_HUES.length]);
 const signColor=i=>{const h=songHue(i);return h>=12&&h<=60?hsl(195,.55,.84):hsl(38,.95,.7);};

 // ---- Wall and pavement, painted once -----------------------------------------------------------
 const backdrop=(()=>{
  const c=layer(W,H),g=c.getContext('2d'),r=random(hash('neon-wall')),bh=u*.046,bw=bh*2.15,mortar=Math.max(1,bh*.11);
  g.fillStyle='#120c0d';g.fillRect(0,0,W,floorY);
  for(let row=0,y=0;y<floorY;row++,y+=bh){
   const shift=row%2?bw/2:0;
   for(let x=-shift;x<W;x+=bw){const tone=18+r()*16,red=tone*1.55+r()*8;g.fillStyle=`rgb(${red|0},${(tone*.92)|0},${(tone*.86)|0})`;g.fillRect(x+mortar/2,y+mortar/2,bw-mortar,bh-mortar);
    if(r()<.35){g.fillStyle=`rgba(0,0,0,${.12+r()*.2})`;g.fillRect(x+mortar/2+r()*bw*.5,y+mortar/2,bw*(.2+r()*.4),bh-mortar);}
    g.fillStyle='rgba(255,230,220,.035)';g.fillRect(x+mortar/2,y+mortar/2,bw-mortar,Math.max(1,mortar*.6));}
  }
  for(let k=0;k<Math.round(W*floorY/900);k++){g.fillStyle=`rgba(${r()<.5?0:255},${r()<.5?0:240},${r()<.5?0:230},${.03+r()*.05})`;g.fillRect(r()*W,r()*floorY,1+r()*2.5,1+r()*2.5);}
  // Water stains running down from the top and a darker band where the wall meets the pavement.
  for(let k=0;k<7;k++){const x=r()*W,w=u*(.04+r()*.12),stain=g.createLinearGradient(0,0,0,floorY*(.3+r()*.5));stain.addColorStop(0,'rgba(0,0,0,.35)');stain.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=stain;g.fillRect(x,0,w,floorY);}
  const shade=g.createLinearGradient(0,0,0,floorY);shade.addColorStop(0,'rgba(4,3,6,.78)');shade.addColorStop(.3,'rgba(4,3,6,.38)');shade.addColorStop(.85,'rgba(4,3,6,.3)');shade.addColorStop(1,'rgba(4,3,6,.75)');g.fillStyle=shade;g.fillRect(0,0,W,floorY);
  const side=g.createRadialGradient(W/2,floorY*.45,u*.25,W/2,floorY*.45,Math.hypot(W,floorY)*.62);side.addColorStop(0,'rgba(0,0,0,0)');side.addColorStop(1,'rgba(0,0,0,.6)');g.fillStyle=side;g.fillRect(0,0,W,floorY);
  // Pavement: wet asphalt with long glossy streaks.
  const floor=g.createLinearGradient(0,floorY,0,H);floor.addColorStop(0,'#0a0a0e');floor.addColorStop(1,'#040406');g.fillStyle=floor;g.fillRect(0,floorY,W,H-floorY);
  for(let k=0;k<Math.round(W*(H-floorY)/500);k++){g.fillStyle=`rgba(200,205,220,${.015+r()*.03})`;g.fillRect(r()*W,floorY+r()*(H-floorY),1+r()*2,1);}
  for(let k=0;k<26;k++){const y=floorY+Math.pow(r(),1.4)*(H-floorY),w=W*(.08+r()*.3);g.fillStyle=`rgba(150,160,190,${.02+r()*.035})`;g.fillRect(r()*W-w/2,y,w,Math.max(1,u*.0018));}
  g.fillStyle='rgba(0,0,0,.85)';g.fillRect(0,floorY,W,Math.max(2,u*.004));g.fillStyle='rgba(120,110,120,.18)';g.fillRect(0,floorY+Math.max(2,u*.004),W,1);
  return c;
 })();

 // ---- Neon tubes ---------------------------------------------------------------------------------
 // A tube is drawn twice: lit (halo, colored edge, pale hot core) and dark (grey glass with a highlight
 // and the shadow it casts on the wall). Both are cached per line.
 function tube(lines,size,color,{style='fill',frame=false,weight}={}){
  weight??=style==='fill'?300:700;
  setFont(measure,weight,size,style==='fill'?.02:.06);const tw=Math.max(...lines.map(line=>measure.measureText(line).width)),lh=size*1.3;
  const pad=size*(frame?1.05:.75),w=Math.ceil(tw+pad*2),h=Math.ceil(lines.length*lh+pad*2);
  const shape=(g,mode)=>{setFont(g,weight,size,style==='fill'?.02:.06);g.textAlign='center';g.textBaseline='middle';
   lines.forEach((line,k)=>{const y=pad+k*lh+lh/2;if(mode==='fill')g.fillText(line,w/2,y);else g.strokeText(line,w/2,y);});
   if(frame&&mode==='stroke'){g.beginPath();g.roundRect(pad*.42,pad*.42,w-pad*.84,h-pad*.84,size*.38);g.stroke();}};
  const lit=layer(w,h),g=lit.getContext('2d');g.lineJoin='round';g.lineCap='round';
  const outline=style!=='fill';
  for(const [blur,alpha,width] of [[size*.32,.7,size*.12],[size*.1,.85,size*.07]]){g.filter=`blur(${blur}px)`;g.fillStyle=g.strokeStyle=rgba(color,alpha);g.lineWidth=width;if(!outline)shape(g,'fill');shape(g,'stroke');}
  g.filter='none';
  if(outline){g.strokeStyle=rgba(color,.95);g.lineWidth=size*.05;shape(g,'stroke');g.strokeStyle=rgba(mix(color,[255,255,255],.72));g.lineWidth=size*.02;shape(g,'stroke');}
  else{g.fillStyle=rgba(mix(color,[255,255,255],.62));shape(g,'fill');g.strokeStyle=rgba(color,.9);g.lineWidth=size*.014;shape(g,'stroke');}
  const dark=layer(w,h),d=dark.getContext('2d');d.lineJoin='round';d.lineCap='round';
  d.save();d.translate(size*.035,size*.05);d.filter=`blur(${size*.025}px)`;d.fillStyle=d.strokeStyle='rgba(0,0,0,.55)';d.lineWidth=size*.05;if(!outline)shape(d,'fill');shape(d,'stroke');d.restore();d.filter='none';
  if(outline){d.strokeStyle='rgba(140,140,150,.42)';d.lineWidth=size*.05;shape(d,'stroke');d.strokeStyle='rgba(225,228,236,.28)';d.lineWidth=size*.012;shape(d,'stroke');}
  else{d.fillStyle='rgba(150,150,160,.36)';shape(d,'fill');d.strokeStyle='rgba(225,228,236,.3)';d.lineWidth=size*.01;shape(d,'stroke');}
  return {lit,dark,w,h,pad};
 }
 const cache=new Map();
 const cached=(key,make)=>{if(cache.has(key)){const v=cache.get(key);cache.delete(key);cache.set(key,v);return v;}const v=make();cache.set(key,v);if(cache.size>12)cache.delete(cache.keys().next().value);return v;};
 const lyricColor=i=>neonColor(songHue(i));
 // Two rows around a center line: the upper row grows upward, the lower one downward, so wrapped lines never meet.
 const rowY=(item,row)=>{const [mid,gap]=L.slots,half=(item.h-item.pad*2)/2;return row?mid+gap/2+half:mid-gap/2-half;};
 const lineTube=(i,n)=>cached(`l${i}:${n}`,()=>{const block=fitText(measure,tracks[i].cues[n].text||' ',{size:L.lyric,minSize:L.lyric*.42,weight:300,lineHeight:1.3,maxWidth:L.slotW-L.lyric*1.5,maxHeight:L.slotH*1.25,spacing:.02,maxLines:3});return tube(block.lines,block.font,lyricColor(i));});
 const introTube=i=>cached(`t${i}`,()=>{const [,size]=L.intro,block=fitText(measure,tracks[i].title||' ',{size,minSize:size*.45,weight:700,lineHeight:1.3,maxWidth:L.slotW-size*2,maxHeight:L.slotH*1.3,spacing:.06,maxLines:2});return tube(block.lines,block.font,lyricColor(i),{style:'outline'});});
 const signTube=i=>cached(`s${i}`,()=>{const [,,maxW,size]=L.sign;setFont(measure,300,size,.02);return tube([ellipsize(measure,tracks[i].title||' ',maxW-size*1.5)],size,signColor(i));});
 const numberTube=i=>cached(`n${i}`,()=>tube([`${String(i+1).padStart(2,'0')} / ${String(tracks.length).padStart(2,'0')}`],L.number[2],lyricColor(i),{style:'outline',frame:true,weight:400}));
 let headTube=null;
 if(base.headline){const [,,maxW,size]=L.head;const block=fitText(measure,base.headline,{size,minSize:size*.45,weight:700,lineHeight:1.2,maxWidth:maxW,maxHeight:size*1.3,spacing:.06,maxLines:1});headTube=tube(block.lines,block.font,headColor,{style:'outline',frame:true});}

 // ---- Electrical behaviour (deterministic) -------------------------------------------------------
 /** Turn-on: a few seeded blinks over about half a second, then steady. */
 function ignite(age,seed){
  if(age<0)return 0;const r=random(seed);let at=0;
  for(let k=0,n=2+Math.floor(r()*2);k<n;k++){const on=.04+r()*.06,off=.04+r()*.07;if(age<at+on)return .55+r()*.4;at+=on;if(age<at+off)return .06;at+=off;}
  return 1;
 }
 /** Occasional buzz: in some 2.3 s windows a short stutter of drop-outs. */
 function buzz(t,seed){
  const slot=Math.floor(t/2.3),r=random(hash(`${seed}:${slot}`));if(r()>.14)return 1;
  const at=r()*1.6,len=.12+r()*.22,dt=t-slot*2.3-at;if(dt<0||dt>len)return 1;return Math.floor(dt*34+r()*3)%3===0?.2:.95;
 }
 function place(ctx,item,cx,cy,glass,lit){
  if(glass>0){ctx.globalAlpha=glass;ctx.drawImage(item.dark,cx-item.w/2,cy-item.h/2);}
  if(lit>0){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=clamp(lit,0,1);ctx.drawImage(item.lit,cx-item.w/2,cy-item.h/2);ctx.globalCompositeOperation='source-over';}
  ctx.globalAlpha=1;
 }
 // Lit signs at quarter size: the source of the wet-pavement reflection.
 const q=4,lights=layer(W/q,floorY/q),lg=lights.getContext('2d');
 const glowLayer=layer(Math.max(2,L.spectrum[2]/6),Math.max(2,L.spectrum[3]/6));

 function draw(ctx,time){
  const s=base.at(time),{i,local,show}=s,cues=vocal?s.track.cues||[]:[],color=lyricColor(i);
  ctx.globalAlpha=1;ctx.drawImage(backdrop,0,0);
  lg.clearRect(0,0,lights.width,lights.height);
  const emit=(item,cx,cy,a)=>{if(a>0){lg.globalAlpha=clamp(a,0,1);lg.drawImage(item.lit,(cx-item.w/2)/q,(cy-item.h/2)/q,item.w/q,item.h/q);lg.globalAlpha=1;}};
  const wash=(cx,cy,rx,ry,c,a)=>{if(a<=.01)return;ctx.save();ctx.translate(cx,cy);ctx.scale(rx/ry,1);const g=ctx.createRadialGradient(0,0,0,0,0,ry);g.addColorStop(0,rgba(c,a));g.addColorStop(1,rgba(c,0));ctx.fillStyle=g;ctx.fillRect(-ry,-ry,ry*2,ry*2);ctx.restore();};

  // Title phrase sign: lights once at the start of the video, then only buzzes.
  if(headTube){const [cx,cy]=L.head,on=ignite(s.t-.25,hash('head'))*buzz(s.t,'head');wash(cx,cy,headTube.w*.55,headTube.h*.9,headColor,.16*on);place(ctx,headTube,cx,cy,1,on);emit(headTube,cx,cy,on);}

  // Lyric tubes in two alternating rows.
  const line=base.lineState(s),c=line.index,starts=cues.map(cue=>cue.start),first=starts.findIndex(Number.isFinite);
  const lineSeed=n=>hash(`${i}:${n}`);
  if(c<0){
   // Before the first line: the song title burns in the middle, then hands over to the unlit glass.
   const firstStart=first>=0?starts[first]:Infinity,offAt=firstStart-2.2,tube=introTube(i),[iy]=L.intro;
   const age=local-.5,off=local>=offAt?clamp(1-(local-offAt)/.35,0,1)*(Math.floor((local-offAt)*26)%2?.3:1):1;
   const on=(firstStart>4?ignite(age,hash(`t${i}`)):0)*off*s.exit*buzz(s.t,`t${i}`);
   const glassTitle=firstStart>4?clamp(Math.min(local/.6,(offAt+.45-local)/.3),0,1)*s.exit:0;
   wash(W/2,iy,tube.w*.55,tube.h*1.1,color,.3*on);place(ctx,tube,W/2,iy,glassTitle,on);emit(tube,W/2,iy,on);
   const glass=clamp((local-offAt-.5)/.6,0,1)*s.exit;
   if(glass>0)for(const n of [first,first+1])if(n>=0&&n<cues.length){const item=lineTube(i,n);place(ctx,item,W/2,rowY(item,n%2),glass,0);}
  }else{
   const prevStart=starts[c],nextGap=Number.isFinite(line.next)?line.next+(local-prevStart):Infinity;
   const age=local-prevStart,tail=(Number.isFinite(line.next)?local+line.next:s.duration)-line.end;
   // A long instrumental gap after the line: the tube switches off a little after the line ends.
   const dark=line.end+1.4,quiet=tail>3.2&&local>dark,offFlicker=quiet?clamp(1-(local-dark)/.3,0,1)*(Math.floor((local-dark)*30)%2?.25:1):1;
   const on=ignite(age,lineSeed(c))*buzz(s.t,lineSeed(c))*offFlicker*s.exit,current=lineTube(i,c),cy=rowY(current,c%2);
   wash(W/2,cy,Math.min(current.w*.6,W*.5),current.h*1.05,color,.32*on);
   // The other row: the line that just went dark fades away, then the next line's glass appears.
   const row=(c+1)%2,gap=Number.isFinite(nextGap)?nextGap:6,outEnd=Math.min(1.5,gap*.45),inEnd=Math.min(2.2,gap*.8);
   if(c>0&&age<outEnd){const prev=lineTube(i,c-1),after=clamp(1-age/.22,0,1),other=rowY(prev,row);place(ctx,prev,W/2,other,clamp((outEnd-age)/Math.max(.2,outEnd*.4),0,1)*show,after*.7);emit(prev,W/2,other,after*.7);}
   if(c+1<cues.length&&age>outEnd){const next=lineTube(i,c+1);place(ctx,next,W/2,rowY(next,row),clamp((age-outEnd)/Math.max(.15,inEnd-outEnd),0,1)*s.exit,0);}
   place(ctx,current,W/2,cy,s.exit,on);emit(current,W/2,cy,on);
  }

  // Small signs: the song title in warm white and the track number box; both relight with each song.
  {const [sx,sy]=L.sign,sign=signTube(i),on=ignite(local-.15,hash(`s${i}`))*buzz(s.t+7.3,`s${i}`)*s.exit;
   const x=sx+sign.w/2-L.sign[3]*.75;wash(x,sy,sign.w*.5,sign.h*.8,signColor(i),.12*on);place(ctx,sign,x,sy,s.exit,on);emit(sign,x,sy,on);
   const box=numberTube(i),[nx,ny]=L.number,on2=ignite(local-.45,hash(`n${i}`))*s.exit,bx=nx-box.w/2+L.number[2]*1.05;place(ctx,box,bx,ny,s.exit,on2);emit(box,bx,ny,on2);
   text(ctx,`${stamp(local)} / ${stamp(s.duration)}`,nx,ny-box.h/2+box.pad*.3,{size:u*.017,weight:600,color:'rgba(214,204,210,.6)',align:'right',spacing:.12,baseline:'bottom'});}

  // Progress rail: a thin tube along the foot of the wall, lit up to the song position.
  {const [x0,x1]=L.rail,y=floorY-u*.022,p=clamp(s.progress,0,1),xp=lerp(x0,x1,p),th=Math.max(2,u*.0045);
   ctx.lineCap='round';ctx.strokeStyle='rgba(130,130,140,.3)';ctx.lineWidth=th;ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.stroke();
   ctx.globalCompositeOperation='lighter';ctx.strokeStyle=rgba(color,.3*show);ctx.lineWidth=th*4;ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(xp,y);ctx.stroke();
   ctx.strokeStyle=rgba(mix(color,[255,255,255],.6),show);ctx.lineWidth=th;ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(xp,y);ctx.stroke();ctx.globalCompositeOperation='source-over';
   lg.strokeStyle=rgba(color,.9*show);lg.lineWidth=th*2/q;lg.beginPath();lg.moveTo(x0/q,y/q);lg.lineTo(xp/q,y/q);lg.stroke();}

  // Spectrum: neon bars (a soft upscaled copy gives the glow, the sharp copy the tube).
  if(s.frame){const [x,y,w,h]=L.spectrum,kind=base.options.spectrum,opts={kind,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,amp:1};
   const gg=glowLayer.getContext('2d');gg.clearRect(0,0,glowLayer.width,glowLayer.height);drawSpectrum(gg,{...opts,tint:color,alpha:1,x:0,y:glowLayer.height*.1,width:glowLayer.width,height:glowLayer.height*.9});
   ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.85*show;ctx.drawImage(glowLayer,x-w*.03,y-h*.05,w*1.06,h*1.1);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
   drawSpectrum(ctx,{...opts,tint:mix(color,[255,255,255],.55),alpha:.95*show,x,y,width:w,height:h});
   lg.globalAlpha=show;lg.drawImage(glowLayer,x/q,y/q,w/q,h/q);lg.globalAlpha=1;}

  // Wet pavement: the lit signs mirrored, squashed and rippling in bands.
  {const bands=16,depth=H-floorY,bandH=depth/bands,squash=.55;ctx.globalCompositeOperation='lighter';
   for(let k=0;k<bands;k++){const d0=k*bandH,ya=Math.max(0,floorY-(d0+bandH)/squash),yb=floorY-d0/squash;if(yb<=0)break;
    const dx=Math.sin(s.t*1.7+k*1.3)*u*.006*(.35+k/bands),stretch=1+k*.004;ctx.globalAlpha=.62*Math.pow(1-k/bands,1.25);
    ctx.save();ctx.translate(dx-W*(stretch-1)/2,floorY+d0+bandH);ctx.scale(stretch,-1);ctx.drawImage(lights,0,ya/q,lights.width,Math.max(.5,(yb-ya)/q),0,0,W,bandH+.5);ctx.restore();}
   ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';}
 }
 return {draw,duration:base.total};
}

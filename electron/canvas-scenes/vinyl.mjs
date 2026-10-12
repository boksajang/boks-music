import {sceneBase,createRoll,lyricLayout,lyricRow,trackRow,discTexture,drawDisc,drawTonearm,shadowSprite,drawShadow,roundedImage,makeParticles,drawParticles,radialGlow,vignette,drawSpectrum,text,fitText,drawBlock,progressBar,stamp,rgba,mix,layer,hash,easeOut,easeInOut,lerp} from '../canvas-kit.mjs';

/**
 * 바이닐 라운지: a warm lounge. The record slides out of its sleeve, spins at 33⅓ rpm, the tonearm
 * swings in and travels inward with the song; a ring spectrum breathes around the record.
 */
export default function vinyl(input){
 const base=sceneBase(input,{hue:28}),{width:W,height:H,portrait,u,vocal,tracks}=base;
 const L=portrait
  ?{sleeve:[u*.06,H*.12,u*.54],lyrics:[u*.08,H*.62,u*.84,u*.09,4],head:[u*.08,H*.49],titleW:u*.84,align:'center',top:H*.05,bar:[u*.08,H*.93,u*.84]}
  :{sleeve:[W*.06,H*.24,H*.5],lyrics:[W*.6,H*.33,W*.34,H*.092,5],head:[W*.6,H*.16],titleW:W*.34,align:'left',top:H*.075,bar:[W*.6,H*.86,W*.34]};
 const [sx,sy,size]=L.sleeve,r=size*.48,shadow=shadowSprite(256,{alpha:.7,round:true}),square=shadowSprite(256,{alpha:.8}),particles=makeParticles(hash('vinyl'),34),roll=createRoll();
 const records=new Map(),layouts=new Map(),titles=new Map(),measure=layer(8,8).getContext('2d');
 const record=i=>{if(!records.has(i)){if(records.size>3)records.delete(records.keys().next().value);records.set(i,discTexture(Math.round(r*2.2),{kind:'vinyl',art:base.art(i).image,accent:base.art(i).accent}));}return records.get(i);};
 const [lx,ly,lw,rowH,rows]=L.lyrics,lh=rowH*rows,anchor=1;
 const lyricsOf=i=>{if(!layouts.has(i))layouts.set(i,lyricLayout(measure,tracks[i].cues||[],{size:u*(portrait?.042:.038),minSize:u*.022,weight:600,maxWidth:lw*.94,rowH}));return layouts.get(i);};
 const titleOf=i=>{if(!titles.has(i))titles.set(i,fitText(measure,tracks[i].title||'',{size:u*.05,minSize:u*.03,weight:800,lineHeight:1.2,maxWidth:L.titleW,maxHeight:u*.13,spacing:-.025,maxLines:2}));return titles.get(i);};
 const trackItems=tracks.map((track,n)=>({number:n+1,title:track.title||'',duration:Number(track.duration)||0}));

 function draw(ctx,time){
  const s=base.at(time),{i,local,show,energy}=s,art=base.art(i),warm=mix(art.accent,[255,190,120],.45);
  // Room: deep tone of the album color, a lamp light that sways slightly, dust in the light.
  const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,rgba(mix(art.deep,[30,22,18],.5)));bg.addColorStop(1,rgba(mix(art.deep,[6,5,5],.6)));ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  const lampX=W*(portrait?.45:.3)+Math.sin(s.t*.12)*u*.04;radialGlow(ctx,lampX,H*.18,u*.95,warm,.2+energy.level*.08);radialGlow(ctx,W*.8,H*.9,u*.7,art.glow,.08);
  // Lamp beam: a soft cone from the lamp; dust drifts only inside it, catching the light.
  const beamX=lampX,beamTop=-H*.05,beamW=u*(portrait?.9:.75);ctx.save();ctx.beginPath();ctx.moveTo(beamX-u*.05,beamTop);ctx.lineTo(beamX+u*.05,beamTop);ctx.lineTo(beamX+beamW/2,H);ctx.lineTo(beamX-beamW/2,H);ctx.closePath();const cone=ctx.createLinearGradient(0,beamTop,0,H);cone.addColorStop(0,rgba(warm,.16));cone.addColorStop(.7,rgba(warm,.04));cone.addColorStop(1,rgba(warm,0));ctx.fillStyle=cone;ctx.fill();ctx.clip();
  drawParticles(ctx,particles,s.t,{width:W,height:H,color:[255,226,190],size:u*.006,alpha:.5,rise:.006,sway:.025});ctx.restore();
  // Record: slides out of the sleeve at the start of the song, back in at the end.
  const out=easeInOut((local-.2)/1.6)*s.exit,cx=sx+size/2+size*lerp(.04,.52,out),cy=sy+size/2,spin=s.t*(33.333/60)*Math.PI*2;
  if(s.frame&&['ring','radial-bars','double-ring','radial-dots'].includes(base.options.spectrum)){const box=r*1.07/.31;drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:mix(warm,[255,255,255],.3),alpha:.5*out,amp:.5,x:cx-box/2,y:cy-box/2,width:box,height:box});}
  drawShadow(ctx,shadow,cx-r,cy-r,r*2,r*2,{alpha:.75,offsetY:.04,spread:1.18});
  drawDisc(ctx,record(i),cx,cy,r,spin,{kind:'vinyl',gloss:.9});
  // Sleeve on top of the record.
  drawShadow(ctx,square,sx,sy,size,size,{alpha:.95});
  roundedImage(ctx,art.image,sx,sy,size,size,u*.004);
  const sheen=ctx.createLinearGradient(sx,sy,sx+size,sy+size);sheen.addColorStop(0,'rgba(255,255,255,.12)');sheen.addColorStop(.4,'rgba(255,255,255,0)');ctx.fillStyle=sheen;ctx.fillRect(sx,sy,size,size);
  // Tonearm: rests beside the record, swings in once it is out, travels inward over the song.
  const px=cx+r*1.02,py=cy-r*1.02,swing=easeInOut((local-1.2)/1.2)*s.exit,angle=lerp(-.12,.12+s.progress*.3,swing);
  drawTonearm(ctx,px,py,r*1.28,angle,{u,color:'#d8dbe0'});
  vignette(ctx,W,H,{alpha:.5});
  // Text.
  const align=L.align,hx=align==='center'?W/2:L.head[0],rise=(1-show)*u*.025;
  text(ctx,base.headline,portrait?W/2:W*.06,L.top,{size:u*.025,weight:800,color:'rgba(255,242,228,.94)',spacing:.02,align:portrait?'center':'left',maxWidth:portrait?u*.84:W*.5});
  text(ctx,`SIDE A  ·  ${String(i+1).padStart(2,'0')} / ${String(tracks.length).padStart(2,'0')}`,hx,L.head[1]+rise,{size:u*.017,weight:600,color:rgba(mix(warm,[255,255,255],.2)),spacing:.18,align,alpha:show});
  drawBlock(ctx,titleOf(i),hx,L.head[1]+u*.03+rise,{color:'#fff6ec',align,alpha:show});
  const {index,ease}=base.rollState(s),dim=[214,200,186],hot=[255,248,238];
  const highlight=(g,x,y,w,h)=>{g.fillStyle=rgba(warm,.95);g.beginPath();g.arc(align==='center'?x+w*.02:x+u*.008,y+h/2,u*.006,0,Math.PI*2);g.fill();};
  if(vocal){const items=lyricsOf(i);roll(ctx,{x:lx,y:ly,w:lw,h:lh,rowH,anchor,index,ease,count:items.length,highlight:align==='center'?null:highlight,row:(g,n,x,top,w,h,e)=>lyricRow(g,items[n],align==='center'?x:x+u*.03,top,align==='center'?w:w-u*.03,h,e,{align,dim,hot,dimAlpha:.38,scale:.08})});}
  else roll(ctx,{x:lx,y:ly,w:lw,h:lh,rowH,anchor,index,ease,count:trackItems.length,row:(g,n,x,top,w,h,e)=>trackRow(g,trackItems[n],x,top,w,h,e,{size:u*.028,dim,hot,accent:warm})});
  const [bx,by,bw]=L.bar;progressBar(ctx,bx,by,bw,u*.0035,s.progress,{fill:rgba(warm),track:'rgba(255,235,215,.16)'});
  text(ctx,stamp(local),bx,by+u*.03,{size:u*.015,color:'rgba(255,240,226,.7)'});text(ctx,stamp(s.duration),bx+bw,by+u*.03,{size:u*.015,color:'rgba(255,240,226,.7)',align:'right'});
 }
 return {draw,duration:base.total};
}

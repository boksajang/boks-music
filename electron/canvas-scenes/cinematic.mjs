import {sceneBase,createRoll,lyricLayout,lyricRow,trackRow,drawCover,drawSweep,radialGlow,vignette,drawSpectrum,text,fitText,drawBlock,stamp,rgba,mix,layer,hash,random,easeOut,clamp,lerp,accentOf} from '../canvas-kit.mjs';

/**
 * 시네마 플로우: a film still. The photograph (or the album art) moves like a slow camera push, a light
 * leak sweeps across, dust floats in the beam; the letterbox opens at the start and the lyrics sit
 * large in the middle of the frame.
 */
export default function cinematic(input){
 const base=sceneBase(input),{width:W,height:H,portrait,u,vocal,tracks}=base;
 const L=portrait
  ?{index:H*.27,title:H*.29,titleW:u*.84,lyrics:[u*.06,H*.42,u*.88,u*.13,3],spectrum:[u*.15,H*.7,u*.7,H*.07],bars:u*.06,top:H*.065}
  :{index:H*.22,title:H*.25,titleW:W*.66,lyrics:[W*.12,H*.42,W*.76,H*.12,3],spectrum:[W*.28,H*.78,W*.44,H*.08],bars:u*.075,top:H*.11};
 const grain=Array.from({length:4},(_,k)=>{const c=layer(256,256),g=c.getContext('2d'),r=random(hash('grain')+k);for(let n=0;n<2600;n++){const v=r()<.5?0:255;g.fillStyle=`rgba(${v},${v},${v},${.05+r()*.08})`;g.fillRect(r()*256,r()*256,1+r()*1.5,1+r()*1.5);}return c;}),roll=createRoll(),layouts=new Map(),titles=new Map(),measure=layer(8,8).getContext('2d');
 const [lx,ly,lw,rowH,rows]=L.lyrics,lh=rowH*rows;
 const lyricsOf=i=>{if(!layouts.has(i))layouts.set(i,lyricLayout(measure,tracks[i].cues||[],{size:u*(portrait?.05:.052),minSize:u*.026,weight:700,maxWidth:lw*.92,rowH,spacing:-.025}));return layouts.get(i);};
 const titleOf=i=>{if(!titles.has(i))titles.set(i,fitText(measure,tracks[i].title||'',{size:u*.05,minSize:u*.03,weight:600,lineHeight:1.2,maxWidth:L.titleW,maxHeight:u*.12,spacing:-.01,maxLines:2}));return titles.get(i);};
 const trackItems=tracks.map((track,n)=>({number:n+1,title:track.title||'',duration:Number(track.duration)||0}));

 function frame(ctx,image,s,seed,alpha){
  // Camera: a slow push-in across each song with a gentle lateral drift.
  const zoom=1.05+s.progress*.09+Math.sin(s.t*.05+seed)*.01,w=W*zoom,h=H*zoom,dx=Math.sin(s.t*.04+seed*2)*W*.025,dy=Math.cos(s.t*.033+seed)*H*.018;
  ctx.globalAlpha=alpha;drawCover(ctx,image,(W-w)/2+dx,(H-h)/2+dy,w,h);ctx.globalAlpha=1;
 }
 function draw(ctx,time){
  const s=base.at(time),{i,local,show,energy}=s,art=base.art(i),light=mix(art.soft,[255,226,190],.5);
  ctx.fillStyle='#05070b';ctx.fillRect(0,0,W,H);
  const picture=base.background||art.image;
  if(!base.background&&i>0&&s.enter<1)frame(ctx,base.art(i-1).image,{...s,progress:1},i-1,1);
  frame(ctx,picture,s,base.background?0:i,base.background||i===0?1:s.enter);
  // Grade: dark, slightly tinted toward the album color, brighter at the center where the text sits.
  // Bright pictures get a deeper grade so the lyrics keep their contrast.
  const lum=base.background?(base.backgroundLuma??=accentOf(base.background).luma):art.luma;
  ctx.fillStyle=rgba(mix(art.deep,[4,6,10],.5),clamp(.5+lum*.45,.52,.8));ctx.fillRect(0,0,W,H);
  radialGlow(ctx,W/2,H*.52,u*.85,art.glow,.1+energy.level*.1);
  drawSweep(ctx,s.t,{width:W,height:H,period:19,color:light,alpha:.13,band:.35});
  vignette(ctx,W,H,{alpha:.65,inner:.35});
  // Film grain: four noise plates cycled at 12 per second (a film-stock texture, not floating particles).
  const plate=grain[Math.floor(s.t*12)%4],off=(Math.floor(s.t*12)*97)%256;ctx.globalAlpha=.55;for(let y=-off;y<H;y+=256)for(let x=-((off*3)%256);x<W;x+=256)ctx.drawImage(plate,x,y);ctx.globalAlpha=1;
  // Heading: fades and tracks in with each song.
  const spread=lerp(.5,.32,show);
  text(ctx,`${String(i+1).padStart(2,'0')} — ${String(tracks.length).padStart(2,'0')}`,W/2,L.index,{size:u*.017,weight:500,color:rgba(light),spacing:spread,align:'center',alpha:show});
  drawBlock(ctx,titleOf(i),W/2,L.title+(1-show)*u*.02,{color:'#f6f3ee',align:'center',alpha:show*.95});
  const t=titleOf(i),ruleY=L.title+t.height+u*.03,ruleW=u*.18*show;
  const rule=ctx.createLinearGradient(W/2-ruleW,0,W/2+ruleW,0);rule.addColorStop(0,'rgba(255,255,255,0)');rule.addColorStop(.5,rgba(light,.7));rule.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=rule;ctx.fillRect(W/2-ruleW,ruleY,ruleW*2,Math.max(1,u*.0015));
  // Lyrics: three large centered lines; the current one glows a little with the music.
  const {index,ease}=base.rollState(s),top=Math.max(ly,ruleY+u*.04);
  if(vocal){const items=lyricsOf(i);roll(ctx,{x:lx,y:top,w:lw,h:lh,rowH,anchor:1,index,ease,count:items.length,fade:.22,row:(g,n,x,y,w,h,e)=>lyricRow(g,items[n],x,y,w,h,e,{align:'center',dim:[200,198,196],hot:mix([255,255,255],light,.15+energy.level*.2),dimAlpha:.3,scale:.1})});}
  else roll(ctx,{x:lx+lw*.15,y:top,w:lw*.7,h:lh,rowH,anchor:1,index,ease,count:trackItems.length,fade:.22,row:(g,n,x,y,w,h,e)=>trackRow(g,trackItems[n],x,y,w,h,e,{size:u*.036,dim:[200,198,196],accent:light,dimAlpha:.35})});
  if(s.frame){const [sx,sy,sw,sh]=L.spectrum;drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:light,alpha:.6,x:sx,y:sy,width:sw,height:sh});}
  // Letterbox: opens at the very start of the video, then holds.
  const bar=L.bars*easeOut(s.t/1.6+.15);ctx.fillStyle='#030406';ctx.fillRect(0,0,W,bar);ctx.fillRect(0,H-bar,W,bar);
  text(ctx,base.headline,W/2,L.top,{size:u*.022,weight:600,color:'rgba(244,240,232,.9)',spacing:.18,align:'center',maxWidth:W*.8});
  // Footer: title, clock and a thin progress line inside the lower bar.
  const fy=H-bar-u*.03;
  text(ctx,tracks[i].title,portrait?u*.06:W*.06,fy,{size:u*.016,color:'rgba(240,236,228,.7)',spacing:.04,maxWidth:W*.6});
  text(ctx,`${stamp(local)} / ${stamp(s.duration)}`,portrait?W-u*.06:W*.94,fy,{size:u*.016,color:'rgba(240,236,228,.7)',align:'right'});
  ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(0,H-bar,W,Math.max(1,u*.002));ctx.fillStyle=rgba(light,.85);ctx.fillRect(0,H-bar,W*clamp(s.progress,0,1),Math.max(1,u*.002));
 }
 return {draw,duration:base.total};
}

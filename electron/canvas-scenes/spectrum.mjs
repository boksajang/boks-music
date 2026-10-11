import {sceneBase,createRoll,lyricLayout,lyricRow,trackRow,makeParticles,drawParticles,radialGlow,vignette,drawSpectrum,energyAt,glyph,text,fitText,drawBlock,progressBar,stamp,rgba,mix,hsl,layer,hash,drawCover,setFont} from '../canvas-kit.mjs';

const RADIAL=['ring','radial-bars','double-ring','radial-dots','ellipse'];
/**
 * 사운드 갤러리: the music is the subject. A round album disc turns at the center inside a glow that
 * pulses with the bass, rings spread outward on loud moments, color fields drift behind.
 */
export default function spectrum(input){
 const base=sceneBase(input,{hue:250}),{width:W,height:H,portrait,u,vocal,tracks}=base;
 const L=portrait
  ?{center:[W/2,H*.31],radius:u*.24,title:H*.535,lyrics:[u*.06,H*.62,u*.88,u*.095,3],linear:[u*.08,H*.79,u*.84,H*.06],bar:[u*.12,H*.9,u*.76],top:H*.05}
  :{center:[W/2,H*.38],radius:H*.2,title:H*.655,lyrics:[W*.2,H*.75,W*.6,H*.072,2],linear:[W*.2,H*.06,W*.6,H*.07],bar:[W*.32,H*.94,W*.36],top:H*.075};
 const particles=makeParticles(hash('spectrum'),40),roll=createRoll(),circles=new Map(),layouts=new Map(),titles=new Map(),measure=layer(8,8).getContext('2d');
 const [cx,cy]=L.center,R=L.radius;
 const circle=i=>{if(!circles.has(i)){if(circles.size>3)circles.delete(circles.keys().next().value);const size=Math.round(R*2),c=layer(size,size),g=c.getContext('2d');g.beginPath();g.arc(size/2,size/2,size/2,0,Math.PI*2);g.clip();drawCover(g,base.art(i).image,0,0,size,size);g.fillStyle='rgba(0,0,0,.25)';g.globalCompositeOperation='destination-out';g.beginPath();g.arc(size/2,size/2,size*.035,0,Math.PI*2);g.fill();circles.set(i,c);}return circles.get(i);};
 const [lx,ly,lw,rowH,rows]=L.lyrics,lh=rowH*rows;
 const lyricsOf=i=>{if(!layouts.has(i))layouts.set(i,lyricLayout(measure,tracks[i].cues||[],{size:u*.038,minSize:u*.022,weight:600,maxWidth:lw*.95,rowH}));return layouts.get(i);};
 const titleOf=i=>{if(!titles.has(i))titles.set(i,fitText(measure,tracks[i].title||'',{size:u*.046,minSize:u*.028,weight:800,lineHeight:1.15,maxWidth:portrait?u*.66:W*.46,maxHeight:u*.06,spacing:-.02,maxLines:1}));return titles.get(i);};
 const trackItems=tracks.map((track,n)=>({number:n+1,title:track.title||'',duration:Number(track.duration)||0}));

 function draw(ctx,time){
  const s=base.at(time),{i,local,show,energy}=s,art=base.art(i),glow=art.glow;
  // Color fields drifting behind.
  ctx.fillStyle=rgba(mix(art.deep,[4,5,12],.4));ctx.fillRect(0,0,W,H);
  radialGlow(ctx,W*(.3+Math.sin(s.t*.05)*.15),H*(.35+Math.cos(s.t*.04)*.15),u*1.1,hsl(art.hue+30,.6,.35),.35);
  radialGlow(ctx,W*(.72+Math.cos(s.t*.045)*.15),H*(.7+Math.sin(s.t*.06)*.12),u*1.0,hsl(art.hue-40,.55,.3),.3);
  drawParticles(ctx,particles,s.t,{width:W,height:H,color:art.soft,size:u*.008,alpha:.4,rise:.01,level:energy.level});
  // Rings: one leaves the disc every 1.5 s, as strong as the music was when it left.
  for(let k=0;k<5;k++){const born=Math.floor(s.t/1.5-k)*1.5;if(born<0)continue;const age=(s.t-born)/7.5,birth=energyAt(input.analyses?.[i],Math.max(0,s.local-(s.t-born)),base.fps).level;if(age>1)continue;ctx.strokeStyle=rgba(art.soft,(1-age)*.35*(.3+birth));ctx.lineWidth=Math.max(1,u*.002);ctx.beginPath();ctx.arc(cx,cy,R*(1.08+age*1.6),0,Math.PI*2);ctx.stroke();}
  radialGlow(ctx,cx,cy,R*(1.9+energy.low*.5),glow,.3+energy.low*.35);
  // Spectrum around the disc (radial shapes) or a band above (linear shapes).
  const kind=base.options.spectrum;
  if(s.frame){if(RADIAL.includes(kind)){const box=R*1.1/.31;drawSpectrum(ctx,{kind,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:art.soft,alpha:.85,amp:.8,x:cx-box/2,y:cy-box/2,width:box,height:box});}
   else if(portrait){const [sx,sy,sw,sh]=L.linear;drawSpectrum(ctx,{kind,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:art.soft,alpha:.75,x:sx,y:sy,width:sw,height:sh});}
   else{// Wide frames: the band runs out to both sides of the disc, mirrored.
    const sh=H*.16,sw=cx-R*1.45-W*.05,spec={kind,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:art.soft,alpha:.7,y:cy-sh/2,width:sw,height:sh};
    drawSpectrum(ctx,{...spec,x:W*.05});ctx.save();ctx.translate(W,0);ctx.scale(-1,1);drawSpectrum(ctx,{...spec,x:W*.05});ctx.restore();}}
  // The disc: round album art turning slowly, with a fine rim.
  const scale=(1+energy.low*.03)*(.85+.15*show);ctx.save();ctx.globalAlpha=show;ctx.translate(cx,cy);ctx.rotate(s.t*.25);ctx.drawImage(circle(i),-R*scale,-R*scale,R*2*scale,R*2*scale);ctx.restore();
  ctx.globalAlpha=show;ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=Math.max(1,u*.002);ctx.beginPath();ctx.arc(cx,cy,R*scale,0,Math.PI*2);ctx.stroke();ctx.fillStyle=rgba(art.deep);ctx.beginPath();ctx.arc(cx,cy,R*.035*scale,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  vignette(ctx,W,H,{alpha:.45});
  // Title between previous/next marks, the playlist below.
  const title=titleOf(i),tw=Math.min(title.lines.length?measureWidth(title):0,portrait?u*.66:W*.46),span=tw/2+u*.07,rise=(1-show)*u*.02;
  drawBlock(ctx,title,W/2,L.title+rise,{color:'#fff',align:'center',alpha:show});
  glyph(ctx,'prev',W/2-span,L.title+title.font*.6+rise,u*.026,'rgba(255,255,255,.75)');glyph(ctx,'next',W/2+span,L.title+title.font*.6+rise,u*.026,'rgba(255,255,255,.75)');
  text(ctx,[base.playlist,`${i+1} / ${tracks.length}`].filter(Boolean).join('  ·  '),W/2,L.title+title.height+u*.04+rise,{size:u*.017,weight:500,color:rgba(art.soft,.85),spacing:.12,align:'center',maxWidth:W*.6,alpha:show});
  const {index,ease}=base.rollState(s),top=L.title+title.height+u*.065;
  if(vocal){const items=lyricsOf(i);roll(ctx,{x:lx,y:Math.max(ly,top),w:lw,h:lh,rowH,anchor:0,index,ease,count:items.length,fade:0,row:(g,n,x,y,w,h,e)=>lyricRow(g,items[n],x,y,w,h,Math.max(e,0),{align:'center',dim:[190,196,214],hot:[255,255,255],dimAlpha:.45,scale:.04})});}
  else roll(ctx,{x:lx+lw*.1,y:Math.max(ly,top),w:lw*.8,h:lh,rowH,anchor:0,index,ease,count:trackItems.length,fade:0,row:(g,n,x,y,w,h,e)=>trackRow(g,trackItems[n],x,y,w,h,e,{size:u*.028,accent:art.soft,dimAlpha:.45})});
  const [bx,by,bw]=L.bar;progressBar(ctx,bx,by,bw,u*.003,s.progress,{fill:rgba(art.soft),track:'rgba(255,255,255,.15)'});
  text(ctx,stamp(local),bx-u*.02,by+u*.004,{size:u*.015,color:'rgba(255,255,255,.65)',align:'right',baseline:'middle'});text(ctx,stamp(s.duration),bx+bw+u*.02,by+u*.004,{size:u*.015,color:'rgba(255,255,255,.65)',baseline:'middle'});
  text(ctx,base.brand,portrait?u*.07:W*.05,L.top,{size:u*.016,weight:700,color:'rgba(255,255,255,.85)',spacing:.28,maxWidth:W*.4});
 }
 function measureWidth(block){setFont(measure,block.weight,block.font,block.spacing);return Math.max(...block.lines.map(line=>measure.measureText(line).width));}
 return {draw,duration:base.total};
}

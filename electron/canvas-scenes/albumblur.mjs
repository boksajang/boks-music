import {sceneBase,createRoll,lyricLayout,lyricRow,trackRow,blurredCover,drawDrift,shadowSprite,drawShadow,roundedImage,radialGlow,vignette,drawSpectrum,glyph,text,fitText,drawBlock,progressBar,stamp,rgba,layer,hash} from '../canvas-kit.mjs';

/**
 * 앨범 블러: the song's own artwork, blurred, drifts behind a floating album card; an orbit line turns
 * around the card and the lyrics scroll through a highlighted band.
 */
export default function albumblur(input){
 const base=sceneBase(input),{width:W,height:H,portrait,u,vocal,tracks}=base;
 const L=portrait
  ?{art:[(W-u*.66)/2,H*.12,u*.66],index:[W/2,H*.12+u*.66+u*.075],title:[W/2,H*.12+u*.66+u*.1,u*.84,u*.058,u*.15],lyrics:[u*.08,H*.6,u*.84,u*.092,5],spectrum:[0,H*.865,W,H*.08],bar:[u*.08,H*.952,u*.84],top:H*.05,align:'center',orbit:[.64,.71]}
  :{art:[W*.08,H*.15,H*.46],index:[W*.08,H*.15+H*.46+H*.08],title:[W*.08,H*.15+H*.46+H*.1,W*.3,H*.046,H*.12],lyrics:[W*.44,H*.12,W*.49,H*.1,7],spectrum:[0,H*.9,W,H*.085],bar:[W*.08,H*.855,W*.3],top:H*.08,align:'left',orbit:[.62,.69]}; 
 const shadow=shadowSprite(256),roll=createRoll();
 const backdrops=new Map(),layouts=new Map(),titles=new Map();
 const measure=layer(8,8).getContext('2d');
 const backdrop=i=>{if(!backdrops.has(i)){if(backdrops.size>3)backdrops.delete(backdrops.keys().next().value);backdrops.set(i,blurredCover(base.art(i).image,W/H,{blur:.05,dim:.06}));}return backdrops.get(i);};
 const [lx,ly,lw,rowH,rows]=L.lyrics,lh=rowH*rows,anchor=Math.floor(rows/2);
 const lyricsOf=i=>{if(!layouts.has(i))layouts.set(i,lyricLayout(measure,tracks[i].cues||[],{size:u*(portrait?.044:.04),minSize:u*.024,weight:600,maxWidth:lw*.9,rowH}));return layouts.get(i);};
 const titleOf=i=>{if(!titles.has(i)){const [, ,maxWidth,size,maxHeight]=L.title;titles.set(i,fitText(measure,tracks[i].title||'',{size,minSize:size*.6,weight:700,lineHeight:1.22,maxWidth,maxHeight,spacing:-.02,maxLines:2}));}return titles.get(i);};
 const trackItems=tracks.map((track,n)=>({number:n+1,title:track.title||'',duration:Number(track.duration)||0}));

 function draw(ctx,time){
  const s=base.at(time),{i,local,show,energy}=s,art=base.art(i),ink=art.ink,accent=art.accent;
  // Backdrop: this song's blurred art drifting slowly; the previous song's fades out under it.
  ctx.fillStyle=rgba(art.deep);ctx.fillRect(0,0,W,H);
  if(i>0&&s.enter<1)drawDrift(ctx,backdrop(i-1),W,H,s.t,{zoom:1.2,seed:i-1});
  drawDrift(ctx,backdrop(i),W,H,s.t,{zoom:1.2,seed:i,alpha:i>0?s.enter:1});
  const shade=ctx.createLinearGradient(0,0,portrait?0:W,portrait?H:0);shade.addColorStop(0,'rgba(5,7,12,.24)');shade.addColorStop(.5,'rgba(5,7,12,.34)');shade.addColorStop(1,'rgba(5,7,12,.5)');ctx.fillStyle=shade;ctx.fillRect(0,0,W,H);
  vignette(ctx,W,H,{alpha:.5});
  // Spectrum: a soft band along the bottom, behind the text.
  if(s.frame){const [sx,sy,sw,sh]=L.spectrum;drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:ink,alpha:.42,x:sx,y:sy,width:sw,height:sh});}
  // Album card: floats, breathes with the music, slides in for each song.
  const [ax,ay,size]=L.art,float=Math.sin(s.t*.55)*u*.006,scale=1+energy.level*.018,slide=(1-show)*u*.06;
  const cx=ax+size/2+(portrait?0:-slide),cy=ay+size/2+float+(portrait?slide:0),card=size*scale;
  radialGlow(ctx,cx,cy,size*.95,art.glow,.18+energy.level*.22);
  // Orbit: a thin arc and a dashed ring turning around the card.
  ctx.save();ctx.globalAlpha=show;ctx.translate(cx,cy);ctx.strokeStyle=rgba(ink,.55);ctx.lineWidth=Math.max(1.5,u*.0022);
  // The arc swings back and forth on the right of the card, clear of the heading and brand text.
  const turn=s.t*.22,swing=Math.sin(s.t*.17)*.55;ctx.beginPath();ctx.arc(0,0,size*L.orbit[0],swing-.7,swing+.7);ctx.stroke();
  const end=swing+.7;glyph(ctx,'spark',Math.cos(end)*size*L.orbit[0],Math.sin(end)*size*L.orbit[0],u*.022,rgba(ink,.9));
  ctx.setLineDash([u*.004,u*.012]);ctx.strokeStyle=rgba(ink,.22);ctx.beginPath();ctx.arc(0,0,size*L.orbit[1],-turn*.6,-turn*.6+Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.restore();
  ctx.globalAlpha=show;drawShadow(ctx,shadow,cx-card/2,cy-card/2,card,card,{alpha:.9});
  roundedImage(ctx,art.image,cx-card/2,cy-card/2,card,card,u*.016);
  // Glass glint: a narrow highlight crosses the card every 7 s, as if the cover were behind glass.
  const glint=((s.t%7)/7)*2.4-.7;if(glint>-.3&&glint<1.3){ctx.save();ctx.beginPath();ctx.roundRect(cx-card/2,cy-card/2,card,card,u*.016);ctx.clip();const gx=cx-card/2+glint*card,band=ctx.createLinearGradient(gx-card*.18,cy-card/2,gx+card*.18,cy+card/2);band.addColorStop(0,'rgba(255,255,255,0)');band.addColorStop(.5,'rgba(255,255,255,.16)');band.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=band;ctx.fillRect(cx-card/2,cy-card/2,card,card);ctx.restore();}
  ctx.strokeStyle='rgba(255,255,255,.14)';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(cx-card/2,cy-card/2,card,card,u*.016);ctx.stroke();ctx.globalAlpha=1;
  // Heading under the card.
  const align=L.align,rise=(1-show)*u*.025;
  text(ctx,`${String(i+1).padStart(2,'0')} / ${String(tracks.length).padStart(2,'0')}   ·   NOW PLAYING`,L.index[0],L.index[1]+rise,{size:u*.017,weight:600,color:rgba(art.soft),spacing:.18,align,alpha:show});
  drawBlock(ctx,titleOf(i),L.title[0],L.title[1]+rise,{color:'#fff',align,alpha:show});
  const [bx,by,bw]=L.bar;progressBar(ctx,bx,by,bw,u*.004,s.progress,{fill:rgba(ink,.95),track:'rgba(255,255,255,.18)',knob:u*.006});
  text(ctx,stamp(local),bx,by+u*.03,{size:u*.016,color:'rgba(235,240,250,.75)',spacing:.05});
  text(ctx,stamp(s.duration),bx+bw,by+u*.03,{size:u*.016,color:'rgba(235,240,250,.75)',spacing:.05,align:'right'});
  // Brand and playlist title.
  text(ctx,base.headline,portrait?W/2:W*.075,L.top,{size:u*.026,weight:800,color:'rgba(244,247,253,.94)',spacing:.02,align:portrait?'center':'left',maxWidth:portrait?u*.84:W*.85});
  // Lyrics (or the track list) through a highlighted band.
  const {index,ease}=base.rollState(s),dim=[214,220,232],hot=[255,255,255];
  const highlight=(g,x,y,w,h)=>{const band=g.createLinearGradient(x,0,x+w,0);band.addColorStop(0,rgba(art.deep,.0));band.addColorStop(.12,rgba(art.deep,.62));band.addColorStop(.88,rgba(art.deep,.62));band.addColorStop(1,rgba(art.deep,0));g.fillStyle=band;g.fillRect(x,y+h*.06,w,h*.88);g.fillStyle=rgba(accent,.9);g.fillRect(x+w*.06,y+h*.06,Math.max(2,u*.004),h*.88);};
  if(vocal){const items=lyricsOf(i);roll(ctx,{x:lx,y:ly,w:lw,h:lh,rowH,anchor,index,ease,count:items.length,highlight,row:(g,n,x,top,w,h,e)=>lyricRow(g,items[n],align==='center'?x:x+w*.1,top,w*(align==='center'?1:.86),h,e,{align,dim,hot,dimAlpha:.4})});}
  else roll(ctx,{x:lx,y:ly,w:lw,h:lh,rowH,anchor,index,ease,count:trackItems.length,highlight,row:(g,n,x,top,w,h,e)=>trackRow(g,trackItems[n],x+w*.1,top,w*.84,h,e,{size:u*.03,dim,hot,accent:art.soft})});
 }
 return {draw,duration:base.total};
}

import {sceneBase,createRoll,lyricLayout,lyricRow,trackRow,blurredCover,drawCover,discTexture,drawDisc,shadowSprite,drawShadow,roundedImage,makeParticles,drawParticles,drawSweep,vignette,drawSpectrum,text,fitText,drawBlock,progressBar,stamp,rgba,mix,layer,hash,easeOut} from '../canvas-kit.mjs';

/**
 * 포토 스테이지: a photograph (or the album art) slowly zooming behind; the album sleeve with its CD
 * sliding out and spinning, the spectrum under it, and lyrics in a tinted side panel.
 */
export default function photo(input){
 const base=sceneBase(input),{width:W,height:H,portrait,u,vocal,tracks}=base;
 const L=portrait
  ?{top:H*.045,index:[u*.08,H*.085],title:[u*.08,H*.1,u*.84,u*.062,u*.16],art:[u*.08,H*.2,u*.56],spectrum:[u*.08,H*.2+u*.56+u*.045,u*.84,u*.09],panel:[u*.05,H*.63,u*.9,H*.335],rows:5,rowH:u*.088,lyric:u*.042}
  :{top:H*.075,index:[W*.06,H*.15],title:[W*.06,H*.17,W*.42,H*.06,H*.1],art:[W*.06,H*.31,H*.46],spectrum:[W*.06,H*.8,H*.46*1.55,H*.1],panel:[W*.575,0,W*.425,H],rows:7,rowH:H*.1,lyric:H*.04};
 const shadow=shadowSprite(256),particles=makeParticles(hash('photo'),18),roll=createRoll();
 const covers=new Map(),discs=new Map(),layouts=new Map(),titles=new Map(),measure=layer(8,8).getContext('2d');
 const backdrop=i=>{const key=base.background?'photo':i;if(!covers.has(key)){if(covers.size>3)covers.delete(covers.keys().next().value);covers.set(key,base.background||blurredCover(base.art(i).image,W/H,{blur:.025,dim:.05}));}return covers.get(key);};
 const disc=i=>{if(!discs.has(i)){if(discs.size>3)discs.delete(discs.keys().next().value);discs.set(i,discTexture(Math.round(L.art[2]*1.05),{kind:'cd',art:base.art(i).image,accent:base.art(i).accent}));}return discs.get(i);};
 const [px,py,pw,ph]=L.panel,rowH=L.rowH,lh=rowH*L.rows,ly=py+(ph-lh)/2+(portrait?u*.01:0),anchor=Math.floor(L.rows/2);
 const lyricsOf=i=>{if(!layouts.has(i))layouts.set(i,lyricLayout(measure,tracks[i].cues||[],{size:L.lyric,minSize:u*.024,weight:600,maxWidth:pw*.82,rowH}));return layouts.get(i);};
 const titleOf=i=>{if(!titles.has(i)){const [, ,maxWidth,size,maxHeight]=L.title;titles.set(i,fitText(measure,tracks[i].title||'',{size,minSize:size*.6,weight:800,lineHeight:1.18,maxWidth,maxHeight,spacing:-.025,maxLines:2}));}return titles.get(i);};
 const trackItems=tracks.map((track,n)=>({number:n+1,title:track.title||'',duration:Number(track.duration)||0}));

 function draw(ctx,time){
  const s=base.at(time),{i,local,show,energy}=s,art=base.art(i);
  // Ken Burns: each song zooms in over its length, panning the opposite way from the previous one.
  const pan=i%2?1:-1,zoom=1.06+s.progress*.1,cw=W*zoom,ch=H*zoom,dx=pan*(s.progress-.5)*W*.04;
  ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
  const image=backdrop(i);drawCover(ctx,image,(W-cw)/2+dx,(H-ch)/2,cw,ch);
  if(!base.background&&i>0&&s.enter<1){ctx.globalAlpha=1-s.enter;drawCover(ctx,backdrop(i-1),0,0,W,H);ctx.globalAlpha=1;}
  // Color grade toward the album color, darker on the text side.
  const grade=ctx.createLinearGradient(0,0,portrait?0:W,portrait?H:0);grade.addColorStop(0,rgba(art.deep,.55));grade.addColorStop(1,rgba(art.deep,.25));ctx.fillStyle=grade;ctx.fillRect(0,0,W,H);
  drawSweep(ctx,s.t,{width:W,height:H,period:18,color:art.soft,alpha:.07});
  vignette(ctx,W,H,{alpha:.45});
  drawParticles(ctx,particles,s.t,{width:W,height:H,color:art.soft,size:u*.01,alpha:.28,level:energy.level});
  // Lyric panel tinted with the album color.
  ctx.fillStyle=rgba(mix(art.deep,art.accent,.22),.62);ctx.beginPath();ctx.roundRect(px,py,pw,ph,portrait?u*.03:0);ctx.fill();
  const edge=ctx.createLinearGradient(px,0,px+pw,0);edge.addColorStop(0,'rgba(255,255,255,.08)');edge.addColorStop(.02,'rgba(255,255,255,0)');ctx.fillStyle=edge;ctx.fillRect(px,py,pw,ph);
  // Heading.
  const rise=(1-show)*u*.03;
  text(ctx,base.brand,L.index[0],L.top,{size:u*.017,weight:700,color:'rgba(255,255,255,.88)',spacing:.26,maxWidth:portrait?W*.5:W*.3});
  text(ctx,`TRACK ${String(i+1).padStart(2,'0')} / ${String(tracks.length).padStart(2,'0')}`,L.index[0],L.index[1]+rise,{size:u*.018,weight:600,color:rgba(art.soft),spacing:.16,alpha:show});
  drawBlock(ctx,titleOf(i),L.title[0],L.title[1]+u*.012+rise,{color:'#fff',alpha:show});
  // Sleeve and CD: the disc slides out from behind the sleeve as the song starts and keeps turning.
  const [ax,ay,size]=L.art,out=easeOut((local-.25)/1.4)*s.exit,r=size*.47,cx=ax+size*.5+size*(.12+.4*out),cy=ay+size/2,lift=Math.sin(s.t*.5)*u*.004;
  ctx.globalAlpha=Math.min(1,show*1.5);drawShadow(ctx,shadow,cx-r,cy-r+lift,r*2,r*2,{alpha:.55});
  drawDisc(ctx,disc(i),cx,cy+lift,r,s.t*1.6,{kind:'cd',gloss:.9});
  drawShadow(ctx,shadow,ax,ay+lift,size,size,{alpha:.9});
  roundedImage(ctx,art.image,ax,ay+lift,size,size,u*.006);
  ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=1;ctx.strokeRect(ax+.5,ay+lift+.5,size-1,size-1);ctx.globalAlpha=1;
  if(s.frame){const [sx,sy,sw,sh]=L.spectrum;drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:[245,246,250],alpha:.85,x:sx,y:sy,width:sw,height:sh});}
  // Panel content: playlist title, lyrics or the track list, progress.
  const inner=pw*.82,ix=px+(pw-inner)/2;
  text(ctx,base.playlist,px+pw/2,py+(portrait?u*.06:H*.075),{size:u*.017,weight:600,color:'rgba(255,255,255,.7)',spacing:.14,align:'center',maxWidth:inner});
  const {index,ease}=base.rollState(s);
  const highlight=(g,x,y,w,h)=>{g.fillStyle='rgba(255,255,255,.1)';g.beginPath();g.roundRect(x+w*.04,y+h*.08,w*.92,h*.84,h*.16);g.fill();};
  if(vocal){const items=lyricsOf(i);roll(ctx,{x:ix-pw*.05,y:ly,w:inner+pw*.1,h:lh,rowH,anchor,index,ease,count:items.length,highlight,row:(g,n,x,top,w,h,e)=>lyricRow(g,items[n],x,top,w,h,e,{align:'center',dim:[226,228,236],hot:[255,255,255],dimAlpha:.42})});}
  else roll(ctx,{x:ix-pw*.05,y:ly,w:inner+pw*.1,h:lh,rowH,anchor,index,ease,count:trackItems.length,highlight,row:(g,n,x,top,w,h,e)=>trackRow(g,trackItems[n],x+w*.08,top,w*.84,h,e,{size:u*.028,dim:[226,228,236],accent:art.soft})});
  const by=py+ph-(portrait?u*.07:H*.085);progressBar(ctx,ix,by,inner,u*.0035,s.progress,{fill:'rgba(255,255,255,.92)',track:'rgba(255,255,255,.2)'});
  text(ctx,stamp(local),ix,by+u*.03,{size:u*.015,color:'rgba(255,255,255,.7)'});text(ctx,stamp(s.duration),ix+inner,by+u*.03,{size:u*.015,color:'rgba(255,255,255,.7)',align:'right'});
 }
 return {draw,duration:base.total};
}

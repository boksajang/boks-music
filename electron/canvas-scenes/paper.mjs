import {sceneBase,createRoll,lyricLayout,lyricRow,trackRow,discTexture,drawDisc,shadowSprite,drawShadow,roundedImage,radialGlow,drawSpectrum,glyph,text,fitText,drawBlock,progressBar,stamp,rgba,mix,hsl,layer,random,hash,easeInOut,lerp} from '../canvas-kit.mjs';

/**
 * 페이퍼 플레이어: a light paper desk with a player card. The card floats and sways a little, the record
 * behind the cover turns, pastel light drifts across the paper, and the lyrics roll in three lines.
 */
export default function paper(input){
 const base=sceneBase(input,{hue:30}),{width:W,height:H,portrait,u,vocal,tracks}=base;
 const L=portrait
  ?{card:[u*.07,H*.1,u*.86,H*.8],art:[.5,.075,.56],title:[.5,.505],lyrics:[.08,.6,.84,u*.082,3],spectrum:[.12,.8,.76,.04],controls:.875,bar:[.12,.935,.76],align:'center'}
  :{card:[W*.09,H*.12,W*.82,H*.76],art:[.06,.13,.44],title:[.56,.12],lyrics:[.53,.31,.42,H*.08,3],spectrum:[.56,.635,.36,.085],controls:.8,bar:[.56,.9,.36],align:'center'};
 const shadow=shadowSprite(256,{alpha:.35}),round=shadowSprite(256,{alpha:.45,round:true}),roll=createRoll();
 const records=new Map(),layouts=new Map(),titles=new Map(),measure=layer(8,8).getContext('2d');
 const [cx0,cy0,cw,ch]=L.card;
 const grain=(()=>{const c=layer(256,256),g=c.getContext('2d'),r=random(7);for(let n=0;n<5200;n++){g.fillStyle=`rgba(${r()<.5?'90,70,50':'255,255,255'},${.03+r()*.05})`;g.fillRect(r()*256,r()*256,1+r(),1+r());}return c;})();
 const artSize=portrait?u*L.art[2]:ch*.62,artBox=()=>portrait?[cx0+cw/2-artSize/2-artSize*.12,cy0+ch*L.art[1],artSize]:[cx0+cw*L.art[0],cy0+ch/2-artSize/2,artSize];
 const record=i=>{if(!records.has(i)){if(records.size>3)records.delete(records.keys().next().value);records.set(i,discTexture(Math.round(artSize*1.05),{kind:'vinyl',art:base.art(i).image,accent:base.art(i).accent}));}return records.get(i);};
 const [lxr,lyr,lwr,rowH,rows]=L.lyrics,lw=cw*lwr,lh=rowH*rows;
 const lyricsOf=i=>{if(!layouts.has(i))layouts.set(i,lyricLayout(measure,tracks[i].cues||[],{size:u*(portrait?.04:.036),minSize:u*.022,weight:700,maxWidth:lw*.95,rowH}));return layouts.get(i);};
 const titleOf=i=>{if(!titles.has(i))titles.set(i,fitText(measure,tracks[i].title||'',{size:u*.052,minSize:u*.03,weight:800,lineHeight:1.18,maxWidth:portrait?cw*.84:cw*.38,maxHeight:u*.13,spacing:-.03,maxLines:2}));return titles.get(i);};
 const trackItems=tracks.map((track,n)=>({number:n+1,title:track.title||'',duration:Number(track.duration)||0}));

 function draw(ctx,time){
  const s=base.at(time),{i,local,show,energy}=s,art=base.art(i),ink=[34,32,38],pastel=hsl(art.hue,.55,.8);
  // Paper desk with drifting pastel light from the album color.
  ctx.fillStyle='#efe9df';ctx.fillRect(0,0,W,H);
  radialGlow(ctx,W*(.25+Math.sin(s.t*.07)*.12),H*(.3+Math.cos(s.t*.05)*.1),u*.9,pastel,.55);
  radialGlow(ctx,W*(.8+Math.cos(s.t*.06)*.1),H*(.75+Math.sin(s.t*.08)*.08),u*.8,hsl(art.hue+40,.5,.82),.45);
  ctx.globalAlpha=.9;for(let y=0;y<H;y+=256)for(let x=0;x<W;x+=256)ctx.drawImage(grain,x,y);ctx.globalAlpha=1;
  // Card: floats and sways slightly; lifts a little with the music.
  const sway=Math.sin(s.t*.35)*.004,lift=Math.sin(s.t*.5)*u*.004-energy.level*u*.004,x0=cx0,y0=cy0+lift;
  ctx.save();ctx.translate(x0+cw/2,y0+ch/2);ctx.rotate(sway);ctx.translate(-cw/2,-ch/2);
  drawShadow(ctx,shadow,0,0,cw,ch,{alpha:.55,offsetY:.035,spread:1.08});
  ctx.fillStyle='#fbfaf7';ctx.beginPath();ctx.roundRect(0,0,cw,ch,u*.035);ctx.fill();
  ctx.strokeStyle='rgba(60,50,40,.08)';ctx.lineWidth=1;ctx.stroke();
  // Cover with the record peeking out and turning.
  const [axa,aya,size]=artBox(),ax=axa-x0,ay=aya-cy0,r=size*.48,out=easeInOut((local-.3)/1.5)*s.exit;
  const rx=portrait?ax+size/2+size*lerp(.05,.3,out):ax+size/2+size*lerp(.05,.32,out),ry=ay+size/2;
  ctx.globalAlpha=Math.min(1,show*1.6);drawShadow(ctx,round,rx-r,ry-r,r*2,r*2,{alpha:.6,offsetY:.03,spread:1.15});
  drawDisc(ctx,record(i),rx,ry,r,s.t*(33.333/60)*Math.PI*2,{kind:'vinyl',gloss:.7});
  drawShadow(ctx,shadow,ax,ay,size,size,{alpha:.9,offsetY:.04,spread:1.12});
  roundedImage(ctx,art.image,ax,ay,size,size,u*.014);ctx.globalAlpha=1;
  // Title and playlist.
  const tx=portrait?cw/2:cw*L.title[0]+cw*.18,ty=ch*L.title[1],rise=(1-show)*u*.02;
  text(ctx,base.brand,portrait?cw*.07:cw*.04,portrait?ch*.04:ch*.07,{size:u*.016,weight:800,color:rgba(mix(art.accent,ink,.35)),spacing:.24,maxWidth:cw*.5});
  drawBlock(ctx,titleOf(i),tx,ty+rise,{color:rgba(ink),align:'center',alpha:show});
  const titleH=titleOf(i).height;
  text(ctx,[base.playlist,`${i+1} / ${tracks.length}`].filter(Boolean).join('  ·  '),tx,ty+titleH+u*.035+rise,{size:u*.018,weight:500,color:'rgba(60,56,64,.62)',align:'center',maxWidth:portrait?cw*.84:cw*.38,alpha:show});
  // Lyrics: three centered lines, the current one dark and slightly larger.
  const lx=cw*lxr,ly=ch*lyr,{index,ease}=base.rollState(s);
  if(vocal){const items=lyricsOf(i);roll(ctx,{x:lx,y:ly,w:lw,h:lh,rowH,anchor:1,index,ease,count:items.length,fade:.2,row:(g,n,x,top,w,h,e)=>lyricRow(g,items[n],x,top,w,h,e,{align:'center',dim:[150,146,150],hot:ink,dimAlpha:.55,scale:.07})});}
  else roll(ctx,{x:lx,y:ly,w:lw,h:lh,rowH,anchor:1,index,ease,count:trackItems.length,fade:.2,row:(g,n,x,top,w,h,e)=>trackRow(g,trackItems[n],x+w*.04,top,w*.92,h,e,{size:u*.03,dim:[150,146,150],hot:ink,accent:art.accent,dimAlpha:.55})});
  // Spectrum, controls and progress.
  if(s.frame){const [sxr,syr,swr,shr]=L.spectrum;drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:mix(art.accent,ink,.15),alpha:.9,x:cw*sxr,y:ch*syr,width:cw*swr,height:ch*shr});}
  const cyc=ch*L.controls,gap=u*(portrait?.12:.085),mid=portrait?cw/2:cw*(L.bar[0]+L.bar[2]/2),icon=u*.032;
  [['repeat',-2],['prev',-1],['next',1],['shuffle',2]].forEach(([name,k])=>glyph(ctx,name,mid+k*gap,cyc,icon*(Math.abs(k)===2?.8:1),Math.abs(k)===2?'rgba(60,56,64,.45)':'rgba(40,38,44,.85)'));
  ctx.fillStyle=rgba(ink);ctx.beginPath();ctx.arc(mid,cyc,u*.04,0,Math.PI*2);ctx.fill();glyph(ctx,'pause',mid,cyc,u*.03,'#fbfaf7');
  const [bxr,byr,bwr]=L.bar,bx=cw*bxr,by=ch*byr,bw=cw*bwr;progressBar(ctx,bx,by,bw,u*.004,s.progress,{fill:rgba(mix(art.accent,ink,.3)),track:'rgba(40,36,44,.12)',knob:u*.007});
  text(ctx,stamp(local),bx,by+u*.032,{size:u*.015,color:'rgba(60,56,64,.6)'});text(ctx,stamp(s.duration),bx+bw,by+u*.032,{size:u*.015,color:'rgba(60,56,64,.6)',align:'right'});
  ctx.restore();
 }
 return {draw,duration:base.total};
}

import {sceneBase,createRoll,blurredCover,drawDrift,discTexture,drawDisc,shadowSprite,drawShadow,makeParticles,drawParticles,radialGlow,vignette,drawSpectrum,equalizer,glyph,text,fitText,drawBlock,progressBar,stamp,rgba,mix,layer,hash,easeOut} from '../canvas-kit.mjs';

/**
 * 플레이리스트 보드 (instrumental): the whole playlist is the subject. A printed CD turns on the left;
 * the 1–n track list on the right scrolls so the playing song stays in the highlighted row.
 */
export default function tracklist(input){
 const base=sceneBase(input),{width:W,height:H,portrait,u,tracks}=base;
 const L=portrait
  ?{disc:[W/2,H*.24,u*.28],title:H*.42,info:H*.475,bar:[u*.12,H*.53,u*.76],controls:H*.585,panel:[u*.06,H*.635,u*.88,H*.33],rowH:u*.075,top:H*.045}
  :{disc:[W*.25,H*.4,H*.25],title:H*.72,info:H*.79,bar:[W*.1,H*.85,W*.3],controls:H*.92,panel:[W*.5,H*.1,W*.44,H*.8],rowH:H*.072,top:H*.075};
 const [cx,cy,R]=L.disc,shadow=shadowSprite(256,{alpha:.65,round:true}),particles=makeParticles(hash('tracklist'),26),roll=createRoll();
 const covers=new Map(),discs=new Map(),titles=new Map(),measure=layer(8,8).getContext('2d');
 const backdrop=i=>{if(!covers.has(i)){if(covers.size>3)covers.delete(covers.keys().next().value);covers.set(i,blurredCover(base.art(i).image,W/H,{blur:.05,dim:.1}));}return covers.get(i);};
 const disc=i=>{if(!discs.has(i)){if(discs.size>3)discs.delete(discs.keys().next().value);discs.set(i,discTexture(Math.round(R*2.2),{kind:'cd',art:base.art(i).image,accent:base.art(i).accent}));}return discs.get(i);};
 const titleOf=i=>{if(!titles.has(i))titles.set(i,fitText(measure,tracks[i].title||'',{size:u*.048,minSize:u*.028,weight:800,lineHeight:1.18,maxWidth:portrait?u*.84:W*.38,maxHeight:u*.07,spacing:-.02,maxLines:1}));return titles.get(i);};
 const [px,py,pw,ph]=L.panel,head=u*.1,rowH=L.rowH,listY=py+head,listH=ph-head-u*.03,rows=Math.max(3,Math.floor(listH/rowH)),anchor=Math.min(2,Math.floor((rows-1)/2));
 const totalTime=tracks.reduce((sum,track)=>sum+(Number(track.duration)||0),0);

 function draw(ctx,time){
  const s=base.at(time),{i,local,show,energy}=s,art=base.art(i);
  ctx.fillStyle=rgba(art.deep);ctx.fillRect(0,0,W,H);
  if(i>0&&s.enter<1)drawDrift(ctx,backdrop(i-1),W,H,s.t,{zoom:1.22,seed:3});
  drawDrift(ctx,backdrop(i),W,H,s.t,{zoom:1.22,seed:3,alpha:i>0?s.enter:1});
  ctx.fillStyle=rgba(mix(art.deep,[6,8,14],.3),.5);ctx.fillRect(0,0,W,H);
  vignette(ctx,W,H,{alpha:.5});
  drawParticles(ctx,particles,s.t,{width:W,height:H,color:art.soft,size:u*.009,alpha:.3,level:energy.level});
  // CD with a glow that follows the bass.
  radialGlow(ctx,cx,cy,R*2.1,art.glow,.22+energy.low*.3);
  drawShadow(ctx,shadow,cx-R,cy-R,R*2,R*2,{alpha:.8,offsetY:.05,spread:1.2});
  drawDisc(ctx,disc(i),cx,cy,R*(.9+.1*show),s.t*1.2,{kind:'cd',gloss:1});
  if(s.frame&&['ring','radial-bars','double-ring','radial-dots'].includes(base.options.spectrum)){const box=R*1.08/.31;drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:art.soft,alpha:.6,amp:.55,x:cx-box/2,y:cy-box/2,width:box,height:box});}
  // Now playing: title, playlist, progress, controls.
  const rise=(1-show)*u*.02;
  drawBlock(ctx,titleOf(i),W*(portrait?.5:.25),L.title+rise,{color:'#fff',align:'center',alpha:show});
  text(ctx,[base.playlist,`${i+1} / ${tracks.length}`].filter(Boolean).join('  ·  '),W*(portrait?.5:.25),L.info+rise,{size:u*.019,weight:500,color:rgba(art.soft,.9),spacing:.06,align:'center',maxWidth:portrait?u*.84:W*.4,alpha:show});
  const [bx,by,bw]=L.bar;progressBar(ctx,bx,by,bw,u*.004,s.progress,{fill:'rgba(255,255,255,.95)',track:'rgba(255,255,255,.2)',knob:u*.007});
  text(ctx,stamp(local),bx,by+u*.032,{size:u*.015,color:'rgba(255,255,255,.7)'});text(ctx,stamp(s.duration),bx+bw,by+u*.032,{size:u*.015,color:'rgba(255,255,255,.7)',align:'right'});
  const mid=bx+bw/2,gap=u*.085;[['repeat',-2],['prev',-1],['next',1],['shuffle',2]].forEach(([name,k])=>glyph(ctx,name,mid+k*gap,L.controls,u*(Math.abs(k)===2?.026:.032),Math.abs(k)===2?'rgba(255,255,255,.55)':'rgba(255,255,255,.9)'));
  ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=Math.max(1.5,u*.003);ctx.beginPath();ctx.arc(mid,L.controls,u*.036,0,Math.PI*2);ctx.stroke();glyph(ctx,'pause',mid,L.controls,u*.026,'#fff');
  // Track list panel.
  ctx.fillStyle='rgba(255,255,255,.07)';ctx.beginPath();ctx.roundRect(px,py,pw,ph,u*.025);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.1)';ctx.lineWidth=1;ctx.stroke();
  text(ctx,'PLAYLIST',px+u*.04,py+u*.055,{size:u*.017,weight:800,color:rgba(art.soft),spacing:.24,baseline:'middle'});
  text(ctx,`${tracks.length}곡 · ${stamp(totalTime)}`,px+pw-u*.04,py+u*.055,{size:u*.017,weight:500,color:'rgba(255,255,255,.65)',align:'right',baseline:'middle'});
  ctx.fillStyle='rgba(255,255,255,.1)';ctx.fillRect(px+u*.04,py+head-u*.012,pw-u*.08,1);
  const index=i,ease=easeOut(local/.7),size=u*.027;
  roll(ctx,{x:px+u*.02,y:listY,w:pw-u*.04,h:rows*rowH,rowH,anchor,index,ease,count:tracks.length,fade:.12,pinTop:true,
   highlight:(g,x,y,w,h)=>{g.fillStyle=rgba(mix(art.accent,[255,255,255],.1),.22);g.beginPath();g.roundRect(x,y+h*.08,w,h*.84,h*.2);g.fill();g.fillStyle=rgba(art.accent);g.fillRect(x,y+h*.2,Math.max(2,u*.004),h*.6);},
   row:(g,n,x,top,w,h,e)=>{const track=tracks[n],cyRow=top+h/2,color=rgba(mix([196,202,216],[255,255,255],e));g.globalAlpha=.55+.45*e;
    if(n===index)equalizer(g,x+u*.025,cyRow-size*.42,size*.9,size*.84,s.frame?.bins,rgba(art.soft));else text(g,String(n+1).padStart(2,'0'),x+u*.025,cyRow,{size:size*.85,weight:600,color,baseline:'middle',alpha:.55+.45*e});
    text(g,track.title||'',x+u*.025+size*2.2,cyRow,{size,weight:e>.5?800:500,color,baseline:'middle',maxWidth:w-size*6.4,alpha:.55+.45*e});
    text(g,stamp(Number(track.duration)||0),x+w-u*.025,cyRow,{size:size*.8,color,align:'right',baseline:'middle',alpha:.55+.45*e});g.globalAlpha=1;}});
  text(ctx,base.brand,portrait?u*.06:W*.06,L.top,{size:u*.017,weight:700,color:'rgba(255,255,255,.88)',spacing:.26,maxWidth:portrait?W*.8:W*.38});
 }
 return {draw,duration:base.total};
}

import {sceneBase,createRoll,shadowSprite,drawShadow,drawCover,drawSpectrum,fitText,setFont,ellipsize,stamp,rgba,mix,layer,hash,random,clamp,lerp,easeOut,easeInOut} from '../canvas-kit.mjs';

/**
 * 물결 반사: a calm horizon at dusk. The album art rises out of the water, floats above it and sinks
 * again at the end of the song; everything above the surface is mirrored below in horizontal slices
 * that sway more toward the viewer. Bass peaks send rings across the water. Lyric lines rise from the
 * surface and drift up into the sky (instrumental: the track list floats above the water like a sign).
 */
const lru=(limit,make)=>{const m=new Map();return key=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make(key);m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};};

export default function water(input){
 const base=sceneBase(input,{hue:205}),{width:W,height:H,portrait,u,vocal,tracks}=base;
 const L=portrait
  ?{horizon:H*.62,art:[W*.5,H*.312,W*.46],head:[W*.5,H*.06],meta:[W*.5,H*.088,W*.84],text:{x:W*.5,w:W*.84,size:u*.058,rowH:H*.085,first:H*.05,align:'center'},
    spectrum:[W*.18,H*.62-H*.034,W*.64,H*.03],list:[W*.1,H*.462,W*.8,H*.112,u*.034],light:W*.5}
  :{horizon:H*.6,art:[W*.27,H*.355,H*.38],head:[W*.5,H*.07],meta:[W*.48,H*.17,W*.43],text:{x:W*.48,w:W*.43,size:u*.05,rowH:H*.125,first:H*.11,align:'left'},
    spectrum:[W*.48,H*.6-H*.045,W*.43,H*.038],list:[W*.48,H*.27,W*.43,H*.3,u*.032],light:W*.62};
 const HY=Math.round(L.horizon),RH=H-HY,measure=layer(8,8).getContext('2d'),shadow=shadowSprite(256,{alpha:.55}),roll=createRoll();
 const above=layer(W,HY),ag=above.getContext('2d');

 // ---- Sky for a song: dusk gradient from the album colors, a low glow, cloud streaks, far hills.
 const sky=lru(3,i=>{
  const art=base.art(i),c=layer(W,HY),g=c.getContext('2d'),r=random(hash('sky'+i));
  const top=mix(art.deep,[6,10,24],.35),mid=mix(art.mid,art.accent,.22),low=mix(art.soft,[255,212,176],.45);
  const grad=g.createLinearGradient(0,0,0,HY);grad.addColorStop(0,rgba(top));grad.addColorStop(.55,rgba(mid));grad.addColorStop(.92,rgba(mix(low,mid,.35)));grad.addColorStop(1,rgba(low));g.fillStyle=grad;g.fillRect(0,0,W,HY);
  const glow=g.createRadialGradient(L.light,HY,0,L.light,HY,u*.8);glow.addColorStop(0,rgba(mix(low,[255,240,220],.4),.55));glow.addColorStop(.4,rgba(low,.18));glow.addColorStop(1,rgba(low,0));g.fillStyle=glow;g.fillRect(0,0,W,HY);
  g.filter=`blur(${u*.012}px)`;
  for(let k=0;k<14;k++){const y=HY*(.12+r()*.62),x=r()*W,w=W*(.18+r()*.4),h=u*(.008+r()*.022);g.fillStyle=rgba(r()<.6?mix(low,mid,.3+r()*.4):mix(top,mid,.5),.18+r()*.22);g.beginPath();g.ellipse(x,y,w/2,h,0,0,Math.PI*2);g.fill();}
  g.filter='none';
  // Far shoreline: two soft ridges just above the horizon.
  for(const [height,alpha,seed] of [[.06,.32,1],[.035,.55,2]]){const rr=random(hash('ridge'+i+seed));g.fillStyle=rgba(mix(top,mid,.4),alpha);g.beginPath();g.moveTo(0,HY);let y=HY-H*height*rr();for(let x=0;x<=W;x+=W/48){y=clamp(y+(rr()-.5)*H*height*.5,HY-H*height,HY-H*height*.15);g.lineTo(x,y);}g.lineTo(W,HY);g.closePath();g.fill();}
  return c;
 });
 const card=lru(3,i=>{const s=Math.round(L.art[2]),c=layer(s,s),g=c.getContext('2d'),rad=s*.03;g.beginPath();g.roundRect(0,0,s,s,rad);g.clip();drawCover(g,base.art(i).image,0,0,s,s);
  const sheen=g.createLinearGradient(0,0,s*.6,s);sheen.addColorStop(0,'rgba(255,255,255,.18)');sheen.addColorStop(.45,'rgba(255,255,255,0)');g.fillStyle=sheen;g.fillRect(0,0,s,s);g.strokeStyle='rgba(255,255,255,.25)';g.lineWidth=Math.max(1,s*.004);g.beginPath();g.roundRect(.5,.5,s-1,s-1,rad);g.stroke();return c;});
 // Mist strip: soft blobs, wider than the frame so it can drift.
 const mist=(()=>{const w=Math.round(W*1.6),h=Math.round(H*.16),c=layer(w,h),g=c.getContext('2d'),r=random(hash('mist'));g.filter=`blur(${u*.02}px)`;for(let k=0;k<26;k++){const x=r()*w,y=h*(.35+r()*.3),rx=W*(.08+r()*.2),ry=h*(.12+r()*.18);g.fillStyle=`rgba(230,236,244,${.1+r()*.16})`;g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fill();for(const dx of [-w,w])if(x+dx+rx>0&&x+dx-rx<w){g.beginPath();g.ellipse(x+dx,y,rx,ry,0,0,Math.PI*2);g.fill();}}g.filter='none';return c;})();
 // Highlight streak texture: thin horizontal glints, used as bands on the water.
 const glints=(()=>{const w=Math.round(W*1.4),h=Math.max(4,Math.round(u*.006)),c=layer(w,h),g=c.getContext('2d'),r=random(hash('glint'));for(let k=0;k<70;k++){const x=r()*w,len=W*(.01+r()*r()*.08),a=.25+r()*.6,grad=g.createLinearGradient(x,0,x+len,0);grad.addColorStop(0,'rgba(255,255,255,0)');grad.addColorStop(.5,`rgba(255,255,255,${a})`);grad.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=grad;g.fillRect(x,h*.3,len,h*.4);}return c;})();

 const TX=L.text,blocks=new Map();
 const blockOf=(i,n)=>{const key=i+':'+n;if(!blocks.has(key)){if(blocks.size>40)blocks.clear();blocks.set(key,fitText(measure,tracks[i].cues[n]?.text||'',{size:TX.size,minSize:TX.size*.62,weight:700,lineHeight:1.2,maxWidth:TX.w,maxHeight:TX.size*2.5,spacing:-.02,maxLines:2}));}return blocks.get(key);};
 const metaOf=lru(4,i=>fitText(measure,tracks[i].title||'',{size:u*(portrait?.036:.04),minSize:u*.024,weight:800,lineHeight:1.15,maxWidth:L.meta[2],maxHeight:u*.1,spacing:-.02,maxLines:2}));
 const glyphBlock=(g,b,x,y,color,alpha,align)=>{setFont(g,b.weight,b.font,b.spacing);g.textAlign=align;g.textBaseline='middle';g.fillStyle=color;g.globalAlpha=alpha;const first=-(b.lines.length-1)*b.font*b.lineHeight/2;b.lines.forEach((l,k)=>g.fillText(l,x,y+first+k*b.font*b.lineHeight));g.globalAlpha=1;};

 // Ripples: a beat grid per song; a slot rings when the measured bass there is strong.
 const STEP=.4,RIPPLE_LIFE=3.2;
 function ripples(ctx,s,art){
  const start=s.t-s.local,ring=rgba(mix(art.soft,[255,255,255],.55));ctx.strokeStyle=ring;
  for(let k=Math.max(0,Math.floor((s.local-RIPPLE_LIFE)/STEP));k*STEP<=s.local;k++){
   const tk=k*STEP,age=s.local-tk;if(age<0||age>RIPPLE_LIFE)continue;const r=random(hash(`rip${s.i}:${k}`));if(r()>.55)continue;
   const e=base.at(start+tk).energy.low;if(e<.5)continue;
   const depth=.12+r()*.7,x=W*(.08+r()*.84),y=HY+RH*depth,persp=.16+depth*.32,grow=easeOut(age/RIPPLE_LIFE),fade=(1-age/RIPPLE_LIFE)*clamp((e-.5)*2.4,.25,1);
   for(let n=0;n<3;n++){const rad=u*(.03+depth*.16)*(grow*1.25-n*.12);if(rad<=0)continue;ctx.globalAlpha=fade*(.42-n*.11);ctx.lineWidth=Math.max(1,u*.0022*(.5+depth));ctx.beginPath();ctx.ellipse(x,y,rad,rad*persp,0,0,Math.PI*2);ctx.stroke();}
  }
  ctx.globalAlpha=1;
 }

 function draw(ctx,time){
  const s=base.at(time),{i,local,show}=s,art=base.art(i),t=s.t;
  // ---- Above the surface (drawn to a layer so the reflection can be sliced from it).
  ag.drawImage(sky(i),0,0);if(i>0&&s.enter<1){ag.globalAlpha=1-s.enter;ag.drawImage(sky(i-1),0,0);ag.globalAlpha=1;}
  // Album art rises from the water, floats, and sinks at the end of the song.
  const [ax,ay,as]=L.art,rise=easeInOut((local-.1)/1.9),sink=1-s.exit,bob=Math.sin(t*.55)*u*.005,lift=(1-rise+sink*1.1)*(HY-ay+as*.5+u*.02);
  const cy=ay+bob+lift,tilt=Math.sin(t*.4)*.008;
  ag.save();ag.translate(ax,cy);ag.rotate(tilt);drawShadow(ag,shadow,-as/2,-as/2,as,as,{alpha:.6*rise*s.exit,offsetY:.05,spread:1.15});ag.drawImage(card(i),-as/2,-as/2,as,as);ag.restore();
  // Heading: headline, then track number and title.
  const [hx,hy]=L.head;if(base.headline){setFont(ag,700,u*.017,.34);ag.textAlign='center';ag.textBaseline='middle';const label=ellipsize(ag,base.headline,W*.6),lw=ag.measureText(label).width;ag.fillStyle='rgba(240,244,250,.82)';ag.fillText(label,hx,hy);ag.fillStyle='rgba(240,244,250,.35)';ag.fillRect(hx-lw/2-u*.09,hy,u*.06,Math.max(1,u*.0014));ag.fillRect(hx+lw/2+u*.03,hy,u*.06,Math.max(1,u*.0014));}
  const [mx,my,mw]=L.meta,align=TX.align,meta=metaOf(i),rise2=(1-easeOut(local/1.2))*u*.02,ma=Math.min(show,1);
  setFont(ag,700,u*.017,.22);ag.textAlign=align;ag.textBaseline='alphabetic';ag.fillStyle=rgba(mix(art.soft,[255,255,255],.3),.85*ma);ag.fillText(`${String(i+1).padStart(2,'0')} / ${String(tracks.length).padStart(2,'0')}   ·   ${stamp(local)} / ${stamp(s.duration)}`,mx,my+rise2);
  setFont(ag,meta.weight,meta.font,meta.spacing);ag.fillStyle=`rgba(255,255,255,${.96*ma})`;ag.textBaseline='top';meta.lines.forEach((l,k)=>ag.fillText(l,mx,my+u*.018+rise2+k*meta.font*meta.lineHeight));
  if(portrait){const pw=W*.5,px=W*.25,py=my+u*.025+meta.height+u*.012;ag.fillStyle='rgba(255,255,255,.2)';ag.fillRect(px,py,pw,Math.max(1,u*.0022));ag.fillStyle=`rgba(255,255,255,${.85*ma})`;ag.fillRect(px,py,pw*s.progress,Math.max(1,u*.0022));}
  else{const py=my+u*.03+meta.height+u*.01;ag.fillStyle='rgba(255,255,255,.2)';ag.fillRect(mx,py,mw*.5,Math.max(1,u*.0022));ag.fillStyle=`rgba(255,255,255,${.85*ma})`;ag.fillRect(mx,py,mw*.5*s.progress,Math.max(1,u*.0022));}
  // Spectrum standing on the surface (its reflection comes from the water).
  if(s.frame){const [sx,sy,sw,sh]=L.spectrum;drawSpectrum(ag,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:mix(art.soft,[255,255,255],.5),alpha:.6*show,x:sx,y:sy,width:sw,height:sh});}
  // Lyrics rise out of the water and drift up into the sky; the list floats like a sign.
  const tx=align==='center'?TX.x:TX.x,slot=k=>HY-TX.first-k*TX.rowH;
  if(vocal){const {index,ease}=base.rollState(s),fadeOut=s.exit;
   for(let k=0;k<3;k++){const n=index-k;if(n<0)continue;const b=blockOf(i,n);let y,a,c;
    if(k===0){y=lerp(HY+b.height*.6,slot(0),ease);a=1;c='#ffffff';}else{y=lerp(slot(k-1),slot(k),ease);a=k===1?lerp(1,.42,ease):lerp(.42,0,ease);c=rgba(mix(art.soft,[255,255,255],.45));}
    if(a<=.01)continue;if(portrait&&k===2)continue;glyphBlock(ag,b,tx,y,k===0?c:c,a*fadeOut,align);}}
  else{const [lx,ly,lw,lh,size]=L.list,rowH=size*2.05,rows=Math.max(3,Math.floor(lh/rowH)),anchor=Math.floor((rows-1)/2),{index,ease}=base.rollState(s);
   roll(ag,{x:lx,y:ly,w:lw,h:rows*rowH,rowH,anchor,index,ease,count:tracks.length,fade:.2,
    row:(g,n,x,top,w,h,e)=>{const cyRow=top+h/2,a=.45+.55*e,color=rgba(mix([206,214,228],[255,255,255],e));setFont(g,700,size*.8,.06);g.textBaseline='middle';g.globalAlpha=a;g.fillStyle=e>.5?rgba(mix(art.soft,[255,255,255],.2)):color;
     const center=align==='center';g.textAlign='left';const ox=center?x+w*.06:x;g.fillText(String(n+1).padStart(2,'0'),ox,cyRow);setFont(g,e>.5?800:600,size*(1+.12*e),-.01);g.fillStyle=color;g.fillText(ellipsize(g,tracks[n].title||'',w-size*5.4-(center?w*.12:0)),ox+size*2.1,cyRow);
     setFont(g,500,size*.76,0);g.textAlign='right';g.fillText(stamp(Number(tracks[n].duration)||0),center?x+w*.94:x+w,cyRow);
     if(e>.02){g.globalAlpha=e;g.fillStyle=rgba(art.soft);g.fillRect(ox,cyRow+size*.8,(center?w*.88:w)*e,Math.max(1,u*.002));}g.globalAlpha=1;}});}
  ctx.drawImage(above,0,0);
  // ---- Water: the mirrored slices, swaying more toward the viewer.
  const deep=mix(art.deep,[4,8,16],.3);ctx.fillStyle=rgba(deep);ctx.fillRect(0,HY,W,RH);
  const sh=Math.max(2,Math.round(u/360));ctx.save();ctx.setTransform(1,0,0,-1,0,HY*2);
  for(let d=0;d<RH;d+=sh){const f=d/RH,sy=HY-d-sh;if(sy<0)break;const amp=u*(.0015+.026*Math.pow(f,1.6)),ph=Math.sqrt(d/u)*30,dx=amp*(Math.sin(ph-t*1.6)+.45*Math.sin(ph*1.9+t*1.1+1.3));
   ctx.drawImage(above,0,sy,W,sh,dx-amp*1.5,sy,W+amp*3,sh+.5);}
  ctx.restore();
  const tint=ctx.createLinearGradient(0,HY,0,H);tint.addColorStop(0,rgba(deep,.26));tint.addColorStop(.35,rgba(deep,.5));tint.addColorStop(1,rgba(deep,.88));ctx.fillStyle=tint;ctx.fillRect(0,HY,W,RH);
  // Highlight bands under the light, shimmering (bands of the glint texture, not particles).
  ctx.globalCompositeOperation='lighter';const warm=mix(art.soft,[255,226,190],.5);
  for(let k=0;k<18;k++){const f=Math.pow((k+.5)/18,1.6),y=HY+RH*f,band=glints.height*(1+f*3),spread=W*(.12+f*.32),x=L.light-glints.width/2+Math.sin(t*.35+k*1.7)*W*.05*(1+f);
   ctx.save();ctx.beginPath();ctx.rect(L.light-spread,y-band,spread*2,band*2);ctx.clip();ctx.globalAlpha=clamp((.35+.35*Math.sin(t*1.3+k*2.1))*(1-f*.55),0,1)*.6;ctx.drawImage(glints,x,y-band/2,glints.width,band);ctx.restore();}
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  ctx.fillStyle=rgba(mix(warm,[255,255,255],.2),.08);ctx.fillRect(0,HY,W,Math.max(1,u*.0016));
  ripples(ctx,s,art);
  // Mist on the horizon (two layers drifting at different speeds) and a soft vignette.
  for(const [speed,alpha,dy] of [[.006,.55,-.05],[-.004,.4,.02]]){const off=((t*speed*W)%(mist.width-W)+(mist.width-W))%(mist.width-W);ctx.globalAlpha=alpha;ctx.drawImage(mist,-off,HY-mist.height/2+H*dy);}
  ctx.globalAlpha=1;
  const v=ctx.createRadialGradient(W/2,H*.5,u*.4,W/2,H*.5,Math.hypot(W,H)*.58);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,.42)');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
 }
 return {draw,duration:base.total};
}

import {sceneBase,layer,rgba,mix,hash,random,clamp,lerp,easeOut,easeInOut,text,fitText,drawBlock,setFont,drawSpectrum,shadowSprite,drawShadow,drawCover,stamp,radialGlow,vignette} from '../canvas-kit.mjs';

/**
 * 빈티지 라디오 (instrumental): a walnut table radio. Every song is a station printed on the lit glass
 * dial; when a song ends the red needle slides to the next station (the scale pages along when the
 * playlist is long) through a burst of tuning interference, the tuning knob turning with it. The
 * green magic-eye tube closes on a station and flickers with the music; the station card beside the
 * radio shows the song.
 */
const TAU=Math.PI*2;
const LINEAR=['bars','round-bars','mirror','blocks','dots','reflection','wave','double-wave','area','mirror-area','ribbon'];
function lru(limit){const m=new Map();return (key,make)=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make();m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};}
function woodGrain(g,x,y,w,h,seed){
 const r=random(seed),base=g.createLinearGradient(x,y,x+w,y+h);base.addColorStop(0,'#5a3320');base.addColorStop(.5,'#6e4029');base.addColorStop(1,'#4a2a19');g.fillStyle=base;g.fillRect(x,y,w,h);
 g.lineCap='round';
 for(let k=0;k<Math.ceil(h/2.4);k++){
  const y0=y+r()*h,amp=h*(.004+r()*.012),f=(2+r()*5)/w*TAU,ph=r()*TAU,dark=r()<.62;
  g.strokeStyle=dark?`rgba(35,16,8,${.08+r()*.2})`:`rgba(210,150,100,${.04+r()*.08})`;g.lineWidth=Math.max(.6,h*(.0012+r()*.004));g.beginPath();
  for(let s=0;s<=40;s++){const xx=x+s/40*w,yy=y0+Math.sin(xx*f+ph)*amp+Math.sin(xx*f*3.1+ph*2)*amp*.3;s?g.lineTo(xx,yy):g.moveTo(xx,yy);}g.stroke();
 }
 for(let k=0;k<3;k++){const kx=x+r()*w,ky=y+r()*h,kr=h*(.01+r()*.02);g.strokeStyle='rgba(30,14,6,.25)';for(let j=1;j<5;j++){g.lineWidth=Math.max(.6,h*.002);g.beginPath();g.ellipse(kx,ky,kr*j*1.8,kr*j*.6,0,0,TAU);g.stroke();}}
}

export default function radio(input){
 const base=sceneBase(input,{hue:34}),{width:W,height:H,portrait,u,tracks}=base,N=tracks.length;
 const R=portrait?[u*.05,H*.075,u*.9,H*.33]:[W*.05,H*.17,W*.6,H*.64];
 const C=portrait?[u*.1,H*.465,u*.8,H*.49]:[W*.695,H*.1,W*.255,H*.8];
 const [rx,ry,rw,rh]=R,fw=rh*.055,tableY=ry+rh+rh*.012;
 const dial=[rx+fw*1.5,ry+rh*.085,rw-fw*3,rh*.285],eye={x:rx+rw/2,y:ry+rh*.425,r:rh*.044},cloth=[rx+fw*1.5,ry+rh*.485,rw-fw*3,rh*.335];
 const tuneKnob={x:rx+fw*1.5+rh*.08,y:ry+rh*.9,r:rh*.06},volKnob={x:rx+rw-fw*1.5-rh*.08,y:ry+rh*.9,r:rh*.06};
 const shadow=shadowSprite(256,{alpha:.8}),measure=layer(8,8).getContext('2d');
 const K=Math.min(N,portrait?4:6),pageStep=Math.max(1,K-1),firstOf=n=>N<=K?0:clamp(Math.floor(n/pageStep)*pageStep,0,N-K);
 const step=clamp(1060/Math.max(1,N-1),10,170),freq=n=>Math.round((540+n*step)/10)*10;
 const [dx,dy,dw,dh]=dial,scaleX=dx+dw*.085,scaleW=dw*.83,sp=scaleW/Math.max(1,K);
 const amber=[255,196,110];

 // ---- Static layers -------------------------------------------------------------------------------
 const room=layer(W,H);{
  const g=room.getContext('2d'),tile=layer(Math.round(u*.08),Math.round(u*.08)),tg=tile.getContext('2d'),t=tile.width;
  tg.strokeStyle='rgba(255,236,210,.06)';tg.lineWidth=Math.max(1,u*.0015);tg.beginPath();tg.moveTo(t/2,0);tg.lineTo(t,t/2);tg.lineTo(t/2,t);tg.lineTo(0,t/2);tg.closePath();tg.stroke();
  tg.fillStyle='rgba(255,236,210,.08)';tg.beginPath();tg.arc(t/2,t/2,t*.04,0,TAU);tg.fill();for(const [a,b] of [[0,0],[t,0],[0,t],[t,t]]){tg.beginPath();tg.arc(a,b,t*.025,0,TAU);tg.fill();}
  g.fillStyle=g.createPattern(tile,'repeat');g.fillRect(0,0,W,tableY);
  const shade=g.createLinearGradient(0,0,0,tableY);shade.addColorStop(0,'rgba(0,0,0,.35)');shade.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=shade;g.fillRect(0,0,W,tableY);
  // Table: dark lacquer with a lit front edge.
  const tb=g.createLinearGradient(0,tableY,0,H);tb.addColorStop(0,'#2a1d17');tb.addColorStop(.25,'#1a120e');tb.addColorStop(1,'#0e0a08');g.fillStyle=tb;g.fillRect(0,tableY,W,H-tableY);
  g.fillStyle='rgba(255,215,170,.12)';g.fillRect(0,tableY,W,Math.max(1,u*.0016));
 }
 const set=layer(W,H);{
  const g=set.getContext('2d');
  // Card shadow is drawn per frame; here the radio and its reflection.
  drawShadow(g,shadow,rx,ry,rw,rh,{alpha:.95,offsetY:.035,spread:1.07});
  for(const fx of [.1,.9]){g.fillStyle='#120b07';g.beginPath();g.roundRect(rx+rw*fx-rh*.05,ry+rh-rh*.01,rh*.1,rh*.03,rh*.01);g.fill();}
  const shape=c=>{c.beginPath();c.roundRect(rx,ry,rw,rh,[rh*.12,rh*.12,rh*.04,rh*.04]);};
  g.save();shape(g);g.clip();woodGrain(g,rx,ry,rw,rh,hash('walnut'));
  const varnish=g.createLinearGradient(0,ry,0,ry+rh);varnish.addColorStop(0,'rgba(255,220,180,.2)');varnish.addColorStop(.12,'rgba(255,220,180,.04)');varnish.addColorStop(.8,'rgba(0,0,0,0)');varnish.addColorStop(1,'rgba(0,0,0,.3)');g.fillStyle=varnish;g.fillRect(rx,ry,rw,rh);
  const side=g.createLinearGradient(rx,0,rx+rw,0);side.addColorStop(0,'rgba(0,0,0,.35)');side.addColorStop(.05,'rgba(0,0,0,0)');side.addColorStop(.95,'rgba(0,0,0,0)');side.addColorStop(1,'rgba(0,0,0,.4)');g.fillStyle=side;g.fillRect(rx,ry,rw,rh);g.restore();
  g.strokeStyle='rgba(255,220,180,.22)';g.lineWidth=Math.max(1,u*.002);g.beginPath();g.moveTo(rx+rh*.12,ry+1.5);g.lineTo(rx+rw-rh*.12,ry+1.5);g.stroke();
  // Inner front: a recessed darker panel framing dial, eye, cloth and controls.
  const fx=rx+fw,fy=ry+fw,fwid=rw-fw*2,fh=rh-fw*2;g.fillStyle='rgba(20,9,4,.42)';g.beginPath();g.roundRect(fx,fy,fwid,fh,rh*.07);g.fill();
  g.strokeStyle='rgba(0,0,0,.5)';g.lineWidth=Math.max(1,u*.003);g.stroke();g.strokeStyle='rgba(255,210,160,.12)';g.lineWidth=Math.max(1,u*.0015);g.beginPath();g.roundRect(fx+1.5,fy+1.5,fwid-3,fh-3,rh*.07);g.stroke();
  const gold=(x,y,w,h,rad)=>{const m=g.createLinearGradient(0,y,0,y+h);m.addColorStop(0,'#f6dd9a');m.addColorStop(.5,'#a77a32');m.addColorStop(1,'#e8c77c');g.strokeStyle=m;g.lineWidth=Math.max(2,u*.004);g.beginPath();g.roundRect(x,y,w,h,rad);g.stroke();};
  gold(dx-u*.004,dy-u*.004,dw+u*.008,dh+u*.008,rh*.03);
  // Grille cloth: woven threads behind gold fretwork.
  const [cx,cy,cw,ch]=cloth,weave=layer(8,8),wg=weave.getContext('2d');wg.fillStyle='#6b5a3e';wg.fillRect(0,0,8,8);wg.fillStyle='#8a7550';wg.fillRect(0,0,8,2);wg.fillRect(0,4,8,2);wg.fillStyle='rgba(40,30,18,.5)';wg.fillRect(0,0,2,8);wg.fillRect(4,0,2,8);
  g.save();g.beginPath();g.roundRect(cx,cy,cw,ch,rh*.025);g.clip();g.fillStyle=g.createPattern(weave,'repeat');g.fillRect(cx,cy,cw,ch);
  const cl=g.createRadialGradient(cx+cw/2,cy+ch*.3,0,cx+cw/2,cy+ch/2,cw*.6);cl.addColorStop(0,'rgba(255,220,160,.12)');cl.addColorStop(1,'rgba(0,0,0,.45)');g.fillStyle=cl;g.fillRect(cx,cy,cw,ch);
  const bars=Math.max(7,Math.round(cw/(rh*.075)));for(let k=1;k<bars;k++){const x=cx+k*cw/bars,bw=Math.max(2,rh*.012);g.fillStyle='rgba(0,0,0,.35)';g.fillRect(x+bw*.6,cy,bw,ch);const m=g.createLinearGradient(x,0,x+bw,0);m.addColorStop(0,'#f1d48c');m.addColorStop(.5,'#b8873b');m.addColorStop(1,'#6e4c1c');g.fillStyle=m;g.fillRect(x,cy,bw,ch);}
  g.restore();gold(cx,cy,cw,ch,rh*.025);
  // Brand plate: the headline in gold on a dark plaque over the cloth.
  if(base.headline){const pw=Math.min(cw*.5,rw*.42),ph=ch*.2,px=cx+(cw-pw)/2,py=cy+ch*.12;g.fillStyle='rgba(22,12,6,.92)';g.beginPath();g.roundRect(px,py,pw,ph,ph*.5);g.fill();gold(px,py,pw,ph,ph*.5);
   const fit=fitText(measure,base.headline,{size:ph*.5,minSize:ph*.3,weight:800,lineHeight:1,maxWidth:pw*.84,maxHeight:ph*.6,spacing:.04,maxLines:1});
   g.save();g.translate(px+pw/2,py+ph*.53);g.transform(1,0,-.16,1,0,0);setFont(g,800,fit.font,.04);g.textAlign='center';g.textBaseline='middle';const m=g.createLinearGradient(0,-fit.font/2,0,fit.font/2);m.addColorStop(0,'#fff0b8');m.addColorStop(.55,'#d6a64c');m.addColorStop(1,'#f5d78a');g.fillStyle='rgba(0,0,0,.6)';g.fillText(fit.lines[0],1.5,2);g.fillStyle=m;g.fillText(fit.lines[0],0,0);g.restore();}
  // Magic-eye bezel and small labels.
  const bez=g.createRadialGradient(eye.x-eye.r*.4,eye.y-eye.r*.5,0,eye.x,eye.y,eye.r*1.45);bez.addColorStop(0,'#fff6d8');bez.addColorStop(.6,'#a77a32');bez.addColorStop(1,'#4a3110');g.fillStyle=bez;g.beginPath();g.arc(eye.x,eye.y,eye.r*1.38,0,TAU);g.fill();
  g.fillStyle='#050805';g.beginPath();g.arc(eye.x,eye.y,eye.r*1.06,0,TAU);g.fill();
  for(const [x,label] of [[eye.x-rw*.16,'TUNING'],[eye.x+rw*.16,'STEREO · MW']])text(g,label,x,eye.y,{size:rh*.026,weight:800,color:'rgba(240,210,150,.55)',spacing:.3,align:'center',baseline:'middle'});
  // Piano keys between the knobs.
  const keys=['FM','MW','LW','SW','TA'],kw=Math.min(rw*.075,(rw-fw*6-rh*.4)/keys.length*.86),kh=rh*.075,k0=rx+rw/2-keys.length*kw*1.08/2;
  keys.forEach((label,n)=>{const x=k0+n*kw*1.08,y=ry+rh*.865+(n===1?rh*.008:0);g.fillStyle='rgba(0,0,0,.45)';g.fillRect(x+2,y+3,kw,kh);const m=g.createLinearGradient(0,y,0,y+kh);m.addColorStop(0,'#fbf6e9');m.addColorStop(1,'#d8ccb0');g.fillStyle=m;g.beginPath();g.roundRect(x,y,kw,kh,kh*.12);g.fill();
   text(g,label,x+kw/2,y+kh*.55,{size:kh*.36,weight:800,color:n===1?'#a2271d':'#4a3a26',align:'center',baseline:'middle'});});
 }
 // Reflection of the radio on the lacquered table.
 const mirror=layer(W,Math.max(1,H-tableY));{
  const g=mirror.getContext('2d');g.save();g.scale(1,-1);g.drawImage(set,0,-tableY);g.restore();
  g.globalCompositeOperation='destination-in';const fade=g.createLinearGradient(0,0,0,rh*.45);fade.addColorStop(0,'rgba(0,0,0,.16)');fade.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=fade;g.fillRect(0,0,W,H);
 }
 const dialGlass=layer(dw,dh);{
  const g=dialGlass.getContext('2d'),sheen=g.createLinearGradient(0,0,0,dh);sheen.addColorStop(0,'rgba(255,255,255,.16)');sheen.addColorStop(.3,'rgba(255,255,255,.03)');sheen.addColorStop(.31,'rgba(255,255,255,0)');g.fillStyle=sheen;g.fillRect(0,0,dw,dh);
  const edge=g.createLinearGradient(0,0,dw,0);edge.addColorStop(0,'rgba(40,20,5,.5)');edge.addColorStop(.06,'rgba(40,20,5,0)');edge.addColorStop(.94,'rgba(40,20,5,0)');edge.addColorStop(1,'rgba(40,20,5,.5)');g.fillStyle=edge;g.fillRect(0,0,dw,dh);
 }
 const eyeGlow=layer(eye.r*2.2,eye.r*2.2);{const g=eyeGlow.getContext('2d'),c=eye.r*1.1,f=g.createRadialGradient(c,c,eye.r*.2,c,c,eye.r);f.addColorStop(0,'#c8ffb0');f.addColorStop(.55,'#4ef06a');f.addColorStop(1,'#0d5a1e');g.fillStyle=f;g.beginPath();g.arc(c,c,eye.r,0,TAU);g.fill();}

 // ---- Station card ---------------------------------------------------------------------------------
 const [kx,ky,kw,kh]=C,pad=kw*.07,art=Math.min(kw-pad*2,kh*.46),artX=(kw-art)/2,artY=pad*1.9;
 const textTop=artY+art+pad*.7,specH=kh*.075,barY=kh-pad*1.15,specY=barY-pad*.55-specH;
 const cards=lru(3);
 const card=i=>cards(i,()=>{
  const c=layer(kw,kh),g=c.getContext('2d'),a=base.art(i),ink='#2a211a',rng=random(hash(`card${i}`));
  const p=g.createLinearGradient(0,0,kw,kh);p.addColorStop(0,'#f5ecd9');p.addColorStop(1,'#e6d6b8');g.fillStyle=p;g.fillRect(0,0,kw,kh);
  for(let k=0;k<kw*kh/180;k++){g.fillStyle=`rgba(90,60,30,${rng()*.06})`;g.fillRect(rng()*kw,rng()*kh,1.2,1.2);}
  g.strokeStyle='rgba(150,40,30,.55)';g.lineWidth=Math.max(1,u*.002);g.strokeRect(pad*.45,pad*.45,kw-pad*.9,kh-pad*.9);
  text(g,`STATION ${String(i+1).padStart(2,'0')} / ${String(N).padStart(2,'0')}`,pad,pad*1.15,{size:u*.017,weight:800,color:'#a2271d',spacing:.22,baseline:'middle'});
  text(g,`MW ${freq(i)} kHz`,kw-pad,pad*1.15,{size:u*.017,weight:800,color:ink,spacing:.08,align:'right',baseline:'middle'});
  g.fillStyle='rgba(0,0,0,.25)';g.fillRect(artX+u*.004,artY+u*.005,art,art);drawCover(g,a.image,artX,artY,art,art);g.strokeStyle='rgba(0,0,0,.3)';g.lineWidth=1;g.strokeRect(artX,artY,art,art);
  const fit=fitText(measure,tracks[i].title||'',{size:u*.042,minSize:u*.026,weight:800,lineHeight:1.18,maxWidth:kw-pad*2,maxHeight:Math.max(u*.045,specY-textTop-u*.08),spacing:-.015,maxLines:2});
  drawBlock(g,fit,pad,textTop,{color:ink});
  if(i+1<N)text(g,`NEXT  ${String(i+2).padStart(2,'0')}  ${tracks[i+1].title||''}`,pad,specY-u*.047,{size:u*.0165,weight:600,color:'#6b5848',baseline:'middle',maxWidth:kw-pad*2});
  text(g,'ON AIR',pad,specY-u*.016,{size:u*.0135,weight:800,color:'#a2271d',spacing:.3,baseline:'middle'});
  return c;
 });

 function knob(ctx,{x,y,r},angle){
  ctx.fillStyle='rgba(0,0,0,.45)';ctx.beginPath();ctx.arc(x+r*.08,y+r*.16,r*1.05,0,TAU);ctx.fill();
  const ring=ctx.createLinearGradient(0,y-r,0,y+r);ring.addColorStop(0,'#f3d996');ring.addColorStop(1,'#6e4c1c');ctx.fillStyle=ring;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
  const b=ctx.createRadialGradient(x-r*.3,y-r*.35,0,x,y,r*.88);b.addColorStop(0,'#6a3b22');b.addColorStop(1,'#1f0f07');ctx.fillStyle=b;ctx.beginPath();ctx.arc(x,y,r*.86,0,TAU);ctx.fill();
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.strokeStyle='rgba(0,0,0,.4)';ctx.lineWidth=Math.max(1,r*.06);for(let k=0;k<16;k++){const a=k/16*TAU;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.7,Math.sin(a)*r*.7);ctx.lineTo(Math.cos(a)*r*.84,Math.sin(a)*r*.84);ctx.stroke();}
  ctx.fillStyle='#f0d690';ctx.beginPath();ctx.arc(0,-r*.55,r*.09,0,TAU);ctx.fill();ctx.restore();
  ctx.fillStyle='rgba(255,230,190,.18)';ctx.beginPath();ctx.ellipse(x-r*.25,y-r*.4,r*.35,r*.16,-.5,0,TAU);ctx.fill();
 }

 function draw(ctx,time){
  const s=base.at(time),{i,local,t,energy}=s,a=base.art(i);
  // Wall in the song's deep tone, a reading lamp, the warm dial light spilling on the table.
  ctx.fillStyle=rgba(mix(a.deep,[46,30,24],.6));ctx.fillRect(0,0,W,H);
  radialGlow(ctx,W*(portrait?.15:.12),H*.08,u*1.1,[255,214,160],.16);
  ctx.drawImage(room,0,0);
  // Tuning: the needle slides from the last station to this one; the scale pages along on long lists.
  const sweep=i>0?easeInOut((local-.15)/1.35):1,tuning=i>0?clamp(1-Math.abs(local-.8)/.75,0,1):0,flick=tuning*(.55+.45*Math.sin(t*41)*Math.sin(t*17.3));
  const firstPos=lerp(firstOf(Math.max(0,i-1)),firstOf(i),sweep),posOf=(n,first)=>scaleX+sp*(n-first+.5);
  const needle=lerp(posOf(Math.max(0,i-1),firstOf(Math.max(0,i-1))),posOf(i,firstOf(i)),sweep);
  radialGlow(ctx,dx+dw/2,tableY+rh*.04,rw*.6,amber,.1*(1-flick*.4));
  ctx.drawImage(mirror,0,tableY);ctx.drawImage(set,0,0);
  // Dial: backlit glass, frequency scale, stations (songs), the red needle with its own lamp.
  ctx.save();ctx.beginPath();ctx.roundRect(dx,dy,dw,dh,rh*.03);ctx.clip();
  const lit=1-flick*.35,bg=ctx.createLinearGradient(0,dy,0,dy+dh);bg.addColorStop(0,rgba(mix([92,60,24],[255,214,140],lit*.85)));bg.addColorStop(.5,rgba(mix([80,50,20],[250,200,120],lit*.8)));bg.addColorStop(1,rgba(mix([60,36,14],[214,150,74],lit*.75)));ctx.fillStyle=bg;ctx.fillRect(dx,dy,dw,dh);
  radialGlow(ctx,needle,dy+dh*.5,dh*1.3,[255,244,215],.35*lit);
  ctx.save();ctx.beginPath();ctx.rect(scaleX-sp*.02,dy,scaleW+sp*.04,dh);ctx.clip();
  const ink='rgba(40,22,10,.88)',pxPerK=sp/step,fAt=x=>540+((x-scaleX)/sp-.5+firstPos)*step,xAt=f=>scaleX+sp*((f-540)/step-firstPos+.5);
  const label=[20,50,100,200,500].find(L=>L*pxPerK>=dh*.62)||1000,minor=label/(label*pxPerK/5>=dh*.05?5:2);
  const f0=Math.max(540-step*.5,fAt(dx)),f1=Math.min(540+(N-1)*step+step*.5,fAt(dx+dw));
  ctx.fillStyle=ink;for(let f=Math.ceil(f0/minor)*minor;f<=f1;f+=minor){const x=xAt(f),major=Math.abs(f/label-Math.round(f/label))<1e-6;ctx.fillRect(x-.5,dy+dh*(major?.27:.32),Math.max(1,u*.0012),dh*(major?.13:.08));
   if(major)text(ctx,String(Math.round(f)),x,dy+dh*.17,{size:dh*.11,weight:700,color:ink,align:'center',baseline:'middle'});}
  ctx.fillRect(xAt(f0),dy+dh*.4,Math.max(0,xAt(f1)-xAt(f0)),Math.max(1,u*.0015));
  for(let n=Math.max(0,Math.floor(firstPos)-1);n<Math.min(N,Math.ceil(firstPos)+K+1);n++){
   const x=posOf(n,firstPos),on=n===i?sweep:n===i-1?1-sweep:0,size=dh*.1;
   ctx.fillStyle=on>.5?'#a2271d':ink;ctx.beginPath();ctx.moveTo(x,dy+dh*.42);ctx.lineTo(x+size*.35,dy+dh*.47);ctx.lineTo(x,dy+dh*.52);ctx.lineTo(x-size*.35,dy+dh*.47);ctx.closePath();ctx.fill();
   text(ctx,String(n+1).padStart(2,'0'),x,dy+dh*.62,{size:size*1.2,weight:800,color:on>.5?'#a2271d':ink,align:'center',baseline:'middle'});
   text(ctx,tracks[n].title||'',x,dy+dh*.8,{size,weight:on>.5?800:600,color:ink,align:'center',baseline:'middle',maxWidth:sp*.9});
  }
  ctx.restore();
  text(ctx,'MW',dx+dw*.04,dy+dh*.17,{size:dh*.11,weight:800,color:ink,align:'center',baseline:'middle'});text(ctx,'kHz',dx+dw*.04,dy+dh*.3,{size:dh*.075,weight:700,color:ink,align:'center',baseline:'middle'});
  if(N>K){const f=firstOf(i);text(ctx,`${String(f+1).padStart(2,'0')}–${String(f+K).padStart(2,'0')}`,dx+dw*.96,dy+dh*.62,{size:dh*.075,weight:800,color:ink,align:'center',baseline:'middle'});text(ctx,`/ ${N}`,dx+dw*.96,dy+dh*.74,{size:dh*.07,weight:700,color:ink,align:'center',baseline:'middle'});}
  // Interference while tuning: wavering lines over the glass.
  if(tuning>0){ctx.strokeStyle=`rgba(255,250,235,${.35*tuning})`;ctx.lineWidth=Math.max(1,u*.0015);for(let k=0;k<5;k++){const yy=dy+dh*(.15+k*.17),ph=t*(9+k*3.7)+k;ctx.beginPath();for(let s2=0;s2<=48;s2++){const x=dx+s2/48*dw,yv=yy+Math.sin(x*.045+ph)*dh*.03*tuning*Math.sin(s2*.7+ph*1.3);s2?ctx.lineTo(x,yv):ctx.moveTo(x,yv);}ctx.stroke();}}
  ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(needle+u*.003,dy,Math.max(2,u*.003),dh);ctx.fillStyle='#c4231a';ctx.fillRect(needle-Math.max(1,u*.0016),dy+dh*.05,Math.max(2,u*.0032),dh*.9);
  ctx.fillStyle='#2a1a10';ctx.fillRect(needle-dh*.07,dy,dh*.14,dh*.06);
  ctx.drawImage(dialGlass,dx,dy);ctx.restore();
  // Magic eye: the green fan closes on a station and flickers with the loudness.
  const open=lerp(.08+(1-energy.level)*.42,1.15,Math.max(tuning,i===0?clamp(1-local/1.2,0,1):0));
  radialGlow(ctx,eye.x,eye.y,eye.r*2.4,[80,255,110],.18+energy.level*.12);
  ctx.drawImage(eyeGlow,eye.x-eye.r*1.1,eye.y-eye.r*1.1);
  ctx.fillStyle='#071108';ctx.beginPath();ctx.moveTo(eye.x,eye.y);ctx.arc(eye.x,eye.y,eye.r*1.01,-Math.PI/2-open,-Math.PI/2+open);ctx.closePath();ctx.fill();
  ctx.fillStyle='#0b0d0b';ctx.beginPath();ctx.arc(eye.x,eye.y,eye.r*.3,0,TAU);ctx.fill();
  // Knobs: tuning turns with the needle, volume rests.
  knob(ctx,tuneKnob,(needle-dx)/dw*TAU*1.5);knob(ctx,volKnob,.9);
  // Station card: the new one is dealt over the old as the needle arrives.
  const deal=i>0?easeOut((local-.7)/1.0):easeOut(local/1.0),tilt=portrait?.01:-.02;
  const place=(n,k,alpha)=>{const x=kx+kw/2+(1-k)*(portrait?u*.5:W*.3),y=ky+kh/2-(1-k)*u*.04,r=tilt+(1-k)*.12;ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.rotate(r);drawShadow(ctx,shadow,-kw/2,-kh/2,kw,kh,{alpha:.8,offsetY:.025,spread:1.07});ctx.drawImage(card(n),-kw/2,-kh/2);return ()=>ctx.restore();};
  if(i>0&&deal<1){place(i-1,1,1)();}
  const done=place(i,deal,clamp(deal*2,0,1));
  const [ox,oy]=[-kw/2,-kh/2];
  if(s.frame){const kind=LINEAR.includes(base.options.spectrum)?base.options.spectrum:'round-bars';drawSpectrum(ctx,{kind,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:[150,46,32],alpha:.85,x:ox+pad,y:oy+specY,width:kw-pad*2,height:specH});}
  ctx.fillStyle='rgba(42,33,26,.18)';ctx.fillRect(ox+pad,oy+barY,kw-pad*2,Math.max(2,u*.003));ctx.fillStyle='#a2271d';ctx.fillRect(ox+pad,oy+barY,(kw-pad*2)*s.progress,Math.max(2,u*.003));
  text(ctx,stamp(local),ox+pad,oy+barY+u*.024,{size:u*.016,weight:700,color:'#5c4a3a',baseline:'middle'});text(ctx,stamp(s.duration),ox+kw-pad,oy+barY+u*.024,{size:u*.016,weight:700,color:'#5c4a3a',align:'right',baseline:'middle'});
  done();
  vignette(ctx,W,H,{alpha:.45,inner:.5});
 }
 return {draw,duration:base.total};
}

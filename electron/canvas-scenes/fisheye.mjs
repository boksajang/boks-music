import {sceneBase,createRoll,trackRow,layer,rgba,mix,hash,random,clamp,lerp,easeOut,easeInOut,fitText,drawBlock,drawCover,text,setFont,stamp,drawSpectrum} from '../canvas-kit.mjs';

/**
 * 골드 어안: the photograph (or the song's album art) seen through a fisheye lens — barrel-bent toward
 * the edges, color-fringed at the rim, darkened in an elliptical fall-off and graded to an amber-gold
 * duotone. The bend and grade are computed per pixel once per picture; every frame the lens slowly
 * pushes in, turns and drifts, while two lens ghosts slide along the axis through a moving glare.
 * A fine white waveform and hairline progress sit at the bottom center. Lyrics rack focus: the next
 * line waits small and out of focus under the sung one and is pulled sharp as it becomes current
 * (instrumental: the song title does the same, beside a quiet 1–n track column).
 */
const TAU=Math.PI*2;
function lru(limit){const m=new Map();return (key,make)=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make();m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};}
// Amber duotone: luminance -> color stops.
const STOPS=[[0,[12,7,3]],[.22,[86,48,15]],[.48,[196,130,50]],[.74,[246,202,122]],[1,[255,248,224]]];
const LUT=(()=>{const out=new Uint8ClampedArray(256*3);for(let n=0;n<256;n++){let t=n/255;t=t*t*(3-2*t)*.55+t*.45;let k=0;while(k<STOPS.length-2&&t>STOPS[k+1][0])k++;const [a,ca]=STOPS[k],[b,cb]=STOPS[k+1],f=clamp((t-a)/(b-a),0,1);for(let c=0;c<3;c++)out[n*3+c]=lerp(ca[c],cb[c],f);}return out;})();

export default function fisheye(input){
 const base=sceneBase(input,{hue:38}),{width:W,height:H,portrait,u,vocal,tracks}=base,N=tracks.length;
 const gold=[236,196,120],paper=[255,247,232];
 const L=portrait
  ?{lyric:[W/2,H*.63],lyricW:u*.86,lyricSize:u*.08,title:[W/2,H*.47],titleW:u*.86,wave:[W*.18,H*.8,W*.64,H*.05],bar:[W*.18,H*.875,W*.64],caption:H*.91,head:H*.065,list:[u*.1,H*.565,u*.8,H*.2,H*.04]}
  :{lyric:[W/2,H*.575],lyricW:W*.72,lyricSize:u*.075,title:[W*.6,H*.58],titleW:W*.5,wave:[W*.35,H*.795,W*.3,H*.06],bar:[W*.35,H*.885,W*.3],caption:H*.928,head:H*.075,list:[W*.055,H*.2,W*.25,H*.5,H*.0555]};
 const measure=layer(8,8).getContext('2d');

 // ---- The lens: bend, fringe, fall-off and grade, once per picture ----------------------------------
 const long=Math.min(Math.max(W,H),1440),lw=Math.round(W>=H?long:long*W/H),lh=Math.round(W>=H?long*H/W:long);
 function lens(image){
  const over=1.7,sw=Math.round(lw*over),sh=Math.round(lh*over),src=layer(sw,sh),sg=src.getContext('2d',{willReadFrequently:true});
  sg.fillStyle='#000';sg.fillRect(0,0,sw,sh);drawCover(sg,image,0,0,sw,sh);const S=sg.getImageData(0,0,sw,sh).data;
  // Auto exposure: a gamma that brings the picture's mean luminance to a mid gold.
  let sum=0,cnt=0;for(let n=0;n<S.length;n+=4*97){sum+=(.3*S[n]+.59*S[n+1]+.11*S[n+2])/255;cnt++;}const gamma=clamp(Math.log(.36)/Math.log(clamp(sum/cnt,.02,.98)),.55,2.4),GL=new Uint8ClampedArray(256);for(let n=0;n<256;n++)GL[n]=255*Math.pow(n/255,gamma);
  const out=layer(lw,lh),og=out.getContext('2d'),img=og.createImageData(lw,lh),D=img.data;
  const cx=lw/2,cy=lh/2,R=Math.hypot(cx,cy),theta=1.22,tn=Math.tan(theta),scx=sw/2,scy=sh/2,k=over;
  const sample=(x,y,ch)=>{x=clamp(x,0,sw-1.001);y=clamp(y,0,sh-1.001);const x0=x|0,y0=y|0,fx=x-x0,fy=y-y0,i=(y0*sw+x0)*4+ch,a=S[i],b=S[i+4],c=S[i+sw*4],d=S[i+sw*4+4];return (a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;};
  for(let y=0;y<lh;y++)for(let x=0;x<lw;x++){
   const dx=x+.5-cx,dy=y+.5-cy,r=Math.hypot(dx,dy)||1e-6,rho=r/R,rs=Math.tan(rho*theta)/tn*R,s=rs/r*k,ca=.016*rho*rho;
   const red=sample(scx+dx*s*(1+ca),scy+dy*s*(1+ca),0),grn=sample(scx+dx*s,scy+dy*s,1),blu=sample(scx+dx*s*(1-ca),scy+dy*s*(1-ca),2);
   const lum=GL[clamp(Math.round(.3*red+.59*grn+.11*blu),0,255)],v=1;
   const o=(y*lw+x)*4;D[o]=(LUT[lum*3]+(red-lum)*.3)*v;D[o+1]=LUT[lum*3+1]*v;D[o+2]=(LUT[lum*3+2]+(blu-lum)*.3)*v;D[o+3]=255;
  }
  og.putImageData(img,0,0);return out;
 }
 const lenses=lru(3);
 const pictureOf=i=>base.background?lenses('bg',()=>lens(base.background)):lenses(i,()=>lens(base.art(i).image));

 // ---- Static overlays: lower-third shade, glass ghosts, grain ------------------------------------------
 const shade=(()=>{const c=layer(W,H),g=c.getContext('2d'),gr=g.createLinearGradient(0,H*.45,0,H);gr.addColorStop(0,'rgba(6,4,2,0)');gr.addColorStop(.5,'rgba(6,4,2,.42)');gr.addColorStop(1,'rgba(4,3,2,.78)');g.fillStyle=gr;g.fillRect(0,H*.45,W,H*.55);
  const top=g.createLinearGradient(0,0,0,H*.16);top.addColorStop(0,'rgba(4,3,2,.55)');top.addColorStop(1,'rgba(4,3,2,0)');g.fillStyle=top;g.fillRect(0,0,W,H*.16);
  {const [bx2,by2]=vocal?L.lyric:L.title,rx=portrait?W*.62:(vocal?W*.44:W*.34),ry=portrait?H*.13:H*.2;g.save();g.translate(bx2,by2);g.scale(rx/ry,1);const b=g.createRadialGradient(0,0,0,0,0,ry);b.addColorStop(0,'rgba(5,3,1,.58)');b.addColorStop(.55,'rgba(5,3,1,.4)');b.addColorStop(1,'rgba(5,3,1,0)');g.fillStyle=b;g.fillRect(-ry,-ry,ry*2,ry*2);g.restore();}
  if(!vocal&&!portrait){const side=g.createLinearGradient(0,0,W*.38,0);side.addColorStop(0,'rgba(4,3,2,.62)');side.addColorStop(1,'rgba(4,3,2,0)');g.fillStyle=side;g.fillRect(0,0,W*.38,H);}
  return c;})();
 // The fixed lens: elliptical field, falling off inward and cut to black outside, with a rim.
 const RX=W*(portrait?.7:.54),RY=H*(portrait?.54:.6);
 const mask=(()=>{const c=layer(W,H),g=c.getContext('2d');g.save();g.translate(W/2,H/2);g.scale(RX/RY,1);
  const f=g.createRadialGradient(0,0,RY*.3,0,0,RY);f.addColorStop(0,'rgba(3,2,1,0)');f.addColorStop(.6,'rgba(3,2,1,.08)');f.addColorStop(.85,'rgba(3,2,1,.45)');f.addColorStop(.95,'rgba(3,2,1,.9)');f.addColorStop(1,'rgba(3,2,1,1)');
  g.fillStyle=f;g.beginPath();g.arc(0,0,RY,0,TAU);g.fill();g.restore();g.fillStyle='rgb(3,2,1)';g.beginPath();g.rect(0,0,W,H);g.ellipse(W/2,H/2,RX,RY,0,0,TAU);g.fill('evenodd');return c;})();
 const ghost=(()=>{const s=256,c=layer(s,s),g=c.getContext('2d');g.translate(s/2,s/2);g.beginPath();g.arc(0,0,s*.46,0,TAU);
  const f=g.createRadialGradient(0,0,0,0,0,s*.46);f.addColorStop(0,'rgba(255,255,255,.18)');f.addColorStop(.75,'rgba(255,255,255,.32)');f.addColorStop(.95,'rgba(255,255,255,.55)');f.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=f;g.fill();return c;})();
 const tinted=lru(6);const tint=(color)=>tinted(color.join(','),()=>{const c=layer(ghost.width,ghost.height),g=c.getContext('2d');g.drawImage(ghost,0,0);g.globalCompositeOperation='source-in';g.fillStyle=rgba(color);g.fillRect(0,0,c.width,c.height);return c;});
 const grain=Array.from({length:3},(_,k)=>{const c=layer(256,256),g=c.getContext('2d'),r=random(hash('fe-grain')+k);for(let n=0;n<2200;n++){const v=r()<.5?0:255;g.fillStyle=`rgba(${v},${v},${v},${.04+r()*.07})`;g.fillRect(r()*256,r()*256,1+r()*1.4,1+r()*1.4);}return c;});

 // ---- Rack-focus text: each block in a sharp and a defocused version ------------------------------------
 const blocks=lru(10);
 function sprite(key,block,{label}={}){return blocks(key,()=>{
  const pad=block.font*.7,lab=label?block.font*.42:0,w=Math.ceil(Math.max(...block.lines.map(l=>{setFont(measure,block.weight,block.font,block.spacing);return measure.measureText(l).width;}))+pad*2),h=Math.ceil(block.height+lab*1.9+pad*2);
  const paint=(g,blur)=>{if(blur)g.filter=`blur(${block.font*blur}px)`;
   if(label){text(g,label,w/2,pad+lab*.6,{size:lab,weight:600,color:rgba(gold),align:'center',baseline:'middle',spacing:.38});}
   drawBlock(g,block,w/2,pad+lab*1.9,{color:rgba(paper),align:'center'});g.filter='none';};
  const sharp=layer(w,h),sg=sharp.getContext('2d');for(const [b,a] of [[.34,.7],[.12,.8]]){sg.filter=`blur(${block.font*b}px)`;sg.globalAlpha=a;drawBlock(sg,{...block},w/2,pad+lab*1.9,{color:'rgba(8,5,2,1)',align:'center'});}sg.filter='none';sg.globalAlpha=1;paint(sg,0);
  const soft=layer(w,h),fg=soft.getContext('2d');paint(fg,.085);
  return {sharp,soft,w,h,bh:block.height+lab*1.9};});}
 const lineSprite=(i,n)=>{
  if(n<0)return sprite(`t${i}`,fitText(measure,tracks[i].title||' ',{size:L.lyricSize*1.1,minSize:L.lyricSize*.55,weight:700,lineHeight:1.2,maxWidth:vocal?L.lyricW:L.titleW,maxHeight:L.lyricSize*3,spacing:-.01,maxLines:2}),{label:`${String(i+1).padStart(2,'0')}  /  ${String(N).padStart(2,'0')}`});
  return sprite(`l${i}:${n}`,fitText(measure,tracks[i].cues[n].text||' ',{size:L.lyricSize,minSize:L.lyricSize*.55,weight:700,lineHeight:1.22,maxWidth:L.lyricW,maxHeight:L.lyricSize*2.6,spacing:-.015,maxLines:2}));
 };
 function place(ctx,sp,x,y,scale,alpha,focus){
  if(alpha<=.003)return;const w=sp.w*scale,h=sp.h*scale;
  if(focus<1){ctx.globalAlpha=alpha*(1-focus);ctx.drawImage(sp.soft,x-w/2,y-h/2,w,h);}
  if(focus>0){ctx.globalAlpha=alpha*focus;ctx.drawImage(sp.sharp,x-w/2,y-h/2,w,h);}
  ctx.globalAlpha=1;
 }
 const roll=createRoll(),items=tracks.map((t,n)=>({number:n+1,title:t.title||'',duration:Number(t.duration)||0}));

 function lensFrame(ctx,picture,t,local,progress,alpha){
  // A slow push-in across the song, a slight turn and a lateral drift (all pure functions of time).
  const zoom=1.015+easeInOut(progress)*.075+Math.sin(t*.09)*.006,rot=Math.sin(t*.045)*.014,dx=Math.sin(t*.037)*W*.012,dy=Math.cos(t*.029)*H*.008;
  ctx.save();ctx.globalAlpha=alpha;ctx.translate(W/2+dx,H/2+dy);ctx.rotate(rot);ctx.scale(zoom,zoom);ctx.drawImage(picture,-W/2,-H/2,W,H);ctx.restore();
 }
 function draw(ctx,time){
  const s=base.at(time),{i,local}=s;
  ctx.fillStyle='#030201';ctx.fillRect(0,0,W,H);
  // Song change: the next picture dissolves in through a glare (one shared photo keeps its slow push).
  const change=i>0?clamp(local/1.4,0,1):1;
  if(change<1&&!base.background){const p=base.at(time-local-.001);lensFrame(ctx,pictureOf(i-1),s.t,p.local,1,1);}
  lensFrame(ctx,pictureOf(i),s.t,local,base.background?(s.t/Math.max(1,base.total)):s.progress,base.background?1:easeInOut(change));
  // Lens glare and two ghosts on the line through the frame center.
  {const gx=W*(.2+.07*Math.sin(s.t*.05)),gy=H*(.16+.05*Math.cos(s.t*.041)),cx=W/2,cy=H/2,flash=i>0?Math.pow(1-change,2):0;
   ctx.globalCompositeOperation='lighter';
   const glare=ctx.createRadialGradient(gx,gy,0,gx,gy,u*.32);glare.addColorStop(0,`rgba(255,214,150,${.2+flash*.5})`);glare.addColorStop(1,'rgba(255,214,150,0)');ctx.fillStyle=glare;ctx.fillRect(gx-u*.32,gy-u*.32,u*.64,u*.64);
   const streak=ctx.createLinearGradient(gx-W*.4,0,gx+W*.4,0);streak.addColorStop(0,'rgba(255,200,120,0)');streak.addColorStop(.5,`rgba(255,212,150,${.13+flash*.3})`);streak.addColorStop(1,'rgba(255,200,120,0)');ctx.fillStyle=streak;ctx.fillRect(gx-W*.4,gy-u*.003,W*.8,u*.006);
   for(const [k,size,color,a] of [[.5,.045,[255,186,90],.32],[1.18,.085,[230,150,70],.18],[1.55,.03,[255,226,170],.4]]){const x=cx+(cx-gx)*k,y=cy+(cy-gy)*k,r=u*size;ctx.globalAlpha=a*(1+flash);ctx.drawImage(tint(color),x-r,y-r,r*2,r*2);}
   ctx.globalAlpha=1;if(flash>0){ctx.fillStyle=`rgba(255,220,160,${flash*.22})`;ctx.fillRect(0,0,W,H);}
   ctx.globalCompositeOperation='source-over';}
  ctx.drawImage(mask,0,0);
  // Rim reflection: a warm arc creeping around the lens edge.
  {const turn=s.t*.11,rim=ctx.createConicGradient(turn,W/2,H/2);for(const [at,a] of [[0,0],[.06,.5],[.14,0],[.5,0],[.55,.22],[.6,0],[1,0]])rim.addColorStop(at,rgba(gold,a));
   ctx.strokeStyle=rim;ctx.lineWidth=Math.max(1.5,u*.003);ctx.beginPath();ctx.ellipse(W/2,H/2,RX*.965,RY*.965,0,0,TAU);ctx.stroke();}
  ctx.drawImage(shade,0,0);
  const f=Math.floor(s.t*12),plate=grain[f%3],off=(f*83)%256;ctx.globalAlpha=.4;for(let y=-off;y<H;y+=256)for(let x=-((off*3)%256);x<W;x+=256)ctx.drawImage(plate,x,y);ctx.globalAlpha=1;
  // Headline: small spaced capitals between two hairlines.
  if(base.headline){setFont(measure,500,u*.019,.32);const tw=Math.min(measure.measureText(base.headline).width,W*.6);text(ctx,base.headline,W/2,L.head,{size:u*.019,weight:500,color:rgba(paper,.88),align:'center',baseline:'middle',spacing:.32,maxWidth:W*.6});
   ctx.fillStyle=rgba(gold,.6);const lw2=u*.05,gap=u*.03;ctx.fillRect(W/2-tw/2-gap-lw2,L.head,lw2,Math.max(1,u*.0012));ctx.fillRect(W/2+tw/2+gap,L.head,lw2,Math.max(1,u*.0012));}

  if(vocal){
   const [cx,cy]=L.lyric,line=base.lineState(s),c=line.index,cues=s.track.cues||[],nextOf=n=>{for(let k=n+1;k<cues.length;k++)if(Number.isFinite(cues[k].start))return k;return -1;};
   const since=c<0?local:local-cues[c].start,e=easeInOut(since/.42),gap=u*.026,SC=.5;
   const cur=lineSprite(i,c<0?-1:c),n1=nextOf(c<0?-1:c),nx=n1>=0?lineSprite(i,n1):null,prev=c>=0?lineSprite(i,c-1<0?-1:c-1):null;
   const below=(a,b)=>cy+a.bh/2+gap+b.bh*SC/2;
   // Out of focus when the song rests: well after a line ended with the next one far away.
   const rest=c>=0&&Number.isFinite(line.next)?clamp((local-line.end-1.6)/.8,0,1)*clamp((line.next-.9)/.6,0,1):c>=0&&!Number.isFinite(line.next)?clamp((local-line.end-2.5)/.8,0,1):0;
   const moving=c>=0&&e<1;
   if(moving&&prev)place(ctx,prev,cx,cy-(prev.bh/2+cur.bh/2+gap)*e,1-.1*e,1-e,1-e);
   place(ctx,cur,cx,moving?lerp(below(prev,cur),cy,e):cy,moving?lerp(SC,1,e):1,(c<0?s.enter:1)*lerp(1,.62,rest)*(moving?lerp(.8,1,e):1),c<0?easeOut(local/.9):lerp(moving?e:1,0,rest));
   if(nx)place(ctx,nx,cx,below(cur,nx),SC,(moving?clamp((e-.55)/.45,0,1):1)*.55*s.exit*(c<0?clamp((local-.6)/.8,0,1):1),0);
  }else{
   // Current title racked into focus at each song, and a quiet 1–n column.
   // The old title drifts up out of focus first; the new one rises and sharpens after it.
   const out=easeOut(local/.5),e=easeInOut((local-(i>0?.15:0))/.6),[cx,cy]=L.title,cur=lineSprite(i,-1);
   if(i>0&&out<1){const old=lineSprite(i-1,-1);place(ctx,old,cx,cy-old.bh*.6*out,1-.08*out,1-out,1-out);}
   place(ctx,cur,cx,lerp(cy+cur.bh*.5,cy,e),lerp(.85,1,e),e*s.exit+(1-s.exit)*.4,e);
   const [lx,ly,lw2,lh2,rowH]=L.list,{index,ease}=base.rollState(s),size=portrait?u*.03:u*.021;
   roll(ctx,{x:lx,y:ly,w:lw2,h:lh2,rowH,anchor:portrait?2:3,index,ease,count:N,pinTop:true,fade:.2,
    highlight:(g,x,y,w,h)=>{g.fillStyle=rgba(gold,.9);g.fillRect(x,y+h*.24,Math.max(2,u*.003),h*.52);},
    row:(g,n,x,y,w,h,em)=>trackRow(g,items[n],x+u*.022,y,w-u*.022,h,em,{size,dim:[214,198,170],hot:paper,accent:gold,dimAlpha:.5})});
  }

  // Bottom center: hairline waveform, progress and caption.
  const [wx,wy,ww,wh]=L.wave;
  if(s.frame)drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:paper,alpha:.88,amp:.9,x:wx,y:wy,width:ww,height:wh});
  const [bx,by,bw]=L.bar,p=clamp(s.progress,0,1);ctx.fillStyle=rgba(paper,.22);ctx.fillRect(bx,by,bw,Math.max(1,u*.0014));ctx.fillStyle=rgba(paper,.92);ctx.fillRect(bx,by,bw*p,Math.max(1,u*.0014));
  ctx.beginPath();ctx.arc(bx+bw*p,by+u*.0007,u*.0035,0,TAU);ctx.fill();
  text(ctx,stamp(local),bx-u*.02,by,{size:u*.018,weight:500,color:rgba(paper,.7),align:'right',baseline:'middle',spacing:.06});
  text(ctx,stamp(s.duration),bx+bw+u*.02,by,{size:u*.018,weight:500,color:rgba(paper,.7),baseline:'middle',spacing:.06});
  if(vocal)text(ctx,`${String(i+1).padStart(2,'0')}   ${tracks[i].title||''}`,W/2,L.caption,{size:u*.02,weight:600,color:rgba(gold,.9),align:'center',baseline:'middle',spacing:.12,maxWidth:portrait?u*.8:W*.5,alpha:s.show});
  else text(ctx,`${String(i+1).padStart(2,'0')}  /  ${String(N).padStart(2,'0')}`,W/2,L.caption,{size:u*.019,weight:600,color:rgba(gold,.9),align:'center',baseline:'middle',spacing:.3});
 }
 return {draw,duration:base.total};
}

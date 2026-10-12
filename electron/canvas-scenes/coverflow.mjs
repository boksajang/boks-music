import {sceneBase,clamp,lerp,easeInOut,layer,rgba,mix,text,fitText,drawBlock,drawCover,drawSpectrum,radialGlow,setFont,stamp} from '../canvas-kit.mjs';

/**
 * 커버 플로우 (instrumental): every album cover of the playlist stands in a 3D carousel on a glossy floor.
 * Covers are projected with a real perspective (drawn in vertical strips and clipped to the exact
 * trapezoid), side covers turn away and darken with depth, reflections mirror into the floor. When a
 * song ends the carousel glides one cover over and the next album turns to face the viewer.
 */
export default function coverflow(input){
 const base=sceneBase(input,{hue:222}),{width:W,height:H,portrait,u,tracks}=base,count=tracks.length;
 // Camera and carousel geometry (world units in px at the center cover's depth).
 const C=portrait?u*.58:H*.42,horizon=portrait?H*.36:H*.43,f=C*2.6,eye=C*.5,theta=.96,Zs=C*.9,X1=C*.84,G=portrait?C*.3:C*.2,R=.4,side=portrait?4:9,move=1.4;
 const S=Math.round(Math.min(C,900)),LH=Math.round(S*(1+R)),floorFar=horizon+eye*f/(f+Zs),floorNear=horizon+eye;
 const L=portrait
  ?{top:H*.075,title:H*.725,titleW:u*.84,meta:H*.775,bar:[u*.14,H*.815,u*.72],spectrum:[u*.22,H*.845,u*.56,H*.065]}
  :{top:H*.085,title:H*.79,titleW:W*.6,meta:H*.85,bar:[W*.32,H*.895,W*.36],spectrum:[W*.41,H*.905,W*.18,H*.065]};
 const pad=n=>String(n).padStart(2,'0'),measure=layer(8,8).getContext('2d');

 // Per-song cover layer (cover + mirrored reflection below) and palette, LRU-bounded to the visible range.
 const covers=new Map(),limit=side*2+5;
 function cover(k){
  let entry=covers.get(k);
  if(entry){covers.delete(k);covers.set(k,entry);return entry;}
  const art=base.art(k),c=layer(S,LH),g=c.getContext('2d');
  drawCover(g,art.image,0,0,S,S);
  g.save();g.translate(0,S*2);g.scale(1,-1);drawCover(g,art.image,0,0,S,S);g.restore();
  g.fillStyle='rgba(0,0,0,.22)';g.fillRect(0,S,S,LH-S);
  g.fillStyle='rgba(255,255,255,.28)';g.fillRect(0,0,S,Math.max(1,S*.003));
  entry={layer:c,accent:art.accent,soft:art.soft,glow:art.glow,deep:art.deep,mid:art.mid};
  covers.set(k,entry);if(covers.size>limit)covers.delete(covers.keys().next().value);
  return entry;
 }
 const titles=new Map();
 const titleOf=k=>{if(!titles.has(k)){if(titles.size>6)titles.delete(titles.keys().next().value);titles.set(k,fitText(measure,tracks[k].title||'',{size:u*.05,minSize:u*.03,weight:800,lineHeight:1.2,maxWidth:L.titleW,maxHeight:u*.064,spacing:-.02,maxLines:1}));}return titles.get(k);};

 /** Position of a cover `d` places from the center: x, depth and yaw. */
 function place(d,camX){
  const a=Math.abs(d),sd=Math.sign(d),t=Math.min(1,a);
  return {X:sd*(a<1?X1*t:X1+(a-1)*G)+camX,Z:Zs*t,phi:sd*theta*Math.min(1,t*1.2)};
 }
 /** Screen geometry of a cover: perspective x of any u across its width and the straight top/end edges. */
 function geometry(d,camX){
  const {X,Z,phi}=place(d,camX),cw=C*Math.cos(phi),sw=C*Math.sin(phi);
  const xAt=v=>{const k=f/(f+Z+(v-.5)*sw);return W/2+(X+(v-.5)*cw)*k;};
  const edge=v=>{const k=f/(f+Z+(v-.5)*sw);return {x:W/2+(X+(v-.5)*cw)*k,top:horizon-(C-eye)*k,floor:horizon+eye*k,end:horizon+(R*C+eye)*k};};
  const a=edge(0),b=edge(1),span=Math.max(1e-6,b.x-a.x),at=(key,x)=>lerp(a[key],b[key],(x-a.x)/span);
  return {d,a,b,xAt,at};
 }
 function quad(ctx,a,b,from,to){ctx.beginPath();ctx.moveTo(a.x,a[from]);ctx.lineTo(b.x,b[from]);ctx.lineTo(b.x,b[to]);ctx.lineTo(a.x,a[to]);ctx.closePath();}
 function drawOne(ctx,entry,geo,occluder,{alpha,floor,glare}){
  const {a,b,xAt,at}=geo,d=Math.abs(geo.d);if(b.x<0||a.x>W)return;
  ctx.save();ctx.globalAlpha=alpha;quad(ctx,a,b,'top','end');ctx.clip();
  const dh=Math.abs((a.end-a.top)-(b.end-b.top)),m=d<.002?1:clamp(Math.ceil(dh/2.5),2,64);
  for(let j=0;j<m;j++){
   const u0=j/m,u1=(j+1)/m,xa=m===1?a.x:xAt(u0),xb=m===1?b.x:xAt(u1);
   if(xb<0||xa>W)continue;
   if(occluder){const o=occluder;if(xa>=o.a.x&&xb<=o.b.x&&at('top',xa)>=o.at('top',xa)&&at('top',xb)>=o.at('top',xb)&&at('end',xa)<=o.at('end',xa)&&at('end',xb)<=o.at('end',xb))continue;}
   const top=Math.min(at('top',xa),at('top',xb)),bottom=Math.max(at('end',xa),at('end',xb));
   ctx.drawImage(entry.layer,u0*S,0,Math.max(.5,(u1-u0)*S),LH,xa-.35,top,xb-xa+.7,bottom-top);
  }
  // Depth: turned covers darken, most at their far edge.
  const t=Math.min(1,d),depth=clamp(.34*t+Math.max(0,d-1)*.07,0,.8);
  if(depth>.005){const far=geo.d<0?0:1,g=ctx.createLinearGradient(a.x,0,b.x,0);g.addColorStop(far,`rgba(0,0,0,${clamp(depth*1.55,0,.9)})`);g.addColorStop(1-far,`rgba(0,0,0,${depth*.7})`);ctx.fillStyle=g;ctx.fillRect(a.x,Math.min(a.top,b.top),b.x-a.x,Math.max(a.end,b.end)-Math.min(a.top,b.top));}
  // Glare drifting slowly across the facing cover.
  if(glare){
   ctx.save();quad(ctx,a,b,'top','floor');ctx.clip();
   const w=b.x-a.x,h=a.floor-a.top,phase=glare.phase,x=a.x-w*.6+phase*w*2.2,g=ctx.createLinearGradient(x,a.top,x+w*.5,a.top+h);
   g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.5,`rgba(255,255,255,${.1*glare.alpha})`);g.addColorStop(1,'rgba(255,255,255,0)');
   ctx.fillStyle=g;ctx.fillRect(a.x,a.top,w,h);ctx.restore();
  }
  // Reflection fades into the floor color.
  quad(ctx,a,b,'floor','end');ctx.clip();
  const ym=(a.floor+b.floor)/2,ye=(a.end+b.end)/2,g=ctx.createLinearGradient(0,ym,0,ye);
  g.addColorStop(0,rgba(floor,.55));g.addColorStop(.75,rgba(floor,.96));g.addColorStop(1,rgba(floor,1));ctx.fillStyle=g;ctx.fillRect(a.x,Math.min(a.floor,b.floor)-1,b.x-a.x,Math.max(a.end,b.end)-Math.min(a.floor,b.floor)+2);
  ctx.restore();
 }

 function draw(ctx,time){
  const s=base.at(time),{i,local,duration,show}=s,lead=Math.min(move,duration*.45);
  const glide=i<count-1?easeInOut((local-(duration-lead))/lead):0,p=i+glide;
  const now=cover(i),next=i<count-1?cover(i+1):now,mixP=(a,b)=>mix(a,b,glide);
  const deep=mixP(now.deep,next.deep),mid=mixP(now.mid,next.mid),glow=mixP(now.glow,next.glow),accent=mixP(now.accent,next.accent);
  const floor=mix(deep,[3,4,7],.45);
  // Room: a dark wall lit from above the center, a glossy floor of one tone (the reflections fade into it).
  const wall=ctx.createLinearGradient(0,0,0,floorFar);wall.addColorStop(0,rgba(mix(deep,[2,3,6],.6)));wall.addColorStop(.75,rgba(mix(mid,deep,.55)));wall.addColorStop(1,rgba(mix(mid,floor,.35)));
  ctx.fillStyle=wall;ctx.fillRect(0,0,W,floorFar);
  const band=ctx.createLinearGradient(0,floorFar-1,0,floorFar+C*.12);band.addColorStop(0,rgba(mix(mid,floor,.35)));band.addColorStop(1,rgba(floor));ctx.fillStyle=band;ctx.fillRect(0,floorFar-1,W,C*.12+1);
  ctx.fillStyle=rgba(floor);ctx.fillRect(0,floorFar+C*.12,W,H-floorFar-C*.12);
  ctx.save();ctx.beginPath();ctx.rect(0,0,W,floorFar);ctx.clip();radialGlow(ctx,W/2,horizon-C*.25,C*1.7,glow,.2);ctx.restore();
  // Carousel: covers in the visible range, farthest first; a slow camera drift keeps the depth alive.
  const camX=Math.sin(s.t*.11)*C*.035,list=[],from=Math.max(0,Math.floor(p-side-1)),to=Math.min(count-1,Math.ceil(p+side+1));
  for(let k=from;k<=to;k++){const d=k-p;if(Math.abs(d)>side+.5)continue;list.push(geometry(d,camX));}
  const byD=new Map(list.map(g=>[Math.round((g.d+p)),g]));
  list.sort((a,b)=>Math.abs(b.d)-Math.abs(a.d));
  for(const geo of list){
   const k=Math.round(geo.d+p),near=geo.d<-.5?byD.get(k+1):geo.d>.5?byD.get(k-1):null,ad=Math.abs(geo.d);
   const glare=ad<1?{alpha:1-ad,phase:((local*.09)%1.6)/1.6}:0;
   drawOne(ctx,cover(k),geo,near,{alpha:clamp(side+.5-ad,0,1),floor,glare});
  }
  // Light pool on the floor in front of the facing cover.
  ctx.save();ctx.translate(W/2,floorNear+C*.06);ctx.scale(1,.18);ctx.globalCompositeOperation='lighter';radialGlow(ctx,0,0,C*1.1,glow,.12);ctx.restore();
  // Title line at the top.
  if(base.headline){
   setFont(ctx,700,u*.019,.32);const w=Math.min(ctx.measureText(base.headline).width,W*.7),gap=u*.03,line=u*.05;
   text(ctx,base.headline,W/2,L.top,{size:u*.019,weight:700,color:rgba(mix(accent,[255,255,255],.75),.92),spacing:.32,align:'center',baseline:'middle',maxWidth:W*.7});
   ctx.fillStyle=rgba(mix(accent,[255,255,255],.4),.55);ctx.fillRect(W/2-w/2-gap-line,L.top,line,Math.max(1,u*.0015));ctx.fillRect(W/2+w/2+gap,L.top,line,Math.max(1,u*.0015));
  }
  // Now playing: title, number and time, a hairline progress.
  const rise=(1-show)*u*.018;
  drawBlock(ctx,titleOf(i),W/2,L.title-u*.032+rise,{color:'#fff',align:'center',alpha:show});
  const meta=`${pad(i+1)}  /  ${pad(count)}`;
  text(ctx,meta,W/2,L.meta+rise,{size:u*.018,weight:700,color:rgba(mix(accent,[255,255,255],.35)),spacing:.24,align:'center',baseline:'middle',alpha:show});
  const [bx,by,bw]=L.bar,lh=Math.max(1,u*.0028);
  ctx.fillStyle='rgba(255,255,255,.16)';ctx.fillRect(bx,by,bw,lh);
  ctx.fillStyle=rgba(mix(accent,[255,255,255],.55));ctx.fillRect(bx,by,bw*s.progress,lh);
  ctx.beginPath();ctx.arc(bx+bw*s.progress,by+lh/2,u*.0055,0,Math.PI*2);ctx.fill();
  text(ctx,stamp(local),bx-u*.02,by+lh/2,{size:u*.015,weight:500,color:'rgba(255,255,255,.62)',align:'right',baseline:'middle'});
  text(ctx,stamp(duration),bx+bw+u*.02,by+lh/2,{size:u*.015,weight:500,color:'rgba(255,255,255,.62)',baseline:'middle'});
  if(s.frame){const [x,y,w,h]=L.spectrum;drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:mix(accent,[255,255,255],.45),alpha:.75,amp:.8,x,y,width:w,height:h});}
 }
 return {draw,duration:base.total};
}

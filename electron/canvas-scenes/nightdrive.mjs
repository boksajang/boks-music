import {sceneBase,createRoll,trackRow,layer,rgba,mix,hash,random,clamp,lerp,easeOut,easeInOut,fitText,drawBlock,text,setFont,stamp,drawSpectrum} from '../canvas-kit.mjs';

/**
 * 나이트 드라이브 (instrumental): first person on a night highway at a constant speed. Lane dashes and
 * streetlights rush out of a vanishing point (each light smeared into a streak by its own motion); the
 * city glows as bokeh on the horizon. Every song change is a tunnel: its portal (with an overhead sign
 * for the next song) grows out of the distance, the car runs under streaking ceiling lights and comes
 * out into a new neon color. Top left, a round track badge rolls to the next number above a heavy
 * two-line title; on the dashboard a door subwoofer pumps with the bass and the head unit lists 1–n.
 */
const TAU=Math.PI*2;
const SCHEMES=[{a:[64,168,255],sky:[10,18,52],glow:[40,90,220]},{a:[255,64,196],sky:[30,8,44],glow:[200,40,150]},{a:[176,255,64],sky:[8,30,30],glow:[60,170,110]},{a:[150,96,255],sky:[18,10,52],glow:[110,60,220]}];
const SPEED=30,TUNNEL_IN=78,TUNNEL_OUT=52;
const HILL=(()=>{const r=random(hash('hill')),out=[];for(let k=0;k<=24;k++){const X=-90+k*7.5;out.push([X,-12-Math.abs(Math.sin(k*.7))*10-r()*6+Math.abs(X)*.12]);}return out;})();
function lru(limit){const m=new Map();return (key,make)=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make();m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};}

export default function nightdrive(input){
 const base=sceneBase(input,{hue:220}),{width:W,height:H,portrait,u,tracks}=base,N=tracks.length;
 // Distance travelled and song progress of the frame being drawn (set at the start of draw).
 let dist=0,prog=0;
 const scheme=i=>SCHEMES[((i%SCHEMES.length)+SCHEMES.length)%SCHEMES.length];
 const VP=portrait?[W/2,H*.43]:[W*.6,H*.5],F=u*(portrait?.95:1.05),CAM=1.25,NEAR=1.2,FAR=420;
 const dashY=portrait?H*.635:H*.76;
 const L=portrait
  ?{badge:[u*.14,H*.075,u*.075],title:[u*.265,H*.048,u*.675,u*.092],sub:H*.16,head:[W-u*.07,H*.03],sub0:[u*.2,H*.745,u*.105],now:[u*.37,H*.685,u*.56,H*.115],list:[u*.07,H*.815,u*.86,H*.14,H*.035]}
  :{badge:[W*.065,H*.13,u*.068],title:[W*.065+u*.1,H*.07,W*.4,u*.085],sub:H*.31,head:[W*.95,H*.06],sub0:[W*.2,H*.885,u*.088],now:[W*.335,H*.79,W*.15,H*.165],list:[W*.505,H*.79,W*.43,H*.165,H*.041]};
 const measure=layer(8,8).getContext('2d');
 const P=(X,Y,z,vx)=>[vx+X*F/z,VP[1]+Y*F/z];

 // ---- Static parts -----------------------------------------------------------------------------------
 const skyline=(()=>{
  const w=Math.ceil(W*1.2),h=Math.ceil(H*.2),c=layer(w,h),g=c.getContext('2d'),r=random(hash('skyline'));
  for(let x=0;x<w;){const bw=u*(.02+r()*.05),bh=h*(.15+Math.pow(r(),1.6)*.75);g.fillStyle=`rgb(${6+r()*6},${7+r()*6},${14+r()*8})`;g.fillRect(x,h-bh,bw,bh);
   for(let k=0;k<bw*bh/(u*u*.0004);k++)if(r()<.35){g.fillStyle=r()<.7?`rgba(255,${200+r()*40},${140+r()*60},${.3+r()*.5})`:`rgba(140,200,255,${.3+r()*.4})`;g.fillRect(x+r()*bw,h-bh+r()*bh*.9,Math.max(1,u*.002),Math.max(1,u*.0025));}
   x+=bw+u*.002;}
  return c;})();
 const bokeh=(()=>{
  const w=Math.ceil(W*1.2),h=Math.ceil(H*.24),c=layer(w,h),g=c.getContext('2d'),r=random(hash('bokeh'));
  for(let k=0;k<70;k++){const x=r()*w,y=h*(.35+r()*.6),rad=u*(.006+Math.pow(r(),2)*.022),col=[[255,186,90],[255,110,170],[110,190,255],[255,236,190],[190,120,255]][Math.floor(r()*5)],gr=g.createRadialGradient(x,y,0,x,y,rad);
   gr.addColorStop(0,rgba(col,.55));gr.addColorStop(.75,rgba(col,.35));gr.addColorStop(1,rgba(col,0));g.fillStyle=gr;g.beginPath();g.arc(x,y,rad,0,TAU);g.fill();}
  return c;})();
 const glowDot=(()=>{const s=128,c=layer(s,s),g=c.getContext('2d'),gr=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.12,'rgba(255,255,255,.8)');gr.addColorStop(.35,'rgba(255,255,255,.22)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,s,s);return c;})();
 const tintDots=lru(8);const dot=color=>tintDots(color.map(Math.round).join(','),()=>{const c=layer(glowDot.width,glowDot.height),g=c.getContext('2d');g.drawImage(glowDot,0,0);g.globalCompositeOperation='source-atop';g.fillStyle=rgba(mix(color,[255,255,255],.35));g.fillRect(0,0,c.width,c.height);g.globalCompositeOperation='destination-in';g.drawImage(glowDot,0,0);return c;});
 const dash=(()=>{
  const c=layer(W,H),g=c.getContext('2d'),top=dashY;
  g.beginPath();g.moveTo(0,top+H*.04);g.bezierCurveTo(W*.3,top-H*.02,W*.7,top-H*.025,W,top+H*.03);g.lineTo(W,H);g.lineTo(0,H);g.closePath();
  const f=g.createLinearGradient(0,top-H*.03,0,H);f.addColorStop(0,'#15171d');f.addColorStop(.25,'#0b0c10');f.addColorStop(1,'#050508');g.fillStyle=f;g.fill();
  g.save();g.clip();const r=random(hash('dash'));for(let k=0;k<W*(H-top)/180;k++){g.fillStyle=`rgba(255,255,255,${r()*.025})`;g.fillRect(r()*W,top+r()*(H-top),1.5,1.5);}g.restore();
  // Panels: head-unit bezel and the door speaker housing.
  const bez=(x,y,w,h,rad)=>{g.fillStyle='rgba(0,0,0,.75)';g.beginPath();g.roundRect(x-u*.008,y-u*.008,w+u*.016,h+u*.016,rad+u*.006);g.fill();g.strokeStyle='rgba(255,255,255,.07)';g.lineWidth=Math.max(1,u*.0015);g.stroke();};
  const [nx,ny,nw,nh]=L.now,[lx,ly,lw,lh]=L.list;
  if(portrait){bez(nx,ny,nw,nh,u*.012);bez(lx,ly,lw,lh,u*.012);}else bez(nx,ny,lx+lw-nx,lh,u*.012);
  const [sx,sy,sr]=L.sub0;const hs=g.createRadialGradient(sx,sy,sr*.9,sx,sy,sr*1.4);hs.addColorStop(0,'#000');hs.addColorStop(.6,'#0d0e12');hs.addColorStop(1,'rgba(13,14,18,0)');g.fillStyle=hs;g.beginPath();g.arc(sx,sy,sr*1.4,0,TAU);g.fill();
  for(let k=0;k<24;k++){const a=k/24*TAU;g.fillStyle='rgba(255,255,255,.12)';g.beginPath();g.arc(sx+Math.cos(a)*sr*1.2,sy+Math.sin(a)*sr*1.2,u*.0022,0,TAU);g.fill();}
  return c;})();
 const screen=(()=>{const [nx,ny,nw,nh]=L.now,[lx,ly,lw,lh]=L.list,c=layer(W,H),g=c.getContext('2d');
  const fill=(x,y,w,h)=>{const f=g.createLinearGradient(0,y,0,y+h);f.addColorStop(0,'#070a12');f.addColorStop(1,'#03040a');g.fillStyle=f;g.beginPath();g.roundRect(x,y,w,h,u*.008);g.fill();
   g.strokeStyle='rgba(120,160,255,.06)';g.lineWidth=1;for(let yy=y;yy<y+h;yy+=Math.max(2,u*.003)){g.beginPath();g.moveTo(x,yy);g.lineTo(x+w,yy);g.stroke();}};
  if(portrait){fill(nx,ny,nw,nh);fill(lx,ly,lw,lh);}else{fill(nx,ny,lx+lw-nx,lh);g.fillStyle='rgba(255,255,255,.08)';g.fillRect(lx-u*.012,ly+lh*.1,Math.max(1,u*.0015),lh*.8);}
  return c;})();

 // ---- World ------------------------------------------------------------------------------------------
 // Tunnel k sits around the distance where song k begins (song 0 starts inside one and drives out).
 const bounds=base.offsets.map(o=>o*SPEED);
 function tunnelNear(d){let best=-1;for(let k=0;k<bounds.length;k++){if(bounds[k]+TUNNEL_OUT>d-1){best=k;break;}}return best;}
 function roadRange(ctx,z0,z1,vx,a,inTunnel){
  if(z1<=z0)return;const half=inTunnel?7.4:5.4,[x0,y0]=P(-half,CAM,z0,vx),[x1]=P(half,CAM,z0,vx),[x2,y2]=P(half,CAM,z1,vx),[x3]=P(-half,CAM,z1,vx);
  if(!inTunnel){const sh=12,[s0]=P(-sh,CAM,z0,vx),[s1]=P(sh,CAM,z0,vx),[s2]=P(sh,CAM,z1,vx),[s3]=P(-sh,CAM,z1,vx);ctx.fillStyle='#07080b';ctx.beginPath();ctx.moveTo(s0,y0);ctx.lineTo(s1,y0);ctx.lineTo(s2,y2);ctx.lineTo(s3,y2);ctx.fill();}
  const g=ctx.createLinearGradient(0,y2,0,y0);g.addColorStop(0,'#101218');g.addColorStop(1,'#16181e');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y0);ctx.lineTo(x2,y2);ctx.lineTo(x3,y2);ctx.fill();
  // Solid edge lines and dashed lane lines (12 m period, 4.5 m dash), flowing toward the camera.
  const line=(X,za,zb,w,color)=>{const [ax,ay]=P(X-w,CAM,za,vx),[bx]=P(X+w,CAM,za,vx),[cx,cy]=P(X+w,CAM,zb,vx),[dx]=P(X-w,CAM,zb,vx);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,ay);ctx.lineTo(cx,cy);ctx.lineTo(dx,cy);ctx.fill();};
  const edge=inTunnel?'rgba(255,214,120,.55)':'rgba(230,236,245,.55)';line(-5.2,z0,z1,.08,edge);line(5.2,z0,z1,.08,edge);
  const phase=((dist%12)+12)%12;
  for(let z=12-phase;z<z1;z+=12){const za=Math.max(z0,z,3),zb=Math.min(z1,z+4.5);if(zb<=za)continue;const fade=clamp(1-za/180,0,1);for(const X of [-1.8,1.8])line(X,za,zb,.07,`rgba(240,244,250,${.75*fade})`);}
 }
 function lightsRange(ctx,z0,z1,vx,a){
  // Streetlights every 40 m on alternating sides; each is smeared over the distance covered in 0.12 s.
  const d=dist,first=Math.ceil((d+z0)/20),blur=SPEED*.12;
  // Guard-rail reflectors every 8 m: the fastest cue of speed near the camera.
  ctx.globalCompositeOperation='lighter';
  for(let n=Math.ceil((d+Math.max(z0,2.5))/8);n*8-d<Math.min(z1,160);n++){const z=n*8-d,r=clamp(.07*F/z,.8,u*.006),fade=clamp(1-z/160,0,1);for(const X of [-6.3,6.3]){const [x,y]=P(X,CAM-.75,z,vx);ctx.fillStyle=X<0?`rgba(255,170,60,${.9*fade})`:`rgba(235,240,255,${.8*fade})`;ctx.fillRect(x-r,y-r*1.6,r*2,r*3.2);}}
  ctx.globalCompositeOperation='source-over';
  ctx.lineCap='round';
  for(let n=Math.ceil((d+z1)/20);n>=first;n--){
   const z=n*20-d;if(z<z0||z>z1)continue;const side=n%2?1:-1,X=side*7.6,head=[side*5.6,-6.6],[bx,by]=P(X,CAM,z,vx),[tx,ty]=P(X,-6.3,z,vx),[ax,ay]=P(head[0],head[1],z,vx);
   const fade=clamp(1-z/260,0,1);if(fade<=0)continue;
   ctx.strokeStyle=`rgba(40,44,56,${.9*fade})`;ctx.lineWidth=Math.max(1,.22*F/z);ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(tx,ty);ctx.lineTo(ax,ay);ctx.stroke();
   const zb=z+blur,[sx,sy]=P(head[0],head[1],zb,vx),col=mix(a,[255,255,255],.55);
   ctx.globalCompositeOperation='lighter';
   ctx.strokeStyle=rgba(col,.55*fade);ctx.lineWidth=clamp(.32*F/z,1,u*.012);ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(sx,sy);ctx.stroke();
   const r=clamp(1.6*F/z,2,u*.06);ctx.globalAlpha=fade;ctx.drawImage(dot(a),ax-r,ay-r,r*2,r*2);ctx.globalAlpha=1;
   // Pool of light on the road.
   const [px,py]=P(head[0]*.8,CAM,z,vx),pr=Math.max(2,3.2*F/z);ctx.globalAlpha=.16*fade;ctx.drawImage(dot(a),px-pr*1.4,py-pr*.35,pr*2.8,pr*.7);ctx.globalAlpha=1;
   ctx.globalCompositeOperation='source-over';
  }
 }
 function tunnelRange(ctx,z0,z1,vx,colorAt,startD){
  if(z1<=z0)return;const Xw=7.6,Yc=-5.6;
  const quad=(p,fill)=>{ctx.fillStyle=fill;ctx.beginPath();p.forEach(([x,y],k)=>k?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.fill();};
  const [lx0,ly0]=P(-Xw,CAM,z0,vx),[lx1,ly1]=P(-Xw,Yc,z0,vx),[rx0,ry0]=P(Xw,CAM,z0,vx),[rx1,ry1]=P(Xw,Yc,z0,vx);
  const [lx2,ly2]=P(-Xw,CAM,z1,vx),[lx3,ly3]=P(-Xw,Yc,z1,vx),[rx2,ry2]=P(Xw,CAM,z1,vx),[rx3,ry3]=P(Xw,Yc,z1,vx);
  quad([[lx0,ly0],[lx1,ly1],[lx3,ly3],[lx2,ly2]],'#0c0d12');quad([[rx0,ry0],[rx1,ry1],[rx3,ry3],[rx2,ry2]],'#0c0d12');quad([[lx1,ly1],[rx1,ry1],[rx3,ry3],[lx3,ly3]],'#08090c');
  const d=dist;
  // Wall seams every 10 m and a neon band along each wall.
  for(let n=Math.ceil((d+z0)/10);(n*10-d)<z1;n++){const z=n*10-d,fade=clamp(1-z/220,0,1);ctx.strokeStyle=`rgba(255,255,255,${.08*fade})`;ctx.lineWidth=Math.max(1,.05*F/z);for(const X of [-Xw,Xw]){const [a,b]=P(X,CAM,z,vx),[c,e]=P(X,Yc,z,vx);ctx.beginPath();ctx.moveTo(a,b);ctx.lineTo(c,e);ctx.stroke();}}
  ctx.globalCompositeOperation='lighter';
  for(const X of [-Xw+.02,Xw-.02]){const steps=10;for(let k=0;k<steps;k++){const za=z0+(z1-z0)*k/steps,zb=z0+(z1-z0)*(k+1)/steps,col=colorAt(d+za),[a,b]=P(X,-1.1,za,vx),[c,e]=P(X,-1.1,zb,vx);ctx.strokeStyle=rgba(col,.55*clamp(1-za/240,0,1));ctx.lineWidth=clamp(.18*F/za,1,u*.008);ctx.beginPath();ctx.moveTo(a,b);ctx.lineTo(c,e);ctx.stroke();}}
  // Ceiling strips every 6 m, streaked by the motion.
  for(let n=Math.ceil((d+z0)/6);(n*6-d)<z1;n++){const z=n*6-d;if(z<z0)continue;const col=mix(colorAt(d+z),[255,255,255],.45),fade=clamp(1-z/240,0,1);
   for(const X of [-2.6,2.6]){const [a,b]=P(X,Yc+.05,z,vx),[c,e]=P(X,Yc+.05,Math.min(z1,z+2.5+SPEED*.1),vx);ctx.strokeStyle=rgba(col,.9*fade);ctx.lineWidth=clamp(.25*F/z,1,u*.007);ctx.beginPath();ctx.moveTo(a,b);ctx.lineTo(c,e);ctx.stroke();
    ctx.strokeStyle=rgba(col,.16*fade);ctx.lineWidth=clamp(1.1*F/z,2,u*.022);ctx.beginPath();ctx.moveTo(a,b);ctx.lineTo(c,e);ctx.stroke();}}
  ctx.globalCompositeOperation='source-over';
 }
 function portal(ctx,z,vx,face,frame,sign){
  if(z<=NEAR)return;const [mx0,my0]=P(-7.6,-5.6,z,vx),[mx1,my1]=P(7.6,CAM,z,vx);
  // A dark hillside with the tunnel mouth cut out.
  ctx.fillStyle=face;ctx.beginPath();const [hx0,hy0]=P(-90,CAM,z,vx);ctx.moveTo(hx0,hy0);for(const [X,Y] of HILL){const [x,y]=P(X,Y,z,vx);ctx.lineTo(x,y);}const [hx1,hy1]=P(90,CAM,z,vx);ctx.lineTo(hx1,hy1);ctx.closePath();ctx.rect(mx0,my0,mx1-mx0,my1-my0);ctx.fill('evenodd');
  ctx.strokeStyle=frame;ctx.lineWidth=Math.max(1,.5*F/z);ctx.strokeRect(mx0,my0,mx1-mx0,my1-my0);
  if(sign){const [s0x,s0y]=P(-4.6,-8.6,z,vx),[s1x,s1y]=P(4.6,-6.4,z,vx),sw=s1x-s0x,sh=s1y-s0y;if(sh>3){
   ctx.fillStyle='#0d5a3a';ctx.fillRect(s0x,s0y,sw,sh);ctx.strokeStyle='rgba(235,245,240,.85)';ctx.lineWidth=Math.max(1,sh*.04);ctx.strokeRect(s0x+sh*.06,s0y+sh*.06,sw-sh*.12,sh-sh*.12);
   if(sh>10){text(ctx,sign.number,s0x+sh*.25,s0y+sh/2,{size:sh*.5,weight:900,color:'#f2f6f3',baseline:'middle'});text(ctx,sign.title,s0x+sh*1.25,s0y+sh/2,{size:sh*.36,weight:700,color:'#f2f6f3',baseline:'middle',maxWidth:sw-sh*1.5});}}}
 }

 // ---- Overlays ---------------------------------------------------------------------------------------
 const titles=lru(4),roll=createRoll(),items=tracks.map((t,n)=>({number:n+1,title:t.title||'',duration:Number(t.duration)||0}));
 const titleOf=i=>titles(i,()=>{const [,,tw,size]=L.title,fit=fitText(measure,tracks[i].title||'',{size,minSize:size*.48,weight:900,lineHeight:1.08,maxWidth:tw,maxHeight:size*2.2,spacing:-.035,maxLines:2});
  const pad=size*.4,w=Math.ceil(tw+pad*2),h=Math.ceil(fit.height+pad*2),c=layer(w,h),g=c.getContext('2d'),a=scheme(i).a;
  g.filter=`blur(${size*.22}px)`;drawBlock(g,fit,pad,pad,{color:rgba(a,.7)});g.filter='none';drawBlock(g,fit,pad,pad,{color:'#ffffff'});
  return {c,w,h,pad,fit};});
 const pad2=n=>String(n).padStart(2,'0');
 function badge(ctx,i,local,a){
  const [x,y,r]=L.badge,roll2=i>0?easeInOut((local-.15)/.55):1;
  ctx.fillStyle='rgba(4,6,12,.55)';ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
  ctx.strokeStyle=rgba(a);ctx.lineWidth=Math.max(2,r*.07);ctx.beginPath();ctx.arc(x,y,r*.92,0,TAU);ctx.stroke();
  ctx.globalCompositeOperation='lighter';ctx.strokeStyle=rgba(a,.25);ctx.lineWidth=r*.2;ctx.beginPath();ctx.arc(x,y,r*.92,0,TAU);ctx.stroke();ctx.globalCompositeOperation='source-over';
  // Progress tick running around the ring.
  ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(2,r*.07);ctx.beginPath();ctx.arc(x,y,r*.92,-Math.PI/2,-Math.PI/2+TAU*clamp(prog,0,1));ctx.stroke();
  ctx.save();ctx.beginPath();ctx.arc(x,y,r*.8,0,TAU);ctx.clip();
  const size=r*.82;if(roll2<1&&i>0)text(ctx,pad2(i),x,y-roll2*r*1.6,{size,weight:900,color:'#fff',align:'center',baseline:'middle',spacing:-.04});
  text(ctx,pad2(i+1),x,y+(1-roll2)*r*1.6,{size,weight:900,color:'#fff',align:'center',baseline:'middle',spacing:-.04});ctx.restore();
 }
 function woofer(ctx,low,a){
  const [x,y,r]=L.sub0,ex=low;
  ctx.globalCompositeOperation='lighter';const ring=ctx.createRadialGradient(x,y,r*.98,x,y,r*1.22);ring.addColorStop(0,rgba(a,0));ring.addColorStop(.3,rgba(a,.55+ex*.25));ring.addColorStop(1,rgba(a,0));ctx.fillStyle=ring;ctx.beginPath();ctx.arc(x,y,r*1.22,0,TAU);ctx.fill();ctx.globalCompositeOperation='source-over';
  const trim=ctx.createLinearGradient(x-r,y-r,x+r,y+r);trim.addColorStop(0,'#8a8f99');trim.addColorStop(.5,'#2b2e35');trim.addColorStop(1,'#6a6f78');ctx.fillStyle=trim;ctx.beginPath();ctx.arc(x,y,r*1.04,0,TAU);ctx.fill();
  // Rubber surround: its highlight shifts as the cone moves out.
  const sur=ctx.createRadialGradient(x-r*.2*(1+ex*.3),y-r*.25*(1+ex*.3),r*.6,x,y,r);sur.addColorStop(0,'#3a3c42');sur.addColorStop(.7,'#141518');sur.addColorStop(1,'#050506');ctx.fillStyle=sur;ctx.beginPath();ctx.arc(x,y,r*.97,0,TAU);ctx.fill();
  const s=1+ex*.11,cr=r*.78*s,cone=ctx.createRadialGradient(x-cr*.15,y-cr*.2,cr*.1,x,y,cr);cone.addColorStop(0,'#2c2e34');cone.addColorStop(.6,'#15161a');cone.addColorStop(1,'#08080a');ctx.fillStyle=cone;ctx.beginPath();ctx.arc(x,y,cr,0,TAU);ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.06)';ctx.lineWidth=Math.max(1,r*.012);for(const k of [.45,.62,.8,.94]){ctx.beginPath();ctx.arc(x,y,cr*k,0,TAU);ctx.stroke();}
  ctx.strokeStyle=rgba(a,.35+ex*.3);ctx.lineWidth=Math.max(1,r*.02);ctx.beginPath();ctx.arc(x,y,cr*.985,Math.PI*1.05,Math.PI*1.6);ctx.stroke();
  const cap=r*.3*(1+ex*.12),cg=ctx.createRadialGradient(x-cap*.35,y-cap*.4-ex*r*.02,cap*.05,x,y,cap);cg.addColorStop(0,'#9aa0aa');cg.addColorStop(.35,'#3a3d44');cg.addColorStop(1,'#101114');ctx.fillStyle=cg;ctx.beginPath();ctx.arc(x,y,cap,0,TAU);ctx.fill();
  text(ctx,'SUB',x,y+r*.6*s,{size:r*.1,weight:800,color:'rgba(255,255,255,.28)',align:'center',baseline:'middle',spacing:.3});
 }

 function draw(ctx,time){
  const s=base.at(time),{i,local}=s,t=s.t,d=t*SPEED,vx=VP[0]+Math.sin(t*.06)*W*.025;dist=d;prog=s.progress;
  // Which side of the nearest tunnel the camera is on decides the colors.
  const k=tunnelNear(d),entry=k>=0?bounds[k]-TUNNEL_IN:Infinity,exit=k>=0?bounds[k]+TUNNEL_OUT:-Infinity,ze=entry-d,zx=exit-d,inside=ze<=0&&zx>0;
  const before=k>=0?scheme(k-1):scheme(i),after=k>=0?scheme(k):scheme(i),sky=inside||ze<=0?after:before;
  const colorAt=wd=>mix(scheme(k-1).a,scheme(k).a,clamp((wd-entry)/(TUNNEL_IN+TUNNEL_OUT),0,1));
  // Sky, horizon glow, skyline and city bokeh (drifting against the road's sway).
  const g=ctx.createLinearGradient(0,0,0,VP[1]);g.addColorStop(0,'#020308');g.addColorStop(.7,rgba(sky.sky));g.addColorStop(1,rgba(mix(sky.glow,[0,0,0],.45)));ctx.fillStyle=g;ctx.fillRect(0,0,W,VP[1]+1);
  ctx.fillStyle='#050609';ctx.fillRect(0,VP[1],W,H-VP[1]);
  const shift=(vx-VP[0])*-.6-W*.1;ctx.drawImage(skyline,shift,VP[1]-skyline.height+H*.004);
  ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.85;ctx.drawImage(bokeh,shift*1.2,VP[1]-bokeh.height*.62);ctx.globalAlpha=1;
  const hz=ctx.createRadialGradient(vx,VP[1],0,vx,VP[1],W*.5);hz.addColorStop(0,rgba(sky.glow,.35));hz.addColorStop(1,rgba(sky.glow,0));ctx.fillStyle=hz;ctx.fillRect(0,VP[1]-W*.5,W,W*.5+H*.1);ctx.globalCompositeOperation='source-over';
  // World, far to near: beyond the tunnel, its exit face, inside, its entry face, before it.
  if(k>=0&&zx>NEAR&&ze<FAR){
   const zIn=Math.max(NEAR,ze);
   if(zx<FAR){roadRange(ctx,zx,FAR,vx,after.a,false);lightsRange(ctx,zx,FAR,vx,after.a);portal(ctx,zx,vx,'#040508',rgba(mix(after.a,[255,255,255],.3),.7));}
   tunnelRange(ctx,zIn,Math.min(zx,FAR),vx,colorAt);roadRange(ctx,zIn,Math.min(zx,FAR),vx,before.a,true);
   if(ze>NEAR){portal(ctx,ze,vx,'#06070a','rgba(190,196,206,.55)',{number:pad2(k+1),title:tracks[k]?.title||''});roadRange(ctx,NEAR,ze,vx,before.a,false);lightsRange(ctx,NEAR,ze,vx,before.a);}
  }else{roadRange(ctx,NEAR,FAR,vx,sky.a,false);lightsRange(ctx,NEAR,FAR,vx,sky.a);}
  // Tunnel ceiling lights wash the cabin.
  if(inside){ctx.globalCompositeOperation='lighter';const flick=.5+.5*Math.cos((d%6)/6*TAU);ctx.fillStyle=rgba(colorAt(d+8),.05+.05*flick);ctx.fillRect(0,0,W,H);ctx.globalCompositeOperation='source-over';}

  const a=scheme(i).a;
  {const sc=ctx.createLinearGradient(0,0,0,H*(portrait?.24:.34));sc.addColorStop(0,'rgba(2,3,8,.62)');sc.addColorStop(1,'rgba(2,3,8,0)');ctx.fillStyle=sc;ctx.fillRect(0,0,W,H*(portrait?.24:.34));}
  // Dashboard, ambient line, subwoofer, head unit.
  ctx.drawImage(dash,0,0);
  ctx.globalCompositeOperation='lighter';ctx.strokeStyle=rgba(a,.5);ctx.lineWidth=Math.max(1.5,u*.0025);ctx.beginPath();ctx.moveTo(0,dashY+H*.04+u*.006);ctx.bezierCurveTo(W*.3,dashY-H*.02+u*.006,W*.7,dashY-H*.025+u*.006,W,dashY+H*.03+u*.006);ctx.stroke();ctx.globalCompositeOperation='source-over';
  woofer(ctx,s.energy.low,a);
  ctx.drawImage(screen,0,0);
  {const [nx,ny,nw,nh]=L.now,p=u*.016,sz=portrait?u*.024:u*.017;
   text(ctx,'NOW PLAYING',nx+p,ny+p+sz*.5,{size:sz*.72,weight:800,color:rgba(a),baseline:'middle',spacing:.24});
   text(ctx,`${pad2(i+1)} / ${pad2(N)}`,nx+nw-p,ny+p+sz*.5,{size:sz*.72,weight:700,color:'rgba(220,228,245,.7)',baseline:'middle',align:'right',spacing:.1});
   text(ctx,`${stamp(local)}`,nx+p,ny+p+sz*2.1,{size:sz*1.5,weight:800,color:'#f4f7ff',baseline:'middle',spacing:.02});
   text(ctx,`/ ${stamp(s.duration)}`,nx+nw-p,ny+p+sz*2.2,{size:sz*.85,weight:600,color:'rgba(220,228,245,.6)',baseline:'middle',align:'right'});
   const by=ny+p+sz*3.3;ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(nx+p,by,nw-p*2,Math.max(2,u*.003));ctx.fillStyle=rgba(a);ctx.fillRect(nx+p,by,(nw-p*2)*clamp(s.progress,0,1),Math.max(2,u*.003));
   if(s.frame){const top=by+u*.012,h=ny+nh-p*.7-top;if(h>u*.02)drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:a,alpha:.9,amp:.9,x:nx+p,y:top,width:nw-p*2,height:h});}}
  {const [lx,ly,lw,lh,rowH]=L.list,{index,ease}=base.rollState(s),size=portrait?u*.027:u*.019,visible=Math.floor(lh/rowH),top=ly+(lh-visible*rowH)/2;
   roll(ctx,{x:lx+u*.012,y:top,w:lw-u*.024,h:visible*rowH,rowH,anchor:Math.floor(visible/2),index,ease,count:N,pinTop:true,fade:.18,
    highlight:(gg,x,y,w,h)=>{gg.fillStyle=rgba(a,.16);gg.beginPath();gg.roundRect(x,y+h*.08,w,h*.84,u*.005);gg.fill();gg.fillStyle=rgba(a);gg.fillRect(x,y+h*.2,Math.max(2,u*.003),h*.6);},
    row:(gg,n,x,y,w,h,em)=>trackRow(gg,items[n],x+u*.014,y,w-u*.028,h,em,{size,dim:[170,184,210],hot:[255,255,255],accent:a,dimAlpha:.55})});}

  // Badge and title, top left; the headline top right.
  badge(ctx,i,local,a);
  {const cur=titleOf(i),[tx,ty]=L.title,wipe=i>0?easeInOut((local-.1)/.6):1,lead=cur.pad,old=i>0&&wipe<1?titleOf(i-1):null;
   // The title rolls over like the badge: the old one slides up out of its slot, the new one rises in.
   const hh=Math.max(cur.fit.height,old?old.fit.height:0)+lead*.5;
   ctx.save();ctx.beginPath();ctx.rect(tx-lead,ty-lead*.25,cur.w,hh);ctx.clip();
   if(old)ctx.drawImage(old.c,tx-lead,ty-lead-wipe*hh);
   ctx.drawImage(cur.c,tx-lead,ty-lead+(1-wipe)*hh);ctx.restore();
   const sy=ty+cur.fit.height+u*.03,subA=old?clamp((wipe-.75)/.25,0,1):1;
   text(ctx,`TRACK ${pad2(i+1)} OF ${pad2(N)}   ·   NIGHT DRIVE   ·   ${stamp(s.duration)}`,tx,sy,{size:u*.017,weight:700,color:rgba(mix(a,[255,255,255],.35),.9),baseline:'middle',spacing:.22,maxWidth:portrait?u*.69:W*.4,alpha:subA});}
  if(base.headline){const [hx,hy]=L.head;if(portrait)text(ctx,base.headline,W/2,hy,{size:u*.02,weight:700,color:'rgba(235,240,255,.75)',align:'center',baseline:'middle',spacing:.2,maxWidth:u*.8});
   else{text(ctx,base.headline,hx,hy,{size:u*.02,weight:700,color:'rgba(235,240,255,.8)',align:'right',baseline:'middle',spacing:.2,maxWidth:W*.3});ctx.fillStyle=rgba(a);ctx.beginPath();ctx.arc(hx-Math.min(W*.3,(setFont(measure,700,u*.02,.2),measure.measureText(base.headline).width))-u*.02,hy,u*.006,0,TAU);ctx.fill();}}
 }
 return {draw,duration:base.total};
}

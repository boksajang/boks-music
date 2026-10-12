import {sceneBase,shadowSprite,drawShadow,drawCover,drawSpectrum,fitText,setFont,ellipsize,stamp,rgba,mix,layer,hash,random,clamp,lerp,easeOut,easeInOut} from '../canvas-kit.mjs';

/**
 * 비 오는 창가: a night window. Behind the glass the city (the chosen photo, or the album art blurred
 * into bokeh) is out of focus; the glass is fogged, beaded with still drops that each show the view
 * upside down, and drops slide down leaving clear trails. Lyrics appear as if wiped by a finger on the
 * fogged glass and fog over again; the instrumental list is written the same way. The album art stands
 * in a small frame on the sill beside a title card.
 */
const lru=(limit,make)=>{const m=new Map();return key=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make(key);m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};};

export default function rainwindow(input){
 const base=sceneBase(input,{hue:215}),{width:W,height:H,portrait,u,vocal,tracks}=base;
 const L=portrait
  ?{glass:[W*.07,H*.05,W*.86,H*.81],sill:H*.86,photo:[W*.08,H*.884,W*.36],card:[W*.49,H*.885,W*.43,H*.128],
    lyric:{x:W*.1,w:W*.8,size:u*.074,slots:[H*.25,H*.43],slotH:H*.15},spectrum:[W*.16,H*.56,W*.68,H*.07],
    list:{x:W*.13,w:W*.74,y:H*.1,rowH:H*.052,rows:8,size:u*.045}}
  :{glass:[W*.05,H*.075,W*.9,H*.785],sill:H*.86,photo:[W*.07,H*.893,H*.27],card:[W*.07+H*.31,H*.895,W*.25,H*.16],
    lyric:{x:W*.1,w:W*.8,size:u*.07,slots:[H*.27,H*.48],slotH:H*.17},spectrum:[W*.6,H*.64,W*.3,H*.12],
    list:{x:W*.22,w:W*.56,y:H*.13,rowH:H*.078,rows:6,size:u*.044}};
 const [gx,gy,gw,gh]=L.glass,measure=layer(8,8).getContext('2d'),shadow=shadowSprite(256,{alpha:.7});
 const os=Math.min(.5,640/u),ow=Math.round(W*os),oh=Math.round(H*os),fs=Math.min(1,1440/u),fw=Math.round(gw*fs),fh=Math.round(gh*fs);
 const PAL=[[255,170,82],[255,238,214],[255,86,70],[255,206,120],[150,200,255]];

 // ---- The view outside: sharp enough to read through clear glass, blurred into city bokeh.
 const outside=lru(3,key=>{
  const c=layer(ow,oh),g=c.getContext('2d'),photo=key==='bg',art=photo?null:base.art(key),src=photo?base.background:art.image,pad=ow*.08;
  g.filter=`blur(${ow*(photo?.005:.028)}px)`;drawCover(g,src,-pad,-pad,ow+pad*2,oh+pad*2);g.filter='none';
  if(!photo){
   g.fillStyle=rgba(mix(art.deep,[8,12,22],.4),.5);g.fillRect(0,0,ow,oh);
   const r=random(hash('bokeh'+key));g.globalCompositeOperation='lighter';
   for(let k=0;k<54;k++){const x=r()*ow,y=oh*(.3+r()*.68),rad=ow*(.012+r()*r()*.05),col=r()<.3?art.soft:PAL[Math.floor(r()*PAL.length)],a=.12+r()*.3,disc=g.createRadialGradient(x,y,0,x,y,rad);disc.addColorStop(0,rgba(col,a*.55));disc.addColorStop(.82,rgba(col,a));disc.addColorStop(1,rgba(col,0));g.fillStyle=disc;g.fillRect(x-rad,y-rad,rad*2,rad*2);}
   g.globalCompositeOperation='source-over';
  }else{g.fillStyle='rgba(6,10,18,.28)';g.fillRect(0,0,ow,oh);}
  g.fillStyle=`rgba(4,8,16,${clamp(((photo?.4:art.luma)-.18)*.9,0,.4)})`;g.fillRect(0,0,ow,oh);
  const grade=g.createLinearGradient(0,0,0,oh);grade.addColorStop(0,'rgba(4,8,18,.45)');grade.addColorStop(.45,'rgba(4,8,18,0)');grade.addColorStop(1,'rgba(4,8,18,.25)');g.fillStyle=grade;g.fillRect(0,0,ow,oh);
  return c;
 });
 const viewKey=i=>base.background?'bg':i;
 /** A drop acts as a small lens: the view upside down, dark rim, a highlight and a bright caustic. */
 const lens=lru(3,key=>{
  const n=96,c=layer(n,n),g=c.getContext('2d'),view=outside(key);g.beginPath();g.arc(n/2,n/2,n/2-1,0,Math.PI*2);g.clip();
  g.save();g.translate(n/2,n/2);g.scale(-1,-1);drawCover(g,view,-n*.75,-n*.75,n*1.5,n*1.5);g.restore();
  g.globalCompositeOperation='screen';g.fillStyle='rgba(96,108,126,.55)';g.fillRect(0,0,n,n);g.globalCompositeOperation='source-over';
  const rim=g.createRadialGradient(n/2,n/2,n*.25,n/2,n/2,n/2);rim.addColorStop(0,'rgba(0,0,0,0)');rim.addColorStop(.8,'rgba(10,14,22,.1)');rim.addColorStop(1,'rgba(10,14,22,.42)');g.fillStyle=rim;g.fillRect(0,0,n,n);
  const caustic=g.createRadialGradient(n*.52,n*.78,0,n*.52,n*.78,n*.32);caustic.addColorStop(0,'rgba(255,255,255,.55)');caustic.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=caustic;g.fillRect(0,0,n,n);
  g.fillStyle='rgba(255,255,255,.9)';g.beginPath();g.ellipse(n*.34,n*.3,n*.15,n*.09,-.6,0,Math.PI*2);g.fill();g.fillStyle='rgba(255,255,255,.5)';g.beginPath();g.arc(n*.6,n*.24,n*.03,0,Math.PI*2);g.fill();
  return c;
 });
 // ---- Fogged glass for a song: uneven condensation (denser low), fine stipple, and the still drops.
 const fog=lru(3,i=>{
  const key=viewKey(i),view=outside(key),drop=lens(key),c=layer(fw,fh),g=c.getContext('2d'),r=random(hash('fog'+i)),pad=fw*.06;
  g.filter=`blur(${fw*.012}px)`;g.drawImage(view,(gx/W)*ow,(gy/H)*oh,(gw/W)*ow,(gh/H)*oh,-pad,-pad,fw+pad*2,fh+pad*2);g.filter='none';
  g.globalCompositeOperation='screen';g.fillStyle='rgba(150,162,178,.62)';g.fillRect(0,0,fw,fh);g.globalCompositeOperation='source-over';
  g.fillStyle='rgba(214,222,232,.1)';g.fillRect(0,0,fw,fh);
  const mask=layer(fw,fh),m=mask.getContext('2d'),grad=m.createLinearGradient(0,0,0,fh);grad.addColorStop(0,'rgba(0,0,0,.42)');grad.addColorStop(.45,'rgba(0,0,0,.74)');grad.addColorStop(1,'rgba(0,0,0,.92)');m.fillStyle=grad;m.fillRect(0,0,fw,fh);
  for(let k=0;k<26;k++){const x=r()*fw,y=r()*fh,rad=fw*(.06+r()*.14),more=r()<.5,b=m.createRadialGradient(x,y,0,x,y,rad);b.addColorStop(0,more?'rgba(0,0,0,.25)':'rgba(0,0,0,0)');b.addColorStop(1,'rgba(0,0,0,0)');if(more){m.fillStyle=b;m.fillRect(x-rad,y-rad,rad*2,rad*2);}else{m.globalCompositeOperation='destination-out';const e=m.createRadialGradient(x,y,0,x,y,rad);e.addColorStop(0,'rgba(0,0,0,.28)');e.addColorStop(1,'rgba(0,0,0,0)');m.fillStyle=e;m.fillRect(x-rad,y-rad,rad*2,rad*2);m.globalCompositeOperation='source-over';}}
  g.globalCompositeOperation='destination-in';g.drawImage(mask,0,0);g.globalCompositeOperation='source-over';
  const dots=Math.round(fw*fh/140);for(let k=0;k<dots;k++){g.fillStyle=r()<.7?`rgba(255,255,255,${.05+r()*.12})`:`rgba(10,16,26,${.04+r()*.06})`;const s=(.6+r()*1.4)*fs*Math.max(1,u/1080);g.fillRect(r()*fw,r()*fh,s,s);}
  const count=Math.round(gw*gh/(u*u)*190);
  for(let k=0;k<count;k++){
   const x=r()*fw,y=r()*fh,rad=u*fs*(.0024+Math.pow(r(),2.2)*.009),stretch=1+r()*.18;
   g.globalCompositeOperation='destination-out';const clear=g.createRadialGradient(x,y,0,x,y,rad*2.1);clear.addColorStop(0,'rgba(0,0,0,.75)');clear.addColorStop(.5,'rgba(0,0,0,.4)');clear.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=clear;g.fillRect(x-rad*2.1,y-rad*2.1,rad*4.2,rad*4.2);
   g.globalCompositeOperation='source-over';g.drawImage(drop,x-rad,y-rad*stretch,rad*2,rad*2*stretch);
  }
  return c;
 });

 // ---- Window frame, sill and the headline on the top rail (static).
 const frame=(()=>{
  const c=layer(W,H),g=c.getContext('2d'),r=random(hash('wood')),sill=L.sill,top=sill+u*.04;
  const wood=g.createLinearGradient(0,0,W,H);wood.addColorStop(0,'#2a1d15');wood.addColorStop(.6,'#3a271b');wood.addColorStop(1,'#24180f');g.fillStyle=wood;g.fillRect(0,0,W,H);
  for(let k=0;k<Math.round(H/2.4);k++){g.fillStyle=`rgba(${r()<.5?'0,0,0':'120,84,56'},${.05+r()*.08})`;g.fillRect(0,r()*H,W,.8+r()*1.6);}
  // Sill: top surface catching the lamp, front edge, front face.
  const surface=g.createLinearGradient(0,sill,0,top);surface.addColorStop(0,'#5a3f2c');surface.addColorStop(1,'#6e4f37');g.fillStyle=surface;g.fillRect(0,sill,W,top-sill);
  for(let k=0;k<40;k++){g.fillStyle=`rgba(${r()<.5?'30,18,10':'150,112,80'},${.08+r()*.1})`;g.fillRect(0,sill+r()*(top-sill),W,.8+r());}
  g.fillStyle='rgba(255,214,170,.28)';g.fillRect(0,top-1,W,Math.max(1.5,u*.002));
  const face=g.createLinearGradient(0,top,0,H);face.addColorStop(0,'#2e2017');face.addColorStop(1,'#120c08');g.fillStyle=face;g.fillRect(0,top,W,H-top);
  const lampLight=g.createRadialGradient(W*.8,sill,0,W*.8,sill,u*.9);lampLight.addColorStop(0,'rgba(255,190,120,.16)');lampLight.addColorStop(1,'rgba(255,190,120,0)');g.fillStyle=lampLight;g.fillRect(0,0,W,H);
  // Bevel around the glass.
  const b=u*.012;g.fillStyle='rgba(0,0,0,.45)';g.fillRect(gx-b,gy-b,gw+b*2,gh+b*2);g.fillStyle='#4a3324';g.fillRect(gx-b*.6,gy-b*.6,gw+b*1.2,gh+b*1.2);
  g.fillStyle='rgba(255,220,180,.16)';g.fillRect(gx-b,gy+gh+b*.4,gw+b*2,Math.max(1,b*.3));
  g.clearRect(gx,gy,gw,gh);
  // Glass edge: shadow from the frame on the glass.
  const edge=u*.03;for(const [x,y,w,h,x2,y2] of [[gx,gy,gw,edge,gx,gy+edge],[gx,gy+gh-edge*.6,gw,edge*.6,gx,gy+gh],[gx,gy,edge*.8,gh,gx+edge*.8,gy],[gx+gw-edge*.8,gy,edge*.8,gh,gx+gw,gy]]){const sh=g.createLinearGradient(x,y,x2,y2);const back=x2<x||y2<y||(x2===gx+gw)||(y2===gy+gh);sh.addColorStop(back?1:0,'rgba(0,0,0,.42)');sh.addColorStop(back?0:1,'rgba(0,0,0,0)');g.fillStyle=sh;g.fillRect(x,y,w,h);}
  if(base.headline){const size=u*(portrait?.022:.02),cy=gy/2+(portrait?u*.004:u*.002);setFont(g,700,size,.32);g.textAlign='center';g.textBaseline='middle';const label=ellipsize(g,base.headline,W*.7);g.fillStyle='rgba(0,0,0,.55)';g.fillText(label,W/2,cy+size*.07);g.fillStyle='rgba(240,222,196,.82)';g.fillText(label,W/2,cy);}
  return c;
 })();
 const photoFrame=lru(3,i=>{
  const s=Math.round(L.photo[2]),c=layer(s,s),g=c.getContext('2d'),f=s*.075,mat=s*.07;
  const wood=g.createLinearGradient(0,0,s,s);wood.addColorStop(0,'#1d1814');wood.addColorStop(1,'#0c0a08');g.fillStyle=wood;g.fillRect(0,0,s,s);
  g.fillStyle='rgba(255,220,180,.18)';g.fillRect(0,0,s,Math.max(1,s*.006));g.fillRect(s-Math.max(1,s*.006),0,Math.max(1,s*.006),s);
  g.fillStyle='#ede8de';g.fillRect(f,f,s-f*2,s-f*2);g.fillStyle='rgba(0,0,0,.2)';g.fillRect(f,f,s-f*2,s*.008);
  drawCover(g,base.art(i).image,f+mat,f+mat,s-(f+mat)*2,s-(f+mat)*2);
  const glint=g.createLinearGradient(0,0,s,s);glint.addColorStop(0,'rgba(255,255,255,0)');glint.addColorStop(.32,'rgba(255,255,255,0)');glint.addColorStop(.38,'rgba(255,255,255,.14)');glint.addColorStop(.5,'rgba(255,255,255,0)');g.fillStyle=glint;g.fillRect(f,f,s-f*2,s-f*2);
  const warm=g.createLinearGradient(0,0,s,0);warm.addColorStop(0,'rgba(0,0,0,.18)');warm.addColorStop(1,'rgba(255,190,120,.08)');g.fillStyle=warm;g.fillRect(0,0,s,s);
  return c;
 });

 // ---- Finger writing on the fog: soft white masks per line (plus a halo of gathered water).
 const LY=L.lyric,regionY=LY.slots[0]-LY.slotH/2,regionH=LY.slots[1]-LY.slots[0]+LY.slotH,LW=Math.round(LY.w),LH=Math.round(LY.slotH);
 const tmp=layer(LW,Math.ceil(regionH)),tg=tmp.getContext('2d');
 const writeMask=(w,h,paint)=>{const c=layer(w,h),g=c.getContext('2d'),halo=layer(w,h),hg=halo.getContext('2d');g.filter=`blur(${Math.max(.6,u*.0018)}px)`;paint(g,1);g.filter='none';hg.filter=`blur(${u*.008}px)`;paint(hg,1.9);hg.filter='none';return {c,halo};};
 const lineMask=lru(8,key=>{
  const [i,n]=key.split(':').map(Number),cue=tracks[i].cues[n],block=fitText(measure,cue?.text||'',{size:LY.size,minSize:LY.size*.6,weight:800,lineHeight:1.12,maxWidth:LW*.92,maxHeight:LH*.94,spacing:-.01,maxLines:2});
  setFont(measure,block.weight,block.font,block.spacing);const lines=block.lines.map((t,k)=>{const w=measure.measureText(t).width,y=LH/2+(k-(block.lines.length-1)/2)*block.font*block.lineHeight;return {t,w,x0:LW/2-w/2,y};});
  const r=random(hash('drip'+key)),drips=[];for(let k=0;k<2+Math.floor(r()*2);k++){const ln=lines[lines.length-1];drips.push({x:ln.x0+ln.w*(.1+r()*.8),y:ln.y+block.font*.3,len:block.font*(.22+r()*.5),delay:.5+r()*1.6,w:block.font*(.03+r()*.02)});}
  const paint=(g,grow)=>{setFont(g,block.weight,block.font,block.spacing);g.textAlign='center';g.textBaseline='middle';g.fillStyle='#fff';g.strokeStyle='#fff';g.lineJoin='round';g.lineWidth=block.font*.07*grow;lines.forEach(l=>{g.fillText(l.t,LW/2,l.y);g.strokeText(l.t,LW/2,l.y);});};
  return {...writeMask(LW,LH,paint),lines,drips,font:block.font};
 });
 const LI=L.list,listW=Math.round(LI.w),listH=Math.round(LI.rowH*LI.rows),listTmp=vocal?null:layer(listW,listH),lt=listTmp?.getContext('2d');
 const listMask=lru(2,p=>{
  const rows=[];for(let n=p*LI.rows;n<Math.min(tracks.length,(p+1)*LI.rows);n++){const y=(n-p*LI.rows+.5)*LI.rowH;setFont(measure,800,LI.size,0);const title=ellipsize(measure,tracks[n].title||'',listW-LI.size*2.6);rows.push({n,y,title,w:LI.size*2.4+measure.measureText(title).width});}
  const paint=(g,grow)=>{g.fillStyle='#fff';g.strokeStyle='#fff';g.lineJoin='round';g.textBaseline='middle';rows.forEach(row=>{setFont(g,800,LI.size*.82,.02);g.lineWidth=LI.size*.06*grow;g.textAlign='left';const num=String(row.n+1).padStart(2,'0');g.fillText(num,0,row.y);g.strokeText(num,0,row.y);setFont(g,800,LI.size,0);g.fillText(row.title,LI.size*2.4,row.y);g.strokeText(row.title,LI.size*2.4,row.y);});};
  return {...writeMask(listW,listH,paint),rows};
 });
 const spec=layer(Math.max(8,Math.round(L.spectrum[2]/3)),Math.max(8,Math.round(L.spectrum[3]/3))),sg=spec.getContext('2d'),specTmp=layer(L.spectrum[2],L.spectrum[3]),st=specTmp.getContext('2d');

 // Slide-down drops: lanes with deterministic, stop-and-go runs that leave clearing trails.
 const LANES=portrait?6:9,lanes=Array.from({length:LANES},(_,l)=>{const r=random(hash('lane'+l));return {x:gx+gw*(l+.12+r()*.76)/LANES,period:6+r()*7,phase:r()*13};});

 function draw(ctx,time){
  const s=base.at(time),{i,local,energy}=s,art=base.art(i),t=s.t;
  // View outside with a slow drift.
  const z=1.05+Math.sin(t*.021)*.025,vw=W*z,vh=H*z,vx=(W-vw)/2+Math.sin(t*.017)*W*.012,vy=(H-vh)/2+Math.cos(t*.013)*H*.01;
  const view=outside(viewKey(i)),fade=i>0&&s.enter<1?1-s.enter:0;
  ctx.drawImage(view,vx,vy,vw,vh);if(fade&&!base.background){ctx.globalAlpha=fade;ctx.drawImage(outside(i-1),vx,vy,vw,vh);ctx.globalAlpha=1;}
  // Lamp reflection on the glass (light only; breathes a little with the music).
  ctx.globalCompositeOperation='screen';const lamp=ctx.createRadialGradient(gx+gw*.82,gy+gh*.2,0,gx+gw*.82,gy+gh*.2,u*.55);lamp.addColorStop(0,`rgba(255,196,130,${.1+energy.level*.06})`);lamp.addColorStop(1,'rgba(255,196,130,0)');ctx.fillStyle=lamp;ctx.fillRect(gx,gy,gw,gh);ctx.globalCompositeOperation='source-over';
  ctx.drawImage(fog(i),gx,gy,gw,gh);if(fade){ctx.globalAlpha=fade;ctx.drawImage(fog(i-1),gx,gy,gw,gh);ctx.globalAlpha=1;}
  const toView=(dx,dy)=>[(dx-vx)/vw*ow,(dy-vy)/vh*oh];
  /** Puts the outside view into the white parts of a scratch canvas placed at (x,y), then draws it. */
  const reveal=(g,c,x,y)=>{g.globalCompositeOperation='source-in';const [sx,sy]=toView(x,y);g.drawImage(view,sx,sy,c.width/vw*ow,c.height/vh*oh,0,0,c.width,c.height);g.globalCompositeOperation='source-over';ctx.drawImage(c,x,y);};
  // Lyrics wiped on the glass: the current line written in, the previous one fogging over again.
  if(vocal){
   const cues=s.track.cues||[],{index}=base.rollState(s),show=Math.min(s.exit,easeOut(local/.6));tg.clearRect(0,0,tmp.width,tmp.height);
   const items=[];
   for(const n of [index-2,index-1,index]){if(n<0||!Number.isFinite(cues[n]?.start))continue;const start=cues[n].start,nextStart=cues[n+1]?.start,slot=n%2;
    let alpha=1;if(n<index){const since=local-(cues[n+1]?.start??local);alpha=1-easeInOut(since/3.6);if(n===index-2)alpha*=1-clamp((local-cues[index].start)/.3,0,1);}
    alpha*=show;if(alpha<=.01)continue;const dur=clamp(((nextStart??start+4)-start)*.3,.45,1.2),written=clamp((local-start)/dur,0,1);items.push({n,slot,alpha,written,start});}
   for(const it of items){const m=lineMask(`${i}:${it.n}`),y=LY.slots[it.slot]-LH/2-regionY,total=m.lines.reduce((a,l)=>a+l.w,0);
    let budget=it.written*total+(it.written<1?0:LW);tg.save();tg.beginPath();
    m.lines.forEach(l=>{const w=Math.min(l.w+m.font*.2,Math.max(0,budget));budget-=l.w;if(w>0)tg.rect(l.x0-m.font*.1,y+l.y-m.font*.75,w+m.font*.1,m.font*1.5);});
    tg.clip();tg.globalAlpha=it.alpha;tg.drawImage(m.c,0,y);tg.restore();
    ctx.save();ctx.globalAlpha=it.alpha*.32;ctx.beginPath();budget=it.written*total+(it.written<1?0:LW);m.lines.forEach(l=>{const w=Math.min(l.w+m.font*.3,Math.max(0,budget));budget-=l.w;if(w>0)ctx.rect(LY.x+l.x0-m.font*.25,LY.slots[it.slot]-LH/2+l.y-m.font*.9,w+m.font*.3,m.font*1.8);});ctx.clip();ctx.drawImage(m.halo,LY.x,LY.slots[it.slot]-LH/2);ctx.restore();
    if(it.written>=1){tg.globalAlpha=it.alpha;tg.fillStyle='#fff';for(const d of m.drips){const len=d.len*easeOut((local-it.start-d.delay)/2.4);if(len<=0)continue;tg.beginPath();tg.roundRect(d.x-d.w/2,y+d.y,d.w,len,d.w/2);tg.fill();tg.beginPath();tg.arc(d.x,y+d.y+len,d.w*.9,0,Math.PI*2);tg.fill();}tg.globalAlpha=1;}
   }
   if(items.length)reveal(tg,tmp,LY.x,regionY);
  }else{
   const page=Math.floor(i/LI.rows),m=listMask(page),pageStart=i%LI.rows===0||i===0,lx=LI.x,ly=LI.y;lt.clearRect(0,0,listW,listH);
   m.rows.forEach((row,k)=>{const hot=row.n===i,wiped=pageStart?easeOut((local-.2-k*.28)/.7):1,a=(hot?1:.4)*Math.min(s.exit*.6+.4,1);if(wiped<=0)return;
    lt.save();lt.beginPath();lt.rect(0,row.y-LI.rowH/2,row.w*wiped+LI.size*.2,LI.rowH);lt.clip();lt.globalAlpha=a;lt.drawImage(m.c,0,0);lt.restore();
    ctx.save();ctx.beginPath();ctx.rect(lx-LI.size*.3,ly+row.y-LI.rowH/2,row.w*wiped+LI.size*.6,LI.rowH);ctx.clip();ctx.globalAlpha=.28*a;ctx.drawImage(m.halo,lx,ly);ctx.restore();});
   const cur=m.rows.find(row=>row.n===i);if(cur){const k=easeOut((local-.6)/1.1),y=cur.y+LI.size*.78;lt.strokeStyle='#fff';lt.lineWidth=LI.size*.12;lt.lineCap='round';lt.beginPath();for(let x=0;x<=cur.w*k;x+=LI.size*.25){const yy=y+Math.sin(x/LI.size*2.3)*LI.size*.06;x?lt.lineTo(x,yy):lt.moveTo(x,yy);}lt.stroke();}
   reveal(lt,listTmp,lx,ly);
  }
  // The measured spectrum, wiped on the glass with a fingertip (soft, wide strokes).
  if(s.frame&&s.show>.05){const [sx,sy,sw,sh]=L.spectrum;sg.clearRect(0,0,spec.width,spec.height);drawSpectrum(sg,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:'mono',tint:[255,255,255],alpha:1,amp:.9,x:0,y:0,width:spec.width,height:spec.height});
   st.clearRect(0,0,specTmp.width,specTmp.height);st.globalAlpha=.85*s.show;st.drawImage(spec,0,0,specTmp.width,specTmp.height);st.globalAlpha=1;reveal(st,specTmp,sx,sy);
   if(base.options.color!=='mono')drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,alpha:.35,amp:.9,x:sx,y:sy,width:sw,height:sh});}
  // Sliding drops and their trails.
  const drop=lens(viewKey(i));ctx.save();ctx.beginPath();ctx.rect(gx,gy,gw,gh);ctx.clip();
  for(const lane of lanes){const kk=Math.floor((t+lane.phase)/lane.period);
   for(let k=kk-2;k<=kk;k++){const tt=t-(k*lane.period-lane.phase);if(tt<0)continue;const r=random(hash(`${lane.x|0}:${k}`)),dur=2.4+r()*2.6,y0=gy+gh*r()*.5,len=(gy+gh*1.05-y0)*(.45+r()*.55),rad=u*(.0055+r()*.004),x0=lane.x+(r()-.5)*gw*.04;if(tt>dur+6)continue;
    const p=clamp(tt/dur,0,1),q=clamp(p+Math.sin(p*25)/25,0,1),y=y0+len*Math.pow(q,1.35),xAt=yy=>x0+Math.sin((yy-y0)/u*9+k)*u*.003;
    const segs=6;for(let j=0;j<segs;j++){const a1=y0+(y-y0)*j/segs,a2=y0+(y-y0)*(j+1)/segs;if(a2-a1<1)continue;const mid=(a1+a2)/2,passed=dur*Math.pow(clamp((mid-y0)/len,0,1),1/1.35),alpha=clamp(1-(tt-passed)/5.5,0,1)*.55;if(alpha<=0)continue;
     const w=rad*.8,x=xAt(mid),[sx,sy]=toView(x-w/2,a1);ctx.globalAlpha=alpha;ctx.drawImage(view,sx,sy,w/vw*ow,(a2-a1)/vh*oh,x-w/2,a1,w,a2-a1);
     const bead=rad*.36,by=a1+(a2-a1)*.5;ctx.drawImage(drop,xAt(by)-bead+(j%2?rad*.3:-rad*.3),by-bead,bead*2,bead*2);}
    const life=p<1?1:clamp(1-(tt-dur)/5.5,0,1);if(life>0){ctx.globalAlpha=life;const hx=xAt(y);ctx.drawImage(drop,hx-rad*1.1,y-rad*1.5,rad*2.2,rad*2.8);}
    ctx.globalAlpha=1;}}
  ctx.restore();
  // Frame, sill, and what stands on the sill.
  ctx.drawImage(frame,0,0);
  const [fx,fb,fsz]=L.photo,fy=fb-fsz;drawShadow(ctx,shadow,fx,fy,fsz,fsz,{alpha:.75,offsetY:.04,spread:1.1});ctx.drawImage(photoFrame(i),fx,fy,fsz,fsz);
  if(fade){ctx.globalAlpha=fade;ctx.drawImage(photoFrame(i-1),fx,fy,fsz,fsz);ctx.globalAlpha=1;}
  ctx.fillStyle='rgba(0,0,0,.4)';ctx.fillRect(fx+fsz*.03,fb,fsz*.94,u*.004);
  const [cx,cb,cw,ch]=L.card;ctx.save();ctx.translate(cx,cb);ctx.rotate(-.02);ctx.translate(0,-ch);
  drawShadow(ctx,shadow,0,0,cw,ch,{alpha:.6,offsetY:.05,spread:1.08});
  const paper=ctx.createLinearGradient(0,0,cw,ch);paper.addColorStop(0,'#efe6d6');paper.addColorStop(1,'#d9cdb8');ctx.fillStyle=paper;ctx.fillRect(0,0,cw,ch);
  const shade=ctx.createLinearGradient(0,0,cw,0);shade.addColorStop(0,'rgba(0,0,0,.2)');shade.addColorStop(1,'rgba(255,200,140,.05)');ctx.fillStyle=shade;ctx.fillRect(0,0,cw,ch);
  const pad=cw*.07,ink='#2a2420';setFont(ctx,700,u*.016,.2);ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillStyle=rgba(mix(art.accent,[90,40,30],.45));ctx.fillText(`${String(i+1).padStart(2,'0')} / ${String(tracks.length).padStart(2,'0')}`,pad,pad+u*.016);
  const title=fitText(ctx,s.track.title||'',{size:u*.032,minSize:u*.022,weight:800,lineHeight:1.15,maxWidth:cw-pad*2,maxHeight:ch*.44,spacing:-.02,maxLines:2});
  setFont(ctx,title.weight,title.font,title.spacing);ctx.fillStyle=ink;ctx.textBaseline='top';title.lines.forEach((l,k)=>ctx.fillText(l,pad,pad+u*.03+k*title.font*title.lineHeight));
  const by=ch-pad*.95;ctx.fillStyle='rgba(42,36,32,.18)';ctx.fillRect(pad,by,cw-pad*2,Math.max(1,u*.002));ctx.fillStyle=ink;ctx.fillRect(pad,by-u*.0006,(cw-pad*2)*s.progress,Math.max(1.5,u*.0032));
  setFont(ctx,600,u*.014,.04);ctx.textBaseline='alphabetic';ctx.fillStyle='rgba(42,36,32,.7)';ctx.fillText(stamp(local),pad,by-u*.012);ctx.textAlign='right';ctx.fillText(stamp(s.duration),cw-pad,by-u*.012);
  ctx.restore();
  const v=ctx.createRadialGradient(W/2,H*.45,u*.4,W/2,H*.45,Math.hypot(W,H)*.58);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,.4)');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
 }
 return {draw,duration:base.total};
}

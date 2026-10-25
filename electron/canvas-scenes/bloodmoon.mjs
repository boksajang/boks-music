import {sceneBase,drawSpectrum,text,fitText,setFont,stamp,rgba,mix,layer,hash,random,clamp,lerp,easeOut,easeInOut,radialGlow,createRoll} from '../canvas-kit.mjs';

/**
 * 블러드 문: a total lunar eclipse over a crimson night. Thin coronal streamers around the dark red moon
 * turn slowly against each other, and a ring of fine rays (the chosen circular spectrum) reaches out
 * from the limb with the music. Dead branches and spires stand black below. Each lyric line is cut
 * open by a red blade sweeping across it and, when the next line comes, cracks in two and falls apart.
 * Every song change is an eclipse cycle: the shadow slides off the pale moon and a new one slides in.
 * Instrumental videos show the playlist as a numbered rite in Roman numerals.
 */
const TAU=Math.PI*2;
const RADIAL=['ring','radial-bars','double-ring','radial-dots','ellipse'];
const BONE=[236,224,212],CRIMSON=[214,30,34],EMBER=[255,92,60];
function lru(limit){const m=new Map();return (key,make)=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make();m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};}
function roman(n){let out='';for(const [v,s] of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']])while(n>=v){out+=s;n-=v;}return out;}

export default function bloodmoon(input){
 const base=sceneBase(input,{hue:356}),{width:W,height:H,portrait,u,vocal,tracks}=base,N=tracks.length;
 const L=portrait
  ?{moon:vocal?[W/2,H*.255,u*.235]:[W/2,H*.205,u*.2],ground:H*(vocal?.82:.875),hill:vocal?1:.55,textX:W/2,align:'center',textW:u*.86,lyricY:H*.6,lyric:u*.084,head:[W/2,H*.05],info:[W/2,H*.948],
    title:[H*.455,u*.064,H*.095],time:H*.595,list:[u*.08,H*.622,u*.84,H*.195],rowH:H*.034}
  :{moon:[W*.7,H*.4,H*.17],ground:H*.84,hill:1,textX:W*.07,align:'left',textW:W*.45,lyricY:H*.46,lyric:u*.074,head:[W*.07,H*.1],info:[W*.07,H*.925],
    title:[H*.2,u*.06,H*.17],time:H*.425,list:[W*.07,H*.46,W*.43,H*.35],rowH:H*.05};
 const [mx,my,R]=L.moon,measure=layer(8,8).getContext('2d');

 // ---- Sky, clouds, silhouettes, grain (painted once) -----------------------------------------------
 const sky=layer(W,H);{const g=sky.getContext('2d'),f=g.createLinearGradient(0,0,0,H);f.addColorStop(0,'#070103');f.addColorStop(.45,'#1a0407');f.addColorStop(.78,'#3a080b');f.addColorStop(1,'#12020a');g.fillStyle=f;g.fillRect(0,0,W,H);
  radialGlow(g,mx,my,R*6,[120,14,18],.32);
  const mist=g.createLinearGradient(0,L.ground-H*.2,0,L.ground);mist.addColorStop(0,'rgba(150,24,24,0)');mist.addColorStop(1,'rgba(150,30,26,.28)');g.fillStyle=mist;g.fillRect(0,L.ground-H*.2,W,H*.2);}
 const clouds=[0,1].map(n=>{const cw=Math.ceil(W*1.6),ch=Math.ceil(H*.7),c=layer(cw,ch),g=c.getContext('2d'),r=random(hash(`cloud${n}`));g.filter=`blur(${u*.012}px)`;
  for(let k=0;k<70;k++){const x=r()*cw,y=ch*(.15+r()*.75),rx=u*(.08+r()*.25),ry=rx*(.08+r()*.12),a=(n?.05:.09)+r()*.12;const draw=xx=>{g.fillStyle=`rgba(${n?60:20},${n?8:4},${n?10:6},${a})`;g.beginPath();g.ellipse(xx,y,rx,ry,0,0,TAU);g.fill();};draw(x);if(x+rx>cw)draw(x-cw);if(x-rx<0)draw(x+cw);}
  g.filter='none';return c;});
 const ground=layer(W,H);{
  const g=ground.getContext('2d'),r=random(hash('ground')),ink='#040103',gy=L.ground;g.fillStyle=ink;
  g.beginPath();g.moveTo(0,H);for(let x=0;x<=W;x+=W/60){g.lineTo(x,gy+Math.sin(x/W*5.3)*H*.012+Math.sin(x/W*13+1)*H*.006);}g.lineTo(W,H);g.fill();
  const branch=(x,y,a,len,w,depth)=>{const x2=x+Math.cos(a)*len,y2=y+Math.sin(a)*len,bend=(r()-.5)*len*.3;g.lineWidth=w;g.lineCap='round';g.strokeStyle=ink;g.beginPath();g.moveTo(x,y);g.quadraticCurveTo((x+x2)/2+bend,(y+y2)/2+bend*.4,x2,y2);g.stroke();
   if(depth<=0||len<u*.008)return;const n=depth>3?2:2+(r()<.4?1:0);for(let k=0;k<n;k++)branch(x2,y2,a+(r()-.5)*1.15+(k-(n-1)/2)*.5,len*(.62+r()*.2),w*.62,depth-1);};
  const spire=(x,base,h,w)=>{g.beginPath();g.moveTo(x-w/2,base);g.lineTo(x-w/2,base-h*.55);g.lineTo(x-w*.32,base-h*.62);g.lineTo(x,base-h);g.lineTo(x+w*.32,base-h*.62);g.lineTo(x+w/2,base-h*.55);g.lineTo(x+w/2,base);g.fill();
   g.fillRect(x-w*.03,base-h-h*.08,w*.06,h*.1);g.fillRect(x-w*.12,base-h-h*.055,w*.24,h*.018);
   for(const s of [-1,1]){g.beginPath();g.moveTo(x+s*w*.5,base-h*.5);g.lineTo(x+s*w*.62,base-h*.66);g.lineTo(x+s*w*.62,base-h*.5);g.fill();}};
  const cross=(x,base,h)=>{g.fillRect(x-h*.06,base-h,h*.12,h);g.fillRect(x-h*.3,base-h*.78,h*.6,h*.11);};
  if(portrait){
   const k=L.hill;spire(W*.12,gy+H*.01,H*.1*k,u*.065*k);spire(W*.25,gy+H*.01,H*.065*k,u*.045*k);spire(W*.89,gy+H*.01,H*.11*k,u*.075*k);
   branch(W*.66,gy+H*.01,-Math.PI/2-.25,H*.045*k,u*.028*k,6);branch(W*.42,gy+H*.01,-Math.PI/2+.3,H*.028*k,u*.016*k,5);
   for(let k=0;k<6;k++)cross(W*(.33+k*.07),gy+H*.006+r()*H*.006,H*(.016+r()*.012));
  }else{
   for(let k=0;k<9;k++)cross(W*(.06+k*.045+r()*.01),gy+H*.008+r()*H*.006,H*(.025+r()*.02));
   spire(W*.93,gy+H*.01,H*.36,u*.08);spire(W*.86,gy+H*.01,H*.24,u*.06);
   branch(W*.62,gy+H*.01,-Math.PI/2-.2,H*.13,u*.03,7);branch(W*.79,gy+H*.01,-Math.PI/2+.25,H*.08,u*.02,6);
  }
  // Vignette and the dark top edge, over everything.
  const v=g.createRadialGradient(W/2,H*.45,u*.3,W/2,H*.45,Math.hypot(W,H)*.6);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,.62)');g.fillStyle=v;g.fillRect(0,0,W,H);
 }
 const grain=layer(Math.ceil(W/2),Math.ceil(H/2));{const g=grain.getContext('2d'),r=random(hash('grain')),n=grain.width*grain.height/9;for(let k=0;k<n;k++){const v=r();g.fillStyle=v<.5?`rgba(0,0,0,${.35+v*.5})`:`rgba(255,220,210,${(v-.5)*.35})`;g.fillRect(r()*grain.width,r()*grain.height,1,1);}}

 // ---- Moon faces and corona -----------------------------------------------------------------------
 function moonFace(blood){
  const s=Math.ceil(R*2),c=layer(s,s),g=c.getContext('2d'),r=random(hash('moon'));g.beginPath();g.arc(R,R,R,0,TAU);g.clip();
  const f=g.createRadialGradient(R*.7,R*1.35,0,R,R,R*1.15);if(blood){f.addColorStop(0,'#8a1c10');f.addColorStop(.5,'#4a0b08');f.addColorStop(1,'#1a0304');}else{f.addColorStop(0,'#e8dccb');f.addColorStop(.6,'#bfae9c');f.addColorStop(1,'#7a6a60');}
  g.fillStyle=f;g.fillRect(0,0,s,s);
  for(let k=0;k<22;k++){const x=R+(r()-.5)*R*1.5,y=R+(r()-.5)*R*1.5,rad=R*(.08+r()*.3),m=g.createRadialGradient(x,y,0,x,y,rad);m.addColorStop(0,blood?'rgba(10,0,0,.35)':'rgba(70,60,58,.32)');m.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=m;g.fillRect(x-rad,y-rad,rad*2,rad*2);}
  for(let k=0;k<40;k++){const x=R+(r()-.5)*R*1.9,y=R+(r()-.5)*R*1.9,rad=R*(.008+Math.pow(r(),3)*.06);g.strokeStyle=blood?'rgba(255,120,90,.06)':'rgba(255,250,240,.1)';g.lineWidth=Math.max(1,rad*.25);g.beginPath();g.arc(x,y,rad,.6,3.6);g.stroke();g.strokeStyle='rgba(0,0,0,.1)';g.beginPath();g.arc(x,y,rad,3.6,6.9);g.stroke();}
  const limb=g.createRadialGradient(R,R,R*.7,R,R,R);limb.addColorStop(0,'rgba(0,0,0,0)');limb.addColorStop(1,blood?'rgba(0,0,0,.5)':'rgba(40,30,30,.35)');g.fillStyle=limb;g.fillRect(0,0,s,s);
  if(blood){g.strokeStyle='rgba(255,110,70,.4)';g.lineWidth=R*.025;g.beginPath();g.arc(R,R,R*.99,Math.PI*.45,Math.PI*1.1);g.stroke();}
  return c;
 }
 const faces={blood:moonFace(true),pale:moonFace(false)};
 // Streamers: fine curved filaments, denser toward two opposite lobes, like a real corona.
 const CS=Math.ceil(R*5),corona=layer(CS,CS);{const g=corona.getContext('2d'),r=random(hash('corona')),c=CS/2;g.globalCompositeOperation='lighter';g.lineCap='round';
  const halo=g.createRadialGradient(c,c,R*.95,c,c,R*1.9);halo.addColorStop(0,'rgba(255,90,60,.5)');halo.addColorStop(.25,'rgba(200,30,30,.22)');halo.addColorStop(1,'rgba(120,10,20,0)');g.fillStyle=halo;g.fillRect(0,0,CS,CS);
  for(let k=0;k<520;k++){const lobe=r()<.65,a=lobe?(r()<.5?.3:Math.PI+.3)+(r()+r()-1)*.9:r()*TAU,len=R*(.15+Math.pow(r(),lobe?1.4:2.6)*(lobe?1.35:.7)),r0=R*(.97+r()*.04),curl=(r()-.5)*.35,w=R*(.002+r()*.006);
   const x0=c+Math.cos(a)*r0,y0=c+Math.sin(a)*r0,x1=c+Math.cos(a+curl)*(r0+len),y1=c+Math.sin(a+curl)*(r0+len),cx=c+Math.cos(a+curl*.2)*(r0+len*.55),cy=c+Math.sin(a+curl*.2)*(r0+len*.55);
   const gr=g.createLinearGradient(x0,y0,x1,y1);gr.addColorStop(0,`rgba(255,${120+r()*80|0},${70+r()*40|0},${.22+r()*.3})`);gr.addColorStop(1,'rgba(160,10,20,0)');g.strokeStyle=gr;g.lineWidth=w;g.beginPath();g.moveTo(x0,y0);g.quadraticCurveTo(cx,cy,x1,y1);g.stroke();}}

 // ---- Lyric blocks: bone-white type with a crimson aura and a blade rule under it -----------------
 const blocks=lru(8);
 function block(key,value,{size,weight,spacing,maxLines,width=L.textW}){return blocks(key,()=>{
  const fit=fitText(measure,value||' ',{size,minSize:size*.42,weight,lineHeight:1.26,maxWidth:width,maxHeight:size*1.26*maxLines,spacing,maxLines});
  const pad=Math.ceil(fit.font*.7),lh=fit.font*fit.lineHeight;setFont(measure,weight,fit.font,spacing);let tw=0;for(const line of fit.lines)tw=Math.max(tw,measure.measureText(line).width);
  const w=Math.ceil(tw+pad*2),h=Math.ceil(fit.lines.length*lh+pad*2),ax=L.align==='center'?w/2:pad;
  const put=(g,col,dx=0,dy=0)=>{setFont(g,weight,fit.font,spacing);g.textAlign=L.align;g.textBaseline='middle';g.fillStyle=col;fit.lines.forEach((line,n)=>g.fillText(line,ax+dx,pad+lh*(n+.5)+dy));};
  const c=layer(w,h),g=c.getContext('2d');g.filter=`blur(${fit.font*.16}px)`;put(g,'rgba(0,0,0,.9)',0,fit.font*.05);put(g,rgba(CRIMSON,.75));g.filter='none';
  put(g,rgba(BONE));const shade=g.createLinearGradient(0,pad,0,h-pad);shade.addColorStop(0,'rgba(255,255,255,0)');shade.addColorStop(1,'rgba(160,40,40,.35)');g.globalCompositeOperation='source-atop';g.fillStyle=shade;g.fillRect(0,0,w,h);
  // A jagged crack across the middle, used when the line breaks apart.
  const r=random(hash('crack'+key)),crack=[];for(let k=0;k<=16;k++)crack.push([w*k/16,h/2+(r()-.5)*fit.font*.55]);
  return {c,w,h,pad,ax,tw,crack};});}
 const lineBlock=(i,n)=>block(`l${i}:${n}`,tracks[i].cues[n].text,{size:L.lyric,weight:700,spacing:.06,maxLines:3});
 const titleBlock=i=>block(`t${i}`,tracks[i].title,vocal?{size:L.lyric*1.15,weight:300,spacing:.12,maxLines:2}:{size:L.title[1],weight:300,spacing:.1,maxLines:2});
 // x of the block's left edge so its text sits at L.textX (left or centered).
 const leftOf=b=>L.align==='center'?L.textX-b.w/2:L.textX-b.pad;
 function blade(ctx,x,y0,y1,a){if(a<=0)return;ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';const sk=(y1-y0)*.3;
  for(const [w,col,al] of [[u*.018,CRIMSON,.18],[u*.007,EMBER,.55],[u*.0022,[255,236,226],1]]){ctx.strokeStyle=rgba(col,al*a);ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x+sk/2,y0);ctx.lineTo(x-sk/2,y1);ctx.stroke();}ctx.restore();}
 /** Reveal: the block is uncovered behind a slanted blade sweeping left to right. */
 function slashIn(ctx,b,x,cy,age,dim=1){
  const y=cy-b.h/2,p=easeInOut(age/.38),sk=b.h*.3,edge=lerp(-sk,b.w+sk,p);
  ctx.save();ctx.globalAlpha=dim;
  if(p<1){ctx.beginPath();ctx.moveTo(x-sk,y);ctx.lineTo(x+edge+sk/2,y);ctx.lineTo(x+edge-sk/2,y+b.h);ctx.lineTo(x-sk,y+b.h);ctx.closePath();ctx.clip();}
  ctx.drawImage(b.c,x,y);ctx.restore();
  if(p<1)blade(ctx,x+edge,y-b.h*.05,y+b.h*1.05,clamp(age/.05,0,1));
  // The cut leaves a red line glowing under the text for a moment.
  const glow=clamp(1-(age-.3)/.9,0,1);if(glow>0){const ly=y+b.h-b.pad*.55,x0=L.align==='center'?x+b.w/2-b.tw/2:x+b.pad,len=b.tw*Math.min(1,p);ctx.fillStyle=rgba(EMBER,.8*glow*dim);ctx.fillRect(x0,ly,len,Math.max(1,u*.0018));}
 }
 /** Exit: the block cracks along its seam; the halves slide apart and fade. */
 function crackOut(ctx,b,x,cy,age){
  const p=easeOut(age/.55),y=cy-b.h/2;if(p>=1)return;
  for(const half of [-1,1]){ctx.save();ctx.translate(x+half*p*u*.03,y+half*p*b.h*.22);ctx.rotate(half*p*.025);ctx.beginPath();ctx.moveTo(0,half<0?0:b.h);b.crack.forEach(([cx,cy2])=>ctx.lineTo(cx,cy2));ctx.lineTo(b.w,half<0?0:b.h);ctx.closePath();ctx.clip();ctx.globalAlpha=(1-p)*(1-p);ctx.drawImage(b.c,0,0);ctx.restore();}
  if(age<.25){ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle=rgba(EMBER,.9*(1-age/.25));ctx.lineWidth=Math.max(1,u*.0025);ctx.beginPath();b.crack.forEach(([cx,cy2],k)=>k?ctx.lineTo(x+cx,y+cy2):ctx.moveTo(x+cx,y+cy2));ctx.stroke();ctx.restore();}
 }

 // ---- Eclipse: the umbra's offset (0 = total) near song boundaries ------------------------------------
 const SWEEP=1.5;
 function umbra(s){const a=s.local<SWEEP?-(1-easeInOut(s.local/SWEEP)):0,b=s.duration-s.local<SWEEP?1-easeInOut((s.duration-s.local)/SWEEP):0;return (a||b)*R*2.35;}

 const roll=createRoll();
 function draw(ctx,time){
  const s=base.at(time),{i,local,duration}=s,t=s.t;
  ctx.drawImage(sky,0,0);
  // Far clouds drift left, a thin near band drifts right across the moon.
  const drift=(c,speed,y,alpha)=>{const x=-(((t*speed)%c.width)+c.width)%c.width;ctx.globalAlpha=alpha;ctx.drawImage(c,x,y);ctx.drawImage(c,x+c.width,y);ctx.globalAlpha=1;};
  drift(clouds[0],u*.006,H*.05,1);
  const off=umbra(s),total=1-clamp(Math.abs(off)/(R*2),0,1);
  // Corona: two copies turning against each other make the streamers shift and shimmer.
  if(total>0){ctx.save();ctx.globalCompositeOperation='lighter';ctx.translate(mx,my);
   ctx.globalAlpha=.85*total;ctx.rotate(t*.018);ctx.drawImage(corona,-CS/2,-CS/2);ctx.rotate(-t*.018-t*.013+1.7);ctx.scale(1.06,1.06);ctx.globalAlpha=.5*total*(.8+.2*Math.sin(t*.4));ctx.drawImage(corona,-CS/2,-CS/2);ctx.restore();}
  // Music: fine rays from the limb (the chosen circular spectrum).
  if(s.frame&&total>0){const kind=RADIAL.includes(base.options.spectrum)?base.options.spectrum:'radial-bars',box=R*1.07/.31;ctx.save();ctx.globalCompositeOperation='lighter';
   drawSpectrum(ctx,{kind,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:[255,96,70],alpha:.8*total,amp:1.7,x:mx-box/2,y:my-box/2,width:box,height:box});ctx.restore();}
  // The moon: pale where the shadow has slid off, blood red inside it (with a soft penumbra).
  ctx.save();ctx.beginPath();ctx.arc(mx,my,R,0,TAU);ctx.clip();
  if(Math.abs(off)>.5){ctx.drawImage(faces.pale,mx-R,my-R);ctx.save();ctx.beginPath();ctx.arc(mx+off,my-off*.12,R*1.3,0,TAU);ctx.clip();ctx.globalAlpha=.55;ctx.drawImage(faces.blood,mx-R,my-R);ctx.restore();
   ctx.beginPath();ctx.arc(mx+off,my-off*.12,R*1.18,0,TAU);ctx.clip();}
  ctx.globalAlpha=1;ctx.drawImage(faces.blood,mx-R,my-R);ctx.restore();
  if(total<1){ctx.save();ctx.globalCompositeOperation='lighter';radialGlow(ctx,mx,my,R*2.2,[255,220,200],.12*(1-total));ctx.restore();}
  drift(clouds[1],-u*.011,my-H*.14,.9);
  ctx.drawImage(ground,0,0);

  // Headline: thin, widely spaced, with a blade rule.
  if(base.headline){const [hx,hy]=L.head,size=u*.03;text(ctx,base.headline,hx,hy,{size,weight:300,color:rgba(BONE,.82),align:L.align,baseline:'middle',spacing:.32,maxWidth:portrait?u*.8:W*.42});
   const rw=portrait?u*.16:W*.14,rx=portrait?hx-rw/2:hx;ctx.fillStyle=rgba(CRIMSON,.85);ctx.fillRect(rx,hy+size*.95,rw,Math.max(1,u*.0016));ctx.save();ctx.translate(rx+(portrait?rw/2:rw),hy+size*.95);ctx.rotate(Math.PI/4);ctx.fillRect(-u*.004,-u*.004,u*.008,u*.008);ctx.restore();}
  const num=roman(i+1),total2=roman(N),info=`${num} / ${total2}`;

  if(vocal){
   const cues=s.track.cues||[],line=base.lineState(s),c=line.index,cy=L.lyricY;
   if(c<0){const b=titleBlock(i),x=leftOf(b),firstStart=Number.isFinite(line.next)?local+line.next:Infinity;
    const label=`— ${num} —`;text(ctx,label,L.align==='center'?L.textX:L.textX,cy-b.h/2-u*.01,{size:u*.026,weight:700,color:rgba(CRIMSON,clamp((local-.3)/.6,0,1)),align:L.align,baseline:'middle',spacing:.4});
    if(local>.55)slashIn(ctx,b,x,cy,local-.55);
   }else{
    const b=lineBlock(i,c),x=leftOf(b),age=local-line.start;
    if(c>0&&age<.6){const pb=lineBlock(i,c-1);crackOut(ctx,pb,leftOf(pb),cy,age);}
    else if(c===0&&age<.6){const tb=titleBlock(i);crackOut(ctx,tb,leftOf(tb),cy,age);}
    // In a long gap the line sinks back into the dark.
    const quiet=Number.isFinite(line.next)?line.next:duration-local,dim=quiet>3.5&&local>line.end+1.5?lerp(1,.38,clamp((local-line.end-1.5)/1.2,0,1)):1;
    if(age>=.08)slashIn(ctx,b,x,cy,age-.08,dim*s.exit);
   }
   // Song: numeral, title and time at the foot.
   const [ix,iy]=L.info,isz=u*.022;setFont(measure,700,isz,.2);const nw=measure.measureText(info).width;
   if(portrait){text(ctx,`${info}   ·   ${stamp(local)} / ${stamp(duration)}`,ix,iy,{size:isz,weight:700,color:rgba(CRIMSON,.9),align:'center',baseline:'middle',spacing:.16});text(ctx,tracks[i].title||'',ix,iy-isz*1.7,{size:isz*1.1,weight:400,color:rgba(BONE,.7),align:'center',baseline:'middle',spacing:.08,maxWidth:u*.8});}
   else{text(ctx,info,ix,iy,{size:isz,weight:700,color:rgba(CRIMSON,.9),baseline:'middle',spacing:.2});text(ctx,`${tracks[i].title||''}`,ix+nw+isz*1.4,iy,{size:isz*1.05,weight:400,color:rgba(BONE,.72),baseline:'middle',spacing:.08,maxWidth:W*.3});
    text(ctx,`${stamp(local)} / ${stamp(duration)}`,W*.5,iy,{size:isz,weight:700,color:rgba(BONE,.55),align:'right',baseline:'middle',spacing:.1});}
  }else{
   // Rite: numeral, current title (slashed in on each new song), time on a blade, then the numbered list.
   const [ty]=L.title,b=titleBlock(i),x=leftOf(b),cy=ty-b.pad+b.h/2;
   text(ctx,info,L.textX,ty-u*.03,{size:u*.024,weight:700,color:rgba(CRIMSON,.95),align:L.align,baseline:'middle',spacing:.4});
   if(i>0&&local<.6){const pb=titleBlock(i-1);crackOut(ctx,pb,leftOf(pb),ty-pb.pad+pb.h/2,local);}
   if(local>.12||i===0)slashIn(ctx,b,x,cy,i===0?local-.4:local-.12,s.exit);
   {const y=L.time,w=portrait?u*.62:L.textW*.82,x0=portrait?W/2-w/2:L.textX,p=clamp(s.progress,0,1),sz=u*.02;
    ctx.fillStyle=rgba(BONE,.16);ctx.fillRect(x0,y,w,Math.max(1,u*.0016));ctx.fillStyle=rgba(CRIMSON,.95);ctx.fillRect(x0,y,w*p,Math.max(1,u*.0022));
    ctx.save();ctx.translate(x0+w*p,y);ctx.rotate(Math.PI/4);ctx.fillStyle=rgba(EMBER);ctx.fillRect(-u*.0045,-u*.0045,u*.009,u*.009);ctx.restore();
    text(ctx,stamp(local),x0,y-sz*1.05,{size:sz,weight:700,color:rgba(BONE,.6),baseline:'middle',spacing:.1});text(ctx,stamp(duration),x0+w,y-sz*1.05,{size:sz,weight:700,color:rgba(BONE,.6),align:'right',baseline:'middle',spacing:.1});}
   const [lx,ly,lw,lh]=L.list,rowH=L.rowH,{index,ease}=base.rollState(s),size=rowH*.44,numW=size*4.2;
   roll(ctx,{x:lx,y:ly,w:lw,h:lh,rowH,anchor:portrait?2:3,index,ease,count:N,pinTop:true,fade:.2,
    highlight:(g,x,y,w,h)=>{const f=g.createLinearGradient(x,0,x+w,0);f.addColorStop(0,rgba(CRIMSON,.32));f.addColorStop(1,rgba(CRIMSON,0));g.fillStyle=f;g.fillRect(x,y+h*.1,w,h*.8);g.fillStyle=rgba(EMBER,.95);g.fillRect(x,y+h*.1,Math.max(2,u*.003),h*.8);},
    row:(g,n,x,y,w,h,e)=>{const cy2=y+h/2,col=rgba(mix([150,120,118],BONE,e)),a=.7+.3*e;
     text(g,roman(n+1),x+numW-size*.6,cy2,{size:size*.9,weight:700,color:rgba(mix([120,40,40],EMBER,e),a),align:'right',baseline:'middle',spacing:.08});
     text(g,stamp(tracks[n].duration),x+w-size*.3,cy2,{size:size*.82,weight:400,color:col,align:'right',baseline:'middle',alpha:a});
     text(g,tracks[n].title||'',x+numW+size*.2,cy2,{size,weight:e>.5?700:400,color:col,baseline:'middle',spacing:.04,maxWidth:w-numW-size*4.6,alpha:a});}});
  }
  // Film grain: the pattern jumps every frame (seeded by the frame number), over the whole picture.
  {const f=Math.floor(t*24),r=random(hash('g'+f));ctx.save();ctx.globalAlpha=.07;ctx.translate(-r()*W*.08,-r()*H*.08);ctx.drawImage(grain,0,0,W*1.1,H*1.1);ctx.restore();}
 }
 return {draw,duration:base.total};
}

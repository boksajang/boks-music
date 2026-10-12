import {sceneBase,shadowSprite,drawShadow,blurredCover,drawCover,drawSpectrum,equalizer,glyph,fitText,setFont,ellipsize,stamp,rgba,mix,hsl,layer,hash,random,clamp,lerp,easeOut,easeInOut} from '../canvas-kit.mjs';

/**
 * 스마트폰 플레이어: a phone mockup floating at an angle (fake 3D from skew/scale, a visible side, a
 * moving screen glare) that turns to a new pose each song. On its screen a streaming app shows synced
 * lyrics scrolling over a blurred album backdrop (instrumental: the play queue). Behind it, the title
 * phrase flows by in huge outlined type over an album-colored gradient.
 */
const lru=(limit,make)=>{const m=new Map();return key=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make(key);m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};};

export default function phone(input){
 const base=sceneBase(input,{hue:250}),{width:W,height:H,portrait,u,vocal,tracks}=base;
 const PH=Math.round(portrait?H*.72:H*.86),PW=Math.round(PH/2.07),R=PW*.15,BZ=Math.round(PW*.034),SW=PW-BZ*2,SH=PH-BZ*2,SR=R-BZ*.9,q=SW/390;
 const C=portrait?[W*.5,H*.5]:[W*.665,H*.5],thick=PW*.05,measure=layer(8,8).getContext('2d'),shadow=shadowSprite(256,{alpha:.7});
 const screen=layer(SW,SH),sg=screen.getContext('2d');

 // ---- Background: album gradient and giant outline type flowing across.
 const backdrop=lru(3,i=>{const art=base.art(i),c=layer(480,Math.round(480*H/W)),g=c.getContext('2d'),w=c.width,h=c.height;
  const lin=g.createLinearGradient(0,0,w,h);lin.addColorStop(0,rgba(mix(art.deep,[8,8,16],.2)));lin.addColorStop(.55,rgba(mix(art.mid,art.accent,.25)));lin.addColorStop(1,rgba(mix(art.accent,art.deep,.35)));g.fillStyle=lin;g.fillRect(0,0,w,h);
  for(const [x,y,r,col,a] of [[.15,.2,.6,art.glow,.45],[.85,.85,.7,hsl(art.hue+40,.6,.5),.35],[.7,.15,.4,art.soft,.2]]){const glow=g.createRadialGradient(w*x,h*y,0,w*x,h*y,Math.max(w,h)*r);glow.addColorStop(0,rgba(col,a));glow.addColorStop(1,rgba(col,0));g.fillStyle=glow;g.fillRect(0,0,w,h);}
  return c;});
 const typeSize=portrait?H*.16:H*.28;
 const strip=lru(2,label=>{setFont(measure,900,typeSize,-.02);const unit=measure.measureText(label+'   ·   ').width,count=Math.ceil((W+unit)/unit)+1,c=layer(Math.ceil(unit*count),Math.ceil(typeSize*1.3)),g=c.getContext('2d');
  setFont(g,900,typeSize,-.02);g.textBaseline='middle';g.lineJoin='round';g.lineWidth=Math.max(1.5,u*.0028);g.strokeStyle='rgba(255,255,255,.95)';for(let k=0;k<count;k++)g.strokeText(label+'   ·   ',k*unit,c.height/2);return {c,unit};});

 // ---- Poses: each song turns the phone a different way.
 const pose=i=>{const r=random(hash('pose'+i)),side=i%2?1:-1;return {rot:(r()-.5)*.16+side*.03,yaw:side*(.45+r()*.45),pitch:(r()-.5)*.8,dx:side*u*.012,dy:(r()-.5)*u*.02};};
 const matrix=(p,t)=>new DOMMatrix().translate(C[0]+p.dx,C[1]+p.dy+Math.sin(t*.5)*u*.006).rotate((p.rot+Math.sin(t*.3)*.012)*180/Math.PI).skewY(p.yaw*5.5).scale(1-.075*Math.abs(p.yaw),1).skewX(p.pitch*3);

 // ---- App screen pieces.
 const blur=lru(3,i=>blurredCover(base.art(i).image,SW/SH,{blur:.07,dim:.12}));
 const LS=q*(portrait?31:32),LX=q*26,LW=q*334,TOP=q*150,BOT=SH-q*232,ANCHOR=TOP+q*56;
 const lyricsOf=lru(3,i=>{const cues=(tracks[i].cues||[]).filter(c=>Number.isFinite(c.start));let y=0;const items=cues.map(c=>{const b=fitText(measure,c.text||'',{size:LS,minSize:LS*.7,weight:800,lineHeight:1.2,maxWidth:LW,maxHeight:LS*3.7,spacing:-.02,maxLines:3});const top=y;y+=b.height+q*24;return {b,top};});return items;});
 const qText=(g,str,x,y,size,weight,color,{align='left',baseline='middle',spacing=0,maxWidth=Infinity}={})=>{setFont(g,weight,size,spacing);g.textAlign=align;g.textBaseline=baseline;g.fillStyle=color;g.fillText(Number.isFinite(maxWidth)?ellipsize(g,str,maxWidth):str,x,y);};
 function statusBar(g){
  qText(g,'9:41',q*52,q*31,q*16,700,'#fff',{align:'center'});
  const x=SW-q*88,y=q*31;g.fillStyle='#fff';for(let k=0;k<4;k++){const h=q*(4+k*2.4);g.fillRect(x+k*q*5,y+q*5-h,q*3.2,h);}
  g.strokeStyle='#fff';g.lineWidth=q*2;g.lineCap='round';for(let k=0;k<3;k++){g.beginPath();g.arc(x+q*33,y+q*6,q*(3+k*3.6),-Math.PI*.75,-Math.PI*.25);g.stroke();}
  g.lineWidth=q*1.2;g.strokeStyle='rgba(255,255,255,.55)';g.beginPath();g.roundRect(x+q*46,y-q*6,q*25,q*12,q*3.5);g.stroke();g.fillStyle='#fff';g.beginPath();g.roundRect(x+q*48,y-q*4,q*17,q*8,q*2);g.fill();g.fillStyle='rgba(255,255,255,.55)';g.fillRect(x+q*72,y-q*2,q*2,q*4);
 }
 function header(g,s,art){
  const y=q*84,th=q*46;g.save();g.beginPath();g.roundRect(q*22,y-th/2,th,th,q*7);g.clip();drawCover(g,art.image,q*22,y-th/2,th,th);g.restore();
  qText(g,s.track.title||'',q*80,y-q*9,q*16,800,'#fff',{maxWidth:SW-q*150});
  qText(g,`${String(s.i+1).padStart(2,'0')} / ${String(tracks.length).padStart(2,'0')}${base.headline?' · '+base.headline:''}`,q*80,y+q*12,q*13,500,'rgba(255,255,255,.62)',{maxWidth:SW-q*150});
  g.fillStyle='rgba(255,255,255,.16)';g.beginPath();g.arc(SW-q*42,y,q*15,0,Math.PI*2);g.fill();g.fillStyle='#fff';for(let k=-1;k<=1;k++){g.beginPath();g.arc(SW-q*42+k*q*5.5,y,q*1.8,0,Math.PI*2);g.fill();}
 }
 function player(g,s,art){
  const by=SH-q*150,bx=q*26,bw=SW-q*52;
  if(s.frame)drawSpectrum(g,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:mix(art.soft,[255,255,255],.6),alpha:.55,x:bx,y:by-q*62,width:bw,height:q*36});
  g.fillStyle='rgba(255,255,255,.25)';g.beginPath();g.roundRect(bx,by,bw,q*5,q*2.5);g.fill();g.fillStyle='rgba(255,255,255,.92)';g.beginPath();g.roundRect(bx,by,Math.max(q*5,bw*s.progress),q*5,q*2.5);g.fill();
  qText(g,stamp(s.local),bx,by+q*20,q*12,600,'rgba(255,255,255,.6)');qText(g,'-'+stamp(s.duration-s.local),bx+bw,by+q*20,q*12,600,'rgba(255,255,255,.6)',{align:'right'});
  const cy=SH-q*88;glyph(g,'prev',SW/2-q*92,cy,q*30,'#fff');glyph(g,'pause',SW/2,cy,q*38,'#fff');glyph(g,'next',SW/2+q*92,cy,q*30,'#fff');
  const iy=SH-q*38,dim='rgba(255,255,255,.62)';
  // Lyrics bubble (lit while lyrics show), AirPlay, queue (lit while the queue shows).
  g.fillStyle=vocal?'#fff':dim;g.beginPath();g.roundRect(q*58,iy-q*9,q*22,q*16,q*5);g.moveTo(q*62,iy+q*6);g.lineTo(q*60,iy+q*12);g.lineTo(q*68,iy+q*6);g.fill();g.fillStyle=vocal?rgba(art.deep):'rgba(0,0,0,.4)';g.font=`900 ${q*13}px serif`;g.textAlign='center';g.textBaseline='middle';g.fillText('”',q*69,iy+q*2);
  g.strokeStyle=dim;g.lineWidth=q*1.8;g.lineJoin='round';g.beginPath();g.arc(SW/2,iy-q*2,q*9,Math.PI*.85,Math.PI*.15,false);g.stroke();g.fillStyle=dim;g.beginPath();g.moveTo(SW/2-q*6,iy+q*9);g.lineTo(SW/2+q*6,iy+q*9);g.lineTo(SW/2,iy+q*2);g.closePath();g.fill();
  g.fillStyle=vocal?dim:'#fff';for(let k=0;k<3;k++){g.fillRect(SW-q*82,iy-q*7+k*q*6,q*4,q*2.4);g.fillRect(SW-q*75,iy-q*7+k*q*6,q*16,q*2.4);}
  g.fillStyle='rgba(255,255,255,.85)';g.beginPath();g.roundRect(SW/2-q*67,SH-q*12,q*134,q*5,q*2.5);g.fill();
 }
 function lyricsView(g,s,art){
  const items=lyricsOf(s.i),{index,ease}=base.rollState(s);
  const scroll=index<0?0:lerp(index>0?items[index-1].top:items[index].top,items[index].top,ease);
  if(index<0||!items.length){// Intro: three breathing dots where the first line will appear.
   for(let k=0;k<3;k++){const a=.35+.65*Math.max(0,Math.sin(s.t*3-k*.9));g.fillStyle=`rgba(255,255,255,${a})`;g.beginPath();g.arc(LX+q*10+k*q*24,ANCHOR+LS*.6,q*7*(.85+.15*a),0,Math.PI*2);g.fill();}
  }
  const offset=index<0?LS*1.8:0;
  for(let n=0;n<items.length;n++){const it=items[n],y=ANCHOR+offset+it.top-scroll;if(y>BOT)break;if(y+it.b.height<TOP-q*60)continue;
   const e=n===index?(index>0?ease:1):n===index-1?1-ease:0,edge=clamp((y-(TOP-q*50))/(q*70),0,1)*clamp((BOT-y-it.b.height*.4)/(q*90),0,1),a=(n<index?.28:.36+.64*e)*edge;if(a<=.01)continue;
   const s0=1+.035*e;g.save();g.translate(LX,y);g.scale(s0,s0);setFont(g,it.b.weight,it.b.font,it.b.spacing);g.textAlign='left';g.textBaseline='top';g.fillStyle=`rgba(255,255,255,${a})`;
   it.b.lines.forEach((l,k)=>g.fillText(l,0,k*it.b.font*it.b.lineHeight));g.restore();}
 }
 function queueView(g,s,art){
  const ease=easeOut(s.local/.7),remain=tracks.slice(s.i+1).reduce((a,t)=>a+(Number(t.duration)||0),0);
  qText(g,'재생 대기열',q*24,q*146,q*22,800,'#fff');qText(g,tracks.length-s.i-1>0?`남은 곡 ${tracks.length-s.i-1}곡 · ${stamp(remain)}`:'마지막 곡',SW-q*24,q*148,q*13,600,'rgba(255,255,255,.6)',{align:'right'});
  const cy=q*176,ch=q*86;g.fillStyle='rgba(255,255,255,.12)';g.beginPath();g.roundRect(q*16,cy,SW-q*32,ch,q*14);g.fill();
  g.save();g.beginPath();g.roundRect(q*28,cy+q*12,q*62,q*62,q*8);g.clip();drawCover(g,art.image,q*28,cy+q*12,q*62,q*62);g.restore();
  qText(g,'지금 재생 중',q*104,cy+q*28,q*12,700,rgba(mix(art.soft,[255,255,255],.3)),{spacing:.04});qText(g,s.track.title||'',q*104,cy+q*52,q*19,800,'#fff',{maxWidth:SW-q*180});
  equalizer(g,SW-q*62,cy+q*30,q*24,q*24,s.frame?.bins,'#fff',4);
  qText(g,'다음 곡',q*24,cy+ch+q*30,q*14,700,'rgba(255,255,255,.7)',{spacing:.04});
  const top=cy+ch+q*48,rowH=q*62,bottom=SH-q*240;g.save();g.beginPath();g.rect(0,top-q*4,SW,bottom-top+q*4);g.clip();
  if(s.i>=tracks.length-1)qText(g,'대기열의 마지막 곡입니다',q*24,top+q*24,q*15,600,'rgba(255,255,255,.5)');
  for(let n=s.i;n<tracks.length;n++){const y=top+(n-s.i-1+(1-ease))*rowH;if(y>bottom)break;if(y+rowH<top)continue;const a=(n===s.i?1-ease:1)*clamp((bottom-y-rowH*.5)/(rowH*.8),0,1);if(a<=.01)continue;
   g.globalAlpha=a;const hue=hash(tracks[n].title||String(n))%360;g.fillStyle=rgba(hsl(hue,.42,.42));g.beginPath();g.roundRect(q*24,y+q*7,q*46,q*46,q*7);g.fill();
   qText(g,String(n+1).padStart(2,'0'),q*47,y+q*30,q*15,800,'rgba(255,255,255,.9)',{align:'center'});
   qText(g,tracks[n].title||'',q*84,y+q*30,q*18.5,700,'#fff',{maxWidth:SW-q*164});qText(g,stamp(Number(tracks[n].duration)||0),SW-q*28,y+q*30,q*14,500,'rgba(255,255,255,.55)',{align:'right'});g.globalAlpha=1;}
  g.restore();
 }
 function paintScreen(s){
  const art=base.art(s.i),g=sg;g.fillStyle=rgba(art.deep);g.fillRect(0,0,SW,SH);
  const z=1.25+Math.sin(s.t*.07)*.06,w=SW*z,h=SH*z;g.drawImage(blur(s.i),(SW-w)/2+Math.sin(s.t*.05)*SW*.06,(SH-h)/2+Math.cos(s.t*.04)*SH*.03,w,h);
  if(s.i>0&&s.enter<1){g.globalAlpha=1-s.enter;g.drawImage(blur(s.i-1),(SW-w)/2,(SH-h)/2,w,h);g.globalAlpha=1;}
  const shade=g.createLinearGradient(0,0,0,SH);shade.addColorStop(0,'rgba(0,0,0,.28)');shade.addColorStop(.5,'rgba(0,0,0,.18)');shade.addColorStop(1,'rgba(0,0,0,.5)');g.fillStyle=shade;g.fillRect(0,0,SW,SH);
  statusBar(g);header(g,s,art);
  if(vocal)lyricsView(g,s,art);else queueView(g,s,art);
  player(g,s,art);
 }

 const leftTitle=lru(4,i=>fitText(measure,tracks[i].title||'',{size:u*.066,minSize:u*.04,weight:900,lineHeight:1.12,maxWidth:W*.36,maxHeight:u*.24,spacing:-.03,maxLines:3}));
 function draw(ctx,time){
  const s=base.at(time),{i,local,show}=s,art=base.art(i),t=s.t;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.drawImage(backdrop(i),0,0,W,H);if(i>0&&s.enter<1){ctx.globalAlpha=1-s.enter;ctx.drawImage(backdrop(i-1),0,0,W,H);ctx.globalAlpha=1;}
  // Outline typography: two rows flowing in opposite directions.
  const label=base.headline||s.track.title||'',st=label?strip(label):null;
  if(st){const rows=portrait?[[H*.13,1],[H*.87,-1]]:[[H*.27,1],[H*.76,-1]];rows.forEach(([y,dir],k)=>{const off=((t*u*.04*dir+k*st.unit*.37)%st.unit+st.unit)%st.unit;ctx.globalAlpha=k?.1:.15;ctx.drawImage(st.c,-off,y-st.c.height/2);});ctx.globalAlpha=1;}
  // 16:9: the playing song beside the phone.
  if(!portrait){const x=W*.075,b=leftTitle(i),rise=(1-show)*u*.025,y0=H*.5-b.height/2;
   setFont(ctx,800,u*.017,.3);ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillStyle=rgba(mix(art.soft,[255,255,255],.3),show);ctx.fillText('NOW PLAYING',x,y0-u*.05+rise);
   setFont(ctx,b.weight,b.font,b.spacing);ctx.fillStyle=`rgba(255,255,255,${show})`;ctx.textBaseline='top';b.lines.forEach((l,k)=>ctx.fillText(l,x,y0+rise+k*b.font*b.lineHeight));
   setFont(ctx,600,u*.02,.08);ctx.textBaseline='top';ctx.fillStyle=`rgba(255,255,255,${.7*show})`;ctx.fillText(`${String(i+1).padStart(2,'0')} / ${String(tracks.length).padStart(2,'0')}   ·   ${stamp(s.duration)}`,x,y0+b.height+u*.03+rise);
   ctx.fillStyle=rgba(art.soft,show);ctx.fillRect(x,y0-u*.03+rise,u*.04,Math.max(2,u*.004));}
  else{setFont(ctx,800,u*.022,.3);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=rgba(mix(art.soft,[255,255,255],.4),.9);ctx.fillText(`NOW PLAYING  ·  ${String(i+1).padStart(2,'0')} / ${String(tracks.length).padStart(2,'0')}`,W/2,H*.062);
   setFont(ctx,800,u*.04,-.02);ctx.fillStyle=`rgba(255,255,255,${show})`;ctx.fillText(ellipsize(ctx,s.track.title||'',W*.86),W/2,H*.93+(1-show)*u*.02);}
  // Phone pose: eases from the previous song's pose to this one.
  const k=i>0?easeInOut((local-.1)/2.2):1,a=i>0?pose(i-1):pose(i),b=pose(i),p={};for(const key of Object.keys(b))p[key]=lerp(a[key],b[key],k);
  const M=matrix(p,t),D=[-p.yaw*thick,thick*.5+Math.abs(p.pitch)*thick*.3];
  paintScreen(s);
  drawShadow(ctx,shadow,C[0]+p.dx-PW*.5+D[0]*2.5,C[1]+p.dy-PH*.5+u*.04,PW,PH,{alpha:.75,offsetY:.02,spread:1.12});
  // Side (titanium band) built from offset copies, then the front.
  const steps=7;for(let n=steps;n>=1;n--){const f=n/steps;ctx.setTransform(M.a,M.b,M.c,M.d,M.e+D[0]*f,M.f+D[1]*f);const side=ctx.createLinearGradient(-PW/2,0,PW/2,0);side.addColorStop(0,rgba(mix([70,74,84],art.deep,.3)));side.addColorStop(.5,rgba(mix([150,156,168],art.soft,.15)));side.addColorStop(1,rgba(mix([60,64,74],art.deep,.3)));ctx.fillStyle=side;ctx.beginPath();ctx.roundRect(-PW/2,-PH/2,PW,PH,R);ctx.fill();}
  ctx.setTransform(M);
  ctx.fillStyle='#07080b';ctx.beginPath();ctx.roundRect(-PW/2,-PH/2,PW,PH,R);ctx.fill();
  const rim=ctx.createLinearGradient(-PW/2,-PH/2,PW/2,PH/2);rim.addColorStop(0,'rgba(255,255,255,.55)');rim.addColorStop(.35,'rgba(255,255,255,.08)');rim.addColorStop(.7,'rgba(255,255,255,.22)');rim.addColorStop(1,'rgba(255,255,255,.05)');ctx.strokeStyle=rim;ctx.lineWidth=Math.max(1.5,PW*.008);ctx.beginPath();ctx.roundRect(-PW/2+PW*.004,-PH/2+PW*.004,PW-PW*.008,PH-PW*.008,R*.97);ctx.stroke();
  ctx.save();ctx.beginPath();ctx.roundRect(-SW/2,-SH/2,SW,SH,SR);ctx.clip();ctx.drawImage(screen,-SW/2,-SH/2);
  // Glare moves across the glass as the phone turns.
  const gx=(p.yaw*.35+Math.sin(t*.11)*.08)*PW,glare=ctx.createLinearGradient(gx-PW*.6,-PH/2,gx+PW*.2,PH*.1);glare.addColorStop(0,'rgba(255,255,255,0)');glare.addColorStop(.45,'rgba(255,255,255,.07)');glare.addColorStop(.5,'rgba(255,255,255,.13)');glare.addColorStop(.56,'rgba(255,255,255,.04)');glare.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=glare;ctx.fillRect(-SW/2,-SH/2,SW,SH);
  ctx.restore();
  ctx.fillStyle='#000';ctx.beginPath();ctx.roundRect(-q*62,-SH/2+q*11,q*124,q*36,q*18);ctx.fill();ctx.fillStyle='rgba(60,70,100,.6)';ctx.beginPath();ctx.arc(q*40,-SH/2+q*29,q*6,0,Math.PI*2);ctx.fill();
  // Side buttons on the visible edge.
  ctx.fillStyle='rgba(30,32,38,.9)';const bx=p.yaw>0?-PW/2-PW*.012:PW/2;ctx.fillRect(bx,-PH*.28,PW*.012,PH*.07);ctx.fillRect(bx,-PH*.19,PW*.012,PH*.07);
  ctx.setTransform(1,0,0,1,0,0);
  const v=ctx.createRadialGradient(W/2,H/2,u*.4,W/2,H/2,Math.hypot(W,H)*.6);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,.38)');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
 }
 return {draw,duration:base.total};
}

import {sceneBase,layer,rgba,mix,hash,random,clamp,lerp,easeOut,easeInOut,text,setFont,drawSpectrum,stamp} from '../canvas-kit.mjs';

/**
 * 타자기: a dark room, one desk lamp, an old typewriter. The sung line is typed onto the sheet one
 * character at a time — each strike lands a little uneven, darker for a moment, with the dry grain of
 * an ink ribbon — while the carriage and paper step left so the print point stays put. At the end of
 * a line the carriage returns and the platen rolls the sheet up a line; earlier lines climb the page.
 * A song begins with a fresh sheet fed in and its title typed at the top, and ends with the sheet
 * pulled out. Keys dip, a typebar flicks up to each strike and the ribbon spools turn with the typing;
 * only the little radio's dial reacts to the music.
 */
const TAU=Math.PI*2;
function lru(limit){const m=new Map();return (key,make)=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make();m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};}
const WIDE=/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/;
// 두벌식 keys, top row to bottom; a syllable presses the key of its first consonant.
const KEYS=[['ㅂ','ㅈ','ㄷ','ㄱ','ㅅ','ㅛ','ㅕ','ㅑ','ㅐ','ㅔ'],['ㅁ','ㄴ','ㅇ','ㄹ','ㅎ','ㅗ','ㅓ','ㅏ','ㅣ',';'],['ㅋ','ㅌ','ㅊ','ㅍ','ㅠ','ㅜ','ㅡ',',','.','/']];
const CHO='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ',PLAIN={ㄲ:'ㄱ',ㄸ:'ㄷ',ㅃ:'ㅂ',ㅆ:'ㅅ',ㅉ:'ㅈ'};

export default function typewriter(input){
 const base=sceneBase(input,{hue:30}),{width:W,height:H,portrait,u,tracks}=base,N=tracks.length;
 const F=u*(portrait?.055:.056),GAP=F*1.8,PX=W*.5-F*.5,PY=H*(portrait?.47:.45),MAXW=W*.44,MARGIN=F*1.8;
 const deskY=H*(portrait?.66:.66),measure=layer(8,8).getContext('2d'),ink=[30,32,42],paperTone=[226,216,194],amber=[255,178,92];
 const adv=ch=>WIDE.test(ch)?F:/\s/.test(ch)?F*.5:/[.,'!?:;·"]/.test(ch)?F*.45:F*.62;

 // ---- Sheet plan per song: rows of characters with the time each one is struck. ----
 function rowsOf(value){
  const rows=[];let row=[],x=0;
  for(const word of String(value).split(/\s+/).filter(Boolean)){
   const chars=[...word],w=chars.reduce((a,c)=>a+adv(c),0);
   if(row.length&&x+adv(' ')+w>MAXW){rows.push(row);row=[];x=0;}
   if(row.length){row.push({ch:' ',x});x+=adv(' ');}
   for(const ch of chars){if(x+adv(ch)>MAXW&&row.length){rows.push(row);row=[];x=0;}row.push({ch,x});x+=adv(ch);}
  }
  if(row.length)rows.push(row);return rows.length?rows:[[]];
 }
 const plans=lru(4);
 const plan=i=>plans(i,()=>{
  const tr=tracks[i],D=Number(tr.duration)||0,cues=(tr.cues||[]).filter(c=>Number.isFinite(c.start)&&c.start<D).sort((a,b)=>a.start-b.start),rows=[];
  const first=cues.length?cues[0].start:D;let r=0,ready=1.2;
  // Type a block of rows starting at `from` with one keystroke every `dt`; returns when the last lands.
  const type=(value,from,dt,{bold=false,skip=1}={})=>{let t=from;const list=rowsOf(value);list.forEach((chars,k)=>{
   const row={r,start:t,bold,chars:chars.map((c,n)=>{const v=random(hash(`${i}:${r}:${n}`));const at=t+n*dt*(c.ch===' '?.6:.8+v()*.4);return {...c,t:at,dx:(v()-.5)*F*.07,dy:(v()-.5)*F*.09,rot:(v()-.5)*.07,inkV:.62+v()*.38,variant:Math.floor(v()*3)};})};
   const last=row.chars.length?row.chars[row.chars.length-1].t:t;row.end=last;rows.push(row);t=last+.62;row.crAt=last+.18;row.lf=k<list.length-1?1:skip;r+=row.lf;});return t;};
  const titleChars=[...(tr.title||'')].length+[...'01 / 01'].length;
  const room=first-1.3-1.2;
  if(room>.4){const dt=clamp(room/titleChars,.035,.11);let t=type(tr.title||'',1.3,dt,{bold:true});type(`— ${String(i+1).padStart(2,'0')} / ${String(N).padStart(2,'0')} —`,t,dt*.6,{skip:2});}
  else{rows.push({r:0,start:-1,bold:true,instant:true,chars:rowsOf(tr.title||'')[0].map(c=>({...c,t:-1,dx:0,dy:0,rot:0,inkV:.9,variant:0})),end:-1,crAt:-.8,lf:3});r=3;}
  cues.forEach((c,k)=>{const next=k+1<cues.length?cues[k+1].start:D,end=Math.min(c.start+8,Number.isFinite(c.end)&&c.end>c.start?c.end:next,next),from=Math.max(c.start,ready),count=[...(c.text||'')].filter(ch=>!/\s/.test(ch)).length||1;
   const window=Math.max(.5,Math.min((end-c.start)*.82,next-from-.75)),dt=clamp(window/count,.04,.14);const lastRow=rows.length;ready=type(c.text||' ',from,dt);for(let n=lastRow;n<rows.length;n++){if(n===rows.length-1)rows[n].crAt=Math.min(rows[n].end+.35,Math.max(rows[n].end+.12,next-.42));}ready=rows[rows.length-1].crAt+.42;});
  return {rows,D};
 });
 /** Carriage offset (how far the paper has moved left) and the sheet row at the print line. */
 function carriage(p,local){
  const rows=p.rows;let k=0;for(let n=rows.length-1;n>=0;n--)if(rows[n].start<=local||n===0){k=n;break;}
  const row=rows[k],cr=local-row.crAt;
  if(cr>=0&&k<rows.length&&(k===rows.length-1?true:local<rows[k+1].start)){const endX=row.chars.length?row.chars[row.chars.length-1].x+adv(row.chars[row.chars.length-1].ch):0,q=easeInOut(cr/.38);return {x:lerp(endX,0,q),row:row.r+row.lf*easeInOut(cr/.3),k,returning:cr<.38};}
  let x=0,last=null;for(const c of row.chars){if(c.t>local)break;last=c;}
  if(last){const step=easeOut((local-last.t)/.05);x=last.x+adv(last.ch)*step;}
  return {x,row:row.r,k,last};
 }

 // ---- Type: one sprite per character and ink variant (dry ribbon speckle, a little bleed). ----
 const speckle=Array.from({length:3},(_,k)=>{const c=layer(128,128),g=c.getContext('2d'),r=random(hash('ribbon'+k));for(let n=0;n<900;n++){g.fillStyle=`rgba(0,0,0,${.35+r()*.6})`;g.fillRect(r()*128,r()*128,.8+r()*1.6,.8+r()*1.6);}for(let n=0;n<6;n++){g.fillStyle='rgba(0,0,0,.55)';g.fillRect(0,r()*128,128,1+r()*3);}return c;});
 const sprites=lru(260),SP=Math.ceil(F*1.5);
 const glyph=(ch,variant,bold)=>sprites(`${ch}|${variant}|${bold?1:0}`,()=>{const c=layer(SP,SP),g=c.getContext('2d');setFont(g,bold?800:600,F*.92,0);g.textAlign='center';g.textBaseline='middle';g.fillStyle=rgba(ink);
  g.filter=`blur(${F*.012}px)`;g.fillText(ch,SP/2,SP/2);if(bold)g.fillText(ch,SP/2+F*.025,SP/2);g.filter='none';g.globalAlpha=.55;g.fillText(ch,SP/2,SP/2);g.globalAlpha=1;
  g.globalCompositeOperation='destination-out';g.globalAlpha=.8;g.drawImage(speckle[variant],-(variant*37)%64,-(variant*53)%64,SP*1.6,SP*1.6);g.globalAlpha=1;
  // Uneven strike: one edge of the slug hits lighter.
  const fade=g.createLinearGradient(0,variant===1?0:SP,0,variant===1?SP:0);fade.addColorStop(0,'rgba(0,0,0,.45)');fade.addColorStop(.5,'rgba(0,0,0,0)');g.fillStyle=fade;if(variant)g.fillRect(0,0,SP,SP);
  g.globalCompositeOperation='source-over';return c;});
 function strike(ctx,c,x0,y0,local,bold){
  if(c.ch===' ')return;const age=local-c.t,fresh=age<.14&&age>=0?1-age/.14:0,sx=x0+c.x+adv(c.ch)/2+c.dx,sy=y0+c.dy;
  ctx.save();ctx.translate(sx,sy);ctx.rotate(c.rot);const s=1+fresh*.06;ctx.globalAlpha=clamp(c.inkV+fresh*.3,0,1);ctx.drawImage(glyph(c.ch,c.variant,bold),-SP/2*s,-SP/2*s,SP*s,SP*s);
  if(fresh>0){ctx.globalAlpha=fresh*.5;ctx.drawImage(glyph(c.ch,(c.variant+1)%3,bold),-SP/2*s,-SP/2*s,SP*s,SP*s);}ctx.restore();ctx.globalAlpha=1;
 }
 const rowCache=lru(24);
 const rowLayer=(i,row)=>rowCache(`${i}:${row.r}`,()=>{const w=MAXW+F*2,c=layer(w,GAP),g=c.getContext('2d');for(const ch of row.chars)strike(g,{...ch,t:-9},F*.5,GAP/2,0,row.bold);return c;});

 // ---- Paper, desk, wall, lamp light (static) and the machine. ----
 const paperTile=(()=>{const n=512,c=layer(n,n),g=c.getContext('2d'),r=random(hash('bond'));g.fillStyle=rgba(paperTone);g.fillRect(0,0,n,n);
  for(let k=0;k<5200;k++){g.fillStyle=r()<.5?`rgba(120,96,60,${r()*.06})`:`rgba(255,250,240,${r()*.08})`;g.fillRect(r()*n,r()*n,1+r()*2,1+r()*2);}
  for(let k=0;k<90;k++){g.strokeStyle=`rgba(140,116,80,${.03+r()*.05})`;g.lineWidth=.6+r();g.beginPath();const x=r()*n,y=r()*n;g.moveTo(x,y);g.quadraticCurveTo(x+r()*30-15,y+r()*30-15,x+r()*40-20,y+r()*40-20);g.stroke();}return c;})();
 const PW=MAXW+MARGIN*2,platenY=PY+F*1.16,platenR=F*.56;
 const room=(()=>{
  const c=layer(W,H),g=c.getContext('2d'),r=random(hash('study'));
  const wall=g.createLinearGradient(0,0,0,deskY);wall.addColorStop(0,'#0b0e14');wall.addColorStop(1,'#151a23');g.fillStyle=wall;g.fillRect(0,0,W,deskY);
  for(let k=0;k<Math.round(W/u*14);k++){const x=r()*W;g.fillStyle=`rgba(${r()<.5?'0,0,0':'90,100,120'},${.03+r()*.04})`;g.fillRect(x,0,u*(.002+r()*.01),deskY);}
  const desk=g.createLinearGradient(0,deskY,0,H);desk.addColorStop(0,'#2b2119');desk.addColorStop(1,'#120d0a');g.fillStyle=desk;g.fillRect(0,deskY,W,H-deskY);
  for(let k=0;k<160;k++){g.fillStyle=`rgba(${r()<.5?'0,0,0':'120,86,56'},${.05+r()*.08})`;g.fillRect(0,deskY+Math.pow(r(),1.4)*(H-deskY),W,.8+r()*2);}
  g.fillStyle='rgba(255,200,140,.12)';g.fillRect(0,deskY,W,Math.max(1,u*.002));
  return c;
 })();
 const lampAt=portrait?[W*.24,H*.22]:[W*.2,H*.2];
 const shade=(()=>{const c=layer(W/2,H/2),g=c.getContext('2d'),[lx,ly]=lampAt;g.fillStyle='rgba(6,9,16,.74)';g.fillRect(0,0,c.width,c.height);
  g.globalCompositeOperation='destination-out';const hole=g.createRadialGradient(lx/2,ly/2,0,lx/2,ly/2,u*.62);hole.addColorStop(0,'rgba(0,0,0,1)');hole.addColorStop(.45,'rgba(0,0,0,.82)');hole.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=hole;g.fillRect(0,0,c.width,c.height);
  g.globalCompositeOperation='source-over';return c;})();
 const warmth=(()=>{const c=layer(W/4,H/4),g=c.getContext('2d'),[lx,ly]=lampAt,grad=g.createRadialGradient(lx/4,ly/4,0,lx/4,ly/4,u*.55/4);grad.addColorStop(0,'rgba(255,170,90,.2)');grad.addColorStop(1,'rgba(255,170,90,0)');g.fillStyle=grad;g.fillRect(0,0,c.width,c.height);return c;})();
 const iron='#171b1f',enamel=[24,32,34],chrome=[176,182,190];
 const bodyTop=platenY+platenR*1.5,cx=PX+F*.5,bodyHalf=portrait?W*.45:W*.34,bodyBottom=portrait?H*.835:H*1.02,keyTop=bodyTop+H*(portrait?.085:.12),keyGapY=portrait?H*.05:H*.062,keyR=Math.min(portrait?W*.03:W*.017,keyGapY*.38),keyGapX=keyR*2.75;
 const machine=(()=>{
  const c=layer(W,H),g=c.getContext('2d');
  // Body: rounded shoulders, a deck behind the keys, the dark type basket opening under the print point.
  if(portrait){const sh=g.createRadialGradient(cx,bodyBottom,0,cx,bodyBottom,bodyHalf*1.15);sh.addColorStop(0,'rgba(0,0,0,.6)');sh.addColorStop(1,'rgba(0,0,0,0)');g.save();g.translate(0,bodyBottom);g.scale(1,.12);g.translate(0,-bodyBottom);g.fillStyle=sh;g.fillRect(cx-bodyHalf*1.2,bodyBottom-bodyHalf*1.2,bodyHalf*2.4,bodyHalf*2.4);g.restore();}
  g.fillStyle=rgba(enamel);g.beginPath();g.moveTo(cx-bodyHalf,bodyBottom);g.lineTo(cx-bodyHalf,bodyTop+F*1.6);g.quadraticCurveTo(cx-bodyHalf,bodyTop,cx-bodyHalf+F*1.6,bodyTop);g.lineTo(cx+bodyHalf-F*1.6,bodyTop);g.quadraticCurveTo(cx+bodyHalf,bodyTop,cx+bodyHalf,bodyTop+F*1.6);g.lineTo(cx+bodyHalf,bodyBottom);g.closePath();g.fill();if(portrait){g.fillStyle='rgba(0,0,0,.45)';g.fillRect(cx-bodyHalf,bodyBottom-u*.012,bodyHalf*2,u*.012);}
  const sheen=g.createLinearGradient(0,bodyTop,0,bodyTop+F*1.4);sheen.addColorStop(0,'rgba(255,220,180,.16)');sheen.addColorStop(1,'rgba(255,220,180,0)');g.fillStyle=sheen;g.fillRect(cx-bodyHalf,bodyTop,bodyHalf*2,F*1.4);
  const bx=cx,by=bodyTop+F*.9,brx=Math.min(bodyHalf*.42,F*4.4),bry=F*1.8;g.fillStyle='#07090a';g.beginPath();g.ellipse(bx,by,brx,bry,0,Math.PI,TAU);g.lineTo(bx+brx,by+F*.25);g.lineTo(bx-brx,by+F*.25);g.closePath();g.fill();
  g.strokeStyle='rgba(150,156,166,.45)';g.lineWidth=Math.max(1,F*.03);for(let k=0;k<=26;k++){const a=Math.PI+k/26*Math.PI;g.beginPath();g.moveTo(bx+Math.cos(a)*brx*.92,by+Math.sin(a)*bry*.92);g.lineTo(bx+Math.cos(a)*brx*.45,by+Math.sin(a)*bry*.35);g.stroke();}
  g.strokeStyle='rgba(255,220,180,.22)';g.lineWidth=Math.max(1,F*.04);g.beginPath();g.ellipse(bx,by,brx,bry,0,Math.PI,TAU);g.stroke();
  // Card guide around the print point.
  g.fillStyle=rgba(chrome);const gx=PX+F*.5;g.fillRect(gx-F*1.1,PY+F*.55,F*.75,F*.08);g.fillRect(gx+F*.35,PY+F*.55,F*.75,F*.08);
  // Front panel below the keys with the title phrase as a chrome nameplate.
  const fp=keyTop+keyGapY*3.15;g.fillStyle='rgba(0,0,0,.35)';g.fillRect(cx-bodyHalf,fp,bodyHalf*2,Math.max(1,u*.003));
  if(base.headline){const size=u*(portrait?.028:.024);setFont(measure,800,size,.3);let label=base.headline;while(label&&measure.measureText(label).width>bodyHalf*1.1)label=label.slice(0,-1);if(label!==base.headline)label+='…';
   const lw=measure.measureText(label).width+size*1.6,ly=fp+size*1.4;g.fillStyle='#0c0f10';g.beginPath();g.roundRect(cx-lw/2,ly-size*.85,lw,size*1.7,size*.3);g.fill();
   setFont(g,800,size,.3);g.textAlign='center';g.textBaseline='middle';g.fillStyle='rgba(0,0,0,.6)';g.fillText(label,cx,ly+size*.06);const gold=g.createLinearGradient(0,ly-size/2,0,ly+size/2);gold.addColorStop(0,'#f1e3c2');gold.addColorStop(1,'#a8916a');g.fillStyle=gold;g.fillText(label,cx,ly);}
  return c;
 })();
 const keySprite=(()=>{const s=Math.ceil(keyR*2.6),c=layer(s,s),g=c.getContext('2d'),m=s/2;g.fillStyle='rgba(0,0,0,.5)';g.beginPath();g.arc(m,m+keyR*.18,keyR*1.06,0,TAU);g.fill();
  const rim=g.createLinearGradient(0,m-keyR,0,m+keyR);rim.addColorStop(0,'#e4e7ec');rim.addColorStop(1,'#7c828c');g.fillStyle=rim;g.beginPath();g.arc(m,m,keyR,0,TAU);g.fill();
  const face=g.createRadialGradient(m-keyR*.2,m-keyR*.3,0,m,m,keyR*.82);face.addColorStop(0,'#2c3033');face.addColorStop(1,'#0e1012');g.fillStyle=face;g.beginPath();g.arc(m,m,keyR*.8,0,TAU);g.fill();return c;})();
 const keyPos=[];KEYS.forEach((row,ry)=>row.forEach((label,kx)=>keyPos.push({label,x:cx+(kx-4.5+ry*.35)*keyGapX,y:keyTop+ry*keyGapY})));
 const keyFor=ch=>{const code=ch.codePointAt(0);if(code>=0xac00&&code<=0xd7a3){const cho=CHO[Math.floor((code-0xac00)/588)];const label=PLAIN[cho]||cho;return keyPos.findIndex(k=>k.label===label);}const n=keyPos.findIndex(k=>k.label===ch);return n>=0?n:hash(ch)%keyPos.length;};

 // ---- Little radio on the desk: the spectrum glows in its dial. ----
 const R=portrait?{x:W*.06,y:H*.868,w:W*.28,h:H*.07}:{x:W*.05,y:H*.6,w:W*.17,h:H*.11};
 const radio=(()=>{const c=layer(R.w,R.h),g=c.getContext('2d'),grad=g.createLinearGradient(0,0,0,R.h);grad.addColorStop(0,'#3a2418');grad.addColorStop(1,'#1c120c');g.fillStyle=grad;g.beginPath();g.roundRect(0,0,R.w,R.h,R.h*.22);g.fill();
  g.fillStyle='rgba(255,210,160,.18)';g.fillRect(R.h*.2,1,R.w-R.h*.4,Math.max(1,R.h*.02));
  g.fillStyle='rgba(0,0,0,.55)';for(let k=0;k<6;k++)g.fillRect(R.w*.06,R.h*(.2+k*.11),R.w*.28,R.h*.05);
  for(const kx of [.4]){g.fillStyle='#120b07';g.beginPath();g.arc(R.w*kx,R.h*.5,R.h*.12,0,TAU);g.fill();}return c;})();
 const dial={x:R.x+R.w*.5,y:R.y+R.h*.2,w:R.w*.44,h:R.h*.6};

 function draw(ctx,time){
  const s=base.at(time),{i,local,duration}=s,p=plan(i),car=carriage(p,local);
  ctx.drawImage(room,0,0);ctx.globalCompositeOperation='lighter';ctx.drawImage(warmth,0,0,W,H);ctx.globalCompositeOperation='source-over';
  // Sheet: fed in from the platen at the start, pulled out upward at the end.
  const feed=(1-easeOut((local-.1)/1.1))*(GAP*3.2+F*2),pull=duration>3?Math.pow(clamp((local-(duration-1.05))/.95,0,1),2.2)*(PY+GAP*12):0;
  const x0=PX-car.x,y0=PY-car.row*GAP+feed-pull,sheetTop=y0-GAP*1.6,paperX=x0-MARGIN;
  ctx.save();ctx.beginPath();ctx.rect(0,0,W,platenY-platenR*.2);ctx.clip();
  ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(paperX+F*.25,Math.max(-10,sheetTop+F*.2),PW,platenY);
  const pat=ctx.createPattern(paperTile,'repeat');pat.setTransform(new DOMMatrix().translateSelf(paperX,sheetTop));ctx.fillStyle=pat;ctx.fillRect(paperX,Math.max(-10,sheetTop),PW,platenY+10-Math.max(-10,sheetTop));
  const curl=ctx.createLinearGradient(0,platenY-F*1.2,0,platenY);curl.addColorStop(0,'rgba(60,40,20,0)');curl.addColorStop(1,'rgba(60,40,20,.28)');ctx.fillStyle=curl;ctx.fillRect(paperX,platenY-F*1.2,PW,F*1.2);
  // Typed rows: finished rows from cache, the row under the print point stroke by stroke.
  for(const row of p.rows){const yy=y0+row.r*GAP;if(yy<-GAP||yy>platenY+GAP*.5)continue;
   const done=row.instant||row.end<local-.15;if(done&&row.start<=local)ctx.drawImage(rowLayer(i,row),x0-F*.5,yy-GAP/2);else if(row.start<=local)for(const c of row.chars){if(c.t>local)break;strike(ctx,c,x0,yy,local,row.bold);}}
  ctx.restore();
  // Platen and carriage: the rubber roller with knobs at both ends, paper bail with two rollers.
  const left=paperX-F*1.4,right=paperX+PW+F*1.4,turn=(car.row*GAP-feed+pull)/platenR;
  const roll=ctx.createLinearGradient(0,platenY-platenR,0,platenY+platenR);roll.addColorStop(0,'#3a3d42');roll.addColorStop(.35,'#15171a');roll.addColorStop(1,'#050506');ctx.fillStyle=roll;ctx.fillRect(left,platenY-platenR,right-left,platenR*2);
  ctx.fillStyle='rgba(255,220,180,.18)';ctx.fillRect(left,platenY-platenR*.72,right-left,Math.max(1,platenR*.08));
  for(const [kx,dir] of [[left,-1],[right,1]]){const r=platenR*1.25,kxx=kx+dir*r*.5;ctx.fillStyle=iron;ctx.fillRect(Math.min(kx,kxx),platenY-platenR*.5,Math.abs(kxx-kx),platenR);
   const knob=ctx.createLinearGradient(0,platenY-r,0,platenY+r);knob.addColorStop(0,'#d7dbe0');knob.addColorStop(.5,'#6d737c');knob.addColorStop(1,'#2a2d32');ctx.fillStyle=knob;ctx.beginPath();ctx.roundRect(kxx-r*.45,platenY-r,r*.9,r*2,r*.3);ctx.fill();
   // Knurled bands scroll as the platen turns.
   ctx.save();ctx.beginPath();ctx.roundRect(kxx-r*.45,platenY-r,r*.9,r*2,r*.3);ctx.clip();ctx.fillStyle='rgba(0,0,0,.35)';for(let k=-1;k<9;k++){const yy=platenY-r+((k*r*.25+turn*r*.4)%(r*2.25)+r*2.25)%(r*2.25);ctx.fillRect(kxx-r*.45,yy,r*.9,r*.07);}ctx.restore();}
  const bailY=PY-F*.88;ctx.fillStyle=rgba(chrome);ctx.fillRect(left+F*.6,bailY,right-left-F*1.2,Math.max(1.5,F*.05));
  for(const fx of [.3,.7]){const rx=paperX+PW*fx;ctx.fillStyle='#16181b';ctx.beginPath();ctx.roundRect(rx-F*.22,bailY-F*.1,F*.44,F*.26,F*.1);ctx.fill();}
  ctx.drawImage(machine,0,0);
  // Ribbon spools turn a little with every stroke.
  const typed=p.rows.reduce((a,row)=>a+row.chars.filter(c=>c.t<=local).length,0);
  for(const [sx,dir] of [[cx-Math.min(bodyHalf*.62,F*6.2),1],[cx+Math.min(bodyHalf*.62,F*6.2),-1]]){const sy=bodyTop+F*.55,r=F*.62;ctx.fillStyle='#0a0b0c';ctx.beginPath();ctx.arc(sx,sy,r*1.1,0,TAU);ctx.fill();ctx.fillStyle='#2a1c18';ctx.beginPath();ctx.arc(sx,sy,r*(dir>0?.95:.7),0,TAU);ctx.fill();
   ctx.save();ctx.translate(sx,sy);ctx.rotate(dir*typed*.21);ctx.strokeStyle=rgba(chrome);ctx.lineWidth=Math.max(1,F*.05);for(let k=0;k<3;k++){ctx.rotate(TAU/3);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(r*.62,0);ctx.stroke();}ctx.fillStyle='#d0d4da';ctx.beginPath();ctx.arc(0,0,r*.14,0,TAU);ctx.fill();ctx.fillStyle='#c4523e';ctx.fillRect(r*.3,-r*.06,r*.22,r*.12);ctx.restore();}
  // Strike: the typebar flicks up to the print point; its key dips.
  const last=car.last,age=last?local-last.t:9;
  if(last&&last.ch!==' '&&age<.075){const q=age<.03?age/.03:1-(age-.03)/.045,bx=PX+F*.5,by=bodyTop+F*.9,len=Math.hypot(0,by-PY)*.98,ang=(1-q)*1.25*(hash(last.ch)%2?1:-1);ctx.save();ctx.translate(bx,by);ctx.rotate(ang);ctx.fillStyle=rgba(chrome);ctx.fillRect(-F*.05,-len,F*.1,len);ctx.fillStyle='#2b2e33';ctx.fillRect(-F*.16,-len,F*.32,F*.22);ctx.restore();}
  const press=last&&age<.12&&last.ch!==' '?keyFor(last.ch):-1;
  keyPos.forEach((k,n)=>{const dy=n===press?keyR*.28*(1-age/.12):0;ctx.drawImage(keySprite,k.x-keySprite.width/2,k.y-keySprite.height/2+dy);text(ctx,k.label,k.x,k.y+dy+keyR*.04,{size:keyR*.82,weight:700,color:'#eef0f3',align:'center',baseline:'middle'});});
  {const sy=keyTop+keyGapY*2.62,sw=keyGapX*6,space=last&&last.ch===' '&&age<.12?keyR*.25:0;ctx.fillStyle='rgba(0,0,0,.5)';ctx.beginPath();ctx.roundRect(cx-sw/2,sy+keyR*.25,sw,keyR*.7,keyR*.3);ctx.fill();ctx.fillStyle='#1a1d20';ctx.beginPath();ctx.roundRect(cx-sw/2,sy+space,sw,keyR*.7,keyR*.3);ctx.fill();ctx.fillStyle='rgba(220,226,234,.4)';ctx.fillRect(cx-sw/2+keyR*.3,sy+space,sw-keyR*.6,Math.max(1,keyR*.06));}

  ctx.drawImage(shade,0,0,W,H);
  // Radio: the dial glass shows the spectrum; title and time on a card beside it.
  ctx.drawImage(radio,R.x,R.y);ctx.fillStyle='#1d140c';ctx.fillRect(dial.x,dial.y,dial.w,dial.h);
  const glow=ctx.createLinearGradient(0,dial.y,0,dial.y+dial.h);glow.addColorStop(0,'rgba(255,190,110,.32)');glow.addColorStop(1,'rgba(255,150,70,.16)');ctx.fillStyle=glow;ctx.fillRect(dial.x,dial.y,dial.w,dial.h);
  if(s.frame)drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:mix(amber,[255,236,200],.3),alpha:.95,amp:.9,x:dial.x+dial.w*.06,y:dial.y+dial.h*.12,width:dial.w*.88,height:dial.h*.76});
  const needle=dial.x+dial.w*lerp(.1,.9,(i+.5)/Math.max(1,N));ctx.fillStyle='rgba(200,40,30,.85)';ctx.fillRect(needle-Math.max(1,u*.0012),dial.y,Math.max(2,u*.0024),dial.h);
  ctx.strokeStyle='rgba(255,220,170,.35)';ctx.lineWidth=Math.max(1,u*.0015);ctx.strokeRect(dial.x,dial.y,dial.w,dial.h);
  const tx=portrait?R.x+R.w+W*.05:R.x,ty=portrait?R.y+R.h*.5-u*.033:R.y+R.h+u*.035,tw=portrait?W*.94-tx:W*.2;
  text(ctx,`${String(i+1).padStart(2,'0')} / ${String(N).padStart(2,'0')}`,tx,ty,{size:u*.017,weight:700,color:rgba(amber,.8),baseline:'middle',spacing:.2});
  text(ctx,s.track.title||'',tx,ty+u*.034,{size:u*.024,weight:700,color:'rgba(236,226,206,.92)',baseline:'middle',maxWidth:tw});
  text(ctx,`${stamp(local)} / ${stamp(duration)}`,tx,ty+u*.066,{size:u*.017,weight:600,color:'rgba(236,226,206,.55)',baseline:'middle',spacing:.1});
 }
 return {draw,duration:base.total};
}

import {sceneBase,shadowSprite,drawShadow,drawCover,drawSpectrum,fitText,setFont,ellipsize,stamp,rgba,mix,hsl,layer,hash,random,clamp,lerp,easeOut,easeInOut} from '../canvas-kit.mjs';

/**
 * 폴라로이드 보드: a cork board under a warm lamp. Each song's polaroid drops in turning, lands with a
 * small bounce and gets taped; the previous one flies to its own place on the board, so the collage
 * grows song by song. Lyrics are written line by line on a pinned notebook page beside the photo
 * (instrumental: the photo is lifted off the board and a track list note marks the playing song).
 */
const lru=(limit,make)=>{const m=new Map();return key=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make(key);m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};};
const PINS=[[214,58,52],[48,96,190],[236,186,52],[54,148,96],[238,236,230]];

/** Seamless cork tile: mottled base, granules and a few old pin holes. */
function corkTile(size){
 const c=layer(size,size),g=c.getContext('2d'),r=random(hash('cork-tile'));
 g.fillStyle='#a8763f';g.fillRect(0,0,size,size);
 const wrapDraw=(x,y,rad,fn)=>{for(const dx of [-size,0,size])for(const dy of [-size,0,size])if(x+dx+rad>0&&x+dx-rad<size&&y+dy+rad>0&&y+dy-rad<size)fn(x+dx,y+dy);};
 for(let k=0;k<34;k++){const x=r()*size,y=r()*size,rad=size*(.05+r()*.14),light=r()<.5,a=.08+r()*.1;wrapDraw(x,y,rad,(px,py)=>{const glow=g.createRadialGradient(px,py,0,px,py,rad);glow.addColorStop(0,light?`rgba(214,168,108,${a})`:`rgba(92,56,26,${a})`);glow.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=glow;g.fillRect(px-rad,py-rad,rad*2,rad*2);});}
 const grains=Math.round(size*size/9);
 for(let k=0;k<grains;k++){
  const x=r()*size,y=r()*size,s=.6+r()*r()*3.2,tone=r();
  g.fillStyle=tone<.45?`rgba(70,40,16,${.18+r()*.32})`:tone<.8?`rgba(150,104,58,${.2+r()*.3})`:`rgba(232,196,140,${.14+r()*.3})`;
  wrapDraw(x,y,s,(px,py)=>{g.beginPath();g.ellipse(px,py,s,s*(.55+r()*.45),r()*Math.PI,0,Math.PI*2);g.fill();});
 }
 for(let k=0;k<5;k++){const x=r()*size,y=r()*size;wrapDraw(x,y,3,(px,py)=>{g.fillStyle='rgba(40,22,8,.55)';g.beginPath();g.arc(px,py,1.3,0,Math.PI*2);g.fill();g.fillStyle='rgba(240,210,160,.25)';g.beginPath();g.arc(px+.8,py+.9,1.1,0,Math.PI*2);g.fill();});}
 return c;
}
/** Fine light speckle for photo paper and notebook paper. */
function grainTile(seed,dark){const c=layer(96,96),g=c.getContext('2d'),r=random(hash(seed));for(let k=0;k<900;k++){g.fillStyle=dark?`rgba(120,100,70,${.03+r()*.06})`:`rgba(255,255,255,${.1+r()*.2})`;g.fillRect(r()*96,r()*96,.6+r()*1.2,.6+r()*1.2);}return c;}
/** A strip of tape with torn ends; `tint` gives masking (cream) or washi color. */
function tapeShape(g,w,h,seed){const r=random(hash(seed)),teeth=7;g.beginPath();g.moveTo(0,0);for(let k=1;k<=teeth;k++)g.lineTo(k%2?w*(.012+r()*.02):0,h*k/teeth);for(let k=teeth;k>=0;k--)g.lineTo(k%2?w-w*(.012+r()*.02):w,h*k/teeth);g.closePath();}
function tapeSprite(w,h,tint,seed,alpha=.82){
 const c=layer(w,h),g=c.getContext('2d');tapeShape(g,w,h,seed);g.clip();
 const fill=g.createLinearGradient(0,0,0,h);fill.addColorStop(0,rgba(mix(tint,[255,255,255],.25),alpha));fill.addColorStop(1,rgba(tint,alpha));g.fillStyle=fill;g.fillRect(0,0,w,h);
 const r=random(hash(seed+'f'));for(let k=0;k<w/3;k++){g.fillStyle=`rgba(255,255,255,${.04+r()*.06})`;g.fillRect(r()*w,0,.8,h);}
 g.fillStyle='rgba(255,255,255,.22)';g.fillRect(0,h*.06,w,h*.1);g.fillStyle='rgba(0,0,0,.06)';g.fillRect(0,h*.88,w,h*.12);
 return c;
}
function drawPin(g,x,y,size,color){
 g.fillStyle='rgba(30,16,6,.35)';g.beginPath();g.ellipse(x+size*.55,y+size*.75,size*.95,size*.6,.5,0,Math.PI*2);g.fill();
 g.strokeStyle='rgba(200,205,212,.9)';g.lineWidth=size*.16;g.lineCap='round';g.beginPath();g.moveTo(x,y);g.lineTo(x+size*.45,y+size*.55);g.stroke();
 const head=g.createRadialGradient(x-size*.3,y-size*.35,size*.05,x,y,size);head.addColorStop(0,rgba(mix(color,[255,255,255],.65)));head.addColorStop(.35,rgba(color));head.addColorStop(1,rgba(mix(color,[0,0,0],.45)));
 g.fillStyle=head;g.beginPath();g.arc(x,y,size*.78,0,Math.PI*2);g.fill();
 g.fillStyle='rgba(255,255,255,.7)';g.beginPath();g.ellipse(x-size*.28,y-size*.3,size*.2,size*.12,-.7,0,Math.PI*2);g.fill();
}

export default function polaroid(input){
 const base=sceneBase(input,{hue:32}),{width:W,height:H,portrait,u,vocal,tracks}=base;
 // World layout (the camera pans and zooms slowly over it).
 const L=portrait
  ?{hero:[W*.5,H*.3,u*.56],memo:[u*.075,H*.545,u*.85,H*.385],lyric:u*.046,rule:u*.075,tape:[W*.5,H*.052],
    slots:[[.08,.21],[.92,.2],[.05,.42],[.95,.46],[.14,.985],[.86,.975],[.52,1.01],[.05,.7],[.96,.74],[.3,.02],[.72,.04],[.5,.52]]}
  :{hero:[W*.275,H*.545,u*.5],memo:[W*.525,H*.165,W*.4,H*.72],lyric:u*.038,rule:u*.063,tape:[W*.5,H*.085],
    slots:[[.055,.17],[.06,.86],[.45,.1],[.47,.94],[.97,.12],[.975,.9],[.19,.99],[.76,.04],[.015,.52],[.99,.5],[.66,.97],[.3,.03]]};
 const [HX,HY,PW]=L.hero,PH=PW*1.215,[MX,MY,MW,MH]=L.memo;
 const M=.06,bs=Math.min(1,1500/u),measure=layer(8,8).getContext('2d');
 const shadow=shadowSprite(256,{alpha:.62}),ink=[30,40,82],inkSoft=[78,86,112],pencil=[110,108,104];
 const photoGrain=grainTile('photo',false),paperGrain=grainTile('paper',true);
 const tapeW=Math.round(PW*.36),tapeH=Math.round(PW*.1),tape=tapeSprite(tapeW,tapeH,[236,226,196],'hero-tape');

 // ---- Board: cork pattern with baked lamp falloff, and per song the pinned polaroids of earlier songs.
 const cork=(()=>{
  const bw=Math.ceil(W*(1+2*M)*bs),bh=Math.ceil(H*(1+2*M)*bs),c=layer(bw,bh),g=c.getContext('2d'),tile=corkTile(384),pattern=g.createPattern(tile,'repeat');
  pattern.setTransform?.(new DOMMatrix().scale(Math.max(.75,u/1080*bs)));g.fillStyle=pattern;g.fillRect(0,0,bw,bh);
  const lamp=g.createRadialGradient(bw*.42,bh*.3,0,bw*.42,bh*.3,Math.hypot(bw,bh)*.62);lamp.addColorStop(0,'rgba(255,214,150,.16)');lamp.addColorStop(.5,'rgba(0,0,0,0)');lamp.addColorStop(1,'rgba(20,8,0,.55)');g.fillStyle=lamp;g.fillRect(0,0,bw,bh);
  return c;
 })();
 const slotOf=j=>{const r=random(hash('slot'+j)),[sx,sy]=L.slots[j%L.slots.length];return {x:(sx+(r()-.5)*.05)*W,y:(sy+(r()-.5)*.045)*H,a:(r()-.5)*.55,s:.5+r()*.08,pin:r()<.55,color:PINS[Math.floor(r()*PINS.length)],tape:r()};};
 const heroOf=j=>{const r=random(hash('hero'+j));return {x:HX+(r()-.5)*u*.02,y:HY+(r()-.5)*u*.016,a:(r()-.5)*.11,s:1,dir:r()<.5?-1:1};};

 function drawPolaroid(g,j,w){
  const h=w*1.215,art=base.art(j),m=w*.064,a=w-m*2;
  const paper=g.createLinearGradient(0,0,w,h);paper.addColorStop(0,'#fbfaf5');paper.addColorStop(1,'#ece7dc');g.fillStyle=paper;g.fillRect(0,0,w,h);
  g.save();g.globalAlpha=.7;g.fillStyle=g.createPattern(photoGrain,'repeat');g.fillRect(0,0,w,h);g.restore();
  g.fillStyle='#16130f';g.fillRect(m,m,a,a);drawCover(g,art.image,m,m,a,a);
  // Instant-film look: lifted blacks, warm cast, soft vignette, gloss.
  g.fillStyle='rgba(255,232,196,.09)';g.fillRect(m,m,a,a);g.fillStyle='rgba(40,30,60,.06)';g.fillRect(m,m,a,a);
  const v=g.createRadialGradient(m+a/2,m+a/2,a*.3,m+a/2,m+a/2,a*.78);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(20,10,0,.32)');g.fillStyle=v;g.fillRect(m,m,a,a);
  const gloss=g.createLinearGradient(m,m,m+a,m+a);gloss.addColorStop(0,'rgba(255,255,255,.16)');gloss.addColorStop(.38,'rgba(255,255,255,.03)');gloss.addColorStop(.4,'rgba(255,255,255,0)');g.fillStyle=gloss;g.fillRect(m,m,a,a);
  g.strokeStyle='rgba(0,0,0,.28)';g.lineWidth=Math.max(1,w*.004);g.strokeRect(m,m,a,a);
  const caption=fitText(g,tracks[j]?.title||'',{size:w*.058,minSize:w*.04,weight:600,lineHeight:1.18,maxWidth:w*.82,maxHeight:(h-m-a)*.62,spacing:-.01,maxLines:2});
  const top=m+a+(h-m-a-caption.height)/2-w*.012;setFont(g,caption.weight,caption.font,caption.spacing);g.textAlign='center';g.textBaseline='middle';g.fillStyle=rgba(ink,.86);
  caption.lines.forEach((line,n)=>g.fillText(line,w/2,top+(n+.5)*caption.font*caption.lineHeight));
  setFont(g,600,w*.026,.14);g.textAlign='right';g.textBaseline='alphabetic';g.fillStyle='rgba(60,50,40,.32)';g.fillText(`No.${String(j+1).padStart(2,'0')}`,w-m,h-m*.55);
  g.strokeStyle='rgba(0,0,0,.08)';g.lineWidth=1;g.strokeRect(.5,.5,w-1,h-1);
 }
 const heroSprite=lru(4,j=>{const c=layer(PW,PH),g=c.getContext('2d');drawPolaroid(g,j,PW);return c;});
 const board=lru(2,i=>{
  const c=layer(cork.width,cork.height),g=c.getContext('2d');g.drawImage(cork,0,0);
  g.setTransform(bs,0,0,bs,M*W*bs,M*H*bs);
  for(let j=Math.max(0,i-1-L.slots.length*2);j<i-1;j++){const p=slotOf(j),w=PW*p.s,h=w*1.215;
   g.save();g.translate(p.x,p.y);g.rotate(p.a);drawShadow(g,shadow,-w/2,-h/2,w,h,{alpha:.75,offsetY:.025,spread:1.1});g.translate(-w/2,-h/2);drawPolaroid(g,j,w);
   if(p.pin)drawPin(g,w/2,u*.018,u*.011,p.color);else{g.translate(w/2,0);g.rotate((p.tape-.5)*.3);g.drawImage(tape,-tapeW*p.s/2,-tapeH*p.s/2,tapeW*p.s,tapeH*p.s);}
   g.restore();}
  return c;
 });
 const pinned=(ctx,p,w,h,j)=>{if(p.pin)drawPin(ctx,0,-h/2+u*.018,u*.011,p.color);else{ctx.save();ctx.translate(0,-h/2);ctx.rotate((p.tape-.5)*.3);ctx.drawImage(tape,-tapeW*p.s/2,-tapeH*p.s/2,tapeW*p.s,tapeH*p.s);ctx.restore();}};

 // ---- Notebook page: cream paper, blue rules, red margin, torn spiral edge.
 const TX=MW*.15,TW=MW*.78,RULE0=MH*(portrait?.25:.26),RULE=L.rule,ROWS=Math.max(3,Math.floor((MH*.84-RULE0)/RULE)),LS=L.lyric;
 const ruleY=n=>RULE0+(n+1)*RULE;
 const sheet=(()=>{
  const c=layer(MW,MH),g=c.getContext('2d'),r=random(hash('sheet'));
  g.beginPath();g.moveTo(0,MH*.018);for(let x=0;x<=MW;x+=MW/60)g.lineTo(x,MH*.008+r()*MH*.012);g.lineTo(MW,MH);g.lineTo(0,MH);g.closePath();g.clip();
  const fill=g.createLinearGradient(0,0,MW,MH);fill.addColorStop(0,'#fbf8ef');fill.addColorStop(1,'#efe9db');g.fillStyle=fill;g.fillRect(0,0,MW,MH);
  g.fillStyle=g.createPattern(paperGrain,'repeat');g.fillRect(0,0,MW,MH);
  g.fillStyle='rgba(120,150,200,.07)';g.fillRect(0,0,MW,MH*.02);
  for(let n=0;n<ROWS;n++){g.fillStyle='rgba(98,140,200,.34)';g.fillRect(MW*.04,ruleY(n),MW*.93,Math.max(1,u*.0016));}
  g.fillStyle='rgba(98,140,200,.34)';g.fillRect(MW*.04,RULE0,MW*.93,Math.max(1,u*.0016));
  g.fillStyle='rgba(214,84,84,.45)';g.fillRect(MW*.12,0,Math.max(1,u*.0018),MH);
  for(let k=0;k<14;k++){g.fillStyle='rgba(60,46,30,.5)';g.beginPath();g.arc(MW*(.06+k*.068),MH*.035,u*.0055,0,Math.PI*2);g.fill();}
  const curl=g.createLinearGradient(MW*.82,MH*.86,MW,MH);curl.addColorStop(0,'rgba(0,0,0,0)');curl.addColorStop(1,'rgba(90,70,40,.16)');g.fillStyle=curl;g.fillRect(0,0,MW,MH);
  return c;
 })();
 const under=(()=>{const c=layer(MW,MH),g=c.getContext('2d');g.drawImage(sheet,0,0);g.globalCompositeOperation='source-atop';g.fillStyle='rgba(120,96,64,.16)';g.fillRect(0,0,MW,MH);return c;})();
 const pagesOf=lru(4,i=>{
  const cues=(tracks[i].cues||[]).filter(c=>Number.isFinite(c.start)),blocks=[],page=[],row=[],firsts=[];let p=0,used=0;
  cues.forEach((cue,n)=>{const b=fitText(measure,cue.text||'',{size:LS,minSize:LS*.72,weight:600,lineHeight:1,maxWidth:TW,maxHeight:LS*2.1,spacing:-.01,maxLines:2});setFont(measure,b.weight,b.font,b.spacing);b.widths=b.lines.map(l=>measure.measureText(l).width);blocks.push(b);
   if(used+b.lines.length>ROWS&&used>0){p++;used=0;}page[n]=p;row[n]=used;if(firsts[p]===undefined)firsts[p]=n;used+=b.lines.length;});
  return {cues,blocks,page,row,firsts};
 });
 const headOf=lru(4,i=>{setFont(measure,700,LS*1.02,-.01);return ellipsize(measure,tracks[i].title||'',TW);});
 const titleTape=(()=>{
  if(!base.headline)return null;const size=u*.03;setFont(measure,800,size,.12);const label=ellipsize(measure,base.headline,W*.62),tw=measure.measureText(label).width,w=Math.ceil(tw+size*2.4),h=Math.ceil(size*2.05);
  const c=tapeSprite(w,h,[232,222,192],'headline',.9),g=c.getContext('2d');setFont(g,800,size,.12);g.textAlign='center';g.textBaseline='middle';g.fillStyle='rgba(36,34,44,.88)';g.fillText(label,w/2+size*.06,h/2+size*.04);
  return c;
 })();
 const listTitle=(()=>{const total=tracks.reduce((a,t)=>a+(Number(t.duration)||0),0);return `${tracks.length}곡 · ${stamp(total)}`;})();

 function line(ctx,str,x,y,size,weight,color,{align='left',spacing=0,maxWidth=Infinity}={}){setFont(ctx,weight,size,spacing);ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillStyle=color;ctx.fillText(Number.isFinite(maxWidth)?ellipsize(ctx,str,maxWidth):str,x,y);}
 /** One page of lyrics: earlier lines in faded ink, the current line written in as it starts. */
 function lyricPage(ctx,i,p,s,current){
  const data=pagesOf(i);
  for(let n=data.firsts[p]??0;n<data.cues.length&&data.page[n]===p&&n<=current;n++){
   const b=data.blocks[n],r=random(hash(`${i}:${n}`)),dx=(r()-.5)*MW*.012,tilt=(r()-.5)*.008,hot=n===current;
   const start=data.cues[n].start,next=data.cues[n+1]?.start??s.duration,dur=clamp((next-start)*.32,.38,1.1),written=hot?clamp((s.local-start)/dur,0,1):1,total=b.widths.reduce((a,v)=>a+v,0);
   let budget=written*total;setFont(ctx,b.weight,b.font,b.spacing);ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillStyle=rgba(hot?ink:inkSoft,hot?.95:.62);
   b.lines.forEach((text,k)=>{const y=ruleY(data.row[n]+k)-RULE*.2,w=Math.min(b.widths[k],budget);budget-=b.widths[k];if(w<=0)return;
    ctx.save();ctx.translate(TX+dx,y);ctx.rotate(tilt);if(w<b.widths[k]){ctx.beginPath();ctx.rect(-4,-b.font*1.2,w+4,b.font*1.6);ctx.clip();}ctx.fillText(text,0,0);ctx.restore();});
   if(hot){ctx.fillStyle=rgba(base.art(i).accent,.9);ctx.beginPath();ctx.arc(MW*.085,ruleY(data.row[n])-RULE*.2-b.font*.32,u*.005,0,Math.PI*2);ctx.fill();}
  }
 }
 function listPage(ctx,p,s){
  const size=LS*.82,first=p*ROWS,art=base.art(s.i),mark=easeOut((s.local-.5)/.9);
  for(let n=first;n<Math.min(tracks.length,first+ROWS);n++){
   const y=ruleY(n-first)-RULE*.22,hot=n===s.i,done=n<s.i;
   if(hot){const w=(TW-size*3.3)*mark;ctx.fillStyle=rgba(hsl(art.hue,.75,.72),.5);ctx.beginPath();ctx.roundRect(TX-size*.35,y-size*1.02,w+size*.35,size*1.42,size*.3);ctx.fill();}
   line(ctx,String(n+1).padStart(2,'0'),TX,y,size*.86,700,rgba(hot?ink:inkSoft,hot?.95:.6),{spacing:.04});
   line(ctx,tracks[n].title||'',TX+size*2.1,y,size,hot?800:600,rgba(hot?ink:inkSoft,hot?.96:done?.45:.72),{maxWidth:TW-size*5.6});
   line(ctx,stamp(Number(tracks[n].duration)||0),TX+TW,y,size*.78,500,rgba(pencil,.8),{align:'right'});
   if(done){ctx.strokeStyle='rgba(196,58,58,.78)';ctx.lineWidth=u*.003;ctx.lineCap='round';ctx.lineJoin='round';const cx=MW*.075,cy=y-size*.35;ctx.beginPath();ctx.moveTo(cx-size*.3,cy);ctx.lineTo(cx-size*.06,cy+size*.26);ctx.lineTo(cx+size*.36,cy-size*.34);ctx.stroke();}
  }
 }
 function drawSheet(ctx,s,page,content){
  const i=s.i;ctx.drawImage(sheet,0,0);
  if(vocal){
   line(ctx,`No.${String(i+1).padStart(2,'0')} / ${String(tracks.length).padStart(2,'0')}`,TX,MH*.105,u*.017,700,'rgba(196,58,58,.85)',{spacing:.14});
   line(ctx,headOf(i),TX,MH*.105+LS*1.45,LS*1.02,700,rgba(ink,.92),{spacing:-.01});
  }else{
   line(ctx,'PLAYLIST',TX,MH*.105,u*.017,800,'rgba(196,58,58,.85)',{spacing:.22});
   line(ctx,listTitle,TX,MH*.105+LS*1.4,LS*.92,700,rgba(ink,.9));
   const pages=Math.ceil(tracks.length/ROWS);if(pages>1)line(ctx,`${page+1} / ${pages}`,TX+TW,MH*.105,u*.017,600,rgba(pencil,.85),{align:'right',spacing:.1});
  }
  content(ctx);
 }

 function draw(ctx,time){
  const s=base.at(time),{i,local,energy}=s,art=base.art(i);
  // Camera: a slow pan and zoom over the board.
  const z=1.035+Math.sin(s.t*.043)*.022,px=Math.sin(s.t*.031)*W*.016,py=Math.cos(s.t*.026)*H*.013;
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#3a2410';ctx.fillRect(0,0,W,H);
  ctx.setTransform(z,0,0,z,W/2-(W/2+px)*z,H/2-(H/2+py)*z);
  ctx.drawImage(board(i),-M*W,-M*H,W*(1+2*M),H*(1+2*M));
  // Lamp pool on the board, a touch brighter on loud passages.
  ctx.globalCompositeOperation='soft-light';const pool=ctx.createRadialGradient(W*.45,H*.35,0,W*.45,H*.35,u*1.05);pool.addColorStop(0,rgba(mix(art.soft,[255,220,170],.6),.28+energy.level*.1));pool.addColorStop(1,'rgba(255,220,170,0)');ctx.fillStyle=pool;ctx.fillRect(-M*W,-M*H,W*(1+2*M),H*(1+2*M));ctx.globalCompositeOperation='source-over';
  // The previous song's polaroid flies from the hero spot to its place in the collage.
  if(i>0){const k=easeInOut(local/.95),from=heroOf(i-1),to=slotOf(i-1),x=lerp(from.x,to.x,k),y=lerp(from.y,to.y,k)-Math.sin(k*Math.PI)*u*.04,sc=lerp(1,to.s,k),a=lerp(from.a,to.a,k),w=PW*sc,h=PH*sc,lift=Math.sin(k*Math.PI);
   ctx.save();ctx.translate(x,y);ctx.rotate(a);drawShadow(ctx,shadow,-w/2,-h/2,w,h,{alpha:.75-lift*.3,offsetY:.025+lift*.06,spread:1.1+lift*.12});ctx.drawImage(heroSprite(i-1),-w/2,-h/2,w,h);if(k>=1)pinned(ctx,to,w,h);ctx.restore();}
  // Notebook page with lyrics or the track list.
  const memoA=-.012;ctx.save();ctx.translate(MX+MW/2,MY+MH/2);ctx.rotate(memoA);
  ctx.save();ctx.rotate(.022);drawShadow(ctx,shadow,-MW/2,-MH/2,MW,MH,{alpha:.55,offsetY:.012,spread:1.05});ctx.drawImage(under,-MW/2+u*.006,-MH/2+u*.004);ctx.restore();
  ctx.save();ctx.rotate(-.02);ctx.drawImage(under,-MW/2-u*.004,-MH/2+u*.002);ctx.restore();
  drawShadow(ctx,shadow,-MW/2,-MH/2,MW,MH,{alpha:.45,offsetY:.01,spread:1.04});
  ctx.translate(-MW/2,-MH/2);
  let page=0,turnAt=-1,content,prevContent;
  if(vocal){const {index}=base.rollState(s),data=pagesOf(i);page=index>=0?data.page[index]:0;turnAt=page>0?data.cues[data.firsts[page]].start:-1;
   content=g=>lyricPage(g,i,page,s,index);prevContent=g=>lyricPage(g,i,page-1,s,data.firsts[page]-1);}
  else{page=Math.floor(i/ROWS);turnAt=i>0&&i%ROWS===0?0:-1;content=g=>listPage(g,page,s);prevContent=g=>listPage(g,page-1,{...s,i:i,local:9});}
  const turn=turnAt>=0?easeOut((local-turnAt)/.55):1;
  if(turn<1){drawSheet(ctx,s,page-1,prevContent);ctx.save();ctx.translate(MW*.06*(1-turn),-MH*.1*(1-turn));ctx.translate(MW/2,0);ctx.rotate(.06*(1-turn));ctx.translate(-MW/2,0);ctx.globalAlpha=clamp(turn*2.5,0,1);drawShadow(ctx,shadow,0,0,MW,MH,{alpha:.5*(1-turn),offsetY:.03,spread:1.06});drawSheet(ctx,s,page,content);ctx.restore();ctx.globalAlpha=1;}
  else drawSheet(ctx,s,page,content);
  // Footer: the measured spectrum as an ink doodle, a pencil progress line and the time.
  const fy=MH*.935,fx=TX,fw=TW;
  if(s.frame)drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:ink,alpha:.55,x:fx,y:fy-MH*.075,width:fw*.42,height:MH*.06});
  ctx.fillStyle=rgba(pencil,.35);ctx.fillRect(fx,fy,fw,Math.max(1,u*.0018));ctx.fillStyle=rgba(ink,.75);ctx.fillRect(fx,fy-u*.0008,fw*s.progress,Math.max(1.5,u*.0034));
  ctx.beginPath();ctx.arc(fx+fw*s.progress,fy+u*.0008,u*.0045,0,Math.PI*2);ctx.fill();
  line(ctx,`${stamp(local)} / ${stamp(s.duration)}`,fx+fw,fy-u*.014,u*.016,600,rgba(pencil,.9),{align:'right',spacing:.04});
  ctx.restore();
  drawPin(ctx,MX+MW/2,MY+MH*.03,u*.012,mix(art.accent,[214,58,52],.35));
  // This song's polaroid: drops in turning, lands with a small bounce, then is taped (instrumental: lifted).
  const hero=heroOf(i),fall=clamp((local-.25)/.72,0,1),landed=local-.97;let x=hero.x,y=hero.y,a=hero.a,sc=1,air=0;
  if(fall<1){const f=fall*fall;y=lerp(-PH*.9-u*.25,hero.y,f);x=hero.x+hero.dir*u*.1*(1-fall);a=hero.a+hero.dir*.55*(1-easeOut(fall));air=1-f;}
  else{const d=Math.exp(-landed*6.5);sc=1-.035*d*Math.cos(landed*17);a=hero.a+hero.dir*.04*d*Math.cos(landed*12);}
  let hover=0;if(!vocal){hover=easeInOut((local-1.8)/1.3)*s.exit;sc*=1+.05*hover;a+=Math.sin(s.t*.55)*.018*hover;y-=u*.012*hover+Math.sin(s.t*.8)*u*.004*hover;air=Math.max(air,hover*.55);}
  if(local>.25){const w=PW*sc,h=PH*sc;ctx.save();ctx.translate(x,y);ctx.rotate(a);
   drawShadow(ctx,shadow,-w/2,-h/2,w,h,{alpha:.78-air*.35,offsetY:.02+air*.09,spread:1.08+air*.22});ctx.drawImage(heroSprite(i),-w/2,-h/2,w,h);
   if(vocal&&landed>.08){const k=easeOut((landed-.08)/.25),r=random(hash('t'+i));ctx.translate(0,-h/2+u*.004);ctx.rotate((r()-.5)*.25);ctx.globalAlpha=k;ctx.drawImage(tape,-tapeW/2*(1.15-.15*k),-tapeH/2,tapeW*(1.15-.15*k),tapeH);ctx.globalAlpha=1;}
   ctx.restore();}
  // Headline on a strip of masking tape across the top of the board.
  if(titleTape){const [tx,ty]=L.tape,tw=titleTape.width,th=titleTape.height;ctx.save();ctx.translate(tx,ty);ctx.rotate(-.018);drawShadow(ctx,shadow,-tw/2,-th/2,tw,th,{alpha:.3,offsetY:.04,spread:1.05});ctx.drawImage(titleTape,-tw/2,-th/2);ctx.restore();}
  ctx.setTransform(1,0,0,1,0,0);
  const v=ctx.createRadialGradient(W/2,H/2,u*.35,W/2,H/2,Math.hypot(W,H)*.56);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(14,6,0,.42)');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
 }
 return {draw,duration:base.total};
}

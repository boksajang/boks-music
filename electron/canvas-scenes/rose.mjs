import {sceneBase,drawSpectrum,fitText,setFont,ellipsize,text,stamp,rgba,mix,hsl,layer,hash,random,clamp,lerp,easeOut,easeInOut} from '../canvas-kit.mjs';

/**
 * 장미 개화: one rose on dark velvet, seen in three-quarter view. Every petal is a curved surface around
 * the stem axis, projected and shaded (dark velvet base, luminous rolled rim, soft shadow, faint veins).
 * The song starts with a tall closed bud hugged by its sepals; each lyric line opens it further, outer
 * petals first — a cup, then a full bloom whose outer petals curl back while the heart stays furled.
 * Lyrics unfold glyph by glyph beside it; now and then a petal lets go and drifts down. At the end of a
 * song the petals fold shut and a new bud rises. Only the dew on the petals glints with the music.
 */
const TAU=Math.PI*2,TILT=.42,CB=Math.cos(TILT),SB=Math.sin(TILT),LIGHT=(()=>{const v=[-.5,.72,.48],n=Math.hypot(...v);return v.map(x=>x/n);})();
const lru=(limit,make)=>{const m=new Map();return key=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make(key);m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};};
/** Velvet crimson; the album hue only shifts it toward rose pink, warm red or deep burgundy. */
function roseTone(h){
 h=((h%360)+360)%360;const [hue,l]=h>=20&&h<70?[358,1.05]:h>=70&&h<200?[346,.78]:h>=200&&h<300?[340,1]:[352,1];
 return {deep:hsl(hue,.85,.1*l),mid:hsl(hue,.82,.27*l),edge:hsl(hue+3,.8,.44*l),rim:hsl(hue+6,.85,.68*Math.min(1,l*1.05))};
}
const GREEN={deep:[10,26,10],mid:[34,72,28],edge:[70,118,52],rim:[130,176,96]};
// Petals by layer, inner to outer; the golden-angle offsets keep neighbours from lining up.
const LAYERS=[3,3,4,5,5,6,6],NL=LAYERS.length;
const PETALS=(()=>{const list=[];let n=0;LAYERS.forEach((m,l)=>{const q=l/(NL-1);for(let k=0;k<m;k++){const r=random(hash('rose-petal'+n++));list.push({l,q,phi:l*2.4+k/m*TAU+(r()-.5)*.4,len:(.44+.095*l)*(.94+r()*.12),r0:.012+.013*l,w:(.2+.048*l)*(.92+r()*.16)});}});
 for(let k=0;k<5;k++)list.push({sepal:true,l:NL,q:1,phi:k/5*TAU+.35,len:.5,r0:.07,w:.075});return list;})();
/** Centre-line angle from upright: closed bud (tips turned in) → cup → bloom (outer tips curled back). */
function angles(p,o){
 if(p.sepal)return [lerp(.3,2.1,clamp(o*1.6,0,1)),0,lerp(-.22,.4,clamp(o*1.6,0,1))];
 const q=p.q,C=[.34+.04*q,0,-.86+.16*q],U=[.36+.22*q,.06,.1+.28*q],O=[.5+.62*q,.14,.2+.8*q],[a,b,k]=o<.5?[C,U,o*2]:[U,O,(o-.5)*2];
 return a.map((v,i)=>lerp(v,b[i],easeInOut(k)));
}
const profile=v=>Math.pow(Math.sin(Math.min(1,v/.72)*Math.PI/2),.8)*(v>.72?1-((v-.72)/.28)**2*.22:1);
const STEPS=10;
/** Petal outline projected to the screen (R units, y down), with the data needed to shade it. */
function petalGeometry(p,o){
 const [a0,a1,a2]=angles(p,o),len=p.sepal?p.len:lerp(.64-.08*p.q,p.len,easeInOut(clamp(o*1.3,0,1))),line=[];
 let rho=p.r0,y=0;line.push({rho,y,a:a0});
 for(let k=1;k<=STEPS;k++){const vm=(k-.5)/STEPS,am=a0+a1*vm+a2*vm*vm;rho+=Math.sin(am)*len/STEPS;y+=Math.cos(am)*len/STEPS;const v=k/STEPS;line.push({rho,y,a:a0+a1*v+a2*v*v});}
 const roll=p.sepal?0:o*o*(.5+.8*p.q),cup=p.sepal?0:1-o*.5;
 const point=(s,k,ext=0)=>{const c=line[k],v=k/STEPS,half=p.w*(p.sepal?(1-v*.85)*Math.sin(Math.min(1,v/.25)*Math.PI/2):profile(v)),th=p.phi+s*Math.min(half/Math.max(c.rho,.03),1.35);
  const st=Math.sin(th),ct=Math.cos(th),out=[Math.cos(c.a)*st,-Math.sin(c.a),Math.cos(c.a)*ct],tan=[Math.sin(c.a)*st,Math.cos(c.a),Math.sin(c.a)*ct];
  // Edges roll back near the top as the petal opens; a closed petal is cupped inward.
  const d=len*(roll*Math.max(0,Math.abs(s)-.45)*Math.max(0,v-.5)*.5-cup*s*s*v*.1);
  const x=c.rho*st+out[0]*d+tan[0]*ext,yy=c.y+out[1]*d+tan[1]*ext,z=c.rho*ct+out[2]*d+tan[2]*ext;return [x,-yy*CB+z*SB,z*CB+yy*SB];};
 const pts=[],left=[],right=[],top=[];
 for(let k=0;k<=STEPS;k++){pts.push(point(-1,k));left.push(pts.length-1);}
 const arc=p.sepal?1:12;for(let j=1;j<arc;j++){const s=-1+2*j/arc;pts.push(point(s*(p.sepal?0:1),STEPS,len*.075*Math.cos(s*Math.PI/2)*(p.sepal?0:1)));top.push(pts.length-1);}
 for(let k=STEPS;k>=0;k--){pts.push(point(1,k));right.push(pts.length-1);}
 const mid=line[STEPS>>1],n=[-Math.cos(mid.a)*Math.sin(p.phi),Math.sin(mid.a),-Math.cos(mid.a)*Math.cos(p.phi)],facing=n[1]*SB+n[2]*CB,m=facing>0?n:n.map(x=>-x);
 const light=.5+.6*Math.max(0,m[0]*LIGHT[0]+m[1]*LIGHT[1]+m[2]*LIGHT[2]),tip=point(0,STEPS),base=point(0,0),depth=pts.reduce((a,q)=>a+q[2],0)/pts.length;
 return {pts,left,right,top:[left[left.length-1],...top,right[0]],tip,base,inner:facing>0,light,depth,len};
}
/** Openness per petal for bloom F: a wave from the outer layers in; the two innermost stay furled. */
const opensFor=F=>PETALS.map(p=>p.sepal?F:easeInOut(clamp((F-.5*(1-p.q))/.5,0,1))*(p.l<2?.42:1));
/** Far side first (outer to inner), then the near side (inner to outer): nested cups overlap correctly. */
function ordered(geo,F){const items=PETALS.map((p,n)=>({p,g:geo[n]}));
 // Sepals hug the outside of the bud; once they fold down they sit behind the bloom.
 if(F>.18){const sep=items.filter(it=>it.p.sepal),rest=items.filter(it=>!it.p.sepal);return [...sep,...ordered2(rest)];}
 return ordered2(items);}
function ordered2(items){const back=items.filter(it=>Math.cos(it.p.phi)<0).sort((a,b)=>b.p.l-a.p.l||a.g.depth-b.g.depth),front=items.filter(it=>Math.cos(it.p.phi)>=0).sort((a,b)=>a.p.l-b.p.l||a.g.depth-b.g.depth);return [...back,...front];}

export default function rose(input){
 const base=sceneBase(input,{hue:350}),{width:W,height:H,portrait,u,tracks}=base;
 const L=portrait
  ?{box:[W*.1,H*.09,W*.9,H*.5],lyric:[W*.5,H*.735,W*.84],ls:u*.068,head:H*.05,info:H*.935,spec:[W*.3,H*.88,W*.4,H*.025]}
  :{box:[W*.075,H*.1,W*.45,H*.84],lyric:[W*.695,H*.5,W*.42],ls:u*.064,head:H*.075,info:H*.915,spec:[W*.57,H*.83,W*.24,H*.04]};
 const [LX,LY,LW]=L.lyric,LS=L.ls,measure=layer(8,8).getContext('2d');
 // Fit every stage (bud to full bloom) inside the flower box.
 const bounds=(()=>{let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const F of [0,.25,.5,.75,1]){const o=opensFor(F);PETALS.forEach((p,n)=>{for(const [x,y] of petalGeometry(p,o[n]).pts){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}});}return {x0,y0,x1,y1};})();
 const [BX0,BY0,BX1,BY1]=L.box,R=Math.min((BX1-BX0)/(bounds.x1-bounds.x0),(BY1-BY0)/(bounds.y1-bounds.y0));
 const FX=(BX0+BX1)/2-(bounds.x0+bounds.x1)/2*R,FY=(BY0+BY1)/2-(bounds.y0+bounds.y1)/2*R;

 // ---- Velvet backdrop, painted once ---------------------------------------------------------------
 const velvet=(()=>{
  const c=layer(W,H),g=c.getContext('2d'),r=random(hash('velvet')),cy=FY+(bounds.y0+bounds.y1)/2*R;
  const bg=g.createRadialGradient(FX,cy,u*.05,FX,cy,Math.hypot(W,H)*.75);bg.addColorStop(0,'#360b16');bg.addColorStop(.4,'#1b050b');bg.addColorStop(1,'#070103');g.fillStyle=bg;g.fillRect(0,0,W,H);
  // Soft folds: long diagonal sheen bands, the pile catching light along each crest.
  for(let k=0;k<9;k++){const x=r()*W*1.4-W*.2,w=u*(.08+r()*.22),a=.022+r()*.035;g.save();g.translate(x,H/2);g.rotate(-.35+r()*.2);const s=g.createLinearGradient(-w,0,w,0);s.addColorStop(0,'rgba(255,120,150,0)');s.addColorStop(.5,`rgba(255,120,150,${a})`);s.addColorStop(1,'rgba(255,120,150,0)');g.fillStyle=s;g.fillRect(-w,-H,w*2,H*2);g.restore();}
  for(let k=0;k<Math.round(W*H/220);k++){g.fillStyle=r()<.5?`rgba(0,0,0,${.06+r()*.08})`:`rgba(255,160,180,${.012+r()*.02})`;g.fillRect(r()*W,r()*H,1+r(),1+r());}
  const v=g.createRadialGradient(W/2,H/2,u*.4,W/2,H/2,Math.hypot(W,H)*.6);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,.55)');g.fillStyle=v;g.fillRect(0,0,W,H);
  return c;
 })();
 // Stem, thorns and two leaves below the receptacle (portrait: the stem fades out above the lyrics).
 const leaf=(()=>{const s=256,c=layer(s,s*.56),g=c.getContext('2d'),h=c.height;
  g.beginPath();g.moveTo(4,h/2);for(let k=0;k<=24;k++){const t=k/24,x=4+t*(s-8),y=h/2-Math.sin(t*Math.PI)*h*.44*(1-t*.25)-(k%2?h*.025:0);g.lineTo(x,y);}for(let k=24;k>=0;k--){const t=k/24,x=4+t*(s-8),y=h/2+Math.sin(t*Math.PI)*h*.44*(1-t*.25)+(k%2?h*.025:0);g.lineTo(x,y);}g.closePath();
  const f=g.createLinearGradient(0,0,0,h);f.addColorStop(0,'#3a6229');f.addColorStop(.5,'#203f17');f.addColorStop(1,'#10240b');g.fillStyle=f;g.fill();
  g.strokeStyle='rgba(170,210,130,.3)';g.lineWidth=2;g.beginPath();g.moveTo(6,h/2);g.quadraticCurveTo(s*.5,h*.47,s-8,h/2);g.stroke();
  g.lineWidth=1;for(let k=1;k<8;k++){const x=s*k/8.5;for(const d of [-1,1]){g.beginPath();g.moveTo(x,h/2);g.quadraticCurveTo(x+s*.05,h/2+d*h*.15,x+s*.09,h/2+d*h*.3*Math.sin(x/s*Math.PI));g.stroke();}}
  return c;})();
 const STEM=(portrait?H*.6:H*1.02)-FY;
 function drawStem(ctx){
  ctx.lineCap='round';let sg;
  if(portrait){sg=ctx.createLinearGradient(0,STEM*.55,0,STEM);sg.addColorStop(0,'#2f5420');sg.addColorStop(1,'rgba(30,60,20,0)');}else{sg=ctx.createLinearGradient(-R*.05,0,R*.05,0);sg.addColorStop(0,'#183210');sg.addColorStop(.4,'#3a6427');sg.addColorStop(1,'#12260c');}
  ctx.strokeStyle=sg;ctx.lineWidth=R*.05;ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(R*.06,STEM*.4,-R*.08,STEM*.7,R*.03,STEM);ctx.stroke();
  ctx.fillStyle='#284519';for(const [f,d] of [[.3,1],[.55,-1],[.82,1]]){const y=STEM*f*(portrait?.8:1),x=R*.01;ctx.beginPath();ctx.moveTo(x+d*R*.02,y-R*.03);ctx.lineTo(x+d*R*.075,y-R*.06);ctx.lineTo(x+d*R*.02,y+R*.01);ctx.fill();}
  for(const [f,a,s,flip] of [[.38,-.5,.62,1],[.62,3.55,.68,-1]]){ctx.save();ctx.translate(R*.015,STEM*f*(portrait?.85:1));ctx.rotate(a);ctx.scale(1,flip);ctx.drawImage(leaf,0,-R*s*.28,R*s,R*s*.56);ctx.restore();}
 }

 // ---- The bloom, rendered once per stage into a cached layer ---------------------------------------
 const PAD=R*.06,LW0=Math.ceil((bounds.x1-bounds.x0)*R+PAD*2),LH0=Math.ceil((bounds.y1-bounds.y0)*R+PAD*2),OX=-bounds.x0*R+PAD,OY=-bounds.y0*R+PAD;
 const DEW=[[PETALS.findIndex(p=>p.l===6),.25,.62],[PETALS.findIndex(p=>p.l===5)+2,-.3,.55],[PETALS.findIndex(p=>p.l===4)+1,.1,.7]];
 const toScreen=([x,y])=>[OX+x*R,OY+y*R];
 const polyline=(g,pts,idx,close)=>{g.beginPath();idx.forEach((n,k)=>{const [x,y]=toScreen(pts[n]);k?g.lineTo(x,y):g.moveTo(x,y);});if(close)g.closePath();};
 function paintPetal(g,p,geo,tone){
  const all=geo.pts.map((_,n)=>n),[bx,by]=toScreen(geo.base),[tx,ty]=toScreen(geo.tip),b=geo.light,sh=c=>c.map(v=>Math.min(255,v*b));
  const body=geo.inner?tone.mid:mix(tone.mid,tone.edge,.22),f=g.createLinearGradient(bx,by,tx,ty);
  f.addColorStop(0,rgba(sh(tone.deep)));f.addColorStop(.45,rgba(sh(body)));f.addColorStop(.86,rgba(sh(tone.edge)));f.addColorStop(1,rgba(sh(mix(tone.edge,tone.rim,.45))));
  // Soft shadow on the petals behind, then the petal itself; no outline.
  g.save();g.shadowColor='rgba(10,0,4,.55)';g.shadowBlur=R*.035;g.shadowOffsetY=R*.01;polyline(g,geo.pts,all,true);g.fillStyle=f;g.fill();g.restore();
  g.save();polyline(g,geo.pts,all,true);g.clip();g.lineJoin='round';g.lineCap='round';
  // Form: the sides darken where the petal turns away; a shadowed heart at the base.
  for(const side of [geo.left,geo.right]){polyline(g,geo.pts,side);g.strokeStyle=rgba(tone.deep.map(v=>v*.6),.09);for(const w of [.12,.075,.04,.018]){g.lineWidth=R*w*geo.len;g.stroke();}}
  const hr=geo.len*R*.42,hg=g.createRadialGradient(bx,by,0,bx,by,hr);hg.addColorStop(0,rgba(tone.deep.map(v=>v*.7),.55));hg.addColorStop(1,rgba(tone.deep,0));g.fillStyle=hg;g.fillRect(bx-hr,by-hr,hr*2,hr*2);
  // Faint veins fanning from the base, then the luminous rolled rim.
  g.strokeStyle=rgba(tone.rim,.06);g.lineWidth=Math.max(.6,R*.0025);for(const s of [-.45,0,.45]){const [mx,my]=toScreen(geo.pts[Math.round(lerp(geo.left[STEPS>>1],geo.right[STEPS>>1],(s+1)/2))]);g.beginPath();g.moveTo(bx,by);g.quadraticCurveTo(lerp(bx,mx,.7),lerp(by,my,.7),lerp(mx,tx,.5),lerp(my,ty,.5));g.stroke();}
  polyline(g,geo.pts,geo.top);g.strokeStyle=rgba(sh(mix(tone.edge,tone.rim,.6)),.12*clamp(b,.5,1));for(const w of [.11,.07,.04,.02]){g.lineWidth=R*w*geo.len;g.stroke();}
  g.restore();
 }
 const toneOf=lru(4,i=>roseTone(base.art(i).hue));
 const bloomAt=lru(3,key=>{
  const [i,step]=key.split(':').map(Number),F=step/400,tone=toneOf(i),o=opensFor(F),geo=PETALS.map((p,n)=>petalGeometry(p,o[n]));
  const c=layer(LW0,LH0),g=c.getContext('2d');
  for(const {p,g:pg} of ordered(geo,F))paintPetal(g,p,pg,p.sepal?GREEN:tone);
  // Dew drops on a few open outer petals (the glint is added per frame).
  const dew=[];for(const [n,s,v] of DEW){if(o[n]<.65||!geo[n].inner)continue;const pg=geo[n],k=Math.round(v*STEPS),[lx,ly]=toScreen(pg.pts[pg.left[k]]),[rx,ry]=toScreen(pg.pts[pg.right[STEPS-k]]),x=lerp(lx,rx,(s+1)/2),y=lerp(ly,ry,(s+1)/2),d=R*.016;
   g.fillStyle='rgba(30,0,8,.35)';g.beginPath();g.ellipse(x+d*.3,y+d*.35,d,d*.8,0,0,TAU);g.fill();g.fillStyle='rgba(255,220,228,.28)';g.beginPath();g.ellipse(x,y,d,d*.8,0,0,TAU);g.fill();g.fillStyle='rgba(255,255,255,.9)';g.beginPath();g.arc(x-d*.35,y-d*.3,d*.28,0,TAU);g.fill();dew.push([x-d*.35,y-d*.3,d,clamp((o[n]-.65)*3,0,1)]);}
  return {c,dew};
 });
 const glint=(()=>{const c=layer(64,64),g=c.getContext('2d'),o=g.createRadialGradient(32,32,0,32,32,32);o.addColorStop(0,'rgba(255,255,255,1)');o.addColorStop(.18,'rgba(255,230,236,.6)');o.addColorStop(1,'rgba(255,200,210,0)');g.fillStyle=o;g.fillRect(0,0,64,64);return c;})();
 const petalSprite=lru(3,i=>{const tone=toneOf(i),sz=128,c=layer(sz,sz),g=c.getContext('2d');g.translate(sz/2,sz*.92);g.beginPath();g.moveTo(0,0);g.bezierCurveTo(-sz*.5,-sz*.18,-sz*.46,-sz*.78,-sz*.12,-sz*.84);g.quadraticCurveTo(0,-sz*.78,sz*.12,-sz*.84);g.bezierCurveTo(sz*.46,-sz*.78,sz*.5,-sz*.18,0,0);g.closePath();
  const f=g.createLinearGradient(0,0,0,-sz*.84);f.addColorStop(0,rgba(tone.deep));f.addColorStop(.5,rgba(tone.mid));f.addColorStop(.9,rgba(tone.edge));f.addColorStop(1,rgba(tone.rim));g.shadowColor='rgba(0,0,0,.4)';g.shadowBlur=6;g.fillStyle=f;g.fill();return c;});

 // ---- Opening schedule -----------------------------------------------------------------------------
 const CLOSE=2.4;
 function bloomOf(s){
  // Bloom F 0..1 grows with each sung line (eased); it closes again at the end of the song.
  const cues=(s.track.cues||[]).filter(c=>Number.isFinite(c.start));let F;
  if(cues.length){const {index}=base.rollState(s),k=index>=0?easeInOut((s.local-s.track.cues[index].start)/1.6):1,at=n=>n<0?0:(n+1)/cues.length;F=lerp(at(index-1),at(index),k);}
  else F=clamp(s.progress/.92,0,1);
  F*=1-easeInOut((s.local-(s.duration-CLOSE))/(CLOSE*.85));
  return Math.pow(clamp(F,0,1),.75);
 }

 // ---- Lyrics: glyph positions per line, cached ----------------------------------------------------
 const blockOf=lru(80,key=>{const [i,n]=key.split(':').map(Number),str=n<0?tracks[i].title||' ':tracks[i].cues[n].text||' ',size=LS*(n<0?1.1:1);
  const b=fitText(measure,str,{size,minSize:size*.55,weight:n<0?700:300,lineHeight:1.34,maxWidth:LW,maxHeight:size*3,spacing:.03,maxLines:2});setFont(measure,b.weight,b.font,b.spacing);
  b.glyphs=b.lines.map(line=>{const chars=[...line],out=[];let pre='';for(const ch of chars){const x=measure.measureText(pre).width,w=measure.measureText(pre+ch).width-x;out.push({ch,x:x+w/2});pre+=ch;}return {glyphs:out,w:measure.measureText(line).width};});
  return b;});
 function drawBlock(ctx,b,cx,cy,{scale=1,alpha=1,color=[255,238,238],age=Infinity}){
  if(alpha<=.01)return;setFont(ctx,b.weight,b.font,b.spacing);ctx.textAlign='center';ctx.textBaseline='middle';
  const lh=b.font*b.lineHeight,top=cy-(b.lines.length-1)*lh*scale/2;let g=0;
  b.glyphs.forEach((line,k)=>{const y=top+k*lh*scale,left=cx-line.w*scale/2;
   for(const {ch,x} of line.glyphs){const e=easeOut((age-g*.035)/.6);g++;if(e<=0)continue;
    ctx.save();ctx.translate(left+x*scale,y+(1-e)*b.font*.35);ctx.rotate((1-e)*-.4);ctx.scale(scale*(.7+.3*e),scale*(.7+.3*e));ctx.globalAlpha=alpha*e;ctx.fillStyle=rgba(color);ctx.fillText(ch,0,0);ctx.restore();}});
  ctx.globalAlpha=1;
 }

 function draw(ctx,time){
  const s=base.at(time),{i,local,energy}=s,tone=toneOf(i),cues=s.track.cues||[],soft=mix(tone.edge,tone.rim,.5);
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.drawImage(velvet,0,0);
  // The rose sways gently about the stem's foot; a new bud rises at each song.
  const grow=easeOut((local-.15)/1.6),scale=lerp(.62,1,grow)*(1-.06*easeInOut((local-(s.duration-CLOSE))/CLOSE)),alpha=clamp(grow*1.4,0,1);
  const sway=Math.sin(s.t*.42)*.012+Math.sin(s.t*.23+1)*.007,pivotY=H*1.15;
  ctx.save();ctx.translate(FX,pivotY);ctx.rotate(sway);ctx.translate(0,FY-pivotY);
  drawStem(ctx);
  const cy=(bounds.y0+bounds.y1)/2*R,spot=ctx.createRadialGradient(0,cy,0,0,cy,R*1.2);spot.addColorStop(0,rgba(tone.mid,.18));spot.addColorStop(1,rgba(tone.mid,0));ctx.fillStyle=spot;ctx.fillRect(-R*1.2,cy-R*1.2,R*2.4,R*2.4);
  const bloom=bloomAt(`${i}:${Math.round(bloomOf(s)*400)}`);
  ctx.scale(scale,scale);ctx.globalAlpha=alpha;ctx.drawImage(bloom.c,-OX,-OY);ctx.globalAlpha=1;
  // Dew glints with the high end of the music.
  ctx.globalCompositeOperation='lighter';bloom.dew.forEach(([x,y,d,a],n)=>{const gs=d*(2.2+7*energy.high)*(.75+.25*Math.sin(s.t*3+n));ctx.globalAlpha=alpha*a*clamp(.2+energy.high,0,1);ctx.drawImage(glint,x-OX-gs/2,y-OY-gs/2,gs,gs);});ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  ctx.restore();
  // Falling petals: some line changes shake one loose; it drifts down on its own seeded path.
  {const sprite=petalSprite(i),{index}=base.rollState(s),span=(bounds.x1-bounds.x0)*R*.4;
   for(let n=Math.max(0,index-4);n<=index;n++){const st=cues[n]?.start;if(!Number.isFinite(st))continue;const r=random(hash(`fall${i}:${n}`));if(r()>.4)continue;const age=local-st-.6;if(age<0||age>7)continue;
    const side=r()<.5?-1:1,x0=FX+side*span*(.6+r()*.3),y0=FY+cy*.6,x=x0+side*age*R*.1+Math.sin(age*1.3+r()*6)*R*.15,y=y0+age*age*R*.03+age*R*.14,sz=R*.15,flip=Math.cos(age*2.2+r()*6),a=clamp(age*3,0,1)*clamp((7-age)/1.5,0,1);
    if(y>H+sz)continue;ctx.save();ctx.translate(x,y);ctx.rotate(age*(.6+r())*side+r()*6);ctx.scale(1,Math.max(.15,Math.abs(flip)));ctx.globalAlpha=a;ctx.drawImage(sprite,-sz/2,-sz/2,sz,sz);ctx.restore();}
   ctx.globalAlpha=1;}

  // Title phrase: small spaced capitals between hairlines.
  if(base.headline){const size=u*.022;setFont(ctx,600,size,.32);const label=ellipsize(ctx,base.headline,W*.6),w=ctx.measureText(label).width;text(ctx,label,W/2,L.head,{size,weight:600,color:rgba(mix(soft,[255,236,220],.55),.85),align:'center',baseline:'middle',spacing:.32});
   ctx.fillStyle=rgba(soft,.4);for(const d of [-1,1])ctx.fillRect(W/2+d*(w/2+size*1.2)-(d<0?u*.07:0),L.head,u*.07,Math.max(1,u*.001));}

  // Lyrics: the current line unfolds glyph by glyph; the previous one shrinks upward, the next waits below.
  const {index,ease}=base.rollState(s),ix=index,end=clamp((s.duration-local-.4)/.8,0,1),gap=LS*.55;
  const cur=blockOf(`${i}:${ix}`),curH=cur.lines.length*cur.font*cur.lineHeight,age=ix>=0?local-cues[ix].start:local-.6;
  const curTop=LY-curH/2,prevY=curTop-gap,nextY=LY+curH/2+gap;
  drawBlock(ctx,cur,LX,LY,{alpha:end,age,color:ix<0?mix(soft,[255,236,230],.6):[255,240,240]});
  if(ix>=0){const pb=blockOf(`${i}:${ix-1}`),ph=pb.lines.length*pb.font*pb.lineHeight*.5;
   const y=lerp(LY,prevY-ph/2,ease),sc=lerp(1,.5,ease);drawBlock(ctx,pb,LX,y,{scale:sc,alpha:lerp(1,.5,ease)*end,color:mix([255,240,240],[214,150,164],ease)});
   if(ix>0){const qb=blockOf(`${i}:${ix-2}`);if(ease<1)drawBlock(ctx,qb,LX,prevY-ph-qb.font*.5,{scale:.5,alpha:.5*(1-ease)*end,color:[214,150,164]});}}
  const nx=cues[ix+1];if(nx&&Number.isFinite(nx.start)){const nb=blockOf(`${i}:${ix+1}`),nh=nb.lines.length*nb.font*nb.lineHeight*.5;drawBlock(ctx,nb,LX,nextY+nh/2,{scale:.5,alpha:.42*ease*end,color:[214,150,164]});}

  // Song line: number, title and time beneath a fine spectrum ornament.
  {const [sx,sy,sw,sh]=L.spec;if(s.frame)drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:mix(soft,[255,220,200],.4),alpha:.55,x:sx,y:sy,width:sw,height:sh});
   const ix0=portrait?W/2:sx+sw/2,size=u*.019;setFont(ctx,600,size,.12);const label=`No.${String(i+1).padStart(2,'0')}  ·  ${ellipsize(ctx,tracks[i].title||'',portrait?W*.5:W*.25)}  ·  ${stamp(local)} / ${stamp(s.duration)}`;
   text(ctx,label,ix0,L.info,{size,weight:600,color:'rgba(226,186,196,.7)',align:'center',baseline:'middle',spacing:.12});}
 }
 return {draw,duration:base.total};
}

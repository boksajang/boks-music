import {sceneBase,layer,rgba,mix,hash,random,clamp,lerp,easeOut,easeInOut,text,fitText,wrap,setFont,drawSpectrum,stamp} from '../canvas-kit.mjs';

/**
 * 잉크 번짐: wet cold-press watercolour paper. A drop of ink falls for every sung line and the words
 * bleed out from where it lands, letter by letter, each spreading from its centre with a feathered
 * indigo fringe before the strokes settle black. When the next line comes, the old one loosens into
 * the water and blurs away, leaving a pale stain; the page keeps the ghosts of the last lines. A song
 * opens with its title in large brush-like ink and a vermilion seal; between songs a wash of water
 * spreads across the sheet and rinses the old ink away. Only the diluted-ink spectrum follows the music.
 */
const TAU=Math.PI*2,SUMI=[20,22,32],INDIGO=[44,62,112],SEAL=[178,46,36];
function lru(limit){const m=new Map();return (key,make)=>{if(m.has(key)){const v=m.get(key);m.delete(key);m.set(key,v);return v;}const v=make();m.set(key,v);if(m.size>limit)m.delete(m.keys().next().value);return v;};}
/** fitText, then narrows the box while the line count holds so wrapped lines come out even. */
function balanced(measure,value,opts){
 const block=fitText(measure,value,opts);if(block.lines.length<2)return block;
 let lo=opts.maxWidth*.45,hi=opts.maxWidth;setFont(measure,block.weight,block.font,block.spacing);
 for(let k=0;k<12;k++){const mid=(lo+hi)/2,lines=wrap(measure,value,mid);if(lines.length<=block.lines.length)hi=mid;else lo=mid;}
 return {...block,lines:wrap(measure,value,hi)};
}

export default function inkbleed(input){
 const base=sceneBase(input,{hue:225}),{width:W,height:H,portrait,u,tracks}=base,N=tracks.length;
 const SLOTS=portrait?[.29,.43,.57,.71].map(y=>H*y):[.33,.515,.7].map(y=>H*y),slotH=portrait?H*.135:H*.19;
 const lineSize=u*(portrait?.08:.078),maxW=portrait?W*.84:W*.66,align=portrait?'center':'left',indent=portrait?[0]:[0,.07,.035].map(x=>x*W),left=W*.12;
 const measure=layer(8,8).getContext('2d');

 // ---- Paper: cold-press tooth, soft mottling, old tide lines (static). ----
 const paper=(()=>{
  const c=layer(W,H),g=c.getContext('2d'),r=random(hash('cold-press'));g.fillStyle='rgb(237,234,227)';g.fillRect(0,0,W,H);
  for(let k=0;k<30;k++){const x=r()*W,y=r()*H,rad=u*(.08+r()*.3),dark=r()<.4,grad=g.createRadialGradient(x,y,0,x,y,rad);grad.addColorStop(0,dark?`rgba(120,126,140,${.015+r()*.025})`:`rgba(255,255,252,${.04+r()*.05})`);grad.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=grad;g.fillRect(x-rad,y-rad,rad*2,rad*2);}
  const dots=Math.round(W*H/55),px=Math.max(1,u/1080);for(let k=0;k<dots;k++){const x=r()*W,y=r()*H,s=(.6+r()*1.6)*px;g.fillStyle=r()<.55?`rgba(96,98,110,${.05+r()*.09})`:`rgba(255,255,255,${.12+r()*.2})`;g.fillRect(x,y,s,s);if(r()<.3){g.fillStyle='rgba(255,255,255,.18)';g.fillRect(x-s*.6,y-s*.6,s*.7,s*.7);}}
  // Tide lines where water once dried, with the faint pale bloom inside.
  for(let k=0;k<3;k++){const cx=r()*W,cy=r()*H,rad=u*(.06+r()*.1),ph=[r()*TAU,r()*TAU,r()*TAU];g.beginPath();for(let a=0;a<=64;a++){const t=a/64*TAU,rr=rad*(1+.12*Math.sin(t*3+ph[0])+.07*Math.sin(t*5+ph[1])+.04*Math.sin(t*9+ph[2]));a?g.lineTo(cx+Math.cos(t)*rr,cy+Math.sin(t)*rr*.85):g.moveTo(cx+Math.cos(t)*rr,cy+Math.sin(t)*rr*.85);}g.closePath();
   g.fillStyle='rgba(255,255,250,.05)';g.fill();g.filter=`blur(${u*.0015}px)`;g.strokeStyle=`rgba(130,120,104,${.035+r()*.03})`;g.lineWidth=Math.max(1,u*.003);g.stroke();g.filter='none';}
  const v=g.createRadialGradient(W/2,H/2,u*.3,W/2,H/2,Math.hypot(W,H)*.6);v.addColorStop(0,'rgba(60,70,90,0)');v.addColorStop(1,'rgba(60,70,90,.14)');g.fillStyle=v;g.fillRect(0,0,W,H);
  if(base.headline){const size=u*(portrait?.024:.02),y=H*(portrait?.075:.085);setFont(g,600,size,.42);g.textAlign='center';g.textBaseline='middle';let label=base.headline;while(label&&g.measureText(label).width>W*.6)label=label.slice(0,-1);if(label!==base.headline)label+='…';
   g.fillStyle=rgba(INDIGO,.72);g.fillText(label,W/2,y);const tw=g.measureText(label).width;g.fillStyle=rgba(INDIGO,.35);g.fillRect(W/2-tw/2-size*3.2,y,size*2.2,Math.max(1,u*.0014));g.fillRect(W/2+tw/2+size,y,size*2.2,Math.max(1,u*.0014));}
  return c;
 })();
 const fiber=(()=>{const n=256,c=layer(n,n),g=c.getContext('2d'),r=random(hash('fiber'));for(let k=0;k<700;k++){g.fillStyle=`rgba(0,0,0,${.3+r()*.6})`;g.fillRect(r()*n,r()*n,.7+r()*1.4,.7+r()*1.4);}g.strokeStyle='rgba(0,0,0,.5)';g.lineWidth=.8;for(let k=0;k<40;k++){g.beginPath();const x=r()*n,y=r()*n;g.moveTo(x,y);g.quadraticCurveTo(x+r()*20-10,y+r()*20-10,x+r()*26-13,y+r()*26-13);g.stroke();}return c;})();

 const blotch=(()=>{const n=256,c=layer(n,n),g=c.getContext('2d'),r=random(hash('blotch'));for(let k=0;k<160;k++){const x=r()*n,y=r()*n,rad=2+r()*9,grad=g.createRadialGradient(x,y,0,x,y,rad);grad.addColorStop(0,`rgba(0,0,0,${.4+r()*.6})`);grad.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=grad;g.fillRect(x-rad,y-rad,rad*2,rad*2);}return c;})();

 // ---- Ink sprites per line: crisp strokes with a feathered fringe, a soft blur, a wide blot and the wet halo. ----
 const inks=lru(8);
 function ink(key,value,{size,weight=400,cx,cy,boxW,boxH,align:al='center',minScale=.55}){
  return inks(key,()=>{
   const block=balanced(measure,value||' ',{size,minSize:size*minScale,weight,lineHeight:1.28,maxWidth:boxW,maxHeight:boxH,spacing:.01,maxLines:3}),f=block.font,pad=f*.9;
   setFont(measure,weight,f,block.spacing);const widths=block.lines.map(l=>measure.measureText(l).width),bw=Math.ceil((al==='center'?boxW:Math.max(...widths))+pad*2),bh=Math.ceil(block.height+pad*2);
   const ox=al==='center'?cx-bw/2:cx-pad,oy=cy-bh/2,lx=al==='center'?bw/2:pad;
   const shape=(g,scale=1)=>{setFont(g,weight,f*scale,block.spacing);g.textAlign=al==='center'?'center':'left';g.textBaseline='middle';block.lines.forEach((l,k)=>g.fillText(l,lx*scale,(pad+(k+.5)*f*block.lineHeight)*scale));};
   // Character centres (for letters bleeding out one by one).
   const chars=[];block.lines.forEach((l,k)=>{const y=pad+(k+.5)*f*block.lineHeight,w0=widths[k],x0=al==='center'?lx-w0/2:lx;let acc='';for(const ch of l){const a=measure.measureText(acc).width;acc+=ch;if(/\s/.test(ch))continue;chars.push({x:x0+(a+measure.measureText(acc).width)/2,y});}});
   const outline=(g,width)=>{setFont(g,weight,f,block.spacing);g.textAlign=al==='center'?'center':'left';g.textBaseline='middle';g.lineWidth=width;g.lineJoin='round';block.lines.forEach((l,k)=>g.strokeText(l,lx,pad+(k+.5)*f*block.lineHeight));};
   const tile=(g,t,alpha)=>{g.globalAlpha=alpha;for(let y=0;y<bh;y+=256)for(let x=0;x<bw;x+=256)g.drawImage(t,x,y);g.globalAlpha=1;};
   // Feathered fringe: pigment creeping into the wet fibres, eaten unevenly so the edge is ragged.
   const fringe=layer(bw,bh),fg=fringe.getContext('2d'),fr=random(hash('fringe'+key));fg.filter=`blur(${f*.05}px)`;
   for(let k=0;k<6;k++){fg.save();fg.translate((fr()-.5)*f*.1,(fr()-.5)*f*.1);fg.strokeStyle=rgba(INDIGO,.15);outline(fg,f*(.06+fr()*.16));fg.restore();}fg.filter='none';
   fg.globalCompositeOperation='destination-out';tile(fg,blotch,.45);
   const crisp=layer(bw,bh),g=crisp.getContext('2d');g.drawImage(fringe,0,0);
   // Body: watery pigment, lighter inside, dark where it dried along the stroke edges.
   g.fillStyle=rgba(mix(SUMI,INDIGO,.3),.88);shape(g);g.strokeStyle=rgba(SUMI,.6);outline(g,f*.018);
   // Granulation and dry tooth: pigment pools unevenly and the paper shows through in specks.
   g.globalCompositeOperation='source-atop';const r=random(hash('pool'+key));for(let k=0;k<Math.ceil(bw/f)*2;k++){const x=r()*bw,y=r()*bh,rad=f*(.4+r()*.9),grad=g.createRadialGradient(x,y,0,x,y,rad);grad.addColorStop(0,r()<.5?rgba(INDIGO,.35):'rgba(70,74,92,.25)');grad.addColorStop(1,rgba(INDIGO,0));g.fillStyle=grad;g.fillRect(x-rad,y-rad,rad*2,rad*2);}
   g.globalCompositeOperation='destination-out';g.globalAlpha=.4;for(let y=0;y<bh;y+=256)for(let x=0;x<bw;x+=256)g.drawImage(fiber,x,y);g.globalAlpha=1;g.globalCompositeOperation='source-over';
   const blurred=(scale,blur,color,alpha)=>{const c=layer(bw*scale,bh*scale),b=c.getContext('2d');b.filter=`blur(${blur*scale}px)`;b.fillStyle=rgba(color,alpha);shape(b,scale);b.filter='none';return c;};
   return {crisp,soft:blurred(.5,f*.07,mix(SUMI,INDIGO,.5),.9),blot:blurred(.25,f*.26,INDIGO,.7),wet:blurred(.25,f*.55,[96,108,128],.5),ox,oy,bw,bh,chars,f};
  });
 }
 const slotOf=n=>{const k=((n%SLOTS.length)+SLOTS.length)%SLOTS.length;return {cx:portrait?W/2:left+indent[k%indent.length],cy:SLOTS[k]};};
 const lineInk=(i,n)=>{const cue=tracks[i].cues[n],{cx,cy}=slotOf(n);return ink(`${i}:${n}`,cue?.text||'',{size:lineSize,cx,cy,boxW:maxW,boxH:slotH,align});};
 const titleInk=i=>ink(`t${i}`,tracks[i].title||'',{size:u*(portrait?.14:.14),weight:700,cx:W/2,cy:H*(portrait?.46:.48),boxW:portrait?W*.84:W*.74,boxH:H*(portrait?.3:.36),align:'center',minScale:.4});

 // ---- Per song: when each mark is inked and when it starts to dissolve. ----
 const plans=lru(4);
 const plan=i=>plans(i,()=>{
  const tr=tracks[i],D=Number(tr.duration)||0,cues=(tr.cues||[]).map((c,n)=>({c,n})).filter(({c})=>Number.isFinite(c.start)&&c.start<D).sort((a,b)=>a.c.start-b.c.start),marks=[];
  const first=cues.length?cues[0].c.start:D;
  marks.push({kind:'title',start:.9,melt:cues.length?Math.max(1.6,first-.1):Infinity,order:-1});
  cues.forEach(({c,n},k)=>{const next=k+1<cues.length?cues[k+1].c.start:Infinity,end=Math.min(c.start+8,Number.isFinite(c.end)&&c.end>c.start?c.end:(Number.isFinite(next)?next:c.start+6));marks.push({kind:'line',n,start:c.start,melt:Number.isFinite(next)?(next-end>4?end+2:next):(D-c.start>12?end+3:Infinity),order:k});});
  return marks;
 });
 const MELT=2.6;
 const scratch=layer(8,8);
 function drawMark(ctx,i,m,local){
  const age=local-m.start;if(age<0)return;const it=m.kind==='title'?titleInk(i):lineInk(i,m.n);
  const melt=Number.isFinite(m.melt)?(local-m.melt)/MELT:-1;
  // How many lines have begun since this one melted: older stains fade out.
  const marks=plan(i),later=marks.filter(o=>o.order>m.order&&o.start<=local),stain=later.length>=3?1-easeOut((local-later[2].start)/1.6):1;
  if(stain<=0)return;
  const wetness=(m.kind==='title'?1.3:1);
  if(melt>=1){ctx.globalAlpha=.3*stain;ctx.drawImage(it.blot,it.ox,it.oy,it.bw,it.bh);ctx.globalAlpha=1;return;}
  // Water halo darkens the paper under fresh ink and dries out; it comes back as the ink loosens.
  const wetA=clamp((age<2.5?.45*(1-age/2.5):0)+(melt>0?Math.sin(Math.PI*melt)*.3:0),0,1)*wetness;
  if(wetA>0){ctx.globalAlpha=clamp(wetA,0,1);ctx.drawImage(it.wet,it.ox-it.f*.3,it.oy-it.f*.3,it.bw+it.f*.6,it.bh+it.f*.6);}
  if(melt<0){
   // Letters spread from the drop: each grows from its centre, the nearer ones first.
   const r=random(hash('drop'+i+':'+(m.n??'t'))),impact=it.chars.length?it.chars[Math.floor(r()*it.chars.length)]:{x:it.bw/2,y:it.bh/2},speed=it.f*(m.kind==='title'?5.5:9),land=.22;
   const grow=age-land;let all=true;
   if(grow>0){if(scratch.width!==it.bw||scratch.height!==it.bh){scratch.width=it.bw;scratch.height=it.bh;}const g=scratch.getContext('2d');g.clearRect(0,0,it.bw,it.bh);
    for(const c of it.chars){const delay=Math.hypot(c.x-impact.x,c.y-impact.y)/speed+(hash(c.x+':'+c.y)%100)/100*.12,p=easeOut((grow-delay)/.55);if(p<1)all=false;if(p<=0)continue;const rad=it.f*(.15+p*1.05),grad=g.createRadialGradient(c.x,c.y,0,c.x,c.y,rad);grad.addColorStop(0,'#000');grad.addColorStop(.7,'rgba(0,0,0,.9)');grad.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=grad;g.fillRect(c.x-rad,c.y-rad,rad*2,rad*2);}
    const spread=clamp(grow/1.6,0,1);ctx.globalAlpha=clamp(.55*Math.sin(Math.PI*Math.min(1,spread*1.3))+.18,0,1);ctx.drawImage(it.blot,it.ox,it.oy,it.bw,it.bh);
    ctx.globalAlpha=clamp(spread*1.4,0,.9)*(1-clamp((grow-1.4)/1.2,0,1)*.6);ctx.drawImage(it.soft,it.ox,it.oy,it.bw,it.bh);ctx.globalAlpha=1;
    if(all)ctx.drawImage(it.crisp,it.ox,it.oy);else{g.globalCompositeOperation='source-in';g.drawImage(it.crisp,0,0);g.globalCompositeOperation='source-over';ctx.drawImage(scratch,it.ox,it.oy);}}
   // The falling drop and the ring it throws on impact.
   const ix=it.ox+impact.x,iy=it.oy+impact.y;
   if(age<land){const q=age/land,y=lerp(iy-u*.45,iy,q*q),rr=it.f*.13;ctx.fillStyle=rgba(SUMI,.85);ctx.beginPath();ctx.ellipse(ix,y,rr*.8,rr*(1.2+q),0,0,TAU);ctx.fill();}
   else if(age<land+1.3){
    // Splash: a wet ring darkening the paper, a blot and a few satellite droplets thrown out.
    const q=(age-land)/1.3;ctx.strokeStyle=`rgba(96,108,128,${.16*(1-q)})`;ctx.lineWidth=it.f*.18*(1-q*.5);ctx.beginPath();ctx.ellipse(ix,iy,it.f*(.35+q*2.2),it.f*(.3+q*1.8),0,0,TAU);ctx.stroke();
    ctx.fillStyle=rgba(mix(SUMI,INDIGO,.4),.55*(1-q));ctx.beginPath();for(let a=0;a<=18;a++){const t=a/18*TAU,rr=it.f*.2*(1+q*.7)*(1+.18*Math.sin(t*5+r()*0));a?ctx.lineTo(ix+Math.cos(t)*rr,iy+Math.sin(t)*rr*.85):ctx.moveTo(ix+Math.cos(t)*rr,iy+Math.sin(t)*rr*.85);}ctx.fill();
    const sr=random(hash('sat'+i+':'+(m.n??'t')));for(let k=0;k<7;k++){const a=sr()*TAU,d=it.f*(.45+sr()*.6)*(.6+easeOut(q*3)*.4),rr=it.f*(.025+sr()*.04);ctx.fillStyle=rgba(SUMI,.6*(1-q));ctx.beginPath();ctx.arc(ix+Math.cos(a)*d,iy+Math.sin(a)*d*.8,rr,0,TAU);ctx.fill();}}
  }else{
   // Loosening: the strokes give way to the soft copy, then to the pale blot that stays.
   const p=melt,dy=easeInOut(p)*u*.006,sc=1+easeInOut(p)*.025,w=it.bw*sc,h=it.bh*sc,x=it.ox-(w-it.bw)/2,y=it.oy-(h-it.bh)/2+dy;
   ctx.globalAlpha=lerp(.25,.3,p);ctx.drawImage(it.blot,x,y,w,h);
   ctx.globalAlpha=clamp(Math.sin(Math.PI*Math.min(1,p*1.6+.25))*.8,0,1);ctx.drawImage(it.soft,x,y,w,h);
   ctx.globalAlpha=Math.pow(1-p,2.2);ctx.drawImage(it.crisp,x,y,w,h);ctx.globalAlpha=1;
  }
  ctx.globalAlpha=1;
 }
 function drawSong(ctx,i,local){for(const m of plan(i))drawMark(ctx,i,m,local);}

 // ---- Seal: the song number carved in vermilion. ----
 const seals=lru(4),SS=Math.round(u*(portrait?.06:.055));
 const seal=i=>seals(i,()=>{const c=layer(SS,SS),g=c.getContext('2d'),r=random(hash('seal'+i));g.fillStyle=rgba(SEAL);g.beginPath();g.roundRect(SS*.04,SS*.04,SS*.92,SS*.92,SS*.08);g.fill();
  g.globalCompositeOperation='destination-out';setFont(g,800,SS*.46,0);g.textAlign='center';g.textBaseline='middle';g.fillText(String(i+1).padStart(2,'0'),SS/2,SS*.52);g.lineWidth=SS*.05;g.strokeRect(SS*.13,SS*.13,SS*.74,SS*.74);
  for(let k=0;k<70;k++){g.globalAlpha=.3+r()*.7;g.fillRect(r()*SS,r()*SS,1+r()*SS*.03,1+r()*SS*.03);}g.globalAlpha=1;g.globalCompositeOperation='source-over';return c;});

 function draw(ctx,time){
  const s=base.at(time),{i,local,duration}=s;
  ctx.drawImage(paper,0,0);
  // Between songs a wash spreads from one point and rinses the old song away.
  const wash=i>0?clamp(local/1.7,0,1):1;
  if(wash<1){
   const r=random(hash('wash'+i)),cx=W*(.2+r()*.6),cy=H*(.25+r()*.5),R=Math.hypot(W,H)*1.05*easeInOut(wash),ph=[r()*TAU,r()*TAU,r()*TAU];
   const front=(fresh=true)=>{if(fresh)ctx.beginPath();for(let a=0;a<=96;a++){const t=a/96*TAU,rr=Math.max(0,R*(1+.1*Math.sin(t*3+ph[0])+.06*Math.sin(t*7+ph[1])+.035*Math.sin(t*13+ph[2])));a?ctx.lineTo(cx+Math.cos(t)*rr,cy+Math.sin(t)*rr):ctx.moveTo(cx+Math.cos(t)*rr,cy+Math.sin(t)*rr);}ctx.closePath();};
   ctx.save();ctx.beginPath();ctx.rect(0,0,W,H);front(false);ctx.clip('evenodd');drawSong(ctx,i-1,Number(tracks[i-1].duration)||0);ctx.restore();
   ctx.save();front();ctx.clip();ctx.fillStyle=`rgba(110,124,146,${.16*(1-wash*.5)})`;ctx.fillRect(0,0,W,H);ctx.restore();
   front();ctx.strokeStyle=rgba(INDIGO,.22*(1-wash));ctx.lineWidth=u*.006;ctx.stroke();ctx.strokeStyle=rgba(INDIGO,.35*(1-wash));ctx.lineWidth=Math.max(1,u*.0016);ctx.stroke();
  }
  if(i>0&&wash>=1&&local<4.2){ctx.fillStyle=`rgba(110,124,146,${.08*(1-(local-1.7)/2.5)})`;ctx.fillRect(0,0,W,H);}
  drawSong(ctx,i,local);

  // Footer: seal, title, time and the spectrum in diluted ink.
  const show=Math.min(s.enter,s.exit*.6+.4),stampIn=clamp((local-1.2)/.35,0,1),sealScale=stampIn<1?1.25-.25*easeOut(stampIn):1;
  const fy=H*(portrait?.865:.885),fx=portrait?W*.08:W*.07,sz=SS;
  if(stampIn>0){ctx.globalAlpha=stampIn*.92;ctx.drawImage(seal(i),fx+sz/2-sz*sealScale/2,fy-sz*sealScale/2,sz*sealScale,sz*sealScale);ctx.globalAlpha=1;}
  const tx=fx+sz*1.35,tw=portrait?W*.92-tx:W*.42;
  text(ctx,s.track.title||'',tx,fy-u*.012,{size:u*(portrait?.03:.026),weight:700,color:rgba(SUMI,.82*show),baseline:'middle',maxWidth:tw});
  text(ctx,`${String(i+1).padStart(2,'0')} / ${String(N).padStart(2,'0')}    ${stamp(local)} / ${stamp(duration)}`,tx,fy+u*.024,{size:u*.018,weight:600,color:rgba(INDIGO,.62*show),baseline:'middle',spacing:.12});
  if(s.frame){const [sx,sy,sw,sh]=portrait?[W*.25,H*.905,W*.5,H*.04]:[W*.7,fy-u*.04,W*.23,u*.075];drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:INDIGO,alpha:.5*show,amp:.9,x:sx,y:sy,width:sw,height:sh});}
 }
 return {draw,duration:base.total};
}

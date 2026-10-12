import {sceneBase,drawSpectrum,drawCover,text,setFont,ellipsize,stamp,rgba,mix,layer,hash,random,hsl,clamp,lerp,easeOut,easeInOut} from '../canvas-kit.mjs';

/**
 * 키네틱 타이포: the frame is one flat color block holding the sung line in huge bold words. The words
 * pop in one after another as the line is sung, each with its own size, tilt and indent. When the next
 * line starts, a new color block wipes across from one side and shoves the old words out of the frame.
 * Before the first line and in long instrumental gaps, the song title takes the stage the same way.
 */
const backOut=x=>{x=clamp(x,0,1);const c1=1.9,c3=c1+1;return 1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2);};
const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
export default function kinetic(input){
 const base=sceneBase(input,{hue:12}),{width:W,height:H,portrait,u,vocal,tracks}=base;
 const M=portrait?u*.07:W*.06;
 const L=portrait
  ?{box:[M,H*.2,W-M*2,H*.58],thumb:u*.12,top:H*.05,foot:H*.94,spectrum:[M,H*.875,u*.4,H*.035],big:u*.2}
  :{box:[W*.08,H*.255,W*.84,H*.56],thumb:u*.1,top:H*.07,foot:H*.92,spectrum:[M,H*.845,W*.26,H*.045],big:u*.19};
 const measure=layer(8,8).getContext('2d');
 const ink=[16,16,20],paper=[244,240,230];

 // Per song: four flat colors that take turns as backgrounds, each with a readable text and emphasis color.
 const schemes=new Map();
 function scheme(i){
  if(schemes.has(i))return schemes.get(i);if(schemes.size>4)schemes.delete(schemes.keys().next().value);
  const hue=base.art(i).hue,vivid=hsl(hue,.82,.55),deep=hsl(hue,.75,.38),second=hsl(hue+155,.62,.6),night=mix(hsl(hue,.4,.1),ink,.5);
  const list=[{bg:night,fg:paper,hot:vivid},{bg:vivid,fg:ink,hot:paper},{bg:paper,fg:ink,hot:deep},{bg:second,fg:ink,hot:paper}];
  schemes.set(i,list);return list;
 }

 // Segments of a song: its title before the first line and in long gaps, then one per sung line.
 const segments=new Map();
 function segmentsOf(i){
  if(segments.has(i))return segments.get(i);if(segments.size>4)segments.delete(segments.keys().next().value);
  const track=tracks[i],cues=vocal?(track.cues||[]).filter(c=>Number.isFinite(c.start)):[],list=[{kind:'title',start:0,end:cues[0]?.start??track.duration}];
  cues.forEach((cue,n)=>{const next=cues[n+1]?.start??track.duration,end=Math.min(Number.isFinite(cue.end)&&cue.end>cue.start?cue.end:next,next,cue.start+8);
   list.push({kind:'line',start:cue.start,end,text:cue.text||''});
   if(next-end>=5.5)list.push({kind:'gap',start:end+1.2,end:next});});
  segments.set(i,list);return list;
 }

 // Word layout: greedy rows of one to three words, sizes and tilts from a hash, shrunk until it fits.
 const layouts=new Map();
 function layoutOf(i,k){
  const key=`${i}:${k}`;if(layouts.has(key))return layouts.get(key);if(layouts.size>8)layouts.delete(layouts.keys().next().value);
  const seg=segmentsOf(i)[k],source=seg.kind==='line'?seg.text:tracks[i].title||'';
  let words=source.split(/\s+/).filter(Boolean);if(!words.length)words=['♪'];if(seg.kind!=='line'&&words.length>10)words=[...words.slice(0,9),'…'];
  const longest=words.reduce((m,w,n)=>w.length>words[m].length?n:m,0);
  const items=words.map((w,n)=>{const r=random(hash(`${source}:${n}:${k}`));const emph=words.length>1&&(n===longest||w.length>=6);return {w,f:(.72+r()*.5)*(emph?1.25:1),rot:r()<.35?(r()-.5)*.13:0,emph,boxed:emph&&r()<.55,swing:r()<.5?-1:1,phase:r()*6.28};});
  const perRow=words.length>8?3:2;
  const [,,bw,bh]=L.box;let S=L.big,rows,total;
  for(;;){
   rows=[];let row=null;const gap=S*.26;
   for(const item of items){item.size=S*item.f;setFont(measure,800,item.size,-.035);item.width=measure.measureText(item.w).width+(item.boxed?item.size*.24:0)+Math.abs(item.rot)*item.size*.6;
    if(row&&row.items.length<perRow&&row.w+gap+item.width<=bw){row.items.push(item);row.w+=gap+item.width;row.h=Math.max(row.h,item.size);}
    else{row={items:[item],w:item.width,h:item.size};rows.push(row);}}
   total=rows.reduce((sum,r)=>sum+r.h*1.08,0);
   if((total<=bh&&rows.every(r=>r.w<=bw))||S<=u*.028)break;S*=.93;
  }
  // Ragged indents read in order but keep the block lively.
  const r=random(hash(source+k));let y=0;
  rows.forEach((row,n)=>{const indent=rows.length===1?.5:[.0,.55,.2,.8,.35][n%5]*(.7+r()*.3);let x=(bw-Math.min(row.w,bw))*indent;const gap=S*.26;
   for(const item of row.items){item.x=x+item.width/2;item.y=y+row.h*.54;x+=item.width+gap;}y+=row.h*1.08;});
  const out={items,height:total,S};layouts.set(key,out);return out;
 }

 function drawWords(ctx,i,k,local,colors,{dx=0,dy=0,settled=false}={}){
  const seg=segmentsOf(i)[k],lay=layoutOf(i,k),[bx,by,bw,bh]=L.box,top=by+(bh-lay.height)/2,n=lay.items.length;
  const span=seg.kind==='line'?Math.max(.4,Math.min(seg.end-seg.start,n*.75))*.8:Math.min(1.4,n*.3),age=local-seg.start;
  const zoom=1+.03*easeOut(age/5),cx=bx+bw/2,cy=top+lay.height/2;
  ctx.save();ctx.translate(cx+dx,cy+dy);ctx.scale(zoom,zoom);ctx.translate(-cx,-cy);ctx.textAlign='center';ctx.textBaseline='middle';
  lay.items.forEach((item,m)=>{
   const a=settled?1:(age-span*m/Math.max(1,n))/.34;if(a<=0)return;const e=backOut(a);
   ctx.save();ctx.translate(bx+item.x,top+item.y+(1-easeOut(a))*item.size*.35+Math.sin(local*1.1+item.phase)*item.size*.018);ctx.rotate(item.rot+(1-clamp(e,0,1.2))*item.swing*.35);const sc=lerp(.3,1,e);ctx.scale(sc,sc);
   ctx.globalAlpha=clamp(a*3,0,1);setFont(ctx,800,item.size,-.035);
   if(item.boxed){const pw=item.width-Math.abs(item.rot)*item.size*.6,ph=item.size*1.08;ctx.fillStyle=rgba(colors.hot);ctx.fillRect(-pw/2,-ph/2,pw,ph);ctx.fillStyle=rgba(colors.bg);}else ctx.fillStyle=rgba(item.emph?colors.hot:colors.fg);
   ctx.fillText(item.w,0,item.size*.04);ctx.restore();
  });
  ctx.restore();ctx.globalAlpha=1;
  if(seg.kind!=='line'){
   const label=seg.kind==='title'?`TRACK ${String(i+1).padStart(2,'0')}`:'♪  간주';
   text(ctx,label,bx+dx,Math.max(top-u*.035,L.top+L.thumb+u*.06)+dy,{size:u*.022,weight:800,color:rgba(colors.hot),spacing:.3,alpha:clamp(age/.4,0,1)});
  }
 }

 function drawChrome(ctx,s,colors){
  const {i,local}=s,art=base.art(i),t=L.thumb,x=M,y=L.top,fg=rgba(colors.fg);
  ctx.fillStyle=fg;ctx.fillRect(x-u*.004,y-u*.004,t+u*.008,t+u*.008);drawCover(ctx,art.image,x,y,t,t);
  const tx=x+t+u*.025,maxW=portrait?W-tx-M:W*.42;
  if(base.headline)text(ctx,base.headline,tx,y+t*.32,{size:u*.027,weight:800,color:fg,spacing:.04,baseline:'middle',maxWidth:maxW});
  text(ctx,`${String(i+1).padStart(2,'0')} / ${String(tracks.length).padStart(2,'0')}   ${tracks[i].title||''}`,tx,y+(base.headline?t*.74:t*.5),{size:u*.019,weight:600,color:fg,baseline:'middle',maxWidth:maxW,alpha:.78});
  const [sx,sy,sw,sh]=L.spectrum;
  if(s.frame)drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:colors.fg,alpha:.75,x:sx,y:sy,width:sw,height:sh});
  const fy=L.foot,bw=W-M*2;ctx.fillStyle=rgba(colors.fg,.22);ctx.fillRect(M,fy,bw,Math.max(2,u*.004));ctx.fillStyle=rgba(colors.hot);ctx.fillRect(M,fy,bw*clamp(s.progress,0,1),Math.max(2,u*.004));
  text(ctx,`${stamp(local)} / ${stamp(s.duration)}`,W-M,fy-u*.018,{size:u*.02,weight:700,color:fg,align:'right',spacing:.06});
 }

 function draw(ctx,time){
  const s=base.at(time),{i,local}=s,segs=segmentsOf(i);
  let k=0;for(let n=segs.length-1;n>=0;n--)if(segs[n].start<=local){k=n;break;}
  const seg=segs[k],colors=(n,song=i)=>scheme(song)[(n+song)%4];
  // Previous block: the earlier segment of this song, or the last one of the song before.
  const prev=k>0?{i,k:k-1}:i>0?{i:i-1,k:segmentsOf(i-1).length-1}:null;
  const p=prev?easeInOut((local-seg.start)/.55):1,dir=DIRS[hash(`${i}:${k}`)%4],[ddx,ddy]=dir;
  if(p<1){
   const old=colors(prev.k,prev.i);ctx.fillStyle=rgba(old.bg);ctx.fillRect(0,0,W,H);
   drawChrome(ctx,prev.i===i?s:{...base.at(base.offsets[i]-.001)},old);
   drawWords(ctx,prev.i,prev.k,prev.i===i?local:0,old,{dx:ddx*p*W*.55,dy:ddy*p*H*.55,settled:prev.i!==i});
   ctx.save();ctx.beginPath();
   const rx=ddx>0?0:ddx<0?W*(1-p):0,ry=ddy>0?0:ddy<0?H*(1-p):0,rw=ddx?W*p:W,rh=ddy?H*p:H;ctx.rect(rx,ry,rw,rh);ctx.clip();
  }
  const now=colors(k);ctx.fillStyle=rgba(now.bg);ctx.fillRect(0,0,W,H);
  drawWords(ctx,i,k,local,now);
  drawChrome(ctx,s,now);
  if(p<1){
   ctx.restore();
   // Leading edge of the wipe: a bar in the emphasis color.
   const edge=u*.035*(1-p*.6);ctx.fillStyle=rgba(now.hot);
   if(ddx>0)ctx.fillRect(W*p-edge,0,edge,H);else if(ddx<0)ctx.fillRect(W*(1-p),0,edge,H);else if(ddy>0)ctx.fillRect(0,H*p-edge,W,edge);else ctx.fillRect(0,H*(1-p),W,edge);
  }
 }
 return {draw,duration:base.total};
}

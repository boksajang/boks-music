import {sceneBase,drawSpectrum,drawCover,text,fitText,drawBlock,setFont,stamp,rgba,mix,layer,hash,random,hsl,clamp,lerp,easeOut,easeInOut} from '../canvas-kit.mjs';

/**
 * 스위스 포스터: an International Typographic Style poster on off-white paper. A strict column grid
 * holds a cropped album picture, a huge outlined track number and flat blocks of accent, black and
 * paper that slide and resize to a new arrangement at every lyric line. The sung line is set large,
 * bold and flush left; small captions, the next line and the whole playlist (current song in bold)
 * sit in their own columns.
 */
export default function swiss(input){
 const base=sceneBase(input,{hue:4}),{width:W,height:H,portrait,u,vocal,tracks}=base;
 const paper=[238,235,226],ink=[18,18,20],grey=[120,118,112];
 const m=portrait?u*.075:u*.08,cols=portrait?6:12,g=u*.02,colW=(W-m*2-g*(cols-1))/cols;
 const X=c=>m+c*(colW+g),span=(c,n)=>n*colW+(n-1)*g;
 const head=m+u*.035;
 const L=portrait
  ?{art:[0,head+u*.045,3],band:[3,3,head+u*.045,span(0,3)],lyric:[0,6,H*.4,H*.22],next:H*.645,list:[0,6,H*.71,H*.2],foot:H-m,spectrum:[0,6]}
  :{art:[0,head+u*.045,3],band:[4,8,head+u*.045,H*.335],lyric:[4,8,H*.555,H*.205],next:H*.8,list:null,foot:H-m,spectrum:[4,8]};
 const artSize=span(0,3),artY=L.art[1];
 if(!portrait)L.list=[0,3,artY+artSize+u*.06,L.foot-u*.05-(artY+artSize+u*.06)];
 const measure=layer(8,8).getContext('2d');
 const accentOf=i=>{const a=base.art(i);return a.real?hsl(a.hue,.82,.5):[226,38,30];};

 // Segments: the song title before the first line and in long gaps, then one per lyric line.
 const segments=new Map();
 function segmentsOf(i){
  if(segments.has(i))return segments.get(i);if(segments.size>4)segments.delete(segments.keys().next().value);
  const track=tracks[i],cues=vocal?(track.cues||[]).map((c,n)=>({...c,n})).filter(c=>Number.isFinite(c.start)):[],list=[{kind:'title',start:0}];
  cues.forEach((cue,n)=>{const next=cues[n+1]?.start??track.duration,end=Math.min(Number.isFinite(cue.end)&&cue.end>cue.start?cue.end:next,next,cue.start+8);
   list.push({kind:'line',start:cue.start,text:cue.text||'',n:cue.n,count:cues.length,after:cues[n+1]?.text||''});if(next-end>=6)list.push({kind:'gap',start:end+1.2,after:cues[n+1]?.text||''});});
  segments.set(i,list);return list;
 }
 const blocks=new Map();
 function blockOf(i,k){
  const key=`${i}:${k}`;if(blocks.has(key))return blocks.get(key);if(blocks.size>16)blocks.delete(blocks.keys().next().value);
  const r=random(hash(`swiss:${key}`)),[c0,n]=L.band,step=k=>Math.floor(r()*k);
  // Grid units: column start/width inside the band and vertical fractions of the band height.
  const ac=step(Math.max(1,n-1)),aw=1+step(Math.min(3,n-ac)),ay=[0,.25,.5][step(3)],ah=[.5,.75,1][step(3)];
  const bc=step(n),bw=1+step(Math.min(2,n-bc)),by=[0,.6,.8][step(3)],bh=[.12,.2,.4][step(3)];
  const out={a:[c0+ac,aw,ay,Math.min(ah,1-ay)],b:[c0+bc,bw,by,Math.min(bh,1-by)],rule:.12+r()*.76,square:[c0+step(n),r()]};
  blocks.set(key,out);return out;
 }
 const fits=new Map();
 function fitted(key,value,opts){if(fits.has(key))return fits.get(key);if(fits.size>24)fits.delete(fits.keys().next().value);const out=fitText(measure,value,opts);fits.set(key,out);return out;}

 function draw(ctx,time){
  const s=base.at(time),{i,local,show}=s,segs=segmentsOf(i),accent=accentOf(i);
  let k=0;for(let n=segs.length-1;n>=0;n--)if(segs[n].start<=local){k=n;break;}
  const seg=segs[k],age=local-seg.start;
  ctx.fillStyle=rgba(paper);ctx.fillRect(0,0,W,H);
  // Faint grid columns: the poster's construction lines.
  ctx.fillStyle='rgba(18,18,20,.07)';const hair=Math.max(1,u*.001);for(let c=0;c<cols;c++){ctx.fillRect(X(c),0,hair,H);ctx.fillRect(X(c)+colW-hair,0,hair,H);}

  // Blocks: interpolate from the previous arrangement to this one.
  const [b0,bn,bandY,bandH]=L.band,bandX=X(b0),bandW=span(b0,bn);
  const intro=seg.kind==='title'?Math.floor(local/3.5):0,key=seg.kind==='title'?`t${intro}`:k;
  const prevKey=seg.kind==='title'?(intro>0?`t${intro-1}`:null):k-1,ph=seg.kind==='title'?local-intro*3.5:age;
  const now=blockOf(i,key),before=prevKey===null?(i>0?blockOf(i-1,segmentsOf(i-1).length-1):now):blockOf(i,prevKey),p=easeInOut(ph/.75);
  const rect=(a,b)=>{const x0=lerp(X(b[0]),X(a[0]),p),w=lerp(span(b[0],b[1]),span(a[0],a[1]),p),y0=bandY+lerp(b[2],a[2],p)*bandH,h=lerp(b[3],a[3],p)*bandH;return [x0,y0,w,h];};
  const A=rect(now.a,before.a),B=rect(now.b,before.b);
  ctx.fillStyle=rgba(accent);ctx.fillRect(...A);ctx.fillStyle=rgba(ink);ctx.fillRect(...B);
  const ruleY=bandY+lerp(before.rule,now.rule,p)*bandH;ctx.fillRect(bandX,ruleY,bandW,Math.max(2,u*.005));

  // Giant outlined track number set flush right in the band; paper-colored where it crosses black.
  const number=String(i+1).padStart(2,'0');setFont(measure,700,100,-.04);const nsize=Math.min(bandH*1.08,bandW*.98/(measure.measureText(number).width/100)),nx=bandX+bandW,ny=bandY+bandH;
  const stroke=(color)=>{setFont(ctx,700,nsize,-.04);ctx.textAlign='right';ctx.textBaseline='alphabetic';ctx.lineWidth=Math.max(1.5,u*.0028);ctx.strokeStyle=color;ctx.strokeText(number,nx,ny-nsize*.02);};
  ctx.globalAlpha=show;stroke(rgba(ink));ctx.save();ctx.beginPath();ctx.rect(...B);ctx.clip();stroke(rgba(paper));ctx.restore();ctx.globalAlpha=1;

  // Album art cropped square in the first columns, with a small accent square riding its edge.
  const ax=X(0),ay=artY,as=artSize;
  if(i>0&&s.enter<1){drawCover(ctx,base.art(i-1).image,ax,ay,as,as);}ctx.globalAlpha=i>0?s.enter:1;drawCover(ctx,base.art(i).image,ax,ay,as,as);ctx.globalAlpha=1;
  const sq=u*.035,sy=ay+lerp(before.square[1],now.square[1],p)*(as-sq);ctx.fillStyle=rgba(accent);ctx.fillRect(ax+as-sq*.5,sy,sq,sq);

  // Header captions on the grid.
  const cap=u*.017,capY=m;
  if(base.headline)text(ctx,base.headline,X(0),capY,{size:cap,weight:700,color:rgba(ink),baseline:'top',spacing:.06,maxWidth:portrait?span(0,4):span(0,4)});
  text(ctx,`Nº ${number} / ${String(tracks.length).padStart(2,'0')}`,portrait?X(4):X(b0),capY,{size:cap,weight:700,color:rgba(ink),baseline:'top',spacing:.06});
  text(ctx,stamp(s.duration),X(cols-1)+colW,capY,{size:cap,weight:500,color:rgba(grey),baseline:'top',align:'right',spacing:.06});
  ctx.fillStyle=rgba(ink);ctx.fillRect(m,capY+u*.03,W-m*2,Math.max(1,u*.0015));

  // Lyrics: large, bold and flush left. A new line is revealed by a mask running left to right.
  const [l0,ln,ly,lh]=L.lyric,lx=X(l0),lw=span(l0,ln),size=portrait?u*.11:u*.1;
  const label=seg.kind==='line'?`가사  ${String(seg.n+1).padStart(2,'0')} / ${String(seg.count).padStart(2,'0')}`:seg.kind==='gap'?'간주':'곡 제목';
  text(ctx,label,lx,ly-u*.03,{size:cap,weight:700,color:rgba(accent),baseline:'bottom',spacing:.08});
  const blockFor=(sg,n)=>sg.kind==='line'?fitted(`l${i}:${n}`,sg.text,{size,minSize:size*.42,weight:700,lineHeight:1.12,maxWidth:lw,maxHeight:lh-u*.03,spacing:-.035,maxLines:4}):fitted(`t${i}`,tracks[i].title||'',{size:size*1.05,minSize:size*.4,weight:700,lineHeight:1.1,maxWidth:lw,maxHeight:lh-u*.03,spacing:-.035,maxLines:3});
  const reveal=easeOut((age-.16)/.5);
  if(k>0&&age<.2){const old=blockFor(segs[k-1],k-1),fade=1-age/.2;ctx.save();ctx.translate(0,-u*.04*(1-fade));drawBlock(ctx,old,lx,ly,{color:rgba(ink),alpha:fade*fade*show});ctx.restore();}
  if(reveal>0){const cur=blockFor(seg,k);ctx.save();ctx.beginPath();ctx.rect(lx-u*.01,ly-u*.02,(lw+u*.03)*reveal,lh+u*.06);ctx.clip();drawBlock(ctx,cur,lx+(1-reveal)*u*.03,ly,{color:rgba(ink),alpha:show});ctx.restore();
   // A short accent bar runs ahead of the mask, then rests under the line.
   const cy=ly+cur.height+u*.012;ctx.fillStyle=rgba(accent);ctx.fillRect(lx,cy,lerp(lw,u*.08,reveal),Math.max(3,u*.007));}
  // Next line, small.
  const after=seg.kind==='title'?(segs[1]?.text||''):seg.after;
  if(after){text(ctx,'다음',lx,L.next,{size:cap,weight:700,color:rgba(grey),baseline:'top',spacing:.08});text(ctx,after,lx+u*.06,L.next,{size:u*.024,weight:500,color:rgba(ink),baseline:'top',maxWidth:lw-u*.06,alpha:.85});}

  // Playlist column: every title, the playing one bold with an accent square.
  {const [c0,cn,y0,h]=L.list,x=X(c0),w=span(c0,cn),rowH=u*(portrait?.05:.044),rows=Math.max(2,Math.floor((h-u*.04)/rowH)),n=tracks.length;
   text(ctx,'플레이리스트',x,y0,{size:cap,weight:700,color:rgba(ink),baseline:'top',spacing:.08});text(ctx,`${n}곡`,x+w,y0,{size:cap,weight:500,color:rgba(grey),baseline:'top',align:'right'});
   ctx.fillStyle=rgba(ink);ctx.fillRect(x,y0+u*.03,w,Math.max(1,u*.0015));
   const first=j=>clamp(j-Math.floor(rows/3),0,Math.max(0,n-rows)),scroll=i>0?lerp(first(i-1),first(i),easeInOut(local/.8)):first(i),top=y0+u*.045;
   ctx.save();ctx.beginPath();ctx.rect(x-u*.01,top,w+u*.02,rows*rowH);ctx.clip();
   for(let j=Math.floor(scroll);j<Math.min(n,Math.ceil(scroll)+rows+1);j++){
    const y=top+(j-scroll)*rowH+rowH/2,cur=j===i;
    if(cur){ctx.fillStyle=rgba(accent);ctx.fillRect(x,y-u*.007,u*.014,u*.014);}
    text(ctx,String(j+1).padStart(2,'0'),x+u*.03,y,{size:u*.018,weight:cur?800:500,color:rgba(cur?ink:grey),baseline:'middle'});
    text(ctx,tracks[j].title||'',x+u*.075,y,{size:u*.021,weight:cur?800:400,color:rgba(cur?ink:mix(ink,paper,.35)),baseline:'middle',maxWidth:w-u*.085});
   }
   ctx.restore();}

  // Footer: spectrum lines, progress rule with a square head, elapsed and remaining time.
  const [f0,fn]=L.spectrum,fx=X(f0),fw=span(f0,fn),fy=L.foot;
  if(s.frame)drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:ink,alpha:.85,x:fx,y:fy-u*.088,width:fw,height:u*.042});
  const pr=clamp(s.progress,0,1),th=Math.max(2,u*.004);ctx.fillStyle=rgba(ink,.2);ctx.fillRect(fx,fy-u*.035,fw,th);ctx.fillStyle=rgba(ink);ctx.fillRect(fx,fy-u*.035,fw*pr,th);
  ctx.fillStyle=rgba(accent);ctx.fillRect(fx+fw*pr-u*.006,fy-u*.035-u*.006+th/2,u*.012,u*.012);
  text(ctx,stamp(local),fx,fy,{size:cap,weight:700,color:rgba(ink),baseline:'bottom'});
  text(ctx,`-${stamp(Math.max(0,s.duration-local))}`,fx+fw,fy,{size:cap,weight:500,color:rgba(grey),baseline:'bottom',align:'right'});
  text(ctx,tracks[i].title||'',fx+u*.09,fy,{size:cap,weight:500,color:rgba(ink),baseline:'bottom',maxWidth:fw-u*.2,alpha:.8});
 }
 return {draw,duration:base.total};
}

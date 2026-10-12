import {sceneBase,drawSpectrum,drawCover,text,fitText,drawBlock,setFont,wrap,ellipsize,stamp,rgba,mix,layer,hash,random,hsl,clamp,lerp,easeOut,easeInOut} from '../canvas-kit.mjs';

/**
 * 노래방: a Korean karaoke screen. The chosen picture (or the album art) plays as a slow Ken Burns
 * shot; two lyric lines sit at the bottom, the upper one left-aligned and the lower one right-aligned,
 * taking turns as in a real machine. The line being sung is wiped with color from the left as it is
 * sung; four countdown dots vanish one by one before the first line and after long interludes, and
 * each song opens with a title card.
 */
export default function karaoke(input){
 const base=sceneBase(input,{hue:205}),{width:W,height:H,portrait,u,vocal,tracks}=base;
 const M=portrait?u*.06:W*.07;
 const L=portrait
  ?{font:u*.076,upper:H*.735,lower:H*.83,maxW:W-M*2,card:[H*.36,H*.2],bar:H*.965,top:H*.045}
  :{font:u*.086,upper:H*.7,lower:H*.83,maxW:W*.8,card:[H*.32,H*.3],bar:H*.958,top:H*.075};
 const measure=layer(8,8).getContext('2d'),navy=[8,12,38],white=[255,255,255];
 const sungColor=i=>{const a=base.art(i);return a.real?hsl(a.hue,.95,.62):hsl(196,.95,.6);};

 // A lyric line fitted for the screen: one row when possible, otherwise two rows.
 const fits=new Map();
 function fit(i,n){
  const key=`${i}:${n}`;if(fits.has(key))return fits.get(key);if(fits.size>24)fits.delete(fits.keys().next().value);
  const value=String(tracks[i].cues[n]?.text||'').trim()||'♪';let size=L.font,rows;
  for(;size>=L.font*.8;size*=.95){setFont(measure,700,size,-.01);if(measure.measureText(value).width<=L.maxW){rows=[value];break;}}
  if(!rows)for(size=L.font*.8;;size*=.95){setFont(measure,700,size,-.01);rows=wrap(measure,value,L.maxW);if(rows.length<=2||size<L.font*.45){rows=rows.slice(0,2);if(wrap(measure,value,L.maxW).length>2)rows[1]=ellipsize(measure,rows[1]+'…',L.maxW);break;}}
  setFont(measure,700,size,-.01);const widths=rows.map(row=>measure.measureText(row).width);
  const out={rows,widths,size,total:widths.reduce((a,b)=>a+b,0)};fits.set(key,out);return out;
 }
 /** Row positions of a line in a slot: the upper slot grows upward and is left-aligned, the lower one grows downward and is right-aligned. */
 function rowsOf(item,slot){
  const lh=item.size*1.22;
  return item.rows.map((row,k)=>{const y=slot===0?L.upper-(item.rows.length-1-k)*lh:L.lower+k*lh,w=item.widths[k];return {row,w,x:slot===0?M:W-M-w,y};});
 }
 function paintRow(ctx,row,x,y,size,fill,edge){
  setFont(ctx,700,size,-.01);ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.lineJoin='round';
  ctx.strokeStyle=rgba(navy,.92);ctx.lineWidth=size*.17;ctx.strokeText(row,x,y);
  if(edge){ctx.strokeStyle=rgba(edge);ctx.lineWidth=size*.075;ctx.strokeText(row,x,y);}
  ctx.fillStyle=rgba(fill);ctx.fillText(row,x,y);
 }
 /** Draws a line with `sung` (0..1) of its width wiped in the song color. */
 function drawLine(ctx,i,n,slot,sung,alpha){
  if(alpha<=0||n<0||n>=(tracks[i].cues||[]).length)return;
  const item=fit(i,n),color=sungColor(i);let left=sung*item.total;ctx.globalAlpha=alpha;
  for(const r of rowsOf(item,slot)){
   paintRow(ctx,r.row,r.x,r.y,item.size,white,null);
   const fill=clamp(left,0,r.w);left-=r.w;
   if(fill>0){ctx.save();ctx.beginPath();ctx.rect(r.x-item.size*.2,r.y-item.size*1.2,fill+item.size*.2,item.size*1.6);ctx.clip();paintRow(ctx,r.row,r.x,r.y,item.size,color,white);ctx.restore();}
  }
  ctx.globalAlpha=1;
 }
 /** Four dots above the start of a line, one disappearing per second before it is sung. */
 function countdown(ctx,i,n,slot,remaining){
  if(remaining>4.4||remaining<=0)return;
  const item=fit(i,n),first=rowsOf(item,slot)[0],r=item.size*.16,y=first.y-item.size*1.02-r,count=clamp(Math.ceil(remaining),0,4),color=sungColor(i);
  for(let k=0;k<4;k++){
   const gone=k>=count,pop=gone?0:clamp((4.4-remaining)/.4,0,1);if(pop<=0)continue;
   const x=first.x+r+k*r*3.1;ctx.fillStyle=rgba(navy,.9);ctx.beginPath();ctx.arc(x,y,r*1.35*pop,0,Math.PI*2);ctx.fill();
   ctx.fillStyle=rgba(k===count-1?white:color);ctx.beginPath();ctx.arc(x,y,r*pop,0,Math.PI*2);ctx.fill();
  }
 }

 // Ken Burns: per song a slow push from one framing to another; a chosen background moves continuously.
 function picture(ctx,image,zoom,px,py,alpha){const w=W*zoom,h=H*zoom;ctx.globalAlpha=alpha;drawCover(ctx,image,(W-w)/2+px*W,(H-h)/2+py*H,w,h);ctx.globalAlpha=1;}
 function shot(ctx,i,progress,alpha){
  const r=random(hash(`${tracks[i].title}:${i}`)),z0=1.06+r()*.05,z1=z0+.14,ax=(r()-.5)*.07,ay=(r()-.5)*.05,p=easeInOut(progress);
  picture(ctx,base.art(i).image,lerp(z0,z1,r()<.5?p:1-p),lerp(ax,-ax,p),lerp(ay,-ay,p),alpha);
 }
 const cards=new Map();
 const cardTitle=i=>{if(!cards.has(i)){if(cards.size>3)cards.delete(cards.keys().next().value);cards.set(i,fitText(measure,tracks[i].title||'',{size:u*(portrait?.075:.085),minSize:u*.035,weight:700,lineHeight:1.18,maxWidth:portrait?W-M*2:W*.6,maxHeight:L.card[1]*(portrait?.42:.55),spacing:-.02,maxLines:2}));}return cards.get(i);};

 function draw(ctx,time){
  const s=base.at(time),{i,local,show}=s,cues=vocal?s.track.cues||[]:[],color=sungColor(i);
  ctx.fillStyle='#05060c';ctx.fillRect(0,0,W,H);
  if(base.background){picture(ctx,base.background,1.12+Math.sin(s.t*.021)*.05,Math.sin(s.t*.017)*.035,Math.cos(s.t*.013)*.025,1);}
  else{if(i>0&&s.enter<1)shot(ctx,i-1,1,1);shot(ctx,i,s.progress,i>0?s.enter:1);}
  // Grade: a light overall dim, darker toward the lyrics and the top bar.
  ctx.fillStyle='rgba(4,6,16,.24)';ctx.fillRect(0,0,W,H);
  const low=ctx.createLinearGradient(0,H*.5,0,H);low.addColorStop(0,'rgba(4,6,18,0)');low.addColorStop(.55,'rgba(4,6,18,.5)');low.addColorStop(1,'rgba(4,6,18,.82)');ctx.fillStyle=low;ctx.fillRect(0,H*.5,W,H*.5);
  const high=ctx.createLinearGradient(0,0,0,H*.16);high.addColorStop(0,'rgba(4,6,18,.6)');high.addColorStop(1,'rgba(4,6,18,0)');ctx.fillStyle=high;ctx.fillRect(0,0,W,H*.16);

  // Top bar: the song number tag and title on the left, the title phrase on the right.
  const tag=`${String(i+1).padStart(2,'0')}`,ty=L.top;setFont(ctx,800,u*.024);const tw=ctx.measureText(tag).width+u*.03;
  ctx.fillStyle=rgba(color);ctx.beginPath();ctx.roundRect(M,ty-u*.022,tw,u*.044,u*.006);ctx.fill();
  text(ctx,tag,M+tw/2,ty,{size:u*.024,weight:800,color:rgba(navy),align:'center',baseline:'middle'});
  text(ctx,tracks[i].title,M+tw+u*.018,ty,{size:u*.024,weight:700,color:'rgba(255,255,255,.95)',baseline:'middle',maxWidth:portrait?W-M*2-tw-u*.02:W*.5,alpha:show});
  if(base.headline)text(ctx,base.headline,portrait?M:W-M,portrait?ty+u*.06:ty,{size:u*.02,weight:700,color:'rgba(255,255,255,.78)',align:portrait?'left':'right',baseline:'middle',spacing:.12,maxWidth:portrait?W-M*2:W*.32});
  if(s.frame){const sw=portrait?u*.3:W*.16,sh=u*.045,sx=W-M-sw,sy=portrait?ty+u*.03:ty+u*.035;drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:mix(color,white,.35),alpha:.75,x:sx,y:sy,width:sw,height:sh});}

  // Lyrics.
  const line=base.lineState(s),c=line.index,starts=cues.map(cue=>cue.start),first=starts.findIndex(Number.isFinite);
  const endOf=n=>{const cue=cues[n],next=starts[n+1]??s.duration;return Math.min(Number.isFinite(cue?.end)&&cue.end>cue.start?cue.end:next,next);};
  const fadeOut=s.exit;let interlude=0;
  if(c<0){
   if(first>=0){const remaining=starts[first]-local,a=clamp((6.5-remaining)/.5,0,1)*fadeOut;
    drawLine(ctx,i,first,first%2,0,a);drawLine(ctx,i,first+1,(first+1)%2,0,a);if(a>0)countdown(ctx,i,first,first%2,remaining);}
  }else{
   const next=c+1,gapAfter=(starts[next]??s.duration)-endOf(c),long=gapAfter>=9,age=local-starts[c];
   // Current line: wiped while sung; after it, in a long interlude it fades out.
   const hold=long?clamp(1-(local-endOf(c)-1)/.5,0,1):1;drawLine(ctx,i,c,c%2,line.progress,hold*fadeOut);
   // Other slot: the line just sung fades, then the next line appears (after a long gap: only near its start).
   if(c>0&&age<.3)drawLine(ctx,i,c-1,(c-1)%2,1,(1-age/.3)*fadeOut);
   if(next<cues.length){
    if(!long){if(age>=.15)drawLine(ctx,i,next,next%2,0,clamp((age-.15)/.25,0,1)*fadeOut);if(gapAfter>=4.5)countdown(ctx,i,next,next%2,starts[next]-local);}
    else{const remaining=starts[next]-local,a=clamp((5.5-remaining)/.5,0,1)*fadeOut;drawLine(ctx,i,next,next%2,0,a);
     if(remaining<5.5)drawLine(ctx,i,next+1,(next+1)%2,0,a*clamp(1-hold,0,1));if(a>0)countdown(ctx,i,next,next%2,remaining);
     interlude=clamp(Math.min((local-endOf(c)-1.2)/.5,(remaining-6)/.5),0,1);}
   }else if(long)interlude=clamp((local-endOf(c)-1.2)/.5,0,1)*clamp((s.duration-local-2)/.5,0,1);
  }
  if(interlude>0){const y=(L.upper+L.lower)/2,pulse=.7+.3*Math.sin(local*3.2);
   ctx.globalAlpha=interlude;setFont(ctx,700,u*.05,.3);ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.strokeStyle=rgba(navy,.9);ctx.lineWidth=u*.009;ctx.strokeText('간 주 중',W/2,y);ctx.fillStyle=rgba(mix(white,color,.3));ctx.fillText('간 주 중',W/2,y);
   ctx.fillStyle=rgba(color,pulse);for(const side of [-1,1]){ctx.beginPath();ctx.arc(W/2+side*u*.17,y,u*.008,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}

  // Opening title card.
  const firstStart=first>=0?starts[first]:s.duration,cardEnd=clamp(firstStart-2.2,3.2,7.5),cin=easeOut((local-.25)/.6),cout=easeInOut((cardEnd-local)/.6),card=Math.min(cin,cout)*fadeOut;
  if(card>0){
   const [cy,ch]=L.card,title=cardTitle(i),band=ctx.createLinearGradient(0,0,W,0);band.addColorStop(0,'rgba(6,10,34,0)');band.addColorStop(.12,'rgba(6,10,34,.84)');band.addColorStop(.88,'rgba(6,10,34,.84)');band.addColorStop(1,'rgba(6,10,34,0)');
   const open=easeOut((local-.25)/.5)*cout,h=ch*open;ctx.globalAlpha=fadeOut;ctx.fillStyle=band;ctx.fillRect(0,cy-h/2,W,h);ctx.fillStyle=rgba(color,.9);ctx.fillRect(W*.5-W*.45*open,cy-h/2,W*.9*open,Math.max(2,u*.004));ctx.fillRect(W*.5-W*.45*open,cy+h/2-Math.max(2,u*.004),W*.9*open,Math.max(2,u*.004));
   ctx.globalAlpha=card;const slide=(1-cin)*u*.08;
   if(portrait){
    const bs=u*.16,bx=W/2-bs/2,by=cy-ch*.42+slide*.3;ctx.fillStyle=rgba(color);ctx.beginPath();ctx.roundRect(bx,by,bs,bs*.82,u*.012);ctx.fill();
    text(ctx,String(i+1).padStart(2,'0'),W/2,by+bs*.38,{size:u*.075,weight:800,color:rgba(navy),align:'center',baseline:'middle',alpha:card});
    text(ctx,`/ ${String(tracks.length).padStart(2,'0')}`,W/2,by+bs*.69,{size:u*.022,weight:700,color:rgba(navy,.8),align:'center',baseline:'middle',alpha:card});
    const titleY=by+bs*.82+u*.035;drawBlock(ctx,title,W/2,titleY,{color:'#fff',align:'center',alpha:card});
    if(base.headline)text(ctx,base.headline,W/2,titleY+title.height+u*.035,{size:u*.024,weight:600,color:rgba(mix(white,color,.4)),align:'center',spacing:.14,maxWidth:W-M*2,alpha:card});
   }else{
    const bs=ch*.62,bx=W*.17-slide,by=cy-bs/2;ctx.fillStyle=rgba(color);ctx.beginPath();ctx.roundRect(bx,by,bs,bs,u*.014);ctx.fill();
    text(ctx,String(i+1).padStart(2,'0'),bx+bs/2,by+bs*.44,{size:bs*.5,weight:800,color:rgba(navy),align:'center',baseline:'middle',alpha:card});
    text(ctx,`/ ${String(tracks.length).padStart(2,'0')}`,bx+bs/2,by+bs*.8,{size:bs*.14,weight:700,color:rgba(navy,.8),align:'center',baseline:'middle',alpha:card});
    const tx=bx+bs+u*.05+slide*.5,extra=base.headline?u*.05:0,titleY=cy-(title.height+extra)/2;drawBlock(ctx,title,tx,titleY,{color:'#fff',alpha:card});
    if(base.headline)text(ctx,base.headline,tx,titleY+title.height+u*.04,{size:u*.024,weight:600,color:rgba(mix(white,color,.4)),spacing:.14,maxWidth:W*.6,alpha:card});
   }
   ctx.globalAlpha=1;
  }

  // Bottom strip: elapsed time, a thin progress bar and the song length.
  const by=L.bar,bx0=M+u*.075,bx1=W-M-u*.075,th=Math.max(2,u*.004);
  text(ctx,stamp(local),M,by,{size:u*.019,weight:700,color:'rgba(255,255,255,.85)',baseline:'middle'});
  text(ctx,stamp(s.duration),W-M,by,{size:u*.019,weight:700,color:'rgba(255,255,255,.6)',align:'right',baseline:'middle'});
  ctx.fillStyle='rgba(255,255,255,.2)';ctx.fillRect(bx0,by-th/2,bx1-bx0,th);ctx.fillStyle=rgba(color);ctx.fillRect(bx0,by-th/2,(bx1-bx0)*clamp(s.progress,0,1),th);
 }
 return {draw,duration:base.total};
}

import {sceneBase,clamp,lerp,easeOut,easeInOut,layer,rgba,mix,hsl,text,fitText,drawBlock,drawSpectrum,radialGlow,stamp,FONT} from '../canvas-kit.mjs';

/**
 * 지하철 노선도 (instrumental): the playlist is a subway line. Songs are stations on a map; the train
 * runs from the playing song's station to the next one with the song's progress, passed stations are
 * filled, the map scrolls along with the train, and an in-car display panel announces 이번 곡은 / 다음 곡
 * with a dot-matrix LED ticker. On each arrival the station grows and sends out a ring pulse.
 */
export default function subway(input){
 const base=sceneBase(input,{hue:150}),{width:W,height:H,portrait,u,tracks}=base,count=tracks.length;
 const paper=[238,240,243],ink=[28,34,48],muted=[128,136,150],amber=[255,176,58];
 // Viewport of the map and the display panel.
 const V=portrait?{x:u*.06,y:H*.115,w:u*.88,h:H*.5}:{x:W*.05,y:H*.17,w:W*.57,h:H*.78};
 const P=portrait?{x:u*.06,y:H*.645,w:u*.88,h:H*.305}:{x:W*.655,y:H*.08,w:W*.295,h:H*.84};
 const measure=layer(8,8).getContext('2d'),pad=n=>String(n).padStart(2,'0'),totalTime=tracks.reduce((sum,t)=>sum+(Number(t.duration)||0),0);

 // ---- Route geometry (map coordinates; the camera scrolls the map vertically) ----
 const pts=[],stations=[];let sp,labelW;
 const push=(x,y)=>pts.push([x,y]);
 if(!portrait){
  const multi=count>6,per=multi?5:count,rowGap=H*.25,Rt=rowGap/2;
  if(!multi){
   sp=Math.min(V.w/per,W*.16);const x0=(V.w-per*sp)/2;
   push(x0+sp*.1,0);for(let j=0;j<count;j++){stations.push(pts.length);push(x0+(j+.5)*sp,0);}push(x0+per*sp-sp*.1,0);
  }else{
   sp=(V.w-2*Rt)/per;const rows=Math.ceil(count/per);
   push(Rt+sp*.1,0);
   for(let r=0;r<rows;r++){
    const y=r*rowGap,dir=r%2?-1:1,n=Math.min(per,count-r*per);let x=0;
    for(let j=0;j<n;j++){x=dir>0?Rt+(j+.5)*sp:V.w-Rt-(j+.5)*sp;stations.push(pts.length);push(x,y);}
    if(r===rows-1){push(x+dir*sp*.4,y);break;}
    const cx=dir>0?V.w-Rt:Rt;push(cx,y);
    for(let k=1;k<=28;k++){const a=-Math.PI/2+dir*Math.PI*k/28;push(cx+Math.cos(a)*Rt,y+Rt+Math.sin(a)*Rt);}
   }
  }
  labelW=sp*.9;
 }else{
  // Vertical line with a 45° jog every four stations, like a printed metro map.
  sp=H*.076;const colA=V.w*.13,colB=V.w*.25,x=j=>Math.floor(j/4)%2?colB:colA;
  push(x(0),-sp*.4);
  for(let j=0;j<count;j++){
   if(j>0&&x(j)!==x(j-1)){push(x(j-1),(j-1)*sp+sp*.22);push(x(j),j*sp-sp*.22);}
   stations.push(pts.length);push(x(j),j*sp);
  }
  push(x(count-1),(count-1)*sp+sp*.4);
  labelW=V.w-colB-u*.1;
 }
 const lens=[0];for(let k=1;k<pts.length;k++)lens.push(lens[k-1]+Math.hypot(pts[k][0]-pts[k-1][0],pts[k][1]-pts[k-1][1]));
 const stationLen=stations.map(k=>lens[k]),routeEnd=lens[lens.length-1];
 function pointAt(len){
  len=clamp(len,0,routeEnd);let lo=0,hi=lens.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(lens[mid]<=len)lo=mid;else hi=mid;}
  const a=pts[lo],b=pts[hi],t=(len-lens[lo])/Math.max(1e-6,lens[hi]-lens[lo]);return [lerp(a[0],b[0],t),lerp(a[1],b[1],t),Math.atan2(b[1]-a[1],b[0]-a[0]),lo];
 }
 const ys=pts.map(p=>p[1]),minY=Math.min(...ys),maxY=Math.max(...ys),margin=portrait?sp*.8:u*.11;
 const fits=maxY-minY+margin*2<=V.h;

 // ---- Caches: palettes and labels (bounded) ----
 const palettes=new Map();
 const paletteOf=k=>{let e=palettes.get(k);if(!e){const art=base.art(k);e={line:hsl(art.hue,.62,.44),soft:art.soft};palettes.set(k,e);if(palettes.size>8)palettes.delete(palettes.keys().next().value);}return e;};
 const big=!portrait&&count<=4?1.25:1,labels=new Map();
 const labelOf=(k,hot)=>{const key=k*2+(hot?1:0);let e=labels.get(key);if(!e){e=portrait
  ?fitText(measure,tracks[k].title||'',{size:u*(hot?.036:.027),minSize:u*.02,weight:hot?800:600,lineHeight:1.2,maxWidth:labelW,maxHeight:sp*.8,spacing:-.02,maxLines:hot?2:1})
  :fitText(measure,tracks[k].title||'',{size:u*(hot?.024:.02)*big,minSize:u*.015,weight:hot?800:600,lineHeight:1.22,maxWidth:hot?sp*1.02:labelW,maxHeight:u*.064,spacing:-.02,maxLines:2});
  labels.set(key,e);if(labels.size>160)labels.delete(labels.keys().next().value);}return e;};
 const panelTitles=new Map();
 const panelTitle=k=>{if(!panelTitles.has(k)){if(panelTitles.size>4)panelTitles.delete(panelTitles.keys().next().value);panelTitles.set(k,fitText(measure,tracks[k].title||'',portrait
  ?{size:u*.05,minSize:u*.03,weight:800,lineHeight:1.18,maxWidth:P.w*.9,maxHeight:u*.12,spacing:-.025,maxLines:2}
  :{size:u*.054,minSize:u*.03,weight:800,lineHeight:1.18,maxWidth:P.w*.84,maxHeight:u*.2,spacing:-.025,maxLines:3}));}return panelTitles.get(k);};

 // ---- Dot-matrix LED ticker ----
 const LED_ROWS=15,cell=Math.max(2,Math.round(u*.0032)),ledW=Math.floor((P.w-u*.08)/cell)*cell,ledH=LED_ROWS*cell;
 const unlit=(()=>{const c=layer(ledW,ledH),g=c.getContext('2d');g.fillStyle=rgba(amber,.08);g.beginPath();for(let y=0;y<LED_ROWS;y++)for(let x=0;x<ledW/cell;x++){g.moveTo(x*cell+cell*.9,y*cell+cell/2);g.arc(x*cell+cell/2,y*cell+cell/2,cell*.38,0,Math.PI*2);}g.fill();return c;})();
 const tickers=new Map();
 function ticker(k){
  if(tickers.has(k))return tickers.get(k);
  const cut=s=>{s=String(s||'');return s.length>34?s.slice(0,33)+'…':s;};
  const message=`이번 곡은  ${cut(tracks[k].title)}  입니다     ▶     ${k<count-1?`다음 곡은  ${cut(tracks[k+1].title)}  입니다`:'이번 곡은 이 노선의 마지막 곡입니다'}     ▶     ${k+1}번째 곡  /  전체 ${count}곡          `;
  const g0=layer(8,8).getContext('2d');g0.font=`700 13px ${FONT}`;
  const cols=Math.min(4000,Math.ceil(g0.measureText(message).width)),src=layer(cols,LED_ROWS),sg=src.getContext('2d',{willReadFrequently:true});
  sg.font=g0.font;sg.fillStyle='#fff';sg.textBaseline='middle';sg.fillText(message,0,LED_ROWS/2+.5);
  const data=sg.getImageData(0,0,cols,LED_ROWS).data,out=layer(cols*cell,ledH),og=out.getContext('2d');
  og.fillStyle=rgba(amber);og.beginPath();
  for(let y=0;y<LED_ROWS;y++)for(let x=0;x<cols;x++)if(data[(y*cols+x)*4+3]>96){og.moveTo(x*cell+cell*.92,y*cell+cell/2);og.arc(x*cell+cell/2,y*cell+cell/2,cell*.42,0,Math.PI*2);}
  og.fill();
  tickers.set(k,out);if(tickers.size>3)tickers.delete(tickers.keys().next().value);
  return out;
 }

 function noteBadge(ctx,x,y,r,color){
  ctx.fillStyle=rgba(color);ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(x-r*.2,y+r*.32,r*.22,r*.17,-.4,0,Math.PI*2);ctx.fill();
  ctx.fillRect(x-r*.02,y-r*.5,r*.1,r*.85);ctx.beginPath();ctx.moveTo(x+r*.08,y-r*.5);ctx.quadraticCurveTo(x+r*.45,y-r*.35,x+r*.38,y-r*.02);ctx.quadraticCurveTo(x+r*.34,y-r*.25,x+r*.08,y-r*.24);ctx.fill();
 }

 function draw(ctx,time){
  const s=base.at(time),{i,local,duration,energy}=s,last=i===count-1;
  const pal=paletteOf(i),prev=i>0?paletteOf(i-1):pal,line=mix(prev.line,pal.line,i>0?easeOut(local/1.4):1),pale=mix(line,paper,.62);
  // Train position: dwells at the station, departs, and arrives as the song ends.
  const q=clamp((local-1.1)/Math.max(.5,duration-2.2),0,1),travel=q*.75+easeInOut(q)*.25;
  const fromLen=stationLen[i],toLen=last?routeEnd:stationLen[i+1],trainLen=lerp(fromLen,toLen,travel),[tx,ty,ta]=pointAt(trainLen);
  const camY=fits?(minY+maxY)/2-V.h/2:clamp(ty-V.h*.42,minY-margin,maxY+margin-V.h);
  const X=x=>V.x+x,Y=y=>V.y+y-camY;
  // Paper and a scrolling map grid.
  ctx.fillStyle=rgba(paper);ctx.fillRect(0,0,W,H);
  ctx.save();ctx.beginPath();ctx.rect(portrait?0:0,V.y,portrait?W:P.x-u*.02,V.h);ctx.clip();
  const gs=u*.06;ctx.fillStyle='rgba(40,60,90,.06)';
  for(let y=((-camY%gs)+gs)%gs+V.y;y<V.y+V.h;y+=gs)ctx.fillRect(0,y,W,Math.max(1,u*.001));
  for(let x=V.x%gs;x<(portrait?W:P.x);x+=gs)ctx.fillRect(x,V.y,Math.max(1,u*.001),V.h);
  // A river crossing the map (scrolls with it).
  const riverY=portrait?sp*Math.min(2.5,count-.5)+sp*.02:H*.25*.58;
  if(Y(riverY)>V.y-u*.1&&Y(riverY)<V.y+V.h+u*.1){
   ctx.strokeStyle='rgba(150,196,232,.45)';ctx.lineWidth=u*.045;ctx.lineCap='round';ctx.beginPath();
   const x0=portrait?-u*.1:V.x-u*.2,x1=portrait?W+u*.1:P.x-u*.02;
   for(let x=x0;x<=x1;x+=u*.02){const y=Y(riverY)+Math.sin(x/u*4.2)*u*.018+Math.sin(x/u*1.3+1)*u*.01;x===x0?ctx.moveTo(x,y):ctx.lineTo(x,y);}
   ctx.stroke();
  }
  // Line: white casing, the route ahead in a pale tint, the travelled part in full color.
  const lw=u*(portrait?.016:.014);ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();pts.forEach(([x,y],k)=>k?ctx.lineTo(X(x),Y(y)):ctx.moveTo(X(x),Y(y)));
  ctx.strokeStyle='#fff';ctx.lineWidth=lw*1.7;ctx.stroke();ctx.strokeStyle=rgba(pale);ctx.lineWidth=lw;ctx.stroke();
  ctx.beginPath();ctx.moveTo(X(pts[0][0]),Y(pts[0][1]));for(let k=1;k<pts.length&&lens[k]<trainLen;k++)ctx.lineTo(X(pts[k][0]),Y(pts[k][1]));ctx.lineTo(X(tx),Y(ty));
  ctx.strokeStyle=rgba(line);ctx.stroke();
  // Stations.
  const r=u*(portrait?.014:.0125)*big,arrive=easeOut(local/.7),pulse=local<2.4?(local%1.2)/1.2:-1;
  for(let k=0;k<count;k++){
   const [mx,my]=pts[stations[k]],x=X(mx),y=Y(my);if(y<V.y-u*.12||y>V.y+V.h+u*.12)continue;
   const passed=k<i,current=k===i,rr=current?r*lerp(1,1.65,arrive):r;
   if(current&&pulse>=0&&(i>0||local>.05)){ctx.strokeStyle=rgba(line,(1-pulse)*.7);ctx.lineWidth=u*.004;ctx.beginPath();ctx.arc(x,y,rr*(1.1+pulse*2.2),0,Math.PI*2);ctx.stroke();}
   ctx.fillStyle=passed?rgba(line):'#fff';ctx.strokeStyle=rgba(passed||current?line:mix(line,paper,.35));ctx.lineWidth=u*(current?.0062:.0045);
   ctx.beginPath();ctx.arc(x,y,rr,0,Math.PI*2);ctx.fill();ctx.stroke();
   if(passed){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,r*.34,0,Math.PI*2);ctx.fill();}
   if(current){ctx.fillStyle=rgba(line);ctx.beginPath();ctx.arc(x,y,rr*.42,0,Math.PI*2);ctx.fill();}
   const color=rgba(current?ink:passed?muted:mix(ink,paper,.18)),block=labelOf(k,current);
   if(portrait){
    text(ctx,pad(k+1),x-r*2.3,y,{size:u*.019,weight:700,color:rgba(current?line:muted),align:'right',baseline:'middle',spacing:.04});
    const lx=X(V.w*.25)+u*.06;drawBlock(ctx,block,lx,y-block.height/2,{color,align:'left'});
   }else{
    text(ctx,pad(k+1),x,y-rr-u*.014,{size:u*.0155,weight:700,color:rgba(current?line:muted),align:'center',spacing:.04});
    drawBlock(ctx,block,x,y+rr+u*.012,{color,align:'center'});
   }
  }
  // Train: a short car on the line with a headlight that brightens with the bass.
  {
   const x=X(tx),y=Y(ty),len=u*(portrait?.062:.052),hh=u*(portrait?.026:.023);
   ctx.save();ctx.translate(x,y);ctx.rotate(ta);
   radialGlow(ctx,len*.62,0,u*.05,mix(line,[255,255,255],.3),.25+energy.low*.45);
   ctx.fillStyle='rgba(0,0,0,.18)';ctx.beginPath();ctx.roundRect(-len/2+u*.002,-hh/2+u*.004,len,hh,hh*.45);ctx.fill();
   ctx.fillStyle=rgba(ink);ctx.beginPath();ctx.roundRect(-len/2,-hh/2,len,hh,[hh*.3,hh*.5,hh*.5,hh*.3]);ctx.fill();
   ctx.fillStyle=rgba(line);ctx.fillRect(-len/2,hh*.12,len*.92,hh*.14);
   ctx.fillStyle='rgba(235,242,255,.92)';for(let w=0;w<3;w++)ctx.fillRect(-len/2+len*(.1+w*.22),-hh*.3,len*.15,hh*.28);
   ctx.fillStyle=rgba(mix(line,[255,255,255],.55));ctx.beginPath();ctx.arc(len*.43,-hh*.12,hh*.11,0,Math.PI*2);ctx.fill();
   ctx.restore();
  }
  ctx.restore();
  // Soft fades where the map scrolls out of view.
  const fadeH=u*.06,fw=portrait?W:P.x-u*.02;
  if(!fits){
   let g=ctx.createLinearGradient(0,V.y,0,V.y+fadeH);g.addColorStop(0,rgba(paper,1));g.addColorStop(1,rgba(paper,0));ctx.fillStyle=g;ctx.fillRect(0,V.y,fw,fadeH);
   g=ctx.createLinearGradient(0,V.y+V.h-fadeH,0,V.y+V.h);g.addColorStop(0,rgba(paper,0));g.addColorStop(1,rgba(paper,1));ctx.fillStyle=g;ctx.fillRect(0,V.y+V.h-fadeH,fw,fadeH);
  }
  // Line name sign (the title text).
  const signY=portrait?H*.06:H*.085,signX=portrait?u*.06:W*.05,br=u*.026;
  if(base.headline){
   noteBadge(ctx,signX+br,signY,br,line);
   text(ctx,base.headline,signX+br*2+u*.022,signY,{size:u*.032,weight:800,color:rgba(ink),baseline:'middle',spacing:-.02,maxWidth:(portrait?W-u*.12:P.x-W*.05-u*.04)-br*2-u*.022-(portrait?0:u*.25)});
  }
  if(!portrait)text(ctx,`${count}개 역  ·  ${stamp(totalTime)}`,P.x-u*.04,signY,{size:u*.018,weight:600,color:rgba(muted),align:'right',baseline:'middle',spacing:.02});
  if(base.headline){ctx.fillStyle=rgba(line);ctx.fillRect(signX,signY+u*.045,(portrait?W-u*.12:P.x-u*.04-signX),Math.max(2,u*.004));}

  // ---- In-car display panel ----
  const {x:px,y:py,w:pw,h:ph}=P,pp=u*.04;
  ctx.fillStyle='rgba(0,0,0,.14)';ctx.beginPath();ctx.roundRect(px+u*.004,py+u*.01,pw,ph,u*.024);ctx.fill();
  const body=ctx.createLinearGradient(0,py,0,py+ph);body.addColorStop(0,'#172036');body.addColorStop(1,'#0d1424');ctx.fillStyle=body;ctx.beginPath();ctx.roundRect(px,py,pw,ph,u*.024);ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.08)';ctx.lineWidth=Math.max(1,u*.0015);ctx.stroke();
  ctx.fillStyle=rgba(line);ctx.fillRect(px+pp,py+u*.03,u*.05,Math.max(2,u*.005));
  const show=s.show,rise=(1-show)*u*.015;
  // 이번 곡은 / title.
  const hy=py+u*.075;
  noteBadge(ctx,px+pp+u*.016,hy,u*.016,line);
  text(ctx,'이번 곡은',px+pp+u*.045,hy,{size:u*.024,weight:800,color:rgba(amber),baseline:'middle',spacing:.02});
  text(ctx,'NOW PLAYING',px+pw-pp,hy,{size:u*.014,weight:700,color:'rgba(255,255,255,.4)',align:'right',baseline:'middle',spacing:.2});
  const tb=panelTitle(i),ty0=hy+u*.05;
  drawBlock(ctx,tb,px+pp,ty0+rise,{color:'#fff',alpha:show});
  // Number, time and a segmented progress bar.
  const iy=portrait?ty0+u*.125:ty0+u*.215;
  text(ctx,`${pad(i+1)} / ${pad(count)}`,px+pp,iy,{size:u*.022,weight:800,color:rgba(amber),baseline:'middle',spacing:.06});
  text(ctx,`${stamp(local)} / ${stamp(duration)}`,px+pw-pp,iy,{size:u*.019,weight:600,color:'rgba(255,255,255,.66)',align:'right',baseline:'middle'});
  const segs=portrait?40:28,sy=iy+u*.03,sw=(pw-pp*2)/segs,lit=s.progress*segs;
  for(let k=0;k<segs;k++){const on=clamp(lit-k,0,1);ctx.fillStyle=on>0?rgba(mix([60,48,30],amber,on)):'rgba(255,255,255,.08)';ctx.fillRect(px+pp+k*sw,sy,sw*.72,u*.011);}
  // Next song.
  const ny=sy+u*(portrait?.05:.065);
  ctx.fillStyle='rgba(255,255,255,.1)';ctx.fillRect(px+pp,ny-u*.02,pw-pp*2,Math.max(1,u*.0012));
  text(ctx,last?'종착역':'다음 곡',px+pp,ny+u*.014,{size:u*.017,weight:700,color:rgba(mix(amber,[255,255,255],.3),.85),baseline:'middle',spacing:.06});
  if(!portrait){
   const nb=last?null:fitText(measure,tracks[i+1].title||'',{size:u*.03,minSize:u*.02,weight:700,lineHeight:1.2,maxWidth:pw-pp*2,maxHeight:u*.08,spacing:-.02,maxLines:2});
   if(nb)drawBlock(ctx,nb,px+pp,ny+u*.035,{color:'rgba(255,255,255,.82)'});else text(ctx,'마지막 곡입니다',px+pp,ny+u*.055,{size:u*.028,weight:700,color:'rgba(255,255,255,.82)',baseline:'middle'});
  }else text(ctx,last?'마지막 곡입니다':tracks[i+1].title||'',px+pp+u*.1,ny+u*.014,{size:u*.026,weight:700,color:'rgba(255,255,255,.85)',baseline:'middle',maxWidth:pw-pp*2-u*.1});
  // LED ticker at the bottom of the panel, and the measured spectrum above it.
  const lx=px+(pw-ledW)/2,ly=py+ph-pp*.8-ledH;
  ctx.save();ctx.beginPath();ctx.roundRect(lx-cell,ly-cell,ledW+cell*2,ledH+cell*2,u*.006);ctx.fillStyle='#05070c';ctx.fill();ctx.clip();
  ctx.drawImage(unlit,lx,ly);
  const tape=ticker(i),offset=Math.floor(local*26)*cell;
  for(let n=0;;n++){const x=lx+ledW-offset+n*tape.width;if(x>=lx+ledW)break;if(x+tape.width>lx)ctx.drawImage(tape,x,ly);}
  ctx.restore();
  if(s.frame){
   const top=portrait?ny+u*.045:ny+u*.15,h=ly-u*.03-top;
   if(h>u*.04)drawSpectrum(ctx,{kind:base.options.spectrum,bins:s.frame.bins,waveform:s.frame.waveform,color:base.options.color,tint:amber,alpha:.8,amp:.8,x:px+pp,y:top,width:pw-pp*2,height:h});
  }
 }
 return {draw,duration:base.total};
}

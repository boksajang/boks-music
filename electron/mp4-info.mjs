import {open} from 'node:fs/promises';

/**
 * Reads the stream facts of an MP4/MOV file from its `moov` box: container duration and, per track,
 * the codec, picture size, sample (frame) count and frame rate. Used to verify finished videos without
 * an ffprobe executable.
 */
export async function readMp4Info(file){
 const handle=await open(file,'r');
 try{
  const {size}=await handle.stat();let offset=0,moov=null;
  while(offset+8<=size){
   const head=Buffer.alloc(16);await handle.read(head,0,16,offset);
   let length=head.readUInt32BE(0),header=8;const type=head.toString('latin1',4,8);
   if(length===1){length=Number(head.readBigUInt64BE(8));header=16;}else if(length===0)length=size-offset;
   if(length<header)throw Error('MP4 구조를 읽지 못했습니다.');
   if(type==='moov'){moov=Buffer.alloc(length-header);await handle.read(moov,0,moov.length,offset+header);break;}
   offset+=length;
  }
  if(!moov)throw Error('MP4 정보(moov)를 찾지 못했습니다.');
  return parseMoov(moov);
 }finally{await handle.close();}
}

function children(buffer,start=0,end=buffer.length){
 const boxes=[];let offset=start;
 while(offset+8<=end){
  let length=buffer.readUInt32BE(offset),header=8;const type=buffer.toString('latin1',offset+4,offset+8);
  if(length===1){length=Number(buffer.readBigUInt64BE(offset+8));header=16;}else if(length===0)length=end-offset;
  if(length<header||offset+length>end)break;
  boxes.push({type,start:offset+header,end:offset+length});offset+=length;
 }
 return boxes;
}
const child=(buffer,box,type)=>children(buffer,box.start,box.end).find(b=>b.type===type);
const path=(buffer,box,...types)=>types.reduce((current,type)=>current&&child(buffer,current,type),box);
// mvhd/mdhd: version 1 uses 64-bit times and duration.
function timing(buffer,box){
 const version=buffer[box.start];
 return version===1?{timescale:buffer.readUInt32BE(box.start+20),duration:Number(buffer.readBigUInt64BE(box.start+24))}:{timescale:buffer.readUInt32BE(box.start+12),duration:buffer.readUInt32BE(box.start+16)};
}
const CODECS={avc1:'h264',avc3:'h264',hvc1:'hevc',hev1:'hevc',mp4a:'aac'};

function parseMoov(buffer){
 const root={start:0,end:buffer.length},mvhd=child(buffer,root,'mvhd');
 if(!mvhd)throw Error('MP4 정보(mvhd)를 찾지 못했습니다.');
 const movie=timing(buffer,mvhd),tracks=[];
 for(const trak of children(buffer).filter(b=>b.type==='trak')){
  const mdia=child(buffer,trak,'mdia'),mdhd=mdia&&child(buffer,mdia,'mdhd'),hdlr=mdia&&child(buffer,mdia,'hdlr'),stbl=mdia&&path(buffer,mdia,'minf','stbl');
  if(!mdhd||!hdlr||!stbl)continue;
  const handler=buffer.toString('latin1',hdlr.start+8,hdlr.start+12),type=handler==='vide'?'video':handler==='soun'?'audio':handler;
  const {timescale,duration}=timing(buffer,mdhd),stsd=child(buffer,stbl,'stsd'),stsz=child(buffer,stbl,'stsz'),stts=child(buffer,stbl,'stts');
  const entry=stsd&&buffer.readUInt32BE(stsd.start+4)>0?stsd.start+8:-1,format=entry>=0?buffer.toString('latin1',entry+4,entry+8):'';
  const track={type,format,codec:CODECS[format]||format,timescale,duration:timescale?duration/timescale:0,frames:stsz?buffer.readUInt32BE(stsz.start+8):0};
  // Visual sample entry: 8-byte box header, 6 reserved, 2 data-reference index, 16 pre-defined/reserved, then width and height.
  if(type==='video'&&entry>=0){track.width=buffer.readUInt16BE(entry+32);track.height=buffer.readUInt16BE(entry+34);}
  if(stts){
   // The most common sample delta is the nominal frame duration (ffprobe's r_frame_rate).
   let common=0,most=0;const count=buffer.readUInt32BE(stts.start+4);
   for(let n=0;n<count;n++){const at=stts.start+8+n*8,samples=buffer.readUInt32BE(at),delta=buffer.readUInt32BE(at+4);if(samples>most){most=samples;common=delta;}}
   if(common)track.frameRate=timescale/common;
  }
  if(track.duration)track.averageFrameRate=track.frames/track.duration;
  tracks.push(track);
 }
 return {duration:movie.timescale?movie.duration/movie.timescale:0,tracks};
}

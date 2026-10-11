import {open} from 'node:fs/promises';
const cache=new Map();
export async function stemWaveform(file,bins=640){
 const handle=await open(file,'r');
 try{
  const stats=await handle.stat(),key=`${file}:${stats.size}:${stats.mtimeMs}:${bins}`;
  if(cache.has(key))return cache.get(key);
  const header=Buffer.alloc(12);await handle.read(header,0,12,0);
  if(header.toString('ascii',0,4)!=='RIFF'||header.toString('ascii',8,12)!=='WAVE')throw new Error('파형을 표시할 수 없는 오디오 형식입니다. 재생은 사용할 수 있습니다.');
  let format,channels,rate,bits,align,dataStart,dataSize;
  for(let offset=12;offset+8<=stats.size;){
   const chunk=Buffer.alloc(8);await handle.read(chunk,0,8,offset);const name=chunk.toString('ascii',0,4),size=chunk.readUInt32LE(4);
   if(offset+8+size>stats.size)throw new Error('오디오 파일이 완전하지 않습니다.');
   if(name==='fmt '){if(size<16)throw new Error('오디오 헤더가 올바르지 않습니다.');const fmt=Buffer.alloc(Math.min(size,40));await handle.read(fmt,0,fmt.length,offset+8);format=fmt.readUInt16LE(0);channels=fmt.readUInt16LE(2);rate=fmt.readUInt32LE(4);align=fmt.readUInt16LE(12);bits=fmt.readUInt16LE(14);if(format===65534&&fmt.length>=40)format=fmt.readUInt16LE(24);}
   if(name==='data'){dataStart=offset+8;dataSize=size;}
   offset+=8+size+(size%2);
   if(format&&dataStart!==undefined)break;
  }
  if(!channels||!rate||!align||dataStart===undefined||!dataSize||!([1,3].includes(format))||!(format===3?[32,64]:[8,16,24,32]).includes(bits)||align!==channels*bits/8||dataSize%align)throw new Error('이 오디오의 파형 분석은 지원하지 않습니다. 재생은 사용할 수 있습니다.');
  const frames=dataSize/align,peaks=new Array(bins).fill(0),bytes=bits/8,buffer=Buffer.alloc(Math.max(align,Math.floor(262144/align)*align));
  let position=0;
  while(position<dataSize){const count=Math.min(buffer.length,dataSize-position),read=await handle.read(buffer,0,count,dataStart+position);if(read.bytesRead!==count)throw new Error('파형 분석 중 파일이 변경되었습니다.');
   for(let offset=0;offset<count;offset+=align){let peak=0;for(let channel=0;channel<channels;channel++){const i=offset+channel*bytes;const value=format===3?(bits===32?buffer.readFloatLE(i):buffer.readDoubleLE(i)):bits===8?(buffer[i]-128)/128:buffer.readIntLE(i,bytes)/2**(bits-1);if(Number.isFinite(value))peak=Math.max(peak,Math.min(1,Math.abs(value)));}const bin=Math.min(bins-1,Math.floor(((position+offset)/align)*bins/frames));peaks[bin]=Math.max(peaks[bin],peak);}
   position+=count;
  }
  const result={peaks,duration:frames/rate};if(cache.size>=32)cache.delete(cache.keys().next().value);cache.set(key,result);return result;
 }finally{await handle.close();}
}

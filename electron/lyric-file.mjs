// LRC / SRT lyric timing files. SRT is converted to LRC first, so LRC parsing is the single
// timing reader. An imported file replaces the song's lyric timing entirely: its starts become
// confirmed ('manual') line starts, and when its text differs from the song lyrics the file's
// lines become the lyrics (the timing always belongs to the lyrics it was made for).
import {lyricLines} from './lyric-lines.mjs';
import {automaticDisplayEnds} from './lyric-timing.mjs';

export const LYRIC_FILE_LIMITS=Object.freeze({maxBytes:1024*1024,maxLines:500,maxLyricsCharacters:10000});
const FORMATS={'.lrc':'LRC','.srt':'SRT'};

export function lyricFileFormat(name){
  const format=FORMATS[String(name).toLowerCase().match(/\.[^./\\]+$/)?.[0]||''];
  if(!format)throw new Error('LRC 또는 SRT 파일을 선택하세요.');
  return format;
}

// UTF-8 (with or without BOM), UTF-16 with BOM, otherwise the Korean Windows code page.
export function decodeLyricFile(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(bytes.length>LYRIC_FILE_LIMITS.maxBytes)throw new Error('가사 시간 파일은 1MB 이하만 불러올 수 있습니다.');
  if(bytes[0]===0xFF&&bytes[1]===0xFE)return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if(bytes[0]===0xFE&&bytes[1]===0xFF)return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  if(bytes[0]===0xEF&&bytes[1]===0xBB&&bytes[2]===0xBF)return new TextDecoder('utf-8').decode(bytes.subarray(3));
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder('euc-kr').decode(bytes);}
}

const fraction=digits=>digits?Number('0.'+digits):0;
const milliseconds=seconds=>Math.round(seconds*1000)/1000;
export function lrcTime(seconds){
  const total=Math.max(0,Math.round(seconds*1000)),minutes=Math.floor(total/60000),rest=total%60000;
  return `[${String(minutes).padStart(2,'0')}:${String(Math.floor(rest/1000)).padStart(2,'0')}.${String(rest%1000).padStart(3,'0')}]`;
}
const clock=seconds=>{const whole=Math.floor(seconds+.0005);return `${Math.floor(whole/60)}:${String(whole%60).padStart(2,'0')}`;};

// Text shown for an entry; nothing sung (empty, ♪, [Music]) marks the end of the previous line.
const shown=text=>lyricLines(text).map(line=>line.text).join(' ');
const sung=text=>/[\p{L}\p{N}]/u.test(shown(text));

const SRT_TIME=/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})/;
export function srtToLrc(text){
  // Cues are split at their time lines (blank separators are not required); the index number
  // right before a time line belongs to the next cue.
  const parsed=[];
  for(const raw of text.split(/\r\n|\n|\r/)){
    const line=raw.trim();
    if(line.includes('-->')){
      const m=SRT_TIME.exec(line);
      if(!m)throw new Error(`인식할 수 없는 SRT 시간 형식입니다: ${line.slice(0,40)}`);
      const previous=parsed.at(-1);if(previous&&/^\d+$/.test(previous.lines.at(-1)||''))previous.lines.pop();
      const start=Number(m[1]||0)*3600+Number(m[2])*60+Number(m[3])+fraction(m[4]),end=Number(m[5]||0)*3600+Number(m[6])*60+Number(m[7])+fraction(m[8]);
      if(!(end>start))throw new Error(`SRT ${parsed.length+1}번째 자막의 끝 시간이 시작보다 앞에 있습니다.`);
      parsed.push({start,end,lines:[]});
    }else if(line&&parsed.length)parsed.at(-1).lines.push(line);
  }
  if(!parsed.length)throw new Error('SRT 파일에서 자막 시간을 찾지 못했습니다.');
  // Formatting tags (<i>, <font …>, {\an8}) are not lyrics; a multi-line subtitle is one line;
  // a subtitle without text is skipped (it neither sings nor ends another line).
  const cues=parsed.map(cue=>({start:cue.start,end:cue.end,text:cue.lines.join(' ').replace(/<[^>]*>/g,'').replace(/\{\\[^}]*\}/g,'').replace(/\s+/g,' ').trim()})).filter(cue=>cue.text);
  if(!cues.length)throw new Error('SRT 파일에 자막 내용이 없습니다.');
  cues.sort((a,b)=>a.start-b.start);
  const out=[];
  cues.forEach((cue,index)=>{const next=cues[index+1];out.push(lrcTime(cue.start)+cue.text);if(!next||cue.end<next.start)out.push(lrcTime(cue.end));});
  return out.join('\n')+'\n';
}

const LRC_TIME=/^\[(\d{1,3}):([0-5]?\d)(?:[.:](\d{1,3}))?\]\s*/;
export function parseLrc(text){
  let offset=0;const stamps=[];
  for(const raw of text.split(/\r\n|\n|\r/)){
    const line=raw.trim();if(!line)continue;
    let rest=line;const times=[];
    for(let m=LRC_TIME.exec(rest);m;m=LRC_TIME.exec(rest)){times.push(Number(m[1])*60+Number(m[2])+fraction(m[3]));rest=rest.slice(m[0].length);}
    // A timestamp-like tag that is not [분:초(.소수 1~3자리)] is reported, never dropped silently.
    if(/^\[\d+:/.test(rest))throw new Error(`인식할 수 없는 LRC 시간 형식입니다: ${rest.slice(0,40)}`);
    if(!times.length){
      // [offset:+500]: a positive value shows lyrics sooner. Other tags (ti, ar, al…) are ignored.
      const tag=/^\[([A-Za-z#]+)\s*:(.*)\]$/.exec(line);
      if(tag?.[1].toLowerCase()==='offset'&&Number.isFinite(Number(tag[2].trim())))offset=Number(tag[2].trim());
      continue;
    }
    // A line with several timestamps is sung at each of them (a repeated chorus); word timestamps
    // of enhanced LRC are not part of the text.
    const words=rest.replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g,'').replace(/\s+/g,' ').trim();
    for(const time of times)stamps.push({time,text:words,order:stamps.length});
  }
  if(!stamps.length)throw new Error('파일에서 [분:초] 형식의 가사 시간을 찾지 못했습니다.');
  stamps.sort((a,b)=>a.time-b.time||a.order-b.order);
  const entries=[];
  for(const stamp of stamps){
    const start=milliseconds(Math.max(0,stamp.time-offset/1000)),last=entries.at(-1);
    if(!sung(stamp.text)){if(last&&last.end===null&&start>last.start)last.end=start;continue;}
    if(last&&start<=last.start)throw new Error(`${clock(start)}에 가사가 두 줄 있습니다(「${last.text}」, 「${stamp.text}」). 한 시간에는 한 줄만 둘 수 있습니다.`);
    entries.push({start,end:null,text:stamp.text});
  }
  if(!entries.length)throw new Error('파일에 시간이 지정된 가사가 없습니다.');
  if(entries.length>LYRIC_FILE_LIMITS.maxLines)throw new Error(`가사 줄은 ${LYRIC_FILE_LIMITS.maxLines}줄까지 불러올 수 있습니다.`);
  return entries;
}

export function parseLyricTimingFile({name,bytes}){
  const format=lyricFileFormat(name),text=decodeLyricFile(bytes);
  return {format,entries:parseLrc(format==='SRT'?srtToLrc(text):text)};
}

// Cues for the song from the file. Same lines as the song lyrics (letters and digits compared)
// keep the lyrics; otherwise the file's lines become the lyrics.
export function planLyricTimingImport({entries,lyrics,duration}){
  if(!Array.isArray(entries)||!entries.length)throw new Error('불러올 가사 시간이 없습니다.');
  if(!Number.isFinite(duration)||duration<=0)throw new Error('음악의 재생시간을 확인할 수 없습니다.');
  const late=entries.findIndex(entry=>entry.start>=duration);
  if(late>=0)throw new Error(`파일의 ${late+1}번째 가사 시간(${clock(entries[late].start)})이 곡 길이(${clock(duration)})를 넘습니다. 이 곡의 파일이 맞는지 확인해 주세요.`);
  const key=text=>text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const current=lyricLines(lyrics||'');
  const matches=current.length===entries.length&&current.every((line,index)=>key(line.text)===key(shown(entries[index].text)));
  const nextLyrics=matches?lyrics:entries.map(entry=>entry.text).join('\n');
  if(nextLyrics.length>LYRIC_FILE_LIMITS.maxLyricsCharacters)throw new Error('파일의 가사가 10,000자를 넘습니다.');
  const lines=lyricLines(nextLyrics);
  if(lines.length!==entries.length)throw new Error('파일의 가사 줄을 곡 가사로 옮기지 못했습니다.');
  const cues=automaticDisplayEnds(lines.map((line,index)=>({...line,start:entries[index].start,end:entries[index].end,status:'manual',startStatus:'manual',reasons:[],startReasons:[],method:'imported-file'})),duration);
  return {matches,lyrics:nextLyrics,lines,cues};
}

import {lyricLines} from './lyric-lines.mjs';
import {lyricTimingState,automaticDisplayEnds} from './lyric-timing.mjs';
import {lrcTime} from './lyric-file.mjs';

/**
 * Subtitle files from confirmed lyric timing: an LRC per song and an SRT for a whole lyric video (each
 * song's lines shifted to where the song plays in the video, for every repetition). Only timing that
 * belongs to the song's current lyrics with every line confirmed is used.
 */
function timedLines(track){
 const {state}=lyricTimingState(track);if(state!=='ready')return null;
 const lines=lyricLines(track.lyrics),duration=Number(track.lyricTiming.duration)||Number(track.duration)||0;
 return automaticDisplayEnds(track.lyricTiming.cues,duration).map((cue,index)=>({start:cue.start,end:cue.end,text:lines[index]?.text||cue.text||''})).filter(cue=>Number.isFinite(cue.start)&&Number.isFinite(cue.end)&&cue.end>cue.start&&cue.text.trim());
}
export function lyricSubtitles(track){
 const lines=timedLines(track);
 if(!lines)throw new Error('모든 가사 줄의 시작점이 확정된 곡만 LRC로 내보낼 수 있습니다.');
 return [`[ti:${String(track.title||'').replace(/[\r\n\]]/g,' ')}]`,...lines.map(line=>lrcTime(line.start)+line.text)].join('\n')+'\n';
}
const srtTime=seconds=>{const total=Math.max(0,Math.round(seconds*1000)),h=Math.floor(total/3600000),m=Math.floor(total%3600000/60000),s=Math.floor(total%60000/1000),ms=total%1000;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;};
/** `chapters`: [{start,trackId}] of the video; `tracks`: the songs by id. Songs without confirmed timing are listed in `missing`. */
export function videoSubtitles({chapters,tracks}){
 const entries=[],missing=new Set();
 for(const chapter of chapters||[]){
  const track=tracks.get(chapter.trackId);const lines=track&&timedLines(track);
  if(!lines){missing.add(track?.title||chapter.title||'곡');continue;}
  for(const line of lines)entries.push({start:chapter.start+line.start,end:chapter.start+line.end,text:line.text});
 }
 if(!entries.length)throw new Error('가사 시간이 확정된 곡이 없어 자막을 만들 수 없습니다.');
 const text=entries.map((entry,index)=>`${index+1}\n${srtTime(entry.start)} --> ${srtTime(entry.end)}\n${entry.text}\n`).join('\n');
 return {text,count:entries.length,missing:[...missing]};
}

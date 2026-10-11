import {parseFile} from 'music-metadata';
import {normalizeLyrics,validateLyricStarts} from './lyric-timing.mjs';

export async function videoPreflight(tracks,mode){
 if(!['vocal','instrumental'].includes(mode))throw Error('영상 유형을 선택하세요.');
 if(!tracks.length)throw Error('재생목록에 활성 음악이 없습니다.');
 const missingLyrics=[],missingTiming=[],needsAlignment=[],needsConfirmation=[],prepared=[];
 for(const track of tracks){
  const duration=(await parseFile(track.audioPath,{duration:true})).format.duration;
  if(!Number.isFinite(duration)||duration<=0)throw Error(`${track.title}: 음악 길이를 읽지 못했습니다.`);
  let cues=[];
  if(mode==='vocal'){
   const normalized=normalizeLyrics(track.lyrics||''),timing=track.lyricTiming;
   if(!normalized.lines.length)missingLyrics.push(track.id);
   else try{
    if(!timing||timing.lyricsHash!==normalized.lyricsHash||!Number.isFinite(timing.duration)||Math.abs(timing.duration-duration)>.1)throw Error('새 분석 필요');
    if(timing.automation?.version!==2&&!timing.cues?.every(cue=>cue.status==='manual'))throw Error('새 분석 필요');
    // Saved timing for these lyrics and this audio is never re-analysed (no vocal separation):
    // remaining review lines go straight to confirmation, whatever policy produced them.
    if(timing.cues?.some(cue=>!['manual','automatic'].includes(cue.status))){if(timing.automation?.timingMode!=='line-starts')throw Error('시작점 기준으로 새 분석 필요');needsConfirmation.push(track.id);missingTiming.push(track.id);prepared.push({id:track.id,title:track.title,audioPath:track.audioPath,artPath:track.artPath,duration,cues:[]});continue;}
    cues=validateLyricStarts({lines:normalized.lines,cues:timing.cues,duration});
   }catch{missingTiming.push(track.id);needsAlignment.push(track.id);}
  }
  prepared.push({id:track.id,title:track.title,audioPath:track.audioPath,artPath:track.artPath,duration,cues});
 }
 return {ready:!missingLyrics.length,renderReady:!missingLyrics.length&&!missingTiming.length,missingLyrics,missingTiming,needsAlignment,needsConfirmation,duration:prepared.reduce((sum,track)=>sum+track.duration,0),tracks:prepared};
}

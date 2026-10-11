import {lyricLines} from './lyric-lines.mjs';
import {createHash} from 'node:crypto';

export const START_DISAGREEMENT_SECONDS = 0.5;
export const END_DISAGREEMENT_SECONDS = 0.8;
// Recorded with each analysis. Saved timing is not re-analysed for a video (2026-10-11 user
// decision: songs with lyric timing skip analysis and vocal separation); the editor can re-run it.
export const ONSET_POLICY = 'hybrid-lyrics-first-asr-v3';
// Saved starts belong to the same audio only when its length differs by at most this much.
export const DURATION_TOLERANCE_SECONDS = 0.1;
export function sameTimingSource(previous,lyricsHash,duration){
  return previous?.lyricsHash===lyricsHash&&Number.isFinite(previous.duration)&&Math.abs(previous.duration-duration)<=DURATION_TOLERANCE_SECONDS;
}

export function preserveManualStarts(timing,previous){
  if(!sameTimingSource(previous,timing.lyricsHash,timing.duration))return timing;
  const cues=timing.cues.map(cue=>{
    const saved=previous.cues?.find(row=>row.lineId===cue.lineId&&row.status==='manual');
    return saved&&Number.isFinite(saved.start)&&saved.start>=0&&saved.start<timing.duration?{...cue,start:saved.start,status:'manual',startStatus:'manual',reasons:[],startReasons:[]}:cue;
  });
  for(let index=1;index<cues.length;index++)if(Number.isFinite(cues[index-1].start)&&Number.isFinite(cues[index].start)&&cues[index].start<=cues[index-1].start){
    for(const cue of [cues[index-1],cues[index]])if(cue.status!=='manual'){cue.status='review';cue.reasons=[...(cue.reasons||[]),'start-order'];}
  }
  return {...timing,cues:automaticDisplayEnds(cues,timing.duration),automation:{...timing.automation,needsConfirmation:cues.filter(cue=>!['automatic','manual'].includes(cue.status)).map(cue=>cue.lineId)}};
}

// Lyric timing badge: 'ready' when every line of the current lyrics has a confirmed start,
// 'review' when saved timing for these lyrics still has lines to confirm, otherwise null (none or stale).
export function lyricTimingState(track) {
  const timing = track?.lyricTiming, lyrics = track?.lyrics || '';
  if (track?.kind === 'stem' || !timing?.cues?.length || typeof lyrics !== 'string' || timing.lyricsHash !== hashLyrics(lyrics)) return {state: null, review: 0};
  const lines = lyricLines(lyrics);
  if (timing.cues.length !== lines.length) return {state: null, review: 0};
  const review = timing.cues.filter(cue => !['manual', 'automatic'].includes(cue.status) || !Number.isFinite(cue.start)).length;
  return {state: review ? 'review' : 'ready', review};
}

export function hashLyrics(lyrics) {
  if (typeof lyrics !== 'string') throw new TypeError('가사는 문자열이어야 합니다.');
  return createHash('sha256').update(lyrics, 'utf8').digest('hex');
}

export function normalizeLyrics(lyrics) {
  const lyricsHash = hashLyrics(lyrics);
  const lines = lyricLines(lyrics);
  return {originalLyrics: lyrics, lyricsHash, lines};
}

function checkLines(lines) {
  if (!Array.isArray(lines) || !lines.length || lines.some(line => !line || typeof line.lineId !== 'string' || !line.lineId || typeof line.text !== 'string' || !line.text.trim()) || new Set(lines.map(line => line.lineId)).size !== lines.length) throw new Error('정렬할 가사 행이 올바르지 않습니다.');
}
function checkDuration(duration) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('곡 길이가 올바르지 않습니다.');
}
function validTime(row, duration) {
  return row && Number.isFinite(row.start) && Number.isFinite(row.end) && row.start >= 0 && row.end > row.start && row.end <= duration;
}
function modelRows(rows, lines, duration) {
  if (!Array.isArray(rows)) throw new Error('모델 정렬 결과가 배열이 아닙니다.');
  const result = new Map(), problems = new Map();
  const ids = new Set(lines.map(line => line.lineId));
  let unknown = false;
  for (const row of rows) {
    if (!row || !ids.has(row.lineId)) { unknown = true; continue; }
    if (result.has(row.lineId)) problems.set(row.lineId, ['duplicate-line']);
    else result.set(row.lineId, row);
  }
  let previous;
  for (const line of lines) {
    const row = result.get(line.lineId);
    if (!row) continue;
    const reasons = problems.get(line.lineId) || [];
    if (Array.isArray(row.flags) && row.flags.length) reasons.push(...row.flags.map(flag => String(flag)));
    if (!validTime(row, duration)) reasons.push('invalid-time');
    else {
      if (previous && row.start < previous.end) {
        reasons.push('overlap-or-order');
        problems.set(previous.lineId, [...(problems.get(previous.lineId) || []), 'overlap-or-order']);
      }
      previous = row;
    }
    if (unknown) reasons.push('unknown-line');
    problems.set(line.lineId, reasons);
  }
  return {result, problems};
}

export function reconcileLyricTiming({lines, primary = [], secondary = [], duration, startThreshold = START_DISAGREEMENT_SECONDS, endThreshold = END_DISAGREEMENT_SECONDS}) {
  checkLines(lines); checkDuration(duration);
  if (![startThreshold, endThreshold].every(value => Number.isFinite(value) && value >= 0)) throw new Error('비교 허용 오차가 올바르지 않습니다.');
  const a = modelRows(primary, lines, duration), b = modelRows(secondary, lines, duration);
  const cues = lines.map(line => {
    const first = a.result.get(line.lineId), second = b.result.get(line.lineId);
    const reasons = [...(a.problems.get(line.lineId) || []).map(reason => `primary:${reason}`), ...(b.problems.get(line.lineId) || []).map(reason => `secondary:${reason}`)];
    const validFirst = validTime(first, duration), validSecond = validTime(second, duration);
    const chosen = validFirst ? first : validSecond ? second : null;
    const deltas = validFirst && validSecond ? {start: Math.abs(first.start - second.start), end: Math.abs(first.end - second.end)} : null;
    if (!first) reasons.push('missing-primary');
    if (!second) reasons.push('missing-secondary');
    if (deltas && (deltas.start > startThreshold || deltas.end > endThreshold)) reasons.push('model-disagreement');
    return {...line, start: chosen?.start ?? null, end: chosen?.end ?? null, primary: first ? {...first} : null, secondary: second ? {...second} : null, deltas, status: !chosen ? 'unmatched' : reasons.length ? 'review' : 'agreed', reasons};
  });
  let previous;
  for (const cue of cues) {
    if (cue.start === null) continue;
    if (previous && cue.start < previous.end) for (const affected of [previous, cue]) {
      affected.status = 'review'; affected.reasons.push('selected-overlap-or-order');
    }
    previous = cue;
  }
  return cues;
}

export function validateManualLyricTiming({lines, cues, duration}) {
  checkLines(lines); checkDuration(duration);
  if (!Array.isArray(cues) || cues.length !== lines.length) throw new Error('모든 가사 행의 시간을 입력하세요.');
  let previousEnd = 0;
  return lines.map((line, index) => {
    const cue = cues[index];
    if (!cue || cue.lineId !== line.lineId) throw new Error('가사 행의 ID 또는 순서가 일치하지 않습니다.');
    if (!validTime(cue, duration)) throw new Error(`${index + 1}행의 시작·종료 시간이 곡 길이 안에 있어야 합니다.`);
    if (cue.start < previousEnd) throw new Error(`${index + 1}행의 시간이 앞 행과 겹칩니다.`);
    previousEnd = cue.end;
    return {...cue, lineId: line.lineId, text: line.text, start: cue.start, end: cue.end};
  });
}

// End is an internal display boundary, never a required user edit.
export function automaticDisplayEnds(cues,duration){
  return cues.map((cue,index)=>{
    if(!Number.isFinite(cue.start)||cue.start<0||cue.start>=duration)return {...cue,end:null};
    const next=cues[index+1]?.start;
    const limit=Number.isFinite(next)&&next>cue.start?Math.min(next,duration):duration;
    const end=Number.isFinite(cue.end)&&cue.end>cue.start?Math.min(cue.end,limit):limit;
    return {...cue,end};
  });
}
export function validateLyricStarts({lines,cues,duration,previousCues}){
  checkLines(lines);checkDuration(duration);
  if(!Array.isArray(cues)||cues.length!==lines.length)throw new Error('모든 가사 줄의 시작점을 확인하세요.');
  let previousStart=-1;
  const canonical=lines.map((line,index)=>{
    const cue=cues[index];
    if(!cue||cue.lineId!==line.lineId)throw new Error('가사 줄의 순서가 일치하지 않습니다.');
    if(!Number.isFinite(cue.start)||cue.start<0||cue.start>=duration)throw new Error(`${index+1}행의 시작점을 곡 안에서 맞춰 주세요.`);
    if(cue.start<=previousStart)throw new Error(`${index+1}행의 시작점은 앞 가사보다 뒤에 있어야 합니다.`);
    previousStart=cue.start;
    return {...cue,...line,...(previousCues?{end:previousCues.find(row=>row.lineId===line.lineId)?.end}:{})};
  });
  return automaticDisplayEnds(canonical,duration);
}

export function finalizeAutomaticTiming({lines,result,duration}){
  checkLines(lines);checkDuration(duration);
  if(result?.automation?.version!==2||!Array.isArray(result.resolved)||result.resolved.length!==lines.length)throw new Error('자동 동기화 결과가 완전하지 않습니다.');
  const diagnostic=reconcileLyricTiming({lines,primary:result.primary,secondary:result.secondary,duration});
  const cues=lines.map((line,index)=>{
    const candidate=result.resolved[index];
    const row=candidate&&{...candidate,end:Number.isFinite(candidate.end)&&candidate.end>duration&&candidate.end-duration<=.002?duration:candidate.end};
    if(row?.lineId!==line.lineId||!['automatic','review','unmatched'].includes(row.status))throw new Error('자동 동기화 가사 순서가 올바르지 않습니다.');
    const status=row.startStatus||row.status;
    if(!['automatic','review','unmatched'].includes(status))throw new Error('가사 시작점 분석 상태가 올바르지 않습니다.');
    const valid=Number.isFinite(row.start)&&row.start>=0&&row.start<duration;
    if(status==='automatic'&&(!valid||!row.method||!row.evidence||typeof row.evidence!=='object'))throw new Error('자동 동기화 근거 또는 시작점이 올바르지 않습니다.');
    return {...diagnostic[index],...row,...line,start:valid?row.start:null,status:valid?status:'unmatched',rangeStatus:row.status,diagnosticReasons:diagnostic[index].reasons,reasons:row.startReasons||row.reasons||[]};
  });
  let previous;
  for(const cue of cues){
    if(cue.start===null)continue;
    if(previous&&cue.start<=previous.start)for(const row of [previous,cue]){row.status='review';row.reasons=[...row.reasons,'start-order'];}
    previous=cue;
  }
  return automaticDisplayEnds(cues,duration);
}

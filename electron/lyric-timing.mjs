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
/**
 * Lyric timing after the lyrics are edited, instead of dropping it: lines whose text is unchanged keep their
 * starts and statuses (matched in order by longest common subsequence); where the same number of lines sits
 * between two kept lines on both sides, those lines are edits of each other and keep their start, as a line to
 * check again (editedStatus 'review') or as they were ('keep', a line corrected in the timing editor); other new
 * lines have no start yet; removed lines go. Returns counts for the notice, and timing undefined when nothing of
 * the old timing is left.
 */
export function remapLyricTiming(timing, lyrics, {editedStatus = 'review'} = {}) {
  const old = timing?.cues || [], lines = lyricLines(lyrics);
  if (!old.length) return {timing: undefined, kept: 0, changed: 0, added: lines.length, removed: 0};
  const key = text => String(text || '').replace(/\s+/g, '');
  const n = old.length, m = lines.length, table = Array.from({length: n + 1}, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i][j] = key(old[i].text) === key(lines[j].text) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const pairs = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (key(old[i].text) === key(lines[j].text)) { pairs.push([i, j]); i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) i++; else j++;
  }
  const from = new Array(m).fill(-1), edited = new Set();
  for (const [i, j] of pairs) from[j] = i;
  const anchors = [[-1, -1], ...pairs, [n, m]];
  // Between two kept lines: the same number of lines on both sides are edits of each other in order; otherwise
  // a new line takes the start of the old line it resembles most (in order), like a line edited and another added.
  const grams = text => { const value = key(text); return value.length < 2 ? [value] : Array.from({length: value.length - 1}, (_, k) => value.slice(k, k + 2)); };
  const alike = (a, b) => { const p = key(a), q = key(b); if (Math.min(p.length, q.length) >= 2 && (p.includes(q) || q.includes(p))) return .9; const x = grams(a), y = grams(b), pool = [...y]; let shared = 0; for (const gram of x) { const at = pool.indexOf(gram); if (at >= 0) { shared++; pool.splice(at, 1); } } return 2 * shared / (x.length + y.length); };
  for (let k = 0; k + 1 < anchors.length; k++) {
    const [i0, j0] = anchors[k], [i1, j1] = anchors[k + 1];
    if (i1 - i0 === j1 - j0) { for (let d = 1; i0 + d < i1; d++) { from[j0 + d] = i0 + d; edited.add(j0 + d); } continue; }
    for (let i = i0 + 1, j = j0 + 1; i < i1 && j < j1;) {
      let best = -1, score = .5;
      for (let c = j; c < j1; c++) { const value = alike(old[i].text, lines[c].text); if (value > score) { score = value; best = c; } }
      if (best < 0) { i++; continue; }
      from[best] = i; edited.add(best); i++; j = best + 1;
    }
  }
  let kept = 0, changed = 0, added = 0;
  const cues = lines.map((line, j) => {
    const i = from[j];
    if (i < 0) { added++; return {lineId: line.lineId, text: line.text, start: null, end: null, status: 'unmatched', reasons: ['lyrics_changed']}; }
    const cue = old[i];
    if (!edited.has(j)) { kept++; return {...cue, lineId: line.lineId, text: line.text}; }
    changed++;
    if (editedStatus === 'keep') return {...cue, lineId: line.lineId, text: line.text};
    return {...cue, lineId: line.lineId, text: line.text, status: Number.isFinite(cue.start) ? 'review' : 'unmatched', reasons: ['lyrics_changed']};
  });
  const removed = n - kept - changed;
  if (!kept && !changed) return {timing: undefined, kept, changed, added, removed};
  return {timing: {...timing, lyricsHash: hashLyrics(lyrics), cues: automaticDisplayEnds(cues, timing.duration), automation: {...timing.automation, needsConfirmation: cues.filter(cue => !['automatic', 'manual'].includes(cue.status)).map(cue => cue.lineId)}}, kept, changed, added, removed};
}

/**
 * Saves confirmations made so far without finishing the review: lines still to check keep their status, so
 * leaving the editor never loses confirmed starts. A confirmed (manual) start must lie inside the song and
 * between the starts of the lines around it; an 'automatic' line keeps that status only with its analysed start.
 */
export function mergeLyricProgress({lines,cues,duration,previousCues=[]}){
  checkLines(lines);checkDuration(duration);
  if(!Array.isArray(cues)||cues.length!==lines.length)throw new Error('모든 가사 줄의 시작점을 확인하세요.');
  const rows=lines.map((line,index)=>{
    const cue=cues[index];
    if(!cue||cue.lineId!==line.lineId)throw new Error('가사 줄의 순서가 일치하지 않습니다.');
    if(!['manual','automatic','review','unmatched'].includes(cue.status))throw new Error(`${index+1}행의 상태가 올바르지 않습니다.`);
    const start=cue.start===null||cue.start===undefined?null:Number(cue.start);
    if(start!==null&&(!Number.isFinite(start)||start<0||start>=duration))throw new Error(`${index+1}행의 시작점을 곡 안에서 맞춰 주세요.`);
    const before=previousCues.find(row=>row.lineId===line.lineId);
    const status=cue.status==='automatic'&&!(before?.status==='automatic'&&before.start===start)?'manual':cue.status;
    return {...before,...line,start,status:start===null&&status==='manual'?'review':status};
  });
  rows.forEach((row,index)=>{
    if(row.status!=='manual')return;
    const previous=rows.slice(0,index).reverse().find(item=>Number.isFinite(item.start)),next=rows.slice(index+1).find(item=>Number.isFinite(item.start));
    if((previous&&row.start<=previous.start)||(next&&row.start>=next.start))throw new Error(`${index+1}행의 시작점은 앞뒤 가사의 시작점 사이에 있어야 합니다.`);
    row.reasons=[];
  });
  return {cues:automaticDisplayEnds(rows,duration),needsConfirmation:rows.filter(row=>!['automatic','manual'].includes(row.status)).map(row=>row.lineId)};
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

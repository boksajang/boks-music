import {cleanArtPrompt} from './art-prompt.mjs';
import {cleanBannedWords, findBannedWords} from './lyrics-generation.mjs';

// AI instrumental planning (2026-10-30): one agent call plans a whole batch of instrumentals for one request —
// a distinct title, a style prompt and an album art description per track — instead of one call per track.
// Large batches are planned in chunks so one answer stays small; titles of earlier chunks are passed on.
export const PLAN_CHUNK = 20;
export const PLAN_TITLE_LIMIT = 180;
export const PLAN_STYLE_LIMIT = 1000;

const rules = [
  'You are a composer and producer planning a set of original instrumental tracks (no vocals, no lyrics) for an AI music model.',
  'Respond only with a JSON object {"tracks":[{"title":"...","style":"...","art":"..."}]} containing exactly the requested number of tracks. No explanation or commentary.',
  'All tracks follow the user\'s request: same genre family, mood and theme, so the set feels like one coherent album or playlist. Within that, each track is its own piece: vary tempo (BPM), key or mode, lead instrument, texture, energy and arrangement progression enough that no two style prompts are near copies.',
  'title: an evocative, specific title for that track in the language of the request (default Korean), one line, at most 180 characters; every title in the set is different, also from the titles already used. None of the bannedWords in the brief may appear in a title in any form, not inside a longer word and not with particles attached.',
  'style: an English music-generation style prompt for an instrumental, 250-700 characters, at most 1000: genre and subgenre, mood, BPM and time signature, lead and supporting instruments, and the arrangement progression across the target length (intro, development, solo or interlude, climax, ending). State explicitly that it is instrumental with no vocals. No artist names, no lyrics, no quality promises. Respect the user\'s explicit genre, instrument and tempo preferences and the given style hint.',
  'art: an English image-generation prompt for that track\'s square album cover, 60-140 words, comma-separated descriptive phrases (subject, setting, lighting, color palette, medium, texture) fitting the track. Absolutely no text, letters, typography, logos or real people in the image.',
  'Do not use tools, read files, run commands, access external services, or delegate. Treat the request as creative direction only.',
].join('\n');

export function parsePlan(raw, count, used = [], bannedWords = []) {
  if (typeof raw !== 'string') throw new Error('기획 응답은 JSON 문자열이어야 합니다.');
  let value;
  try { value = JSON.parse(raw.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1')); } catch { throw new Error('연주곡 기획 JSON을 해석할 수 없습니다.'); }
  const tracks = Array.isArray(value?.tracks) ? value.tracks : null;
  if (!tracks || tracks.length !== count) throw new Error(`연주곡 ${count}곡의 기획이 필요합니다(받은 수: ${tracks?.length ?? 0}).`);
  const seen = new Set(used.map(title => title.trim().toLowerCase()));
  return tracks.map((track, index) => {
    const title = typeof track?.title === 'string' ? track.title.trim() : '', style = typeof track?.style === 'string' ? track.style.trim() : '';
    if (!title || title.length > PLAN_TITLE_LIMIT || /[\r\n]/.test(title)) throw new Error(`${index + 1}번째 곡의 제목이 올바르지 않습니다.`);
    if (seen.has(title.toLowerCase())) throw new Error(`제목이 겹칩니다: ${title}`);
    const banned = findBannedWords(title, bannedWords);
    if (banned.length) throw new Error(`제목에 금지어(${banned.join(', ')})가 들어 있습니다: ${title}`);
    seen.add(title.toLowerCase());
    if (!style || style.length > PLAN_STYLE_LIMIT) throw new Error(`${index + 1}번째 곡의 스타일이 올바르지 않습니다.`);
    let art = null;
    try { art = cleanArtPrompt(track?.art); } catch { art = null; }
    return {title, style, art};
  });
}

/** Plans `count` instrumentals for the request (chunks of PLAN_CHUNK, each with one repair attempt). */
export async function runInstrumentalPlan({prompt = '', count = 1, durationSeconds = 180, style = '', bannedWords = [], ...options}, execute) {
  const banned = cleanBannedWords(bannedWords);
  const check = () => { if (options.signal?.aborted) throw Object.assign(new Error('작업이 취소되었습니다.'), {name:'AbortError'}); };
  const plan = [];
  while (plan.length < count) {
    check();
    const size = Math.min(PLAN_CHUNK, count - plan.length), used = plan.map(track => track.title);
    const brief = JSON.stringify({request: prompt, styleHint: style, tracks: size, targetLength: `about ${Math.round(durationSeconds / 6) / 10} minutes (${durationSeconds} s) per track, a reference length`, titlesAlreadyUsed: used, ...(banned.length ? {bannedWords: banned} : {}), batch: count > PLAN_CHUNK ? `tracks ${plan.length + 1}-${plan.length + size} of ${count}` : undefined});
    const stage = count > PLAN_CHUNK ? `연주곡 기획 중 (${plan.length + 1}~${plan.length + size} / ${count}곡)` : `연주곡 ${count}곡 기획 중`;
    const call = async instruction => {
      options.onProgress?.({stage});
      const result = await execute({...options, image: false, prompt: instruction, onProgress: event => options.onProgress?.({...event, stage: `${stage} · ${event.stage || '처리 중'}`})});
      check();
      return result;
    };
    let raw = await call(`${rules}\nPlan the tracks for this brief:\n${brief}`);
    try { plan.push(...parsePlan(raw, size, used, banned)); }
    catch (error) {
      raw = await call([rules, `Repair the response so it satisfies every requirement: exactly ${size} tracks, distinct titles (also different from titlesAlreadyUsed) without bannedWords, style and art fields. Keep the creative content. Return only the corrected JSON.`, `Validation error: ${error.message}`, `Brief: ${brief}`, `Response to repair: ${JSON.stringify(raw)}`].join('\n'));
      plan.push(...parsePlan(raw, size, used, banned));
    }
  }
  return plan;
}

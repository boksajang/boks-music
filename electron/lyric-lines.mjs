// Shared text-only normalization; original lyrics are never modified.
// [Section] labels are removed entirely. (Parenthesized) words are sung lyrics: only the
// parentheses are dropped, e.g. "(오~~오~~~)" → "오~~오~~~". Line positions stay unchanged.
export function lyricLines(lyrics) {
  if (typeof lyrics !== 'string') throw new TypeError('가사는 문자열이어야 합니다.');
  const stack = [], spans = [];
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i] === '[') stack.push(i);
    else if (lyrics[i] === ']' && stack.length) spans.push([stack.pop(), i]);
  }
  // Keep newlines inside removed labels so neighboring sung lines stay distinct.
  const removed = new Uint8Array(lyrics.length);
  for (const [start, end] of spans) removed.fill(1, start, end + 1);
  let text = '';
  for (let i = 0; i < lyrics.length; i++) text += removed[i] && !/[\r\n]/.test(lyrics[i]) ? ' ' : /[()（）]/.test(lyrics[i]) ? ' ' : lyrics[i];
  const lines = text.split(/\r\n|\n|\r/).map(line => line.replace(/[^\S\r\n]+/g, ' ').trim()).filter(Boolean)
    .map((text, index) => ({lineId: `line-${index + 1}`, text}));
  return lines;
}

// User-selected app character limits, not official YuE2 model limits.
// UTF-16 lengths match HTML textarea maxLength and the existing character counter.
// 4,000 (2026-10-30, was 2,000): long songs and rap need more words; the model context (24,576 tokens) still fits.
export const YUE2_LYRICS_MAX_LENGTH = 4000;
export const YUE2_STYLE_MAX_LENGTH = 1000;
export function inspectYue2Input(style, lyrics = '', instrumental = false) {
  const styleLength = typeof style === 'string' ? style.length : 0;
  const lyricsLength = typeof lyrics === 'string' ? lyrics.length : 0;
  const errors = [];
  if (styleLength > YUE2_STYLE_MAX_LENGTH) errors.push('스타일은 1,000자까지 입력할 수 있습니다.');
  if (!instrumental && lyricsLength > YUE2_LYRICS_MAX_LENGTH) errors.push(`가사는 ${YUE2_LYRICS_MAX_LENGTH.toLocaleString('ko-KR')}자까지 입력할 수 있습니다.`);
  return {styleLength,lyricsLength,styleLimit:YUE2_STYLE_MAX_LENGTH,lyricsLimit:YUE2_LYRICS_MAX_LENGTH,valid:errors.length===0,message:errors.join(' ')};
}
export function assertYue2Input(style, lyrics = '', instrumental = false) {
  const result = inspectYue2Input(style, lyrics, instrumental);
  if (!result.valid) throw new Error(result.message);
}

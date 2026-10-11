import {assertYue2Input} from './yue2-input.mjs';

export const INSTRUMENTAL_DURATIONS = Object.freeze([120,180,240,300]);
export function validateInstrumentalDuration(value = 180) {
  if(!INSTRUMENTAL_DURATIONS.includes(value))throw new Error('경음악 목표 길이는 2분, 3분, 4분, 5분 중에서 선택하세요.');
  return value;
}
export const isNewInstrumental = request => request?.instrumental === true && request.operation === 'generate';

// This is a compositional request, not a guarantee of exact output duration.
// Keep the user's style intact; only the original user input has the UI limit.
export function newInstrumentalRequest(request, {lora = false} = {}) {
  if(!isNewInstrumental(request))return null;
  const seconds=validateInstrumentalDuration(request.instrumentalDuration);
  const style=request.style ?? '';
  if(typeof style!=='string')throw new Error('스타일을 확인하세요.');
  assertYue2Input(style,'',true);
  const minutes={120:'two',180:'three',240:'four',300:'five'}[seconds];
  const brief=`Instrumental music only; no singing, speech, humming, choir or vocal samples. Complete approximately ${minutes}-minute composition with a developed main theme, contrasting middle section, varied reprise and a natural ending.`;
  const format = value => Math.floor(value/60)+':'+String(value%60).padStart(2,'0');
  const boundaries=[0,.08,.25,.43,.65,.9,1].map(ratio=>Math.round(seconds*ratio));
  const structure=['intro','verse','chorus','bridge','chorus','outro'].map((tag,index)=>`[${tag} ${format(boundaries[index])}-${format(boundaries[index+1])}]`).join('\n');
  return {style:style?`${style}\n\n${brief}`:brief,lyrics:lora?structure:'',cot:lora?'full':'off'};
}

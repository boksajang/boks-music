import {getVideoTemplate} from './video-template-registry.mjs';
import {SPECTRUM_STYLES} from './video-spectrum.mjs';

export function validateVideoOptions(input={}){
 if(input.codec!==undefined&&input.codec!=='h264')throw Error('현재 영상 코덱은 H.264를 지원합니다.');
 // 시네마 플로우 · GPU merged into 시네마 플로우 when every built-in template became a GPU scene.
 const legacy={'cinematic-gpu':'cinematic'};
 const options={aspect:input.aspect??'16:9',resolution:input.resolution??1080,fps:input.fps??30,format:input.format??'mp4',template:legacy[input.template]??input.template??'albumblur',spectrum:input.spectrum??'bars',color:input.color??'mono',mode:input.mode??'instrumental',repeat:input.repeat??1};
 const template=getVideoTemplate(options.template);
 // Scene text: the editable top-left brand line and the playlist video title (control characters removed).
 const line=(value,label,max)=>{if(value===undefined)return undefined;if(typeof value!=='string')throw Error(label+' 형식이 올바르지 않습니다.');const clean=value.replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();if(clean.length>max)throw Error(`${label}은(는) ${max}자 이내로 입력하세요.`);return clean;};
 const brand=line(input.brand,'왼쪽 위 문구',40),playlistTitle=line(input.playlistTitle,'영상 이름',180);
 if(brand!==undefined)options.brand=brand;if(playlistTitle!==undefined)options.playlistTitle=playlistTitle;
 if(!(template.modes||['vocal','instrumental']).includes(options.mode))throw Error(`${template.name} 템플릿은 ${options.mode==='vocal'?'가사 영상':'경음악 영상'}에 사용할 수 없습니다.`);
 if(!template.aspects.includes(options.aspect)||!template.spectra.includes(options.spectrum)||![480,720,1080,1440,2160,4320].includes(options.resolution)||![24,25,30,50,60].includes(options.fps)||!['mp4','mov'].includes(options.format)||!SPECTRUM_STYLES.some(s=>s.id===options.spectrum)||!['mono','gradient','rainbow'].includes(options.color)||!['vocal','instrumental'].includes(options.mode)||!Number.isInteger(options.repeat)||options.repeat<1||options.repeat>20)throw Error('지원하지 않는 비디오 설정입니다.');
 if(template.maxResolution&&options.resolution>template.maxResolution)throw Error(`이 템플릿은 최대 ${template.maxResolution}p까지 지원합니다.`);
 const short=options.resolution,long=Math.round(short*16/9/2)*2;
 return {...options,width:options.aspect==='16:9'?long:short,height:options.aspect==='16:9'?short:long};
}
export {analyzeAudioFrame} from './audio-frame.mjs';
export {renderPlaylistVideo,probeVideoEncoder} from './hyperframes-render.mjs';

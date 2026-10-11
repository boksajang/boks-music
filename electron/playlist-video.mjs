import {getVideoTemplate} from './video-template-registry.mjs';
import {SPECTRUM_STYLES} from './video-spectrum.mjs';

export function validateVideoOptions(input={}){
 if(input.codec!==undefined&&input.codec!=='h264')throw Error('현재 영상 코덱은 H.264를 지원합니다.');
 const options={aspect:input.aspect??'16:9',resolution:input.resolution??1080,fps:input.fps??30,format:input.format??'mp4',template:input.template??'albumblur',spectrum:input.spectrum??'bars',color:input.color??'mono',mode:input.mode??'instrumental',repeat:input.repeat??1};
 const template=getVideoTemplate(options.template);
 if(!template.aspects.includes(options.aspect)||!template.spectra.includes(options.spectrum)||![480,720,1080,1440,2160,4320].includes(options.resolution)||![24,25,30,50,60].includes(options.fps)||!['mp4','mov'].includes(options.format)||!SPECTRUM_STYLES.some(s=>s.id===options.spectrum)||!['mono','gradient','rainbow'].includes(options.color)||!['vocal','instrumental'].includes(options.mode)||!Number.isInteger(options.repeat)||options.repeat<1||options.repeat>20)throw Error('지원하지 않는 비디오 설정입니다.');
 if(template.maxResolution&&options.resolution>template.maxResolution)throw Error(`이 템플릿은 최대 ${template.maxResolution}p까지 지원합니다.`);
 const short=options.resolution,long=Math.round(short*16/9/2)*2;
 return {...options,width:options.aspect==='16:9'?long:short,height:options.aspect==='16:9'?short:long};
}
// Radix-2 FFT over actual decoded samples; no generated pseudo-spectrum.
export function analyzeAudioFrame(samples,time,sampleRate=12000){
 const n=1024,re=new Float64Array(n),im=new Float64Array(n),start=Math.floor(time*sampleRate)-n/2,waveform=[];
 for(let i=0;i<n;i++){const sample=samples[start+i]||0;re[i]=sample*(.5-.5*Math.cos(2*Math.PI*i/(n-1)));if(i%8===0)waveform.push(sample);}
 for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
 for(let len=2;len<=n;len<<=1){const angle=-2*Math.PI/len;for(let i=0;i<n;i+=len)for(let j=0;j<len/2;j++){const cos=Math.cos(angle*j),sin=Math.sin(angle*j),a=i+j,b=a+len/2,tr=re[b]*cos-im[b]*sin,ti=re[b]*sin+im[b]*cos;re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;}}
 const bins=[];for(let b=0;b<64;b++){const lo=Math.max(1,Math.floor(2**(b/64*9))),hi=Math.min(n/2,Math.max(lo+1,Math.floor(2**((b+1)/64*9))));let power=0;for(let k=lo;k<hi;k++)power=Math.max(power,Math.hypot(re[k],im[k])/(n*.25));bins.push(Math.max(0,Math.min(1,(20*Math.log10(Math.max(power,1e-5))+65)/65)));}
 return {bins,waveform};
}
export {renderPlaylistVideo,probeVideoEncoder} from './hyperframes-render.mjs';

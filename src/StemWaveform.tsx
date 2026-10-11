import {useEffect,useMemo,useRef,useState} from 'react';
type Waveform={peaks:number[];duration:number};
const time=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
export function StemWaveform({id,label,audioUrl,audioLabel}:{id:string;label:string;audioUrl:string;audioLabel:string}){
 const audio=useRef<HTMLAudioElement>(null),pendingSeek=useRef<number|null>(null);
 const [wave,setWave]=useState<Waveform|null>(null),[error,setError]=useState(''),[position,setPosition]=useState(0);
 useEffect(()=>{let active=true;setWave(null);setError('');setPosition(0);pendingSeek.current=null;if(!window.boks){setError('앱에서 파형을 확인할 수 있습니다.');return;}window.boks.invoke('stemWaveform',{id}).then((result:Waveform)=>{if(active)setWave(result);}).catch((failure:Error)=>{if(active)setError(failure.message||'파형을 불러오지 못했습니다.');});return()=>{active=false;};},[id]);
 useEffect(()=>{
  const player=audio.current;if(!player)return;let frame=0;
  const sync=()=>setPosition(Number.isFinite(player.currentTime)?player.currentTime:0);
  const tick=()=>{sync();if(!player.paused&&!player.ended)frame=requestAnimationFrame(tick);};
  const start=()=>{cancelAnimationFrame(frame);tick();};
  const stop=()=>{cancelAnimationFrame(frame);sync();};
  const loaded=()=>{if(pendingSeek.current!==null&&Number.isFinite(player.duration)){player.currentTime=Math.min(player.duration,pendingSeek.current);pendingSeek.current=null;}sync();};
  player.addEventListener('play',start);player.addEventListener('pause',stop);player.addEventListener('ended',stop);player.addEventListener('timeupdate',sync);player.addEventListener('seeked',sync);player.addEventListener('loadedmetadata',loaded);
  return()=>{cancelAnimationFrame(frame);player.removeEventListener('play',start);player.removeEventListener('pause',stop);player.removeEventListener('ended',stop);player.removeEventListener('timeupdate',sync);player.removeEventListener('seeked',sync);player.removeEventListener('loadedmetadata',loaded);};
 },[id,audioUrl]);
 const path=useMemo(()=>wave?.peaks.map((peak,index)=>{const height=Math.sqrt(peak)*26;return height>0?`M${index+.5},${28-height}v${height*2}`:'';}).join('')||'',[wave]);
 const seek=(value:number)=>{const player=audio.current;if(!player||!wave)return;const duration=Number.isFinite(player.duration)?player.duration:wave.duration;const next=Math.max(0,Math.min(duration,value));if(player.readyState===0){pendingSeek.current=next;player.load();}else player.currentTime=next;setPosition(next);};
 return <div className="stem-audio-panel">{wave?<div className="stem-waveform"><div className="stem-waveform-seek" role="slider" tabIndex={0} aria-label={`${label} 파형 재생 위치`} aria-valuemin={0} aria-valuemax={wave.duration} aria-valuenow={Math.min(position,wave.duration)} aria-valuetext={`${time(position)} / ${time(wave.duration)}`} onClick={event=>{const bounds=event.currentTarget.getBoundingClientRect();if(bounds.width)seek((event.clientX-bounds.left)/bounds.width*wave.duration);}} onKeyDown={event=>{const next=event.key==='Home'?0:event.key==='End'?wave.duration:event.key==='ArrowLeft'?position-5:event.key==='ArrowRight'?position+5:null;if(next!==null){event.preventDefault();seek(next);}}} title="클릭하여 재생 위치 이동"><svg viewBox={`0 0 ${wave.peaks.length} 56`} preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="28" x2={wave.peaks.length} y2="28" className="waveform-baseline"/><path d={path} vectorEffect="non-scaling-stroke"/></svg><span className="stem-waveform-playhead" style={{left:`${wave.duration?Math.min(100,position/wave.duration*100):0}%`}} /></div><div className="stem-waveform-axis"><span>{time(position)}</span><span>{time(wave.duration)}</span></div></div>:<div className="stem-waveform-status" role="status">{error||'파형 불러오는 중…'}</div>}<audio ref={audio} controls preload="metadata" src={audioUrl} aria-label={audioLabel} onPlay={event=>{const current=event.currentTarget;document.querySelectorAll('audio').forEach(player=>{if(player!==current)player.pause();});}} /></div>;
}

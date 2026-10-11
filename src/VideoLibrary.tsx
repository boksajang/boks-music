import {useState} from 'react';
type Row=Record<string,any>;
const clock=(seconds:number)=>{const total=Math.max(0,Math.round(Number(seconds)||0));return `${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`;};
const when=(value:string)=>value?new Date(value).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
const glyph=(d:string,fill='none')=><svg width="15" height="15" viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d}/></svg>;
// The playlist is named only when the video was given a different name (or when it was deleted).
const origin=(name:string|undefined,title:string,date:string)=>[name===undefined?'삭제된 플레이리스트':name!==title?`플레이리스트 ${name}`:'',when(date)].filter(Boolean).join(' · ');
const stageText=(stage?:string)=>(stage||'').replace(/\s*\d+(?:\.\d+)?%$/,'');
const unresolved=(track?:Row)=>!track?.lyricTiming?.cues?.length||track.lyricTiming.cues.some((cue:Row)=>!['manual','automatic'].includes(cue.status));

/** Video jobs that still matter to the user: running, waiting for lyric confirmation, or failed
 * without a later attempt for the same playlist. Shared with the sidebar badge. */
export function videoWork(jobs:Row[]){
 const videos=jobs.filter(job=>job.type==='video').sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
 const latest=new Map<string,Row>();for(const job of videos){const key=job.playlistId||job.result?.playlistId||job.id;if(!latest.has(key))latest.set(key,job);}
 return {
  active:videos.filter(job=>['queued','running'].includes(job.status)),
  waiting:videos.filter(job=>job.status==='needs-confirmation'),
  failed:videos.filter(job=>job.status==='failed'&&latest.get(job.playlistId||job.result?.playlistId||job.id)===job),
 };
}

export function VideoLibrary({data,busy,openMaker,openQueue,cancel,reveal,pauseMusic}:{data:Row;busy:boolean;openMaker:(playlistId:string)=>void;openQueue:()=>void;cancel:(job:Row)=>void;reveal:(video:Row)=>Promise<void>;pauseMusic:()=>void}){
 const [playing,setPlaying]=useState<Row|null>(null);const [playError,setPlayError]=useState('');
 const {active,waiting,failed}=videoWork(data.jobs||[]);
 const done=[...(data.videos||[])].sort((a:Row,b:Row)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
 const playlist=(id?:string)=>(data.playlists||[]).find((item:Row)=>item.id===id);
 const listName=(id?:string):string|undefined=>playlist(id)?.name;
 const total=active.length+waiting.length+failed.length+done.length;
 return <section className="video-library">
  <div className="page-heading"><div><div className="eyebrow">VIDEO STUDIO</div><h1>영상 제작<span className="title-count">{total}개</span></h1><p>플레이리스트로 만든 영상의 진행 상황을 보고, 멈춘 제작을 이어가거나 완성된 영상을 재생합니다.</p></div></div>
  {!total&&<div className="video-library-empty">아직 만든 영상이 없습니다. 플레이리스트에서 ‘플레이리스트 영상 만들기’로 시작하세요.</div>}
  {active.length>0&&<div className="video-library-group"><h2>제작 중<span>{active.length}</span></h2>{active.map(job=><article className="video-library-row" key={job.id}><div className="video-library-info"><h3 title={job.title}>{job.title}</h3><p>{origin(listName(job.playlistId),job.title,job.createdAt)} · {job.trackCount||'-'}곡</p><small>{job.status==='queued'?'다른 작업이 끝나기를 기다리고 있습니다':stageText(job.stage)||'제작 중'}</small>{typeof job.progress==='number'&&<progress max="100" value={job.progress} aria-label={`${job.title} 진행률`}/>}</div><div className="video-library-actions"><button className="secondary" onClick={openQueue}>작업 대기열 보기</button></div></article>)}</div>}
  {waiting.length>0&&<div className="video-library-group"><h2>이어서 진행할 영상<span>{waiting.length}</span></h2>{waiting.map(job=>{const ids:string[]=job.result?.trackIds||[];const open=ids.filter(id=>unresolved(data.tracks.find((track:Row)=>track.id===id)));const failures=job.result?.alignmentFailures?.length||0;const list=playlist(job.result?.playlistId);
   return <article className="video-library-row attention" key={job.id}><div className="video-library-info"><h3 title={job.title}>{job.title}</h3><p>{origin(listName(job.result?.playlistId),job.title,job.createdAt)}</p><small>{!list?'플레이리스트가 삭제되어 이어서 만들 수 없습니다':failures?`가사 분석을 마치지 못한 곡 ${failures}곡`:open.length?`가사 시간 확인이 필요한 곡 ${open.length}곡`:'가사 확인이 끝났습니다. 이어서 제작할 수 있습니다'}</small></div><div className="video-library-actions"><button className="primary" disabled={busy||!list} onClick={()=>openMaker(job.result.playlistId)}>이어서 진행</button><button className="secondary" disabled={busy} onClick={()=>cancel(job)}>제작 취소</button></div></article>;})}</div>}
  {failed.length>0&&<div className="video-library-group"><h2>실패한 제작<span>{failed.length}</span></h2>{failed.map(job=><article className="video-library-row" key={job.id}><div className="video-library-info"><h3 title={job.title}>{job.title}</h3><p>{origin(listName(job.playlistId),job.title,job.createdAt)}</p><small className="job-error">{job.error||'영상을 만들지 못했습니다.'}</small></div><div className="video-library-actions"><button className="secondary" disabled={busy||!playlist(job.playlistId)} onClick={()=>openMaker(job.playlistId)}>다시 만들기</button></div></article>)}</div>}
  {done.length>0&&<div className="video-library-group"><h2>완성된 영상<span>{done.length}</span></h2>{done.map((video:Row)=><article className="video-library-row" key={video.id}><div className="video-library-info"><h3 title={video.title}>{video.title}</h3><p>{origin(listName(video.playlistId),video.title,video.createdAt)}</p><small>{clock(video.duration)} · {video.height?`${video.height}p`:''}{video.fps?` · ${video.fps}fps`:''} · {String(video.format||'mp4').toUpperCase()}</small></div><div className="video-library-actions"><button className="secondary" onClick={()=>{pauseMusic();setPlayError('');setPlaying(video);}}>{glyph('m8 5 11 7-11 7Z','currentColor')}재생</button><button className="secondary" disabled={busy} onClick={()=>void reveal(video)}>폴더에서 보기</button></div></article>)}</div>}
  {playing&&<div className="modal-backdrop" onClick={()=>setPlaying(null)}><section className="modal video-player-modal" role="dialog" aria-modal="true" aria-labelledby="video-player-heading" onClick={event=>event.stopPropagation()} onKeyDown={event=>{if(event.key==='Escape')setPlaying(null);}}><div className="modal-title"><div><span className="eyebrow">NOW PLAYING</span><h2 id="video-player-heading">{playing.title}</h2></div><button title="닫기" aria-label="영상 재생 닫기" onClick={()=>setPlaying(null)}>{glyph('m6 6 12 12M18 6 6 18')}</button></div><video key={playing.id} src={playing.videoUrl} controls autoPlay preload="metadata" onError={()=>setPlayError('영상 파일을 재생할 수 없습니다. 파일을 이동하거나 삭제했을 수 있습니다.')}/>{playError&&<p className="job-error">{playError}</p>}</section></div>}
 </section>;
}

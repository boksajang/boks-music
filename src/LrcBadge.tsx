type Row=Record<string,any>;
/** LRC (lyric timing) badge, the same wherever songs are listed. lyricState comes from the main
 * process: 'ready' = every line of the current lyrics has a confirmed start, 'review' = lines left
 * to confirm. With `open` it is a button that opens the lyric timing editor. */
export function LrcBadge({track,open}:{track:Row;open?:()=>void}){
 if(!track?.lyricState)return null;
 const review=track.lyricState==='review',label=review?'LRC 확인':'LRC';
 const title=review?`가사 시간 확인이 필요한 줄 ${track.lyricReview||0}개`:'모든 가사 줄의 시간 정보가 있습니다';
 const className=`lrc-badge${review?' review':''}`;
 return open?<button type="button" className={className} title={`${title} · 눌러서 가사 시간 조정`} aria-label={`${track.title} ${title}`} onClick={open}>{label}</button>:<span className={className} title={title}>{label}</span>;
}

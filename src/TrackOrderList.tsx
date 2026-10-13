import {useEffect,useRef,useState} from 'react';
import type {KeyboardEvent as ReactKeyboardEvent,PointerEvent as ReactPointerEvent,ReactNode} from 'react';
type Row=Record<string,any>;
const collator=new Intl.Collator(['ko','en'],{numeric:true,sensitivity:'base'});
const same=(a:string[],b:string[])=>a.length===b.length&&a.every((id,index)=>id===b[index]);
const moved=(order:string[],id:string,to:number)=>{const next=order.filter(item=>item!==id);next.splice(Math.max(0,Math.min(next.length,to)),0,id);return next;};

/**
 * The songs of a video in playing order. Each row shows its position; the order changes by dragging the
 * grip, by typing a position into the number badge, by ↑/↓ (Home/End) on the grip, or by sorting all titles
 * ascending ↔ descending. Every change is handed to `onOrder` (saved as the playlist order); the last change
 * can be undone (되돌리기).
 */
export function TrackOrderList({tracks,editable,onOrder,duration,children,className=''}:{tracks:Row[];editable:boolean;onOrder:(ids:string[])=>Promise<void>;duration:(track:Row)=>string;children:(track:Row)=>ReactNode;className?:string}){
 const ids=tracks.map(track=>track.id as string),key=ids.join('|');
 const [draft,setDraft]=useState<string[]|null>(null),[dragging,setDragging]=useState(''),[sort,setSort]=useState<'asc'|'desc'|''>(''),[typing,setTyping]=useState<{id:string;value:string}|null>(null),[undo,setUndo]=useState<string[]|null>(null);
 const list=useRef<HTMLDivElement>(null),pointerY=useRef(0),frame=useRef(0),keyTimer=useRef<number>(0),draftRef=useRef<string[]|null>(null),cancelTyping=useRef(false),stopDrag=useRef<()=>void>(()=>{});
 draftRef.current=draft;
 // A new saved order from the library replaces the draft (unless a row is being dragged).
 useEffect(()=>{if(!dragging)setDraft(null);},[key]);
 useEffect(()=>()=>{stopDrag.current();cancelAnimationFrame(frame.current);window.clearTimeout(keyTimer.current);},[]);
 const order=draft||ids,byId=new Map(tracks.map(track=>[track.id,track])),shown=order.map(id=>byId.get(id)).filter(Boolean) as Row[];
 const width=String(shown.length).length<2?2:String(shown.length).length,label=(n:number)=>String(n).padStart(width,'0');
 const commit=async(next:string[],remember=true)=>{if(same(next,ids)){setDraft(null);return;}const before=ids;setDraft(next);try{await onOrder(next);setUndo(remember?before:null);}catch{setDraft(null);}};
 // Undo only while the same songs are listed (a song added or removed meanwhile makes it stale).
 const canUndo=!!undo&&undo.length===ids.length&&undo.every(id=>ids.includes(id));
 const undoLast=()=>{if(!undo)return;setSort('');void commit(undo,false);};
 const sortTitles=()=>{const direction=sort==='asc'?'desc':'asc',next=[...shown].sort((a,b)=>collator.compare(String(a.title||''),String(b.title||''))*(direction==='asc'?1:-1)).map(track=>track.id);setSort(direction);void commit(next);};
 // Dragging: the row moves to the slot under the pointer; near the list edges the list scrolls.
 const place=(id:string)=>{const host=list.current;if(!host)return;const rows=[...host.querySelectorAll<HTMLElement>('[data-track-id]')].filter(row=>row.dataset.trackId!==id);let to=rows.length;for(let index=0;index<rows.length;index++){const box=rows[index].getBoundingClientRect();if(pointerY.current<box.top+box.height/2){to=index;break;}}const current=draftRef.current||ids,next=moved(current,id,to);if(!same(next,current)){draftRef.current=next;setDraft(next);}};
 const scrollLoop=(id:string)=>{const host=list.current;if(!host)return;const box=host.getBoundingClientRect(),edge=42,y=pointerY.current;const speed=y<box.top+edge?-Math.ceil((box.top+edge-y)/4):y>box.bottom-edge?Math.ceil((y-box.bottom+edge)/4):0;if(speed){host.scrollTop+=speed;place(id);}frame.current=requestAnimationFrame(()=>scrollLoop(id));};
  // The pointer is followed on the window: the dragged row's element moves within the list while it is dragged.
 const startDrag=(event:ReactPointerEvent<HTMLButtonElement>,id:string)=>{if(!editable||event.button!==0)return;event.preventDefault();const pointer=event.pointerId;pointerY.current=event.clientY;draftRef.current=order;setDraft(order);setDragging(id);setSort('');
  const move=(next:PointerEvent)=>{if(next.pointerId!==pointer)return;pointerY.current=next.clientY;place(id);};
  const detach=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);cancelAnimationFrame(frame.current);stopDrag.current=()=>{};};
  const end=(next:PointerEvent)=>{if(next.pointerId!==pointer)return;detach();setDragging('');void commit(draftRef.current||ids);};
  stopDrag.current=detach;
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);frame.current=requestAnimationFrame(()=>scrollLoop(id));};
 const keyMove=(event:ReactKeyboardEvent<HTMLButtonElement>,id:string)=>{if(!editable)return;const index=order.indexOf(id),to={ArrowUp:index-1,ArrowDown:index+1,Home:0,End:order.length-1}[event.key];if(to===undefined)return;event.preventDefault();if(to<0||to>=order.length||to===index)return;const next=moved(order,id,to);setDraft(next);setSort('');
  // Several key presses in a row are saved once.
  window.clearTimeout(keyTimer.current);keyTimer.current=window.setTimeout(()=>void commit(draftRef.current||next),450);
  requestAnimationFrame(()=>list.current?.querySelector<HTMLButtonElement>(`[data-track-id="${CSS.escape(id)}"] .track-grip`)?.focus());};
 const typed=(id:string,value:string)=>{setTyping(null);if(cancelTyping.current){cancelTyping.current=false;return;}const position=Number.parseInt(value,10);if(!Number.isFinite(position))return;setSort('');void commit(moved(order,id,position-1));};
 return <>
  {editable&&shown.length>1&&<div className="track-order-tools"><small>번호를 눌러 순서를 입력하거나, 손잡이를 끌어 옮기세요.</small><div className="track-order-buttons">{canUndo&&<button type="button" className="track-order-undo" title="마지막 순서 변경을 되돌립니다" onClick={undoLast}>되돌리기</button>}<button type="button" className="track-order-sort" aria-pressed={!!sort} title={sort==='asc'?'제목 내림차순으로 정렬':'제목 오름차순으로 정렬'} onClick={sortTitles}><svg viewBox="0 0 16 16" aria-hidden="true"><path d={sort==='desc'?'M5 13V3M2.5 10.5 5 13l2.5-2.5':'M5 3v10M2.5 5.5 5 3l2.5 2.5'}/><path d="M10 4h4M10 8h3M10 12h2"/></svg>{sort==='asc'?'제목 오름차순':sort==='desc'?'제목 내림차순':'제목순 정렬'}</button></div></div>}
  <div ref={list} className={`video-track-checks track-order-list ${editable?'':'track-order-static'} ${dragging?'is-dragging':''} ${className}`}>{shown.map((track,index)=><div key={track.id} data-track-id={track.id} className={dragging===track.id?'dragging':''}>
   {editable&&typing?.id===track.id?<input className="track-order-badge" type="number" min={1} max={shown.length} autoFocus aria-label={`${track.title} 순서 입력`} value={typing?.value??''} onChange={event=>setTyping({id:track.id,value:event.target.value})} onBlur={event=>typed(track.id,event.target.value)} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancelTyping.current=true;event.currentTarget.blur();}}}/>
    :editable?<button type="button" className="track-order-badge" title="눌러서 순서 번호 입력" aria-label={`${index+1}번째: ${track.title} · 눌러서 순서 입력`} onClick={()=>{cancelTyping.current=false;setTyping({id:track.id,value:String(index+1)});}}>{label(index+1)}</button>
    :<span className="track-order-badge">{label(index+1)}</span>}
   {editable&&<button type="button" className="track-grip" aria-label={`${track.title} 순서 이동 (끌거나 ↑↓ 키)`} title="끌어서 순서 이동" onPointerDown={event=>startDrag(event,track.id)} onKeyDown={event=>keyMove(event,track.id)}><svg viewBox="0 0 10 16" aria-hidden="true">{[3,8,13].flatMap(y=>[<circle key={`a${y}`} cx="3" cy={y} r="1.3"/>,<circle key={`b${y}`} cx="7" cy={y} r="1.3"/>])}</svg></button>}
   <div className="track-order-main">{children(track)}</div>
   <small className="video-track-duration">{duration(track)}</small>
  </div>)}</div>
 </>;
}

/**
 * Songs and projects that queued or running jobs work on. Library management (trash, permanent deletion,
 * project deletion, moving songs) is refused only for these, so a long video render does not lock the
 * rest of the library.
 */
// A cancelled job counts until its process has exited (`stopping`).
const active=job=>['queued','running'].includes(job.status)||job.stopping===true;

export function busyTrackIds(data){
 const ids=new Set();
 for(const job of data.jobs||[]){
  if(!active(job))continue;const request=job.request||{};
  for(const id of [request.trackId,request.parentId,...(Array.isArray(request.trackIds)?request.trackIds:[])])if(typeof id==='string')ids.add(id);
 }
 // A song in use keeps its Stems (they move and are deleted together with it).
 for(const row of data.tracks||[])if(row.kind==='stem'&&ids.has(row.parentId))ids.add(row.id);
 return ids;
}
export function busyProjectIds(data){
 const ids=new Set();
 for(const job of data.jobs||[])if(active(job))for(const id of [job.request?.projectId,job.request?.storageProjectId])if(typeof id==='string')ids.add(id);
 return ids;
}
/** Throws when one of the rows is used by a queued or running job. */
export function assertTracksIdle(data,rows,action){
 const busy=busyTrackIds(data),row=rows.find(item=>busy.has(item.id)||(item.kind==='stem'&&busy.has(item.parentId)));
 if(row)throw new Error(`「${row.title||'곡'}」을(를) 사용하는 작업이 끝나거나 취소된 뒤 ${action}.`);
}

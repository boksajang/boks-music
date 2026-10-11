// Persist the engine result directly; no secondary conversion stage.
export async function registerFinalTrack(request,result,{addAudio,signal}) {
  if(signal?.aborted)throw Object.assign(new Error('작업이 취소되었습니다.'),{name:'AbortError'});
  if(!['generate','cover'].includes(request.operation))throw new Error('지원하지 않는 음악 작업입니다.');
  return addAudio({audioPath:result.audioPath,projectId:request.projectId,title:request.title,lyrics:request.lyrics,style:request.style,presetId:request.presetId,seed:request.seed,instrumental:request.instrumental,...(request.instrumental&&request.operation==='generate'?{instrumentalDuration:request.instrumentalDuration||180}:{}),kind:request.operation==='generate'?'song':'cover',...(request.operation==='cover'&&request.parentId?{parentId:request.parentId}:{}),metadata:result.metadata,settings:request.settings},{signal});
}

// Finish the remaining songs even when one analysis fails; cancellation stops the batch.
export async function analyzeLyricBatch(trackIds,{signal,analyze,onFailure}){
 const failures=[];
 for(const [index,trackId] of trackIds.entries()){
  signal.throwIfAborted();
  try{await analyze(trackId,index);signal.throwIfAborted();}
  catch(error){signal.throwIfAborted();const failure={trackId,message:error.message||String(error)};failures.push(failure);await onFailure?.(failure);}
 }
 return failures;
}

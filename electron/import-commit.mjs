// A single durable write publishes both the music and extraction-consumed marker.
export async function commitImportedTrack(store,row,origin,signal){
 if(signal?.aborted)throw new Error('작업이 취소되었습니다.');
 if(origin.result?.importedTrackId)throw new Error('이미 가져온 음악입니다.');
 const previous={...origin.result};
 try{store.data.tracks.push(row);origin.result={...origin.result,importedTrackId:row.id};await store.save();}
 catch(error){store.data.tracks=store.data.tracks.filter(item=>item!==row);origin.result=previous;throw error;}
 return row;
}

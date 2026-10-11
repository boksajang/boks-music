import {randomUUID} from 'node:crypto';

const pending=new WeakMap();
const name=value=>{if(typeof value!=='string'||!value.trim()||value.length>100)throw new Error('재생목록 이름은 1~100자로 입력하세요.');return value.trim();};
const find=(store,id)=>{if(typeof id!=='string')throw new Error('재생목록을 선택하세요.');const row=store.data.playlists.find(item=>item.id===id);if(!row)throw new Error('재생목록을 찾을 수 없습니다.');return row;};
const ids=value=>{if(!Array.isArray(value)||!value.length||value.length>10000||value.some(id=>typeof id!=='string'||!id))throw new Error('재생목록의 곡을 선택하세요.');return [...new Set(value)];};
function edit(store,change){
  const operation=(pending.get(store)||Promise.resolve()).then(async()=>{
    const before=structuredClone(store.data.playlists);
    try{const result=change();await store.save();return result;}catch(error){store.data.playlists=before;throw error;}
  });
  pending.set(store,operation.catch(()=>{}));return operation;
}
export function createPlaylist(store,{name:value}={}){return edit(store,()=>{const now=new Date().toISOString(),row={id:randomUUID(),name:name(value),trackIds:[],createdAt:now,updatedAt:now};store.data.playlists.push(row);return row;});}
export function renamePlaylist(store,{id,name:value}={}){return edit(store,()=>{const row=find(store,id);row.name=name(value);row.updatedAt=new Date().toISOString();return row;});}
export function deletePlaylist(store,{id}={}){return edit(store,()=>{find(store,id);store.data.playlists=store.data.playlists.filter(row=>row.id!==id);return {deletedId:id};});}
export function addToPlaylist(store,{playlistId,ids:values}={}){return edit(store,()=>{
  const row=find(store,playlistId),selected=ids(values);
  for(const id of selected){const track=store.data.tracks.find(item=>item.id===id);if(!track||track.trashedAt||track.kind==='stem')throw new Error('휴지통에 없는 음악만 재생목록에 추가할 수 있습니다.');}
  row.trackIds=[...new Set([...row.trackIds,...selected])];row.updatedAt=new Date().toISOString();return row;
});}
export function removeFromPlaylist(store,{playlistId,ids:values}={}){return edit(store,()=>{const row=find(store,playlistId),selected=new Set(ids(values));if([...selected].some(id=>!row.trackIds.includes(id)))throw new Error('재생목록에 있는 곡만 제거할 수 있습니다.');row.trackIds=row.trackIds.filter(id=>!selected.has(id));row.updatedAt=new Date().toISOString();return row;});}

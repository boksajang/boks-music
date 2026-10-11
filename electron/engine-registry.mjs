// Register an adapter once here; the renderer discovers its selection without paths.
export const engineRegistry = Object.freeze([
  {id:'yue2-cpp',role:'music',name:'YuE2 / yue2.cpp',adapter:'native',platforms:['win32']},
  {id:'yue2-cpp-transcriber',role:'cover',name:'SheetSage2 / yue2.cpp',adapter:'native',platforms:['win32']},
  {id:'audio-cpp-yue2',role:'music',name:'YuE2 / audio.cpp Metal',adapter:'audio-cpp',platforms:['darwin']},
  {id:'audio-cpp-sheetsage2',role:'cover',name:'SheetSage2 / audio.cpp Metal',adapter:'audio-cpp',platforms:['darwin']},
  {id:'bs-roformer',role:'stems',name:'BS-RoFormer',adapter:'python'}
]);
export const enginesForPlatform=(platform=process.platform)=>engineRegistry.filter(e=>!e.platforms||e.platforms.includes(platform));
export const defaultEngineSelection=Object.fromEntries(enginesForPlatform().map(e=>[e.role,e.id]));
export function selectedEngine(settings,operation){
  const role=operation==='generate'?'music':operation;
  const id=settings.engineSelection?.[role]||defaultEngineSelection[role];
  const entry=enginesForPlatform().find(e=>e.role===role&&e.id===id);
  if(!entry)throw new Error('선택한 엔진이 등록되지 않았습니다. 설치된 엔진을 선택하세요.');
  return entry;
}

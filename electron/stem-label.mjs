export function stemLabel(file = '') {
  const filename = String(file).replace(/\\/g, '/').split('/').pop();
  const part = [...filename.matchAll(/\(([^)]+)\)/g)].at(-1)?.[1];
  const aliases = {vocals:'Vocal',vocal:'Vocal',drums:'Drum',drum:'Drum',instrumental:'Instrumental',no_vocals:'Instrumental',hh:'Hi-hat'};
  if (part) return aliases[part.toLowerCase()] || part.replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const text=filename.toLowerCase();
  const known=['instrumental','vocals','vocal','piano','strings','drums','bass','guitar','other'];
  const found=known.find(key=>new RegExp('(^|[^a-z])'+key+'([^a-z]|$)').test(text));
  return found ? aliases[found] || found[0].toUpperCase()+found.slice(1) : 'Audio';
}

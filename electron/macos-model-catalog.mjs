import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const development=fileURLToPath(new URL('../engines/macos-catalog.json',import.meta.url));
export const macosCatalog=JSON.parse(readFileSync(existsSync(development)?development:path.join(process.resourcesPath,'engines','macos-catalog.json'),'utf8').replace(/^\uFEFF/,''));
const minimum={BF16:32,Q8_0:24,Q4_0:16};
export const macModelChoices=macosCatalog.models.filter(m=>m.role==='backbone').map(model=>{
  const precision=/-(bf16|q8_0|q4_0)\.gguf$/.exec(model.filename)[1].toUpperCase();
  return {id:'yue2-macos-'+({BF16:'bf16',Q8_0:'q8',Q4_0:'q4'}[precision]),name:`YuE2 3B · ${precision}`,precision,backbone:model.filename,minUnifiedMemoryGB:minimum[precision],requiredDiskGB:Math.ceil(model.bytes/2**30)+44};
}).sort((a,b)=>b.minUnifiedMemoryGB-a.minUnifiedMemoryGB);

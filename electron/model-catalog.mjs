import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const development=fileURLToPath(new URL('../engines/native-catalog.json',import.meta.url));
export const nativeCatalog=JSON.parse(readFileSync(existsSync(development)?development:path.join(process.resourcesPath,'engines','native-catalog.json'),'utf8'));
const memory={BF16:12,Q8_0:8,Q6_K:7,Q5_K_M:5.5};
export const modelChoices=nativeCatalog.models.filter(m=>m.role==='backbone').map(model=>{
  const [,size,precision]=/^YuE2-(.+)-(BF16|Q8_0|Q6_K|Q5_K_M)\.gguf$/.exec(model.filename)||[];
  return {id:`yue2-native-${size==='3B'?'':String(size).toLowerCase()+'-'}${{BF16:'bf16',Q8_0:'q8',Q6_K:'q6',Q5_K_M:'q5'}[precision]}`,name:`YuE2 ${size} · ${precision}`,precision,backbone:model.filename,minVramGB:model.minVramGB??(size==='3B'?memory[precision]:null),requiredDiskGB:Math.ceil(model.bytes/2**30)+44};
}).sort((a,b)=>b.minVramGB-a.minVramGB);

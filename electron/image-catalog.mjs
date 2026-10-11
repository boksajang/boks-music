// Local album art models: stable-diffusion.cpp prebuilt binaries and two model families, each
// listed from the lowest to the highest hardware requirement. Every file is pinned by size and
// SHA-256 (Hugging Face LFS / GitHub release digests, checked 2026-10-11). GPU memory for 1024x1024
// with --offload-to-cpu: measured Z-Image Q8_0 = 7.4 GB on an RTX 5080 (diffusion file + ~1.3 GB, the
// text encoder is offloaded after encoding); other Z-Image variants follow that rule, FLUX.2 klein
// figures are estimates. See docs/VALIDATION.md.
const HF='https://huggingface.co';
const GH='https://github.com/leejet/stable-diffusion.cpp/releases/download';
export const IMAGE_ENGINE_RELEASE='master-956-1b0ba10';
const asset=(name,bytes,sha256)=>({filename:name,url:`${GH}/${IMAGE_ENGINE_RELEASE}/${name}`,bytes,sha256});
// Prebuilt engine per host. NVIDIA uses CUDA 12 (with its runtime DLLs), other Windows GPUs Vulkan.
export const IMAGE_ENGINE_BUILDS={
  'win-cuda12':{label:'NVIDIA CUDA',platform:'win32',arch:'x64',assets:[asset('sd-master-1b0ba10-bin-win-cuda12-x64.zip',337974452,'144b9631bf2eeb9bf6bf7f148cf40aaf05739ce7c49d3ac0ec2ddf6b65765d69'),asset('cudart-sd-bin-win-cu12-x64.zip',563452046,'fe20366827d357c00797eebb58244dddab7fd9a348d70090c3871004c320f38d')]},
  'win-vulkan':{label:'Vulkan',platform:'win32',arch:'x64',assets:[asset('sd-master-1b0ba10-bin-win-vulkan-x64.zip',30123908,'9e8b9baff514fe5dfb77e51bf08d85f11e6f10128eac14d4474c87f563309725')]},
  'win-cpu':{label:'CPU',platform:'win32',arch:'x64',assets:[asset('sd-master-1b0ba10-bin-win-cpu-x64.zip',17543461,'39c2ea1cc03f697864c858ad0b22b9b8ce62f945ba428e8596a814527e6db6fb')]},
  'mac-metal':{label:'Apple Metal',platform:'darwin',arch:'arm64',assets:[asset('sd-master-1b0ba10-bin-Darwin-macOS-26.6.2-arm64.zip',35158090,'72c18ca1ba4177ca77cd288a9cb1e0f78d63ad3bde4b91fd7c84f3f4187b5761')]},
};
const hf=(repo,file,bytes,sha256,folder)=>({filename:file.split('/').pop(),url:`${HF}/${repo}/resolve/main/${file}`,bytes,sha256,folder});
// Qwen3-4B text encoder: the identical file (same SHA-256) is used by both families, so it is shared.
const TEXT_ENCODERS={
  q4:hf('unsloth/Qwen3-4B-GGUF','Qwen3-4B-Q4_K_M.gguf',2497281312,'f6f851777709861056efcdad3af01da38b31223a3ba26e61a4f8bf3a2195813a','text-encoders'),
  q8:hf('unsloth/Qwen3-4B-GGUF','Qwen3-4B-Q8_0.gguf',4280405792,'eed555233267a33c7e8ee31682762cc7751b3f6d224039086e0e846f05fffa5d','text-encoders'),
  bf16:hf('Comfy-Org/z_image_turbo','split_files/text_encoders/qwen_3_4b.safetensors',8044982048,'6c671498573ac2f7a5501502ccce8d2b08ea6ca2f661c458e708f36b36edfc5a','text-encoders'),
};
export const IMAGE_FAMILIES=[
  {id:'z-image-turbo',name:'Z-Image Turbo',vendor:'Tongyi-MAI',license:'Apache-2.0',parameters:'6B',
   description:'사실적인 질감과 조명이 강한 고품질 모델입니다. 8단계로 생성합니다.',steps:8,cfgScale:1,
   vae:hf('Comfy-Org/z_image_turbo','split_files/vae/ae.safetensors',335304388,'afc8e28272cd15db3919bacdb6918ce9c1ed22e96cb12c4d5ed0fba823529e38','z-image-turbo'),
   variants:[
    {quant:'Q3_K',note:'4GB급 GPU에서도 동작하는 최소 구성, 세부 묘사가 줄어듭니다',minVramGB:4,recVramGB:6,diffusion:hf('leejet/Z-Image-Turbo-GGUF','z_image_turbo-Q3_K.gguf',3143559104,'4b44bdaa7814f20d7cf144e3939bd93aa32f50660204dd0c2aea5c5376232980','z-image-turbo'),textEncoder:'q4'},
    {quant:'Q4_K',note:'6GB급 GPU의 균형 구성',minVramGB:6,recVramGB:8,diffusion:hf('leejet/Z-Image-Turbo-GGUF','z_image_turbo-Q4_K.gguf',3864250304,'14b375ab4f226bc5378f68f37e899ef3c2242b8541e61e2bc1aff40976086fbd','z-image-turbo'),textEncoder:'q4'},
    {quant:'Q6_K',note:'원본에 가까운 품질, 8GB급 GPU',minVramGB:8,recVramGB:10,diffusion:hf('leejet/Z-Image-Turbo-GGUF','z_image_turbo-Q6_K.gguf',5263239104,'319f627beac8059b7546f36a7b4d5097b7f4ee6a1fc37585d0f75ca1d12d01af','z-image-turbo'),textEncoder:'q4'},
    {quant:'Q8_0',note:'원본과 거의 같은 품질, 10GB급 GPU',minVramGB:8,recVramGB:10,diffusion:hf('leejet/Z-Image-Turbo-GGUF','z_image_turbo-Q8_0.gguf',6577440704,'df1c5baa86d1398c979495a6072dbcee79444fdb884a2445582ba0769c44e9a1','z-image-turbo'),textEncoder:'q8'},
    // Recommended only from 18 GB: on 16 GB it fits, but Q8_0 looks the same at half the download.
    {quant:'BF16',note:'양자화하지 않은 원본, 16GB 이상 GPU',minVramGB:13,recVramGB:18,diffusion:hf('Comfy-Org/z_image_turbo','split_files/diffusion_models/z_image_turbo_bf16.safetensors',12309866400,'2407613050b809ffdff18a4ac99af83ea6b95443ecebdf80e064a79c825574a6','z-image-turbo'),textEncoder:'bf16'},
   ]},
  {id:'flux2-klein-4b',name:'FLUX.2 klein 4B',vendor:'Black Forest Labs',license:'Apache-2.0',parameters:'4B',
   description:'가장 빠른 모델입니다. 4단계로 생성해 저사양에서도 기다림이 짧습니다.',steps:4,cfgScale:1,
   vae:hf('Comfy-Org/flux2-klein-4B','split_files/vae/flux2-vae.safetensors',336211292,'868fe7b343cc8f3a19dbcfcafbc3d5f888802be3f89bd81b65b3621a066ce8f3','flux2-klein-4b'),
   variants:[
    {quant:'Q4_0',note:'4GB급 GPU용 최소 구성',minVramGB:4,recVramGB:6,diffusion:hf('leejet/FLUX.2-klein-4B-GGUF','flux-2-klein-4b-Q4_0.gguf',2460378560,'d1023499ef3f2f82ff7c50e6778495195c1b6cc34835741778868428111f9ff4','flux2-klein-4b'),textEncoder:'q4'},
    {quant:'Q8_0',note:'원본과 거의 같은 품질, 8GB급 GPU',minVramGB:6,recVramGB:8,diffusion:hf('leejet/FLUX.2-klein-4B-GGUF','flux-2-klein-4b-Q8_0.gguf',4300629440,'0bba6951258ec8f92d51114a8fa13e66828297bfff58a738f52729b3ef66fa28','flux2-klein-4b'),textEncoder:'q8'},
    {quant:'BF16',note:'양자화하지 않은 원본, 12GB 이상 GPU',minVramGB:10,recVramGB:12,diffusion:hf('Comfy-Org/flux2-klein-4B','split_files/diffusion_models/flux-2-klein-4b.safetensors',7751105712,'ec3d4e733a771f61c052fb4856c48b336c55eaf2c65487c2a1faeb9bbda7a343','flux2-klein-4b'),textEncoder:'bf16'},
   ]},
];
const GB=1024**3;
export const variantId=(family,variant)=>`${family.id}:${variant.quant.toLowerCase()}`;
/** Every variant with the files it needs (diffusion model, VAE, shared text encoder). */
export function imageVariants(){
  return IMAGE_FAMILIES.flatMap(family=>family.variants.map(variant=>{
    const files=[variant.diffusion,family.vae,TEXT_ENCODERS[variant.textEncoder]];
    return {id:variantId(family,variant),family:family.id,familyName:family.name,quant:variant.quant,note:variant.note,minVramGB:variant.minVramGB,recVramGB:variant.recVramGB,steps:family.steps,cfgScale:family.cfgScale,files,
     modelBytes:files.reduce((sum,file)=>sum+file.bytes,0),weightsGB:(variant.diffusion.bytes+TEXT_ENCODERS[variant.textEncoder].bytes)/GB};
  }));
}
export const findImageVariant=id=>imageVariants().find(item=>item.id===id)||null;

const number=value=>{const parsed=parseFloat(String(value??'').replace(/,/g,''));return Number.isFinite(parsed)?parsed:0;};
/** The prebuilt engine for this host, or the reason none exists. */
export function imageEngineBuild(system={}){
  // gpuVendor can be '확인 불가' for AMD/Intel on Windows: the GPU name decides then.
  const platform=system.platform||process.platform,arch=system.arch||process.arch,vendor=`${system.gpuVendor||''} ${system.gpu||''}`.toLowerCase();
  if(platform==='darwin')return arch==='arm64'&&!system.translated?{id:'mac-metal',...IMAGE_ENGINE_BUILDS['mac-metal']}:{id:null,reason:'Intel Mac(또는 Rosetta 실행)용 이미지 엔진 실행 파일이 제공되지 않습니다.'};
  if(platform!=='win32')return {id:null,reason:'현재 운영체제는 지원하지 않습니다.'};
  if(arch!=='x64')return {id:null,reason:'Windows x64에서만 이미지 엔진 실행 파일이 제공됩니다.'};
  if(/nvidia/.test(vendor)||number(system.vramMB)>0)return {id:'win-cuda12',...IMAGE_ENGINE_BUILDS['win-cuda12']};
  if(/amd|radeon|\barc\b|intel\(r\) arc|iris xe/.test(vendor))return {id:'win-vulkan',...IMAGE_ENGINE_BUILDS['win-vulkan']};
  return {id:'win-cpu',...IMAGE_ENGINE_BUILDS['win-cpu']};
}
/** Usable GPU memory, system memory and free disk space in GB. Apple Silicon shares one pool. */
export function imageHardware(system={}){
  const ram=number(system.ram),disk=number(system.freeSpace),build=imageEngineBuild(system);
  if(build.id==='mac-metal'){const unified=number(system.unifiedMemoryGB)||ram;return {build,gpuGB:unified*.65,ramGB:unified,diskGB:disk,shared:true};}
  // Windows reports no VRAM for most AMD/Intel GPUs: assume a conservative 4 GB and say so.
  const reported=build.id==='win-cuda12'?number(system.vramMB)/1024||number(system.vram):build.id==='win-vulkan'?number(system.vram):0;
  const unknownVram=build.id==='win-vulkan'&&!reported;
  return {build,gpuGB:unknownVram?4:reported,ramGB:ram,diskGB:disk,shared:false,unknownVram};
}

/** Choices for the install layer, lowest to highest requirement per family. status: recommended |
 * available | slow (runs by moving weights between memories, slowly) | unavailable (with reason). */
export function localImageChoices(system={},{installed=[],engineInstalled=false,presentFiles=[]}={}){
  const hardware=imageHardware(system),{build}=hardware,present=new Set(presentFiles);
  const engineBytes=build.id&&!engineInstalled?build.assets.reduce((sum,item)=>sum+item.bytes,0):0;
  const rows=imageVariants().map(variant=>{
   const needBytes=engineBytes+variant.files.filter(file=>!present.has(`${file.folder}/${file.filename}`)).reduce((sum,file)=>sum+file.bytes,0);
   const needGB=needBytes/GB,isInstalled=installed.includes(variant.id);
   let status='available',reason='';
   if(!build.id){status='unavailable';reason=build.reason;}
   else if(!isInstalled&&hardware.diskGB&&hardware.diskGB<needGB*1.1+1){status='unavailable';reason=`디스크 공간이 부족합니다. ${needGB.toFixed(1)}GB가 필요하고 ${hardware.diskGB.toFixed(0)}GB 남아 있습니다.`;}
   else if(hardware.shared?hardware.ramGB*.75<variant.weightsGB*1.2:hardware.gpuGB+hardware.ramGB*.6<variant.weightsGB*1.2){status='unavailable';reason=`메모리가 부족합니다. GPU와 시스템 메모리를 합쳐도 모델(${variant.weightsGB.toFixed(1)}GB)을 올릴 수 없습니다.`;}
   else if(build.id==='win-cpu'){status='slow';reason='GPU 가속 없이 CPU로 생성해 한 장에 수 분 이상 걸릴 수 있습니다.';}
   else if(hardware.gpuGB<variant.minVramGB){status='slow';reason=hardware.unknownVram?`GPU 메모리 크기를 확인할 수 없어 4GB로 가정했습니다. 권장 최소 ${variant.minVramGB}GB보다 작으면 느리게 생성합니다.`:`GPU 메모리(${hardware.gpuGB.toFixed(0)}GB)가 권장 최소 ${variant.minVramGB}GB보다 작아 일부를 시스템 메모리로 옮기며 느리게 생성합니다.`;}
   return {...variant,status,reason,installed:isInstalled,downloadBytes:isInstalled?0:needBytes};
  });
  // Recommended: per family the highest variant whose recommended GPU memory fits; overall Z-Image first.
  const pick=family=>[...rows].filter(row=>row.family===family&&row.status==='available'&&hardware.gpuGB>=row.recVramGB).pop()||rows.find(row=>row.family===family&&row.status==='available');
  const recommended=pick('z-image-turbo')||pick('flux2-klein-4b')||rows.find(row=>row.status==='slow')||null;
  for(const family of IMAGE_FAMILIES){const best=pick(family.id);if(best)best.familyRecommended=true;}
  if(recommended)recommended.recommended=true;
  return {build:build.id?{id:build.id,label:build.label}:null,reason:build.id?'':build.reason,hardware:{gpuGB:Math.round(hardware.gpuGB*10)/10,ramGB:Math.round(hardware.ramGB),diskGB:Math.round(hardware.diskGB),shared:hardware.shared,unknownVram:!!hardware.unknownVram},
   recommendedId:recommended?.id||null,families:IMAGE_FAMILIES.map(family=>({id:family.id,name:family.name,vendor:family.vendor,license:family.license,parameters:family.parameters,description:family.description,variants:rows.filter(row=>row.family===family.id)}))};
}

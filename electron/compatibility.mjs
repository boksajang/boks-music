import {modelChoices} from './model-catalog.mjs';
import {macModelChoices} from './macos-model-catalog.mjs';
const lyricItems=[{label:'가사 시간 정렬',value:'Qwen3 ForcedAligner 0.6B'},{label:'교차 확인 인식',value:'Qwen3-ASR 1.7B'},{label:'영상 제작',value:'GPU 캔버스 · WebCodecs H.264'}];

// All choices remain visible/selectable. Only installation is gated with a reason.
// These conservative bundle thresholds are app policy, not measured guarantees.
export function installationOptions(system,settings={},platform=process.platform) {
  if(platform==='darwin')return macInstallationOptions(system,settings);
  const nvidia=system.gpuVendor==='NVIDIA',vram=Number(system.vramMB||0)/1024;
  const ram=Number.parseFloat(system.ram)||0,disk=Number.parseFloat(system.freeSpace);
  const eligible=modelChoices.filter(m=>Number.isFinite(m.minVramGB)&&vram>=Math.max(m.minVramGB*1.25,6));
  const recommended=(eligible.find(m=>m.precision===(vram>=23.5?'BF16':'Q8_0'))||eligible[0]||modelChoices.at(-1)).id;
  return modelChoices.map(model=>{
    const installed=settings.installedModelIds?.includes(model.id);
    let reason='';
    if(platform!=='win32')reason='Boks Music은 Windows와 macOS를 지원 대상으로 합니다. 현재 OS용 설치 구성은 없습니다.';
    else if(system.arch&&system.arch!=='x64')reason='현재 Windows 통합 배포물은 x64 전용입니다. Windows ARM64 런타임은 등록되지 않았습니다.';
    else if(!Number.isFinite(model.minVramGB))reason='이 모델의 Windows 메모리 요구사항이 아직 등록되지 않았습니다.';
    else if(!nvidia)reason='현재 Windows CUDA 통합 패키지를 실행하려면 NVIDIA GPU가 필요합니다. 이 PC에 맞는 전체 패키지가 아직 등록되지 않았습니다.';
    else if(system.computeCapability&&Number.parseFloat(system.computeCapability)<7.5)reason='현재 통합 패키지의 CUDA 13은 Turing(Compute Capability 7.5) 이상이 필요합니다. Maxwell/Pascal/Volta용 CUDA 12 실행 구성이 이 앱의 설치 목록에 등록되지 않았습니다. 이 GPU에서 네이티브 실행 자체가 불가능하다는 뜻은 아닙니다.';
    else if(system.driver&&((Number.parseInt(system.driver,10)<580)||(Number.parseInt(system.driver,10)===580&&Number(String(system.driver).split('.')[1]||0)<88)))reason='Native CUDA 13 구성에는 NVIDIA 드라이버 580.88 이상이 필요합니다. 드라이버를 업데이트하세요.';
    else if(vram<Math.max(model.minVramGB,6))reason=`VRAM ${system.vram||'확인 불가'}: ${model.name}과 필수 구성의 설치 정책상 ${Math.max(model.minVramGB,6)}GB 이상이 필요합니다. 더 작은 모델을 선택하세요.`;
    else if(ram<16)reason=`RAM ${system.ram||'확인 불가'}: 통합 패키지는 RAM 16GB 이상이 필요합니다.`;
    else if(!installed&&!Number.isFinite(disk))reason='저장 공간을 확인하지 못했습니다. 저장 위치를 확인하고 시스템 재검사를 실행하세요.';
    else if(!installed&&disk<model.requiredDiskGB)reason=`저장 공간 ${system.freeSpace}: 모델과 필수 패키지 설치에 여유 ${model.requiredDiskGB}GB가 필요합니다.`;
    return {...model,description:'Windows CUDA · Native 런타임, Cover Transcriber, BS-RoFormer Stem, Qwen 가사 분석을 함께 자동 설치합니다.',supported:!reason,recommended:!reason&&model.id===recommended,backend:'cuda',reason:reason||'이 PC에서 통합 설치를 선택할 수 있습니다. 설치 후 모델 로딩과 실행을 검사하며 음악 품질 검증은 별도입니다.',status:'미설치'};
  });
}

export function installationRecommendation(system,settings={},platform=process.platform){
  const options=installationOptions(system,settings,platform);
  if(platform==='darwin'){
    const candidate=options.find(o=>o.recommended)||options.find(o=>o.supported)||options.find(o=>o.candidateRecommended);
    return {available:!!candidate?.supported,optionId:candidate?.supported?candidate.id:'',candidateOptionId:candidate?.id||'',hardware:[system.gpu||'GPU 확인 불가',system.vram||system.ram||'메모리 확인 불가'].join(' / ')+' 감지',reason:options.find(o=>o.id===candidate?.id)?.reason||options.at(-1)?.reason,explanation:'통합 메모리 기준은 보수적인 설치 정책입니다. 실제 Mac에서 설치·추론·품질 검증은 아직 수행하지 않았습니다.',items:[{label:'Music',value:candidate?candidate.name+' · 후보':'호환 후보 없음'},{label:'Audio Decoder',value:'YuE2 VAE F32'},{label:'Cover',value:'SheetSage2 · Mac 검증 필요'},{label:'Backend',value:system.arch==='arm64'?'macOS Metal / audio.cpp':'macOS CPU · 검증 필요'},{label:'Stem',value:system.arch==='arm64'?'BS-RoFormer MPS · 검증 필요':'BS-RoFormer CPU · 검증 필요'},...lyricItems]};
  }
  const selected=options.find(o=>o.recommended)||options.find(o=>o.supported);
  return {available:!!selected,optionId:selected?.id||'',hardware:[system.gpu||'GPU 확인 불가',system.vram||'VRAM 확인 불가'].join(' / ')+' 감지',reason:selected?'':options.at(-1)?.reason||'호환 구성을 찾지 못했습니다.',explanation:selected?'VRAM 여유와 통합 구성의 실행 조건을 고려한 추천입니다. 곡 길이에 따른 실제 메모리 사용량과 생성 품질은 설치 후 확인이 필요합니다.':'시스템 재검사 후 지원 가능한 구성을 다시 확인하세요.',items:[
    {label:'Music',value:selected?.name||'설치 가능한 모델 없음'},
    {label:'Audio Decoder',value:'YuE2 VAE F32'},
    {label:'Cover',value:'SheetSage2 Q8_0'},
    {label:'Backend',value:'Windows CUDA / yue2.cpp'},
    {label:'Stem',value:'BS-RoFormer CUDA'},...lyricItems]};
}

function macInstallationOptions(system,settings){
  const memory=Number(system.unifiedMemoryGB)||Number.parseFloat(system.ram)||0;
  const minimum={Q4_0:16,Q8_0:24,BF16:32};
  const apple=system.arch==='arm64',version=Number.parseInt(system.macOSVersion,10);
  const eligible=apple&&!system.translated&&version>=14;
  const candidate=macModelChoices.find(m=>eligible&&memory>=minimum[m.precision]);
  return macModelChoices.map(model=>{
    const enough=memory>=minimum[model.precision];
    let reason='';
    if(system.translated)reason='Rosetta x64 실행이 감지되었습니다. arm64 앱·런타임으로 실행해야 합니다.';
    else if(!apple)reason='Intel Mac용 audio.cpp CPU 배포물은 있지만, 현재 통합 Stem/MPS 구성과 Python 의존성은 Apple Silicon 전용입니다.';
    else if(!Number.isFinite(version))reason='macOS 버전을 확인하지 못했습니다. macOS 14 이상 여부를 확인해야 합니다.';
    else if(version<14)reason='현재 macOS 후보 구성은 macOS 14 이상을 대상으로 합니다.';
    else if(!enough)reason=`통합 메모리 ${memory} GB: ${model.name} 후보는 보수적인 정책상 ${minimum[model.precision]} GB 이상이 필요합니다. 실제 Mac 실행 검증 전입니다.`;
    if(!reason&&!settings.installedModelIds?.includes(model.id)){const disk=Number.parseFloat(system.freeSpace);if(!Number.isFinite(disk))reason='저장 공간을 확인하지 못했습니다. 시스템 재검사를 실행하세요.';else if(disk<model.requiredDiskGB)reason='저장 공간 '+system.freeSpace+': 설치에 여유 '+model.requiredDiskGB+'GB가 필요합니다.';} return {...model,description:'macOS Apple Silicon · audio.cpp Metal 음악/Cover, BS-RoFormer MPS, Qwen 가사 분석. 실제 Mac 실행은 미검증입니다.',supported:!reason,installAvailable:!reason,recommended:!reason&&model.id===candidate?.id,candidateEligible:eligible&&enough,candidateRecommended:model.id===candidate?.id,minUnifiedMemoryGB:minimum[model.precision],backend:apple?'metal':'cpu',reason:reason||'이 Mac에서 통합 설치를 선택할 수 있습니다. 메모리 기준은 보수적인 정책이며 실제 Mac 실행·품질은 미검증입니다.',status:'미설치'};
  });
}



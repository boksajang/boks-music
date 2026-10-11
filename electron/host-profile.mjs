import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {statfs} from 'node:fs/promises';
const exec=promisify(execFile);

// supported identifies an implemented host branch, never an installable bundle.
export function hostProfile(platform=process.platform,arch=process.arch){
  const windows=platform==='win32'&&arch==='x64',apple=platform==='darwin'&&arch==='arm64',intel=platform==='darwin'&&arch==='x64';
  return {platform,arch,key:windows?'win32-x64':apple?'darwin-arm64':intel?'darwin-x64':'unsupported',supported:windows||apple||intel,nativeBackend:windows?'cuda':apple?'metal':'cpu',stemDevice:windows?'cuda':apple?'mps':'cpu'};
}

export async function inspectHostSystem(storage,deps={}){
  const platform=deps.platform??process.platform,arch=deps.arch??process.arch,run=deps.exec??exec,host=deps.os??os,disk=deps.statfs??statfs;
  const profile=hostProfile(platform,arch);
  const system={os:`${host.type()} ${host.release()}`,cpu:host.cpus()[0]?.model||'확인 불가',ram:`${Math.round(host.totalmem()/2**30)} GB`,gpu:'확인 중',gpuVendor:'확인 불가',vram:'확인 불가',cuda:'확인 불가',platform,arch,runtimeKey:profile.key,nativeBackend:profile.nativeBackend,stemDevice:profile.stemDevice};
  if(platform==='darwin'){
    system.cuda='해당 없음';system.translated=false;
    try{const {stdout}=await run('/usr/bin/sw_vers',['-productVersion'],{timeout:5000});system.macOSVersion=stdout.trim();system.os=`macOS ${system.macOSVersion}`;}catch{system.macOSVersion='확인 불가';}
    try{const {stdout}=await run('/usr/sbin/sysctl',['-n','sysctl.proc_translated'],{timeout:5000});system.translated=stdout.trim()==='1';}catch{}
    try{const {stdout}=await run('/usr/sbin/system_profiler',['SPHardwareDataType','SPDisplaysDataType','-json'],{timeout:15000});const report=JSON.parse(stdout),hardware=report.SPHardwareDataType?.[0],display=report.SPDisplaysDataType?.[0];
      system.cpu=hardware?.chip_type||hardware?.cpu_type||system.cpu;
      system.gpu=display?.sppci_model||display?._name||'확인 불가';
      system.gpuVendor=/Apple/i.test(system.gpu+' '+(hardware?.chip_type||''))?'Apple':display?.spdisplays_vendor||'확인 불가';
      if(arch==='arm64'||system.translated||hardware?.chip_type){system.unifiedMemoryGB=host.totalmem()/2**30;system.vram=`통합 메모리 ${system.unifiedMemoryGB.toFixed(0)} GB`;}
      else system.vram=display?.spdisplays_vram||display?.spdisplays_vram_shared||'확인 불가';
      system.metal=display?.spdisplays_metal||display?.spdisplays_metalfamily||'확인 불가';
    }catch{system.gpu='macOS GPU 정보를 확인하지 못했습니다';}
    if(system.translated){system.runtimeKey='darwin-arm64';system.hardwareArch='arm64';system.arch='x64';system.archMessage='Rosetta로 실행 중입니다. 네이티브 arm64 앱과 런타임이 필요합니다.';}
  }else if(platform==='win32'){
    try{const {stdout}=await run('nvidia-smi',['--query-gpu=name,memory.total,driver_version','--format=csv,noheader,nounits'],{windowsHide:true,timeout:10000});const [name,memory,driver]=stdout.trim().split('\n')[0].split(',').map(x=>x.trim());Object.assign(system,{gpu:name,gpuVendor:'NVIDIA',vram:`${(Number(memory)/1024).toFixed(1)} GB`,vramMB:Number(memory),driver,cuda:'Windows CUDA 드라이버 확인됨'});}
    catch{system.gpu='NVIDIA GPU를 확인하지 못했습니다';try{const {stdout}=await run('powershell.exe',['-NoProfile','-Command','(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join ", "'],{windowsHide:true,timeout:10000});system.gpu=stdout.trim();}catch{}}
    if(system.gpuVendor==='NVIDIA')try{const {stdout}=await run('nvidia-smi',['--query-gpu=compute_cap','--format=csv,noheader'],{windowsHide:true,timeout:5000});system.computeCapability=stdout.trim().split('\n')[0];system.bf16=Number.parseFloat(system.computeCapability)>=8?'하드웨어 지원':'하드웨어 미지원';}catch{system.bf16='확인 불가';}
  }else system.gpu='지원하지 않는 운영체제입니다';
  try{const value=await disk(storage);system.freeSpace=`${Math.floor(value.bavail*value.bsize/2**30)} GB`;}catch{system.freeSpace='확인 불가';}
  return system;
}


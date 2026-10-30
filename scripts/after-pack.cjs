// electron-builder afterPack: removes Chromium files the app never loads, before the installer is made.
// dxcompiler.dll / dxil.dll compile shaders only for WebGPU, which Boks Music does not use (scenes are canvas 2D
// with WebCodecs). SwiftShader stays as the software fallback, and the Chromium licence file must ship.
const {rm}=require('node:fs/promises');
const path=require('node:path');

exports.default=async context=>{
  if(context.electronPlatformName!=='win32')return;
  for(const name of ['dxcompiler.dll','dxil.dll'])await rm(path.join(context.appOutDir,name),{force:true});
};

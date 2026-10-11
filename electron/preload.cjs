const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('boks',Object.freeze({
  invoke:async(method,payload)=>{const response=await ipcRenderer.invoke('boks:invoke',method,payload);if(!response.ok)throw new Error(response.error);return response.data;},
  onUpdate:callback=>{const handler=()=>callback();ipcRenderer.on('boks:update',handler);return()=>ipcRenderer.removeListener('boks:update',handler);},
  onBeforeClose:callback=>{const handler=async()=>{try{await callback();ipcRenderer.send('boks:close-ready',true);}catch{ipcRenderer.send('boks:close-ready',false);}};ipcRenderer.on('boks:prepare-close',handler);return()=>ipcRenderer.removeListener('boks:prepare-close',handler);},
  windowControl:action=>ipcRenderer.send('boks:window',action)
}));

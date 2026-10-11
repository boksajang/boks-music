export function createVideoComposition(config?:{tracks?:Record<string,any>[];options?:Record<string,any>;duration?:number;assets?:Record<string,any>}):string;

export function mountVideoPreview(host:HTMLElement,config?:{tracks?:Record<string,any>[];options?:Record<string,any>;duration?:number;assets?:Record<string,any>}):{ready:Promise<any>;renderFrame:(time:number)=>Promise<void>;dispose:()=>void};

export function interpolateAnalysisFrame(analysis:any,time:number,fallbackFps?:number):{bins:number[];waveform:number[]}|undefined;

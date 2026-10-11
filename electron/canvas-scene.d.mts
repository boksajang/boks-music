export const CANVAS_SCENES: readonly string[];

export function createCanvasScene(input:{scene:string;width:number;height:number;tracks:Record<string,any>[];options:Record<string,any>;images:{background:CanvasImageSource|null;arts:(CanvasImageSource|null)[]};analyses:any[]}):{draw:(ctx:CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D,time:number)=>void;duration:number};

export function mountCanvasPreview(host:HTMLElement,config?:{scene:string;tracks?:Record<string,any>[];options?:Record<string,any>;duration?:number;assets?:Record<string,any>}):{ready:Promise<void>;dispose:()=>void};

export function unpackAnalysis(item:any):any;

export function drawSpectrum(ctx:CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D,input:{kind?:string;bins?:number[];waveform?:number[];color?:string;x:number;y:number;width:number;height:number}):void;

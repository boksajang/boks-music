/// <reference types="vite/client" />
interface Window {
  boks?: {
    invoke: (method: string, payload?: unknown) => Promise<any>;
    onUpdate: (callback: () => void) => () => void;
    onProgress: (callback: (value: { id: string; status?: string; stage?: string; progress?: number; eta?: number; speed?: number; tokens?: number }) => void) => () => void;
    onBeforeClose: (callback: () => Promise<void>) => () => void;
    windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
  };
}

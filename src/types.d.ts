/// <reference types="vite/client" />
interface Window {
  boks?: {
    invoke: (method: string, payload?: unknown) => Promise<any>;
    onUpdate: (callback: () => void) => () => void;
    onBeforeClose: (callback: () => Promise<void>) => () => void;
    windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
  };
}

// App entry. The same executable also serves as the GPU video render process (see canvas-render.mjs),
// which must not start the app itself (no single-instance lock, windows or library).
if(process.argv.includes('--boks-canvas-render'))await import('./canvas-render-process.mjs');
else await import('./main.mjs');

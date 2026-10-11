import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import electron from 'electron';
const server = await createServer();
await server.listen();
const child = spawn(electron, ['.'], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'], env: { ...process.env, BOKS_DEV_URL: 'http://127.0.0.1:5173' } });
let closed = false;
async function finish(code) {
  if (closed) return;
  closed = true;
  await server.close();
  process.exit(code ?? 0);
}
child.on('error', error => { console.error('Electron을 실행하지 못했습니다:', error.message); void finish(1); });
child.on('exit', code => void finish(code));
function requestQuit() {
  if (closed || !child.connected) return;
  child.send('boks:quit', error => { if (error && !closed) console.error('종료 요청을 전달하지 못했습니다:', error.message); });
}
process.on('SIGINT', requestQuit);
process.on('SIGTERM', requestQuit);

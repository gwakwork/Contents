import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['--watch', 'server/index.mjs'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
];
let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
process.on('SIGINT', () => close());
process.on('SIGTERM', () => close());
for (const child of children) {
  child.on('error', (error) => {
    console.error(error);
    close(1);
  });
  child.on('exit', (code, signal) => {
    if (!closing) close(code ?? (signal ? 1 : 0));
  });
}

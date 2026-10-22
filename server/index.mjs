import { resolve } from 'node:path';
import { createApplication } from './app.mjs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const { app, close } = createApplication({
  dbPath:
    process.env.DATA_PATH ||
    (process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support', 'MoaContentStudio', 'studio.sqlite')
      : resolve('data/studio.sqlite')),
});
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const server = app.listen(port, host, () =>
  console.log(`MOA studio is listening on ${host}:${port}`),
);
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  server.close(async () => {
    await close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

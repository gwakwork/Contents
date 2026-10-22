import { resolve } from 'node:path';
import { createApplication } from './app.mjs';

const { app, store } = createApplication({
  dbPath: process.env.DATA_PATH || resolve('data/studio.sqlite'),
});
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const server = app.listen(port, host, () =>
  console.log(`MOA studio is listening on ${host}:${port}`),
);
function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

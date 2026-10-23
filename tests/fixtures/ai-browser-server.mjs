// Test-only upstream. The production server never enables this fixture.
import { createApplication } from '../../server/app.mjs';
import { responseFor, envelope } from './mock-ai.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'moa-ai-browser-'));
const local = createApplication({
  dbPath: join(directory, 'studio.sqlite'),
  environmentKey: '',
  environmentModel: '',
  aiFetch: async (_url, init) => {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 150);
      init.signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new DOMException('Cancelled', 'AbortError'));
        },
        { once: true },
      );
    });
    const input = JSON.parse(JSON.parse(init.body).input);
    if (input.source.includes('한도 오류 테스트'))
      return Response.json({ error: { message: 'test upstream limit' } }, { status: 429 });
    return Response.json(envelope(responseFor(input)));
  },
});
const server = local.app.listen(Number(process.env.PORT || 3102), '127.0.0.1');
async function shutdown() {
  await local.close();
  server.close(() => {
    rmSync(directory, { recursive: true, force: true });
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

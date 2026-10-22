import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { createApplication } from '../server/app.mjs';
import { createStore } from '../server/store.mjs';
import { FORMULAS } from '../server/ai.mjs';
import { createContent } from '../server/domain.mjs';
import { responseFor, envelope } from './fixtures/mock-ai.mjs';

const KEY = 'sk-test-only-never-a-real-key';
const input = {
  source: '매주 수요일에 동네 독서 모임을 엽니다. 참가비는 없습니다.',
  formula: 'aida',
  tone: 'friendly',
  length: 'short',
  channels: ['website', 'instagram', 'threads'],
  customFormula: '',
  audience: '동네 주민',
  instructions: '참가비를 정확히 써 주세요.',
};
async function instance(t, options = {}) {
  const dir = options.dir || mkdtempSync(join(tmpdir(), 'moa-ai-test-'));
  if (!options.dir) t.after(() => rmSync(dir, { recursive: true, force: true }));
  const calls = [];
  const upstream = createServer(async (req, res) => {
    let raw = '';
    for await (const part of req) raw += part;
    const payload = JSON.parse(raw);
    calls.push({ payload, authorization: req.headers.authorization, path: req.url });
    if (options.delay) await new Promise((resolve) => setTimeout(resolve, options.delay));
    res.writeHead(options.status || 200, { 'Content-Type': 'application/json' });
    res.end(
      options.raw ??
        JSON.stringify(options.output ?? envelope(responseFor(JSON.parse(payload.input)))),
    );
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const local = createApplication({
    dbPath: join(dir, 'studio.sqlite'),
    settingsFile: join(dir, 'ai-settings.json'),
    environmentKey: '',
    environmentModel: '',
    aiFetch: (url, init) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      return fetch(`http://127.0.0.1:${upstream.address().port}${new URL(url).pathname}`, init);
    },
  });
  const server = local.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await local.close();
    await new Promise((resolve) => server.close(resolve));
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  };
  t.after(stop);
  async function request(path, method = 'GET', value, headers = {}) {
    if (headers.Host)
      return new Promise((resolve, reject) => {
        const req = httpRequest(
          `http://127.0.0.1:${server.address().port}/api${path}`,
          { method, headers },
          (res) => {
            let raw = '';
            res.on('data', (part) => {
              raw += part;
            });
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
          },
        );
        req.on('error', reject);
        req.end();
      });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: value === undefined ? undefined : JSON.stringify(value),
    });
    return {
      status: response.status,
      body: response.status === 204 ? null : await response.json(),
    };
  }
  async function configure() {
    return request('/ai/settings', 'PUT', { apiKey: KEY, model: 'gpt-4.1-mini' });
  }
  async function start(value = input, id = randomUUID()) {
    return request('/ai/generations', 'POST', { ...value, requestId: id });
  }
  async function finish(id) {
    for (let n = 0; n < 200; n++) {
      const run = (await request(`/ai/generations/${id}`)).body;
      if (run.status !== 'running') return run;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('AI job did not finish in the expected test time');
  }
  return { dir, calls, request, configure, start, finish, stop };
}

test('real Responses HTTP contract, every formula, private key storage, and review-first adoption', async (t) => {
  const app = await instance(t);
  assert.equal((await app.start()).status, 409);
  assert.equal((await app.configure()).status, 200);
  assert.equal(app.calls.length, 0, 'saving credentials must not make a paid request');
  assert.equal(statSync(join(app.dir, 'ai-settings.json')).mode & 0o777, 0o600);
  for (const formula of FORMULAS) {
    const value = {
      ...input,
      formula: formula.id,
      customFormula: formula.id === 'custom' ? '공감 → 안내' : '',
    };
    const started = await app.start(value);
    assert.equal(started.status, 202);
    const run = await app.finish(started.body.id);
    assert.equal(run.status, 'completed', run.error);
    const call = app.calls.at(-1);
    assert.equal(call.path, '/v1/responses');
    assert.equal(call.authorization, `Bearer ${KEY}`);
    assert.equal(call.payload.store, false);
    assert.equal(call.payload.text.format.type, 'json_schema');
    assert.equal(call.payload.text.format.strict, true);
    assert.deepEqual(JSON.parse(call.payload.input), value);
    assert.equal(run.usage.inputTokens, 123);
  }
  const run = (await app.request('/ai/generations')).body[0];
  let content = (await app.request(`/ai/generations/${run.id}/adopt`, 'POST', {})).body;
  assert.equal(content.status, 'review');
  assert.equal(content.approval, null);
  assert.equal(content.aiSource.source, input.source);
  assert.equal(
    (await app.request(`/ai/generations/${run.id}/adopt`, 'POST', {})).body.id,
    content.id,
  );
  assert.equal((await app.request('/contents')).body.length, 1);
  assert.equal(
    (
      await app.request(`/contents/${content.id}/actions`, 'POST', {
        revision: content.revision,
        action: 'approve',
        checks: {},
      })
    ).status,
    400,
  );
  content = (
    await app.request(`/contents/${content.id}/actions`, 'POST', {
      revision: content.revision,
      action: 'approve',
      checks: { accuracy: true, rights: true, channels: true },
    })
  ).body;
  assert.equal(content.status, 'approved');
  content = (
    await app.request(`/contents/${content.id}`, 'PUT', { ...content, title: '다시 검토할 제목' })
  ).body;
  assert.equal(content.status, 'draft');
  assert.equal(content.approval, null);
  assert.equal(content.aiSource.source, input.source);
  const backup = (await app.request('/backup')).body;
  assert.equal(backup.contents[0].aiSource.source, input.source);
  for (const path of [
    '/ai/settings',
    '/ai/generations',
    `/ai/generations/${run.id}`,
    '/contents',
    '/backup',
  ])
    assert.ok(!JSON.stringify((await app.request(path)).body).includes(KEY), path);
  assert.equal((await app.request('/backup', 'POST', backup)).body.skipped, 1);
  await app.request('/ai/settings', 'DELETE', {});
  assert.equal((await app.request('/ai/settings')).body.configured, false);
  assert.ok(!readFileSync(join(app.dir, 'ai-settings.json'), 'utf8').includes(KEY));
});

test('same request ID is idempotent; concurrent and changed requests cannot double-charge; cancellation persists', async (t) => {
  const app = await instance(t, { delay: 200 });
  await app.configure();
  const id = randomUUID();
  assert.equal((await app.start(input, id)).status, 202);
  assert.equal((await app.start(input, id)).status, 202);
  assert.equal((await app.start({ ...input, source: '다른 원문' }, id)).status, 409);
  assert.equal((await app.start()).status, 409);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(app.calls.length, 1);
  const cancelled = await app.request(`/ai/generations/${id}/cancel`, 'POST', {});
  assert.equal(cancelled.body.status, 'cancelled');
  assert.equal((await app.start(input, id)).body.status, 'cancelled');
  assert.equal((await app.request(`/ai/generations/${id}/adopt`, 'POST', {})).status, 409);
  assert.equal(app.calls.length, 1);
});

for (const scenario of [
  { name: '401 credential error', status: 401, output: { error: { message: KEY } } },
  { name: '429 limit without automatic retry', status: 429, output: {} },
  { name: 'invalid JSON', raw: 'not json' },
  { name: 'incomplete response', output: { status: 'incomplete', output: [] } },
  {
    name: 'model refusal',
    output: {
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'refusal', refusal: KEY }] }],
    },
  },
  {
    name: 'wrong formula stages',
    output: envelope({
      ...responseFor(input),
      formulaSteps: [{ stage: '잘못된 순서', summary: '오류' }],
    }),
  },
  {
    name: 'overlong Threads result',
    output: envelope({ ...responseFor(input), threads: '가'.repeat(501) }),
  },
])
  test(`AI failure is safe: ${scenario.name}`, async (t) => {
    const app = await instance(t, scenario);
    await app.configure();
    const started = await app.start();
    const run = await app.finish(started.body.id);
    assert.equal(run.status, 'failed');
    assert.equal(run.result, null);
    assert.ok(!run.error.includes(KEY));
    assert.equal((await app.request('/contents')).body.length, 0);
    assert.equal((await app.start(input, run.id)).body.status, 'failed');
    assert.equal(app.calls.length, 1);
  });

test('persisted results and keys survive restart; unfinished jobs become interrupted without a request', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'moa-ai-restart-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const first = await instance(t, { dir });
  await first.configure();
  const done = await first.finish((await first.start()).body.id);
  await first.stop();
  const db = createStore(join(dir, 'studio.sqlite'));
  const id = randomUUID();
  db.saveGeneration({ ...done, id, status: 'running', result: null });
  db.close();
  const next = await instance(t, { dir });
  assert.equal((await next.request('/ai/settings')).body.configured, true);
  assert.deepEqual((await next.request(`/ai/generations/${done.id}`)).body, done);
  assert.equal((await next.request(`/ai/generations/${id}`)).body.status, 'interrupted');
  assert.equal(next.calls.length, 0);
});

test('legacy offline backups migrate atomically, preserve current work, and retain AI source on copies', async (t) => {
  const app = await instance(t);
  const original = createContent({
    title: '이전 HTML 원고',
    body: '기존에 작성한 내용',
    channels: ['website'],
    color: 'sage',
  });
  const backup = { format: 'moa-content-backup', version: 1, contents: [original] };
  assert.equal((await app.request('/backup', 'POST', backup)).body.added, 1);
  assert.equal((await app.request('/backup', 'POST', backup)).body.skipped, 1);
  const changed = { ...backup, contents: [{ ...original, title: '다른 내용' }] };
  assert.equal((await app.request('/backup', 'POST', changed)).body.copies, 1);
  const current = (await app.request('/contents')).body;
  assert.equal(current.find((c) => c.id === original.id).title, original.title);
  assert.equal(current.find((c) => c.id !== original.id).status, 'draft');
  const invalid = {
    ...backup,
    contents: [
      { ...original, id: randomUUID() },
      { ...original, id: 'invalid' },
    ],
  };
  assert.equal((await app.request('/backup', 'POST', invalid)).status, 400);
  assert.equal((await app.request('/contents')).body.length, 2);
});

test('API key mutations reject foreign origins, DNS rebinding hosts, and invalid settings', async (t) => {
  const app = await instance(t);
  assert.equal(
    (
      await app.request(
        '/ai/settings',
        'PUT',
        { model: 'gpt-4.1-mini', apiKey: KEY },
        { Origin: 'https://evil.invalid' },
      )
    ).status,
    403,
  );
  assert.equal(
    (await app.request('/ai/settings', 'GET', undefined, { Host: 'evil.invalid' })).status,
    403,
  );
  assert.equal(
    (await app.request('/ai/settings', 'PUT', { model: '../bad', apiKey: KEY })).status,
    400,
  );
  assert.equal(
    (await app.request('/ai/settings', 'PUT', { model: 'gpt-4.1-mini', apiKey: 'x' })).status,
    400,
  );
  assert.equal(app.calls.length, 0);
});

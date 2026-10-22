import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../server/app.mjs';

const fields = {
  title: '우리의 첫 번째 이야기',
  body: '검토 후 발행할 콘텐츠입니다.',
  excerpt: '첫 소식',
  channels: ['website', 'instagram'],
  color: 'sage',
  variants: { instagram: '인스타그램용 짧은 원고', threads: '' },
};
const checks = { accuracy: true, rights: true, channels: true };
async function instance(t, dbPath = ':memory:') {
  const { app, store } = createApplication({ dbPath });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const stop = async () => {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  };
  let stopped = false;
  const close = async () => {
    if (!stopped) {
      stopped = true;
      await stop();
    }
  };
  t.after(close);
  async function request(path, method = 'GET', body, headers = {}) {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: response.status === 204 ? null : await response.json(),
    };
  }
  return { request, close };
}

test('draft → review → changes → edit → review → approval → export; never uploads', async (t) => {
  const { request } = await instance(t);
  const created = await request('/contents', 'POST', fields);
  assert.equal(created.status, 201);
  let content = created.body;
  assert.equal(content.status, 'draft');
  assert.equal((await request(`/contents/${content.id}/export`)).status, 409);
  assert.equal(
    (
      await request(`/contents/${content.id}/actions`, 'POST', {
        revision: content.revision,
        action: 'approve',
        checks,
      })
    ).status,
    409,
  );
  content = (
    await request(`/contents/${content.id}/actions`, 'POST', {
      revision: content.revision,
      action: 'submit',
    })
  ).body;
  assert.equal(content.status, 'review');
  assert.equal(
    (
      await request(`/contents/${content.id}/actions`, 'POST', {
        revision: content.revision,
        action: 'approve',
        checks: { accuracy: true },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/contents/${content.id}/actions`, 'POST', {
        revision: content.revision,
        action: 'request_changes',
        message: '  ',
      })
    ).status,
    400,
  );
  content = (
    await request(`/contents/${content.id}/actions`, 'POST', {
      revision: content.revision,
      action: 'request_changes',
      message: '마지막 문장을 더 쉽게 써 주세요.',
    })
  ).body;
  assert.equal(content.status, 'changes');
  content = (
    await request(`/contents/${content.id}`, 'PUT', {
      ...fields,
      body: '조금 더 쉽게 다듬은 본문입니다.',
      revision: content.revision,
    })
  ).body;
  assert.equal(content.status, 'draft');
  content = (
    await request(`/contents/${content.id}/actions`, 'POST', {
      revision: content.revision,
      action: 'submit',
    })
  ).body;
  content = (
    await request(`/contents/${content.id}/actions`, 'POST', {
      revision: content.revision,
      action: 'approve',
      checks,
    })
  ).body;
  assert.equal(content.status, 'approved');
  assert.equal(content.approval.revision, content.revision);
  assert.deepEqual(content.approval.checks, checks);
  const exported = await request(`/contents/${content.id}/export`);
  assert.equal(exported.status, 200);
  assert.equal(
    exported.body.targets.find((target) => target.channel === 'instagram').body,
    fields.variants.instagram,
  );
  assert.equal(
    exported.body.targets.find((target) => target.channel === 'website').body,
    content.body,
  );
  assert.equal((await request(`/contents/${content.id}/publish`, 'POST', {})).status, 409);
  const approvedBody = content.body;
  content = (
    await request(`/contents/${content.id}/actions`, 'POST', {
      revision: content.revision,
      action: 'note',
      message: '최종 확인 완료',
    })
  ).body;
  assert.equal(content.status, 'approved');
  assert.equal(content.body, approvedBody);
  content = (
    await request(`/contents/${content.id}`, 'PUT', {
      ...fields,
      title: '승인 이후 수정한 제목',
      revision: content.revision,
    })
  ).body;
  assert.equal(content.status, 'draft');
  assert.equal(content.approval, null);
  assert.equal(content.approvedAt, null);
  assert.equal((await request(`/contents/${content.id}/export`)).status, 409);
  assert.deepEqual(
    content.history.map((event) => event.action),
    [
      'created',
      'submitted',
      'changes_requested',
      'edited',
      'submitted',
      'approved',
      'note',
      'edited',
    ],
  );
});

test('stale revisions cannot overwrite, approve, or delete newer work', async (t) => {
  const { request } = await instance(t);
  const original = (await request('/contents', 'POST', fields)).body;
  const saved = (
    await request(`/contents/${original.id}`, 'PUT', { ...fields, title: '새 원고', revision: 1 })
  ).body;
  assert.equal(saved.revision, 2);
  assert.equal(
    (await request(`/contents/${original.id}`, 'PUT', { ...fields, revision: 1 })).status,
    409,
  );
  assert.equal(
    (await request(`/contents/${original.id}/actions`, 'POST', { action: 'submit', revision: 1 }))
      .status,
    409,
  );
  assert.equal((await request(`/contents/${original.id}`, 'DELETE', { revision: 1 })).status, 409);
  assert.equal((await request(`/contents/${original.id}`)).body.title, '새 원고');
});

test('invalid content and over-limit social copy cannot enter review', async (t) => {
  const { request } = await instance(t);
  for (const invalid of [
    { ...fields, title: ' ' },
    { ...fields, channels: [] },
    { ...fields, channels: ['unknown'] },
    { ...fields, title: 'a'.repeat(161) },
    { ...fields, variants: { threads: 'a'.repeat(501) } },
  ]) {
    assert.equal((await request('/contents', 'POST', invalid)).status, 400);
  }
  assert.equal((await request('/contents', 'POST', null)).status, 400);
  assert.equal((await request('/contents', 'POST', [])).status, 400);
  const empty = (await request('/contents', 'POST', { ...fields, body: '' })).body;
  assert.equal(
    (
      await request(`/contents/${empty.id}/actions`, 'POST', {
        action: 'submit',
        revision: empty.revision,
      })
    ).status,
    400,
  );
  const tooLong = (
    await request('/contents', 'POST', {
      ...fields,
      body: '글'.repeat(501),
      channels: ['threads'],
      variants: {},
    })
  ).body;
  assert.equal(
    (
      await request(`/contents/${tooLong.id}/actions`, 'POST', {
        action: 'submit',
        revision: tooLong.revision,
      })
    ).status,
    400,
  );
  const fixed = (
    await request(`/contents/${tooLong.id}`, 'PUT', {
      ...tooLong,
      variants: { threads: '짧게 다듬은 원고' },
    })
  ).body;
  assert.equal(
    (
      await request(`/contents/${fixed.id}/actions`, 'POST', {
        action: 'submit',
        revision: fixed.revision,
      })
    ).status,
    200,
  );
});

test('data and approval history survive closing and reopening SQLite', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'moa-persistence-'));
  const dbPath = join(directory, 'studio.sqlite');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const first = await instance(t, dbPath);
  let content = (await first.request('/contents', 'POST', fields)).body;
  content = (
    await first.request(`/contents/${content.id}/actions`, 'POST', {
      revision: content.revision,
      action: 'submit',
    })
  ).body;
  content = (
    await first.request(`/contents/${content.id}/actions`, 'POST', {
      revision: content.revision,
      action: 'approve',
      checks,
    })
  ).body;
  await first.close();
  const second = await instance(t, dbPath);
  assert.deepEqual((await second.request(`/contents/${content.id}`)).body, content);
  assert.equal((await second.request(`/contents/${content.id}/export`)).status, 200);
  await second.close();
});

test('examples are opt-in, labeled, and removable without deleting real work', async (t) => {
  const { request } = await instance(t);
  assert.deepEqual((await request('/contents')).body, []);
  await request('/contents', 'POST', fields);
  const seeded = await request('/examples', 'POST', {});
  assert.equal(seeded.status, 201);
  assert.equal(seeded.body.filter((content) => content.isExample).length, 6);
  assert.equal((await request('/examples', 'POST', {})).status, 409);
  assert.equal((await request('/examples', 'DELETE', {})).body.removed, 6);
  const remaining = (await request('/contents')).body;
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].isExample, false);
});

test('cross-site and malformed-origin writes are rejected; channels stay disconnected', async (t) => {
  const { request } = await instance(t);
  assert.equal(
    (await request('/contents', 'POST', fields, { Origin: 'https://elsewhere.invalid' })).status,
    403,
  );
  assert.equal((await request('/contents', 'POST', fields, { Origin: 'null' })).status, 403);
  assert.equal(
    (await request('/contents', 'POST', fields, { 'Sec-Fetch-Site': 'cross-site' })).status,
    403,
  );
  const channels = await request('/channels');
  assert.equal(channels.body.length, 3);
  assert.ok(channels.body.every((channel) => channel.connected === false));
  assert.equal((await request('/contents/missing')).status, 404);
});

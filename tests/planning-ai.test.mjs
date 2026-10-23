import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApplication } from '../server/app.mjs';
import { planToBrief } from '../server/planning.mjs';
import { responseFor, envelope } from './fixtures/mock-ai.mjs';

const fields = {
  topic: '무료 독서 모임 안내',
  purpose: 'education',
  metric: 'understanding',
  target: '',
  timeframe: '7d',
  audience: '이 주제를 처음 접하는 사람',
  awareness: 'unaware',
  need: '일정과 참가 방법을 이해하고 싶다',
  message: '매주 수요일에는 참가비 없이 함께 책을 읽을 수 있다.',
  angle: '핵심 정보 정리',
  evidence:
    '운영 메모: 매주 수요일에 동네 독서 모임을 엽니다. 참가비는 없습니다. 장소는 확인이 필요합니다.',
  objection: '어디에서 어떻게 참가하나요?',
  action: '자세한 내용을 확인하기',
  channels: ['website', 'threads'],
  format: 'article',
  tone: 'friendly',
  formula: 'information',
  customFormula: '',
  length: 'short',
  trigger: '필요한 자료를 확인하면',
  nextStep: '기획안을 바탕으로 첫 초안을 작성한다',
  checks: { specific: true, audience: true, evidence: true, feasible: true },
};
async function instance(t) {
  const directory = mkdtempSync(join(tmpdir(), 'narrative-plan-ai-'));
  const calls = [];
  const local = createApplication({
    dbPath: join(directory, 'studio.sqlite'),
    environmentKey: 'sk-test-only-no-real-plan-key',
    environmentModel: '',
    aiFetch: async (url, init) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      const payload = JSON.parse(init.body);
      const input = JSON.parse(payload.input);
      calls.push({ payload, input });
      return Response.json(envelope(responseFor(input)));
    },
  });
  const server = local.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await local.close();
    await new Promise((resolve) => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  });
  async function request(path, method = 'GET', data) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return {
      status: response.status,
      body: response.status === 204 ? null : await response.json(),
    };
  }
  async function ready() {
    const draft = (await request('/plans', 'POST', { fields })).body;
    const result = await request(`/plans/${draft.id}/complete`, 'POST', {
      revision: draft.revision,
    });
    assert.equal(result.status, 200);
    return result.body;
  }
  async function finish(id) {
    for (let n = 0; n < 100; n++) {
      const value = (await request(`/ai/generations/${id}`)).body;
      if (value.status !== 'running') return value;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('AI job did not finish');
  }
  return { request, ready, finish, calls };
}

test('confirmed creative brief reaches the model as an immutable snapshot and requires intent review', async (t) => {
  const app = await instance(t);
  const plan = await app.ready();
  assert.equal(app.calls.length, 0, 'planning must not contact OpenAI');
  const brief = planToBrief(plan);
  const generated = await app.request('/ai/generations', 'POST', {
    ...brief,
    requestId: randomUUID(),
    planning: { fields: { purpose: 'action', target: '가짜 목표' } },
  });
  assert.equal(generated.status, 202);
  const run = await app.finish(generated.body.id);
  assert.equal(run.status, 'completed', run.error);
  assert.deepEqual(run.input.planning, plan);
  assert.deepEqual(app.calls[0].input.planning, plan);
  assert.match(app.calls[0].payload.instructions, /미래의 확인 계획/);
  assert.match(app.calls[0].payload.instructions, /가짜 후기/);
  assert.equal(app.calls[0].input.planning.fields.target, '');
  let content = (await app.request(`/ai/generations/${run.id}/adopt`, 'POST', {})).body;
  assert.deepEqual(content.planning, plan);
  assert.equal(content.status, 'review');
  const threeChecks = { accuracy: true, rights: true, channels: true };
  assert.equal(
    (
      await app.request(`/contents/${content.id}/actions`, 'POST', {
        revision: content.revision,
        action: 'approve',
        checks: threeChecks,
      })
    ).status,
    400,
  );
  content = (
    await app.request(`/contents/${content.id}/actions`, 'POST', {
      revision: content.revision,
      action: 'approve',
      checks: { ...threeChecks, intent: true },
    })
  ).body;
  assert.equal(content.status, 'approved');
  assert.equal(content.approval.checks.intent, true);
  const backup = (await app.request('/backup')).body;
  assert.deepEqual(backup.contents[0].planning, plan);
  assert.deepEqual(backup.plans[0], plan);
  assert.equal((await app.request('/backup', 'POST', backup)).status, 200);
  const invalid = structuredClone(backup);
  delete invalid.contents[0].approval.checks.intent;
  assert.equal((await app.request('/backup', 'POST', invalid)).status, 400);
  await app.request(`/plans/${plan.id}`, 'DELETE', { revision: plan.revision });
  assert.deepEqual(
    (await app.request(`/contents/${content.id}`)).body.planning,
    plan,
    'deleting live plan must preserve original creative brief',
  );
});

test('changed or incomplete plans block new paid calls; idempotent job recovery still works', async (t) => {
  const app = await instance(t);
  const plan = await app.ready();
  const brief = planToBrief(plan);
  const id = randomUUID();
  const started = await app.request('/ai/generations', 'POST', { ...brief, requestId: id });
  await app.finish(started.body.id);
  const updated = await app.request(`/plans/${plan.id}`, 'PUT', {
    revision: plan.revision,
    fields: { message: '수정한 핵심 메시지' },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.status, 'draft');
  const stale = await app.request('/ai/generations', 'POST', { ...brief, requestId: randomUUID() });
  assert.equal(stale.status, 409);
  const incomplete = await app.request('/ai/generations', 'POST', {
    ...brief,
    planRevision: updated.body.revision,
    requestId: randomUUID(),
  });
  assert.equal(incomplete.status, 409);
  const recovered = await app.request('/ai/generations', 'POST', { ...brief, requestId: id });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.status, 'completed');
  assert.equal(app.calls.length, 1);
  const missing = await app.request('/ai/generations', 'POST', {
    ...brief,
    planId: randomUUID(),
    requestId: randomUUID(),
  });
  assert.equal(missing.status, 409);
  const malformed = await app.request('/ai/generations', 'POST', {
    ...brief,
    planRevision: 0,
    requestId: randomUUID(),
  });
  assert.equal(malformed.status, 400);
  assert.equal(app.calls.length, 1);
});

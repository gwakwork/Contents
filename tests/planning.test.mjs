import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../server/app.mjs';
import { PLANNING_FIELDS } from './fixtures/planning-fields.mjs';
import { createContent, transition } from '../server/domain.mjs';
import { createBackup, validateBackup } from '../server/backup.mjs';
import {
  createPlan,
  updatePlan,
  completePlan,
  planReadiness,
  planToBrief,
  validateStoredPlan,
} from '../server/planning.mjs';

async function instance(t, dbPath = ':memory:') {
  const local = createApplication({ dbPath, environmentKey: '', environmentModel: '' });
  const server = local.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  let stopped = false;
  const close = async () => {
    if (stopped) return;
    stopped = true;
    await local.close();
    await new Promise((resolve) => server.close(resolve));
  };
  t.after(close);
  async function request(path, method = 'GET', body, headers = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: response.status === 204 ? null : await response.json(),
    };
  }
  return { request, store: local.store, close };
}

test('planning drafts start without a purpose or invented numeric target; meaningful readiness covers all stages', () => {
  const empty = createPlan();
  assert.equal(empty.fields.purpose, '');
  assert.equal(empty.fields.target, '');
  assert.equal(empty.fields.formula, '');
  assert.equal(planReadiness(empty).progress, 0);
  assert.equal(planReadiness(empty).complete, false);
  assert.throws(() => completePlan(empty), { status: 409 });
  const partial = updatePlan(empty, {
    step: 3,
    fields: {
      topic: PLANNING_FIELDS.topic,
      purpose: 'education',
      metric: 'understanding',
      timeframe: '7d',
    },
  });
  const readiness = planReadiness(partial);
  assert.equal(readiness.completedSteps, 1);
  assert.equal(readiness.totalSteps, 6);
  assert.equal(readiness.steps[0].complete, true);
  assert.equal(
    partial.step,
    3,
    'drafts may save a later active stage without falsely completing earlier stages',
  );
  const ready = completePlan(createPlan({ fields: PLANNING_FIELDS }));
  assert.equal(ready.status, 'ready');
  assert.equal(planReadiness(ready).progress, 100);
  assert.equal(ready.fields.target, '');
  assert.equal(completePlan(ready), ready, 'complete is idempotent for an unchanged ready plan');
});

test('goal changes expose incompatible metrics and substantive edits invalidate confirmations; navigation does not', () => {
  const ready = completePlan(createPlan({ fields: PLANNING_FIELDS }));
  const navigation = updatePlan(ready, { step: 1 });
  assert.equal(navigation.status, 'ready');
  assert.deepEqual(navigation.fields.checks, ready.fields.checks);
  const changed = updatePlan(ready, {
    fields: { purpose: 'action', message: '수정된 핵심 메시지' },
  });
  assert.equal(changed.status, 'draft');
  assert.equal(changed.completedAt, null);
  assert.ok(Object.values(changed.fields.checks).every((v) => v === false));
  assert.ok(planReadiness(changed).steps[0].missing.includes('목적에 맞는 확인 기준'));
  const ownCriterion = updatePlan(changed, {
    fields: { metric: 'custom', target: '댓글에 참여 방법을 정확히 설명한 사례가 있는지 확인' },
  });
  assert.equal(planReadiness(ownCriterion).steps[0].complete, true);
  assert.equal(
    planReadiness(updatePlan(changed, { fields: { metric: 'custom' } })).steps[0].complete,
    false,
  );
});

test('planning input and backup metadata are sanitized; malformed enums and fields cannot be stored', () => {
  const plan = createPlan({
    fields: {
      ...PLANNING_FIELDS,
      apiKey: 'not-a-real-secret',
      checks: { ...PLANNING_FIELDS.checks, unknown: true },
    },
    status: 'ready',
    revision: 999,
    apiKey: 'private',
  });
  assert.equal(plan.status, 'draft');
  assert.equal(plan.revision, 1);
  assert.equal(plan.fields.apiKey, undefined);
  assert.equal(plan.apiKey, undefined);
  assert.equal(plan.fields.checks.unknown, undefined);
  for (const fields of [
    { purpose: 'invalid' },
    { topic: '가'.repeat(161) },
    { channels: ['invalid'] },
    { channels: 'website' },
    { checks: { evidence: 'yes' } },
  ])
    assert.throws(() => createPlan({ fields }), { status: 400 });
  assert.throws(() => createPlan({ step: 6 }), { status: 400 });
  const ready = completePlan(plan);
  assert.deepEqual(
    validateStoredPlan({
      ...ready,
      apiKey: 'not-copied',
      fields: { ...ready.fields, apiKey: 'not-copied' },
    }),
    ready,
  );
  assert.throws(() => validateStoredPlan({ ...ready, fields: { ...ready.fields, message: '' } }), {
    status: 400,
  });
  assert.throws(() => validateStoredPlan({ ...ready, revision: Number.MAX_SAFE_INTEGER + 1 }), {
    status: 400,
  });
});

test('ready plans produce a factual AI brief with one objective and no manufactured outcomes', () => {
  const plan = completePlan(
    createPlan({ fields: { ...PLANNING_FIELDS, target: '첫 발행 반응을 기록해 기준을 만든다' } }),
  );
  const brief = planToBrief(plan);
  assert.equal(brief.planId, plan.id);
  assert.equal(brief.planRevision, plan.revision);
  assert.equal(brief.formula, 'information');
  assert.equal(brief.audience, PLANNING_FIELDS.audience);
  assert.deepEqual(brief.channels, PLANNING_FIELDS.channels);
  assert.ok(brief.source.includes(PLANNING_FIELDS.message));
  assert.ok(brief.source.includes(PLANNING_FIELDS.evidence));
  assert.ok(brief.instructions.includes(PLANNING_FIELDS.need));
  assert.ok(brief.instructions.includes(PLANNING_FIELDS.action));
  assert.ok(brief.instructions.includes('목표 수치를 달성된 성과로 표현하지 마세요'));
  assert.ok(brief.instructions.includes('후기·희소성·효과를 새로 만들어 넣지 말고'));
  assert.throws(() => planToBrief(createPlan({ fields: PLANNING_FIELDS })), { status: 409 });
});

test('plan CRUD uses optimistic revisions; incomplete and stale completion cannot overwrite newer work', async (t) => {
  const { request } = await instance(t);
  const created = await request('/plans', 'POST', { fields: { topic: '첫 콘텐츠 기획' } });
  assert.equal(created.status, 201);
  const original = created.body;
  assert.equal(
    (await request(`/plans/${original.id}/complete`, 'POST', { revision: 1 })).status,
    409,
  );
  const saved = (
    await request(`/plans/${original.id}`, 'PUT', { revision: 1, step: 2, fields: PLANNING_FIELDS })
  ).body;
  assert.equal(saved.revision, 2);
  assert.equal(saved.status, 'draft');
  assert.equal(saved.step, 2);
  assert.equal(
    (await request(`/plans/${original.id}`, 'PUT', { revision: 1, fields: { topic: '다른 창' } }))
      .status,
    409,
  );
  assert.equal(
    (await request(`/plans/${original.id}/complete`, 'POST', { revision: 1 })).status,
    409,
  );
  assert.equal((await request(`/plans/${original.id}`, 'DELETE', { revision: 1 })).status, 409);
  assert.equal((await request(`/plans/${original.id}`, 'DELETE', {})).status, 400);
  const ready = (await request(`/plans/${original.id}/complete`, 'POST', { revision: 2 })).body;
  assert.equal(ready.status, 'ready');
  assert.equal(ready.revision, 3);
  assert.deepEqual(
    (await request(`/plans/${original.id}/complete`, 'POST', { revision: 3 })).body,
    ready,
  );
  assert.equal((await request('/plans')).body.length, 1);
  assert.equal((await request(`/plans/${original.id}`, 'DELETE', { revision: 3 })).status, 204);
  assert.equal((await request(`/plans/${original.id}`)).status, 404);
});

test('plans and existing content survive closing and reopening the same SQLite file', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'narrative-plan-persistence-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'studio.sqlite');
  const first = await instance(t, path);
  const content = first.store.insert(
    createContent({
      title: '기존 원고',
      body: '보존해야 할 원고',
      channels: ['website'],
      color: 'sage',
    }),
  );
  const plan = (await first.request('/plans', 'POST', { fields: PLANNING_FIELDS })).body;
  await first.close();
  const second = await instance(t, path);
  assert.deepEqual((await second.request(`/contents/${content.id}`)).body, content);
  assert.deepEqual((await second.request(`/plans/${plan.id}`)).body, plan);
});

test('backups restore plans with legacy v1 content, skip identical entries and copy conflicts without replacing current work', async (t) => {
  const { request, store } = await instance(t);
  const content = createContent({
    title: '기존 HTML 원고',
    body: '예전 원고',
    channels: ['website'],
    color: 'sage',
  });
  const legacy = { format: 'moa-content-backup', version: 1, contents: [content] };
  const first = await request('/backup', 'POST', legacy);
  assert.equal(first.body.added, 1);
  assert.deepEqual(first.body.plans, { added: 0, copies: 0, skipped: 0 });
  const plan = completePlan(createPlan({ fields: PLANNING_FIELDS }));
  const backup = createBackup([content], [plan]);
  assert.equal((await request('/backup', 'POST', backup)).body.plans.added, 1);
  const repeated = (await request('/backup', 'POST', backup)).body;
  assert.equal(repeated.skipped, 1);
  assert.equal(repeated.plans.skipped, 1);
  const conflicted = createBackup(
    [content],
    [{ ...plan, fields: { ...plan.fields, topic: '예전 다른 제목' } }],
  );
  const copied = (await request('/backup', 'POST', conflicted)).body;
  assert.equal(copied.plans.copies, 1);
  assert.equal(store.getPlan(plan.id).fields.topic, PLANNING_FIELDS.topic);
  const copy = store.listPlans().find((item) => item.id !== plan.id);
  assert.equal(copy.status, 'draft');
  assert.equal(copy.fields.topic, '예전 다른 제목 (복원본)');
  assert.equal(copy.completedAt, null);
  assert.ok(Object.values(copy.fields.checks).every((v) => v === false));
  const exported = (await request('/backup')).body;
  assert.equal(exported.version, 1);
  assert.equal(exported.contents.length, 1);
  assert.equal(exported.plans.length, 2);
});

test('invalid plan batches cannot partially import contents or other plans', async (t) => {
  const { request, store } = await instance(t);
  const plan = completePlan(createPlan({ fields: PLANNING_FIELDS }));
  const content = createContent({
    title: '가져오면 안 되는 원고',
    body: '잘못된 기획을 포함한 배치',
    channels: ['website'],
    color: 'sage',
  });
  const invalid = { ...plan, id: 'invalid' };
  assert.equal(
    (await request('/backup', 'POST', createBackup([content], [plan, invalid]))).status,
    400,
  );
  assert.deepEqual(store.list(), []);
  assert.deepEqual(store.listPlans(), []);
  assert.equal(
    (await request('/backup', 'POST', createBackup([content], [plan, plan]))).status,
    400,
  );
  assert.deepEqual(store.list(), []);
  assert.deepEqual(store.listPlans(), []);
});

test('content keeps a sanitized planning snapshot after live plan deletion; approval backups require the intent check', async (t) => {
  const { request, store } = await instance(t);
  const plan = completePlan(createPlan({ fields: PLANNING_FIELDS }));
  store.insertPlan(plan);
  let content = createContent({
    title: '기획이 연결된 원고',
    body: '계획한 목적을 검토할 원고',
    channels: ['website'],
    color: 'sage',
  });
  content.planning = plan;
  content = { ...transition(content, { action: 'submit' }), revision: 2 };
  content = {
    ...transition(content, {
      action: 'approve',
      checks: { accuracy: true, rights: true, channels: true, intent: true },
    }),
    revision: 3,
  };
  store.insert(content);
  assert.equal(
    (await request(`/plans/${plan.id}`, 'DELETE', { revision: plan.revision })).status,
    204,
  );
  const backup = (await request('/backup')).body;
  assert.equal(backup.plans.length, 0);
  assert.deepEqual(backup.contents[0].planning, plan);
  assert.deepEqual(validateBackup(backup)[0].planning, plan);
  const missingIntent = structuredClone(backup);
  delete missingIntent.contents[0].approval.checks.intent;
  assert.throws(() => validateBackup(missingIntent), { status: 400 });
});

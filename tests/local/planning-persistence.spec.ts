import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createContent } from '../../server/domain.mjs';
import { createPlan, completePlan } from '../../server/planning.mjs';
import { PLANNING_FIELDS } from '../fixtures/planning-fields.mjs';

const entry = 'http://127.0.0.1:4174/moa-local.html';
const database = 'moa-content-studio-local-v1';
const legacyContent = () =>
  createContent({
    title: '이전 파일에서 작성한 원고',
    body: '저장소를 업그레이드해도 유지되어야 하는 실제 원고입니다.',
    excerpt: '',
    channels: ['website'],
    color: 'sage',
    variants: { instagram: '', threads: '' },
  });

test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) =>
    route.request().url() === entry ? route.continue() : route.abort('internetdisconnected'),
  );
});

test('offline backups atomically restore plans and contents, preserve conflicts, and omit invalid batches', async ({
  page,
}) => {
  await page.goto(entry);
  const content = legacyContent();
  const plan = completePlan(createPlan({ fields: PLANNING_FIELDS }));
  const upload = async (value: unknown) =>
    page.getByLabel('가져올 백업 파일').setInputFiles({
      name: 'planning-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(value)),
    });
  const read = () =>
    page.evaluate(
      (database) =>
        new Promise<{ contents: any[]; plans: any[] }>((resolve, reject) => {
          const request = indexedDB.open(database);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction(['contents', 'plans'], 'readonly');
            const contents = tx.objectStore('contents').getAll();
            const plans = tx.objectStore('plans').getAll();
            tx.oncomplete = () => {
              db.close();
              resolve({ contents: contents.result, plans: plans.result });
            };
            tx.onabort = () => reject(tx.error);
          };
        }),
      database,
    );
  await upload({ format: 'moa-content-backup', version: 1, contents: [content], plans: [plan] });
  await expect(page.getByRole('heading', { name: content.title, exact: true })).toBeVisible();
  let saved = await read();
  expect(saved.contents).toEqual([content]);
  expect(saved.plans).toEqual([plan]);
  const badContent = { ...legacyContent(), title: '가져오면 안 되는 새 원고' };
  await upload({
    format: 'moa-content-backup',
    version: 1,
    contents: [badContent],
    plans: [{ ...plan, id: 'invalid' }],
  });
  await expect(
    page.getByText('백업의 기획 정보가 올바르지 않아요.', { exact: true }),
  ).toBeVisible();
  saved = await read();
  expect(saved.contents).toEqual([content]);
  expect(saved.plans).toEqual([plan]);
  await upload({
    format: 'moa-content-backup',
    version: 1,
    contents: [content],
    plans: [{ ...plan, fields: { ...plan.fields, topic: '백업에 담긴 다른 제목' } }],
  });
  await expect.poll(async () => (await read()).plans.length).toBe(2);
  saved = await read();
  expect(saved.contents).toHaveLength(1);
  expect(saved.plans.find((p) => p.id === plan.id)).toEqual(plan);
  const copy = saved.plans.find((p) => p.id !== plan.id);
  expect(copy.status).toBe('draft');
  expect(copy.fields.topic).toBe('백업에 담긴 다른 제목 (복원본)');
  expect(Object.values(copy.fields.checks).every((v) => v === false)).toBe(true);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '백업 저장', exact: true }).click();
  const file = await downloading;
  const exported = JSON.parse(readFileSync((await file.path())!, 'utf8'));
  expect(exported.plans).toHaveLength(2);
  expect(exported.contents).toEqual([content]);
});

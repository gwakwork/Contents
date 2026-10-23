import { test, expect, type Page, type Route } from '@playwright/test';
import { openHome, openPlanning } from '../helpers/navigation';

const TOPIC = '무료 동네 독서 모임을 소개하는 글';
const MESSAGE = '참가비 없이 매주 수요일에 이웃과 함께 책을 읽을 수 있습니다.';
const EVIDENCE =
  '매주 수요일에 동네 독서 모임을 엽니다. 참가비는 없습니다. 장소와 신청 방법은 아직 확인하지 않았습니다.';
const KEY = 'sk-planning-browser-test-not-a-real-key';

test.beforeEach(async ({ request }) => {
  await request.delete('/api/ai/settings', { data: {} });
  for (const plan of await (await request.get('/api/plans')).json()) {
    await request.delete(`/api/plans/${plan.id}`, { data: { revision: plan.revision } });
  }
  for (const content of await (await request.get('/api/contents')).json()) {
    await request.delete(`/api/contents/${content.id}`, { data: { revision: content.revision } });
  }
});

async function startPlan(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '콘텐츠 기획', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '새 기획 만들기', exact: true }).first().click();
  await expect(page.getByLabel('기획할 콘텐츠', { exact: true })).toBeVisible();
}
async function choose(page: Page, label: string) {
  await page.getByRole('radio', { name: label, exact: true }).check();
}
async function next(page: Page) {
  await page.getByRole('button', { name: '다음', exact: true }).click();
}
async function saved(page: Page) {
  await expect(page.getByText('저장됨', { exact: true })).toBeVisible();
}

test('plan without an API key, resume real choices, complete the brief, create an AI draft, and explicitly approve against the plan', async ({
  page,
  request,
}, info) => {
  test.setTimeout(90000);
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  const beforeRuns = await (await request.get('/api/ai/generations')).json();
  await startPlan(page);
  await next(page);
  await expect(page.getByRole('alert')).toContainText('주제');
  await page.getByLabel('기획할 콘텐츠', { exact: true }).fill(TOPIC);
  const awareness = page.getByRole('radio', { name: '알리기', exact: true });
  await awareness.focus();
  await awareness.press('Space');
  await awareness.press('ArrowRight');
  await expect(page.getByRole('radio', { name: '이해·도움', exact: true })).toBeChecked();
  await choose(page, '이해 여부 확인');
  await choose(page, '발행 후 7일');
  await saved(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results-planning/purpose-${info.project.name}.png`,
    fullPage: true,
  });
  await next(page);
  await choose(page, '처음 접하는 사람');
  await choose(page, '아직 주제를 잘 모름');
  await choose(page, '빠른 이해');
  await saved(page);
  const partial = (await (await request.get('/api/plans')).json())[0];
  expect(partial.fields.purpose).toBe('education');
  expect(partial.fields.metric).toBe('understanding');
  expect(partial.fields.target).toBe('');
  expect(partial.fields.audience).toBe('이 주제를 처음 접하는 사람');
  expect((await (await request.get('/api/ai/settings')).json()).configured).toBe(false);
  expect((await (await request.get('/api/ai/generations')).json()).length).toBe(beforeRuns.length);
  await openPlanning(page);
  await expect(page.getByRole('heading', { name: '콘텐츠 기획', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '기획 이어하기', exact: true }).click();
  await expect(page.getByRole('radio', { name: '처음 접하는 사람', exact: true })).toBeChecked();
  await openHome(page);
  await expect(page.getByRole('heading', { name: '콘텐츠 기획', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '기획 이어하기', exact: true }).click();
  await expect(page.getByRole('radio', { name: '처음 접하는 사람', exact: true })).toBeChecked();
  await next(page);
  await page.getByLabel('핵심 메시지 한 문장', { exact: true }).fill(MESSAGE);
  await choose(page, '핵심 정리');
  await page.getByLabel('근거·확인할 자료', { exact: true }).fill(EVIDENCE);
  await page
    .getByRole('group', { name: '독자의 예상 질문', exact: true })
    .getByRole('radio', { name: '직접 입력', exact: true })
    .check();
  await page
    .getByLabel('독자의 예상 질문 직접 입력', { exact: true })
    .fill('정확한 장소와 신청 방법은 어디서 확인하나요?');
  await next(page);
  await choose(page, '저장하기');
  await page.getByRole('checkbox', { name: '웹사이트', exact: true }).check();
  await next(page);
  await choose(page, '해설·정보형');
  await choose(page, '정보 전달형');
  await choose(page, '짧게');
  await next(page);
  await choose(page, '다음 작업을 시작하면');
  await choose(page, '첫 초안 작성');
  const progress = page.getByRole('progressbar', { name: '기획 진행률' });
  const progressValue =
    (await progress.getAttribute('value')) ?? (await progress.getAttribute('aria-valuenow'));
  expect(progressValue).not.toBeNull();
  expect(Number(progressValue)).toBeLessThan(Number(await progress.getAttribute('aria-valuemax')));
  for (const label of [
    '목적과 확인 기준이 분명해요',
    '독자의 필요와 메시지가 연결돼요',
    '근거와 불확실한 부분을 구분했어요',
    '다음 행동을 실행할 수 있어요',
  ]) {
    await page.getByRole('checkbox', { name: label, exact: true }).check();
  }
  await page.getByRole('button', { name: '기획 확정', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '이 기획으로 AI 원고 만들기', exact: true }),
  ).toBeVisible();
  const ready = await (await request.get(`/api/plans/${partial.id}`)).json();
  expect(ready.status).toBe('ready');
  expect(ready.fields.message).toBe(MESSAGE);
  expect(ready.fields.target).toBe('');
  expect(ready.fields.channels).toEqual(['website']);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results-planning/brief-${info.project.name}.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '이 기획으로 AI 원고 만들기', exact: true }).click();
  await expect(page.getByRole('button', { name: '기획 수정', exact: true })).toBeVisible();
  await expect(page.getByLabel('각색할 원문', { exact: false })).toHaveValue(
    /참가비 없이 매주 수요일/,
  );
  await expect(page.getByRole('button', { name: 'AI 초안 만들기', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'AI 연결 설정', exact: true }).click();
  await page.getByLabel('OpenAI API 키', { exact: false }).fill(KEY);
  await page.getByRole('button', { name: '연결 설정 저장', exact: true }).click();
  const pendingRequest = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith('/api/ai/generations'),
  );
  await page.getByRole('button', { name: 'AI 초안 만들기', exact: true }).click();
  const sent = (await pendingRequest).postDataJSON();
  expect(sent.planId).toBe(ready.id);
  expect(sent.planRevision).toBe(ready.revision);
  await expect(page.locator('.ai-result-copy h2')).toHaveText('함께 읽는 수요일');
  await page.getByRole('button', { name: '이 결과를 검토함으로 보내기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '검토 대기', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '기획 기준 보기', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(TOPIC);
  await expect(page.getByRole('dialog')).toContainText(MESSAGE);
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).first().click();
  for (const label of [
    '내용과 오탈자를 확인했어요',
    '사용 권리를 확인했어요',
    '채널별 원고를 확인했어요',
  ]) {
    await page.getByRole('checkbox', { name: label, exact: true }).check();
  }
  await expect(page.getByRole('button', { name: '최종 승인', exact: true })).toBeDisabled();
  await page
    .getByRole('checkbox', { name: '기획 목적과 메시지를 확인했어요', exact: true })
    .check();
  await page.getByRole('button', { name: '최종 승인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '승인 완료', exact: true })).toBeVisible();
  const content = (await (await request.get('/api/contents')).json())[0];
  expect(content.planning.id).toBe(ready.id);
  expect(content.planning.revision).toBe(ready.revision);
  expect(content.planning.fields.message).toBe(MESSAGE);
  expect(content.approval.checks.intent).toBe(true);
  expect(failures).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a failed autosave stays visible and can be retried without losing the draft', async ({
  page,
  request,
}) => {
  await startPlan(page);
  await page.route('**/api/plans/*', async (route) => {
    if (route.request().method() === 'PUT')
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: '테스트 저장 연결이 끊겼습니다.' }),
      });
    else await route.continue();
  });
  await page.getByLabel('기획할 콘텐츠', { exact: true }).fill('저장 실패 후 되찾을 기획');
  await expect(page.locator('.planner-save')).toContainText('저장하지 못했습니다.');
  await expect(page.getByLabel('기획할 콘텐츠', { exact: true })).toHaveValue(
    '저장 실패 후 되찾을 기획',
  );
  await page.unroute('**/api/plans/*');
  await page.getByRole('button', { name: '다시 저장', exact: true }).click();
  await saved(page);
  const plan = (await (await request.get('/api/plans')).json())[0];
  expect(plan.fields.topic).toBe('저장 실패 후 되찾을 기획');
  expect(plan.status).toBe('draft');
  await page.reload();
  await page.getByRole('button', { name: '기획 이어하기', exact: true }).click();
  await expect(page.getByLabel('기획할 콘텐츠', { exact: true })).toHaveValue(
    '저장 실패 후 되찾을 기획',
  );
});

test('a stale tab preserves the latest server plan and can explicitly save its own work separately', async ({
  page,
  context,
  request,
}) => {
  await startPlan(page);
  await page.getByLabel('기획할 콘텐츠', { exact: true }).fill('두 창에서 편집할 기획');
  await saved(page);
  const original = (await (await request.get('/api/plans')).json())[0];
  const other = await context.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: '기획 이어하기', exact: true }).click();
  await expect(other.getByLabel('기획할 콘텐츠', { exact: true })).toHaveValue(
    '두 창에서 편집할 기획',
  );
  await page.getByLabel('기획할 콘텐츠', { exact: true }).fill('첫 번째 창에서 저장한 최신 기획');
  await saved(page);
  await other.getByLabel('기획할 콘텐츠', { exact: true }).fill('두 번째 창에서 작성한 다른 기획');
  await expect(
    other.getByRole('button', { name: '현재 입력을 새 기획으로 저장', exact: true }),
  ).toBeVisible();
  await expect(other.getByLabel('기획할 콘텐츠', { exact: true })).toHaveValue(
    '두 번째 창에서 작성한 다른 기획',
  );
  await other.getByRole('button', { name: '현재 입력을 새 기획으로 저장', exact: true }).click();
  await saved(other);
  const plans = await (await request.get('/api/plans')).json();
  expect(plans).toHaveLength(2);
  expect(plans.find((p: { id: string }) => p.id === original.id).fields.topic).toBe(
    '첫 번째 창에서 저장한 최신 기획',
  );
  const copy = plans.find((p: { id: string }) => p.id !== original.id);
  expect(copy.fields.topic).toBe('두 번째 창에서 작성한 다른 기획 (보관본)');
  expect(copy.status).toBe('draft');
  expect(Object.values(copy.fields.checks).every((value) => value === false)).toBe(true);
  await other.close();
});

test('restoring a backup blocks new edits until completion and unlocks safely after a failed request', async ({
  page,
  request,
}) => {
  await startPlan(page);
  const original = '복원하는 동안 안전하게 유지할 기획';
  const topic = page.getByLabel('기획할 콘텐츠', { exact: true });
  await topic.fill(original);
  await saved(page);
  const plan = (await (await request.get('/api/plans')).json())[0];
  const backup = await (await request.get('/api/backup')).json();
  const writes: string[] = [];
  page.on('request', (sent) => {
    if (sent.method() === 'PUT' && /\/api\/plans\//.test(sent.url())) writes.push(sent.url());
  });
  const shell = page.locator('.app-shell');
  const progress = page.getByRole('status').filter({ hasText: '백업을 가져오고 있습니다.' });

  async function pauseImport(abort = false) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let entered!: () => void;
    const intercepted = new Promise<void>((resolve) => (entered = resolve));
    const handler = async (route: Route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      entered();
      await gate;
      if (abort) await route.abort('failed');
      else await route.continue();
    };
    await page.route('**/api/backup', handler);
    await topic.focus();
    await expect(topic).toBeFocused();
    await page.getByLabel('가져올 백업 파일').setInputFiles({
      name: 'saved-plan-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await intercepted;
    return { release, cleanup: () => page.unroute('**/api/backup', handler) };
  }

  async function expectEditsBlocked() {
    await expect(shell).toHaveAttribute('inert', '');
    await expect(shell).toHaveAttribute('aria-busy', 'true');
    await expect(progress).toBeVisible();
    expect(
      await progress.evaluate(
        (element) => !document.querySelector('.app-shell')?.contains(element),
      ),
    ).toBe(true);
    await topic.focus();
    await expect(topic).not.toBeFocused();
    await page.keyboard.type(' THIS MUST NOT CHANGE THE PLAN');
    await expect(topic).toHaveValue(original);
    expect(writes).toEqual([]);
  }

  const completed = await pauseImport();
  try {
    await expectEditsBlocked();
  } finally {
    completed.release();
  }
  await expect(progress).toHaveCount(0);
  await expect(shell).not.toHaveAttribute('inert');
  await expect(shell).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('status')).toContainText('기획 0개 복원');
  await completed.cleanup();
  await openPlanning(page);
  await page.getByRole('button', { name: '기획 이어하기', exact: true }).click();
  await expect(topic).toHaveValue(original);
  expect((await (await request.get(`/api/plans/${plan.id}`)).json()).fields.topic).toBe(original);

  const failed = await pauseImport(true);
  try {
    await expectEditsBlocked();
  } finally {
    failed.release();
  }
  await expect(progress).toHaveCount(0);
  await expect(shell).not.toHaveAttribute('inert');
  await expect(shell).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('status').filter({ hasText: /fetch/i })).toBeVisible();
  await failed.cleanup();
  await expect(topic).toHaveValue(original);
  await topic.fill('복원 실패 뒤에도 계속 작성할 수 있는 기획');
  await saved(page);
  expect((await (await request.get(`/api/plans/${plan.id}`)).json()).fields.topic).toBe(
    '복원 실패 뒤에도 계속 작성할 수 있는 기획',
  );
});

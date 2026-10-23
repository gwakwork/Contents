import { test, expect } from '@playwright/test';

const SOURCE = '매주 수요일에 동네 독서 모임을 엽니다. 참가비는 없습니다.';
const KEY = 'sk-browser-test-not-a-real-key';
test.beforeEach(async ({ request }) => {
  await request.delete('/api/ai/settings', { data: {} });
  for (const content of await (await request.get('/api/contents')).json())
    await request.delete(`/api/contents/${content.id}`, { data: { revision: content.revision } });
});

test('connect key, rewrite by formula and channel, compare original, adopt, approve, edit, and back up', async ({
  page,
  request,
}, info) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'AI 작업실 열기' }).click();
  await page.getByRole('button', { name: 'AI 연결 설정', exact: true }).click();
  await page.getByLabel('OpenAI API 키', { exact: false }).fill(KEY);
  await page.getByRole('button', { name: '연결 설정 저장' }).click();
  await expect(page.locator('.ai-connection')).toContainText('API 키 저장됨');
  // A new input clears any job restored from previous tests.
  await page.getByRole('button', { name: '새 원문으로 시작' }).click();
  await page.getByLabel('각색할 원문', { exact: false }).fill(SOURCE);
  await expect(page).toHaveTitle('Narrative');
  await expect(page.getByRole('button', { name: 'Narrative 홈' })).toBeAttached();
  await page.getByRole('button', { name: 'PAS', exact: true }).click();
  await page.getByLabel('인스타그램', { exact: true }).check();
  await page.getByLabel('Threads', { exact: true }).check();
  await page.getByRole('button', { name: 'AI로 각색하기' }).click();
  await expect(page.locator('.ai-result-copy h2')).toHaveText('함께 읽는 수요일');
  await page.getByText('편집 요약', { exact: true }).click();
  await expect(page.locator('.ai-formula-result b')).toHaveText(['문제', '공감', '해결']);
  await page.getByRole('button', { name: 'Threads', exact: true }).click();
  await expect(page.locator('.ai-result-copy')).toContainText('참가비 없는 동네 독서 모임');
  await page.getByText('원문과 비교하기', { exact: true }).click();
  await expect(page.locator('.ai-original p')).toHaveText(SOURCE);
  await page.getByLabel('추가 요청', { exact: false }).fill('문장을 더 짧게 써 주세요.');
  await expect(page.getByRole('button', { name: '이 결과를 검토함으로 보내기' })).toBeDisabled();
  await expect(page.locator('.ai-stale-notice')).toBeVisible();
  await page.getByRole('button', { name: 'AI로 각색하기' }).click();
  await expect(page.getByRole('button', { name: '이 결과를 검토함으로 보내기' })).toBeEnabled();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/ai-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '이 결과를 검토함으로 보내기' }).click();
  await expect(page.getByRole('heading', { name: '검토 대기', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'AI 원문 보기' }).click();
  await expect(page.locator('.ai-source-details')).toContainText(SOURCE);
  await page.getByRole('button', { name: '확인했어요' }).click();
  await expect(page.getByRole('button', { name: '최종 승인', exact: true })).toBeDisabled();
  await page.getByLabel('내용과 오탈자를 확인했어요').check();
  await page.getByLabel('사용 권리를 확인했어요').check();
  await page.getByLabel('채널별 원고를 확인했어요').check();
  await page.getByRole('button', { name: '최종 승인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '승인 완료', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '원고 편집' }).click();
  await page.getByLabel('콘텐츠 제목').fill('수정한 독서 모임');
  await page.getByRole('button', { name: '변경사항 저장', exact: true }).click();
  await page.getByRole('button', { name: '검토 및 승인' }).click();
  await expect(page.getByRole('heading', { name: '작성 중', exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '백업 저장', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^narrative-backup-/);
  const backup = await (await request.get('/api/backup')).json();
  expect(backup.contents[0].aiSource.source).toBe(SOURCE);
  expect(JSON.stringify(backup)).not.toContain(KEY);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(KEY);
  expect(JSON.stringify(await (await request.get('/api/ai/settings')).json())).not.toContain(KEY);
  await page.reload();
  await expect(page.getByRole('heading', { name: '수정한 독서 모임', exact: true })).toBeVisible();
  expect(failures).toEqual([]);
});

test('limit error stays failed after reload, without an automatic paid retry', async ({
  page,
  request,
}) => {
  await request.put('/api/ai/settings', { data: { model: 'gpt-4.1-mini', apiKey: KEY } });
  await page.goto('/');
  await page.getByRole('button', { name: 'AI 작업실 열기' }).click();
  await page.getByRole('button', { name: '새 원문으로 시작' }).click();
  await page.getByLabel('각색할 원문', { exact: false }).fill('한도 오류 테스트');
  await page.getByRole('button', { name: 'AI로 각색하기' }).click();
  await expect(page.locator('.ai-result-empty')).toContainText('OpenAI 사용 한도 또는 잔액');
  const runs = await (await request.get('/api/ai/generations')).json();
  await page.reload();
  await page.getByRole('button', { name: 'AI 작업실 열기' }).click();
  await expect(page.locator('.ai-result-empty')).toContainText('OpenAI 사용 한도 또는 잔액');
  expect((await (await request.get('/api/ai/generations')).json()).length).toBe(runs.length);
});

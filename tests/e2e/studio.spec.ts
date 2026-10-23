import { test, expect } from '@playwright/test';
import { openLibrary } from '../helpers/navigation';

test.beforeEach(async ({ request }) => {
  const response = await request.get('/api/contents');
  for (const content of await response.json()) {
    await request.delete(`/api/contents/${content.id}`, { data: { revision: content.revision } });
  }
});

test('create, review, request changes, approve, export, and re-review an edited article', async ({
  page,
}) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto('/');
  await openLibrary(page);
  await expect(page.getByRole('heading', { name: '아직 콘텐츠가 없습니다.' })).toBeVisible();
  await page.getByRole('button', { name: '첫 콘텐츠 작성하기' }).click();
  await page.getByLabel('콘텐츠 제목').fill('나의 첫 번째 콘텐츠');
  await page.getByLabel('한 줄 소개').fill('검토 과정을 확인하는 이야기');
  await page
    .getByLabel('본문', { exact: true })
    .fill('제목부터 본문까지 꼼꼼하게 확인할 원고입니다.\n\n검토 의견을 남기고 승인해 보세요.');
  await page.getByLabel('인스타그램', { exact: true }).check();
  await page
    .getByRole('textbox', { name: '인스타그램 원고', exact: true })
    .fill('인스타그램에 맞게 다듬은 짧은 이야기.');
  await page.getByRole('button', { name: '임시 저장', exact: true }).click();
  await expect(page.getByText('원고를 안전하게 저장했어요.')).toBeVisible();
  await page.getByRole('button', { name: '검토 요청', exact: true }).click();
  await expect(page.getByRole('heading', { name: '검토 대기', exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: '최종 승인', exact: true })
    .isDisabled()
    .then((value) => expect(value).toBe(true));
  await page.getByRole('button', { name: '인스타그램', exact: true }).click();
  await expect(page.locator('.article-text')).toHaveText('인스타그램에 맞게 다듬은 짧은 이야기.');
  await page
    .getByRole('textbox', { name: '검토 의견', exact: true })
    .fill('독자에게 질문하는 문장을 더해주세요.');
  await page.getByRole('button', { name: '수정 요청', exact: true }).click();
  await expect(page.getByRole('heading', { name: '수정 요청', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '원고 편집' }).click();
  await page
    .getByLabel('본문', { exact: true })
    .fill('더 쉽게 고친 이야기입니다.\n\n여러분은 어떻게 생각하시나요?');
  await page.getByRole('button', { name: '변경사항 저장', exact: true }).click();
  await page.getByRole('button', { name: '검토 요청', exact: true }).click();
  await page.getByLabel('내용과 오탈자를 확인했어요').check();
  await page.getByLabel('사용 권리를 확인했어요').check();
  await page.getByLabel('채널별 원고를 확인했어요').check();
  await page.getByRole('button', { name: '최종 승인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '승인 완료', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '채널 연결 후 발행 가능' })).toBeDisabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '승인 원고 내보내기' }).click();
  expect((await download).suggestedFilename()).toMatch(/^narrative-content-.*\.json$/);
  await page.getByRole('button', { name: '변경 이력' }).click();
  await expect(
    page.locator('.history-panel').getByText('독자에게 질문하는 문장을 더해주세요.'),
  ).toBeVisible();
  await page.getByRole('button', { name: '원고 편집' }).click();
  await page.getByLabel('콘텐츠 제목').fill('승인 이후 수정한 콘텐츠');
  await expect(page.getByText('내용을 수정하면 기존 검토·승인이 초기화돼요.')).toBeVisible();
  await page.getByRole('button', { name: '변경사항 저장', exact: true }).click();
  await page.getByRole('button', { name: '검토 및 승인' }).click();
  await expect(page.getByRole('heading', { name: '작성 중', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '콘텐츠 목록', exact: true }).click();
  await page.reload();
  await openLibrary(page);
  await expect(
    page.getByRole('heading', { name: '승인 이후 수정한 콘텐츠', exact: true }),
  ).toBeVisible();
  expect(failures).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('sample library, search, filters, channel information, and safe sample cleanup', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await openLibrary(page);
  await page.getByRole('button', { name: '예시 콘텐츠 둘러보기' }).click();
  await expect(page.locator('.content-card')).toHaveCount(6);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: '알림 닫기' }).click();
  await page.screenshot({
    path: `test-results/library-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('콘텐츠 검색').fill('작은 루틴');
  await expect(page.locator('.content-card')).toHaveCount(1);
  await page.getByRole('button', { name: '검색 지우기' }).click();
  await page
    .getByRole('group', { name: '콘텐츠 상태 필터' })
    .getByRole('button', { name: '검토 대기' })
    .click();
  await expect(page.locator('.content-card')).toHaveCount(2);
  await page.getByRole('button', { name: '리스트로 보기' }).click();
  await expect(page.locator('.list-view')).toBeVisible();
  await page.locator('.content-card').first().click();
  await expect(page.getByRole('heading', { name: '검토 대기', exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/review-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '콘텐츠 목록', exact: true }).click();
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: '메뉴 열기' }).click();
  await page.getByRole('button', { name: '발행 채널', exact: true }).click();
  await expect(page.getByText('미연결', { exact: true })).toHaveCount(3);
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: '메뉴 열기' }).click();
  await page.getByRole('button', { name: '모든 콘텐츠' }).click();
  await page.getByRole('button', { name: '예시 정리', exact: true }).click();
  await page.getByRole('button', { name: '예시만 삭제', exact: true }).click();
  await expect(page.locator('.content-card')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '아직 콘텐츠가 없습니다.' })).toBeVisible();
});

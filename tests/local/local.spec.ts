import { test, expect, chromium, type Page } from '@playwright/test';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// This managed cloud browser blocks file://. Serve the exact release document;
// the application still has no backend APIs and all external requests are blocked.
const entry = 'http://127.0.0.1:4174/moa-local.html';
test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) =>
    route.request().url() === entry ? route.continue() : route.abort('internetdisconnected'),
  );
});
async function create(page: Page, title = '내 컴퓨터에서 작성한 이야기') {
  await page.getByRole('button', { name: '새 콘텐츠 작성', exact: true }).click();
  await page.getByLabel('콘텐츠 제목').fill(title);
  await page
    .getByLabel('본문', { exact: true })
    .fill('인터넷이 없어도 작성하고 직접 검토할 수 있어요.\n\n첫 번째 로컬 원고입니다.');
  await page.getByRole('button', { name: '임시 저장', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}
async function approve(page: Page) {
  await page.getByRole('button', { name: '검토 요청', exact: true }).click();
  await expect(page.getByRole('button', { name: '최종 승인', exact: true })).toBeDisabled();
  await page.getByLabel('내용과 오탈자를 확인했어요').check();
  await page.getByLabel('사용 권리를 확인했어요').check();
  await page.getByLabel('채널별 원고를 확인했어요').check();
  await page.getByRole('button', { name: '최종 승인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '승인 완료', exact: true })).toBeVisible();
}
test('standalone document without backend APIs: create, revise, approve, export, and retain after reload', async ({
  page,
}, info) => {
  const failures: string[] = [];
  const network: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && request.url() !== entry) network.push(request.url());
  });
  await page.goto(entry);
  await expect(page.getByRole('heading', { name: '첫 번째 이야기를 모아볼까요?' })).toBeVisible();
  await create(page);
  await page.getByRole('button', { name: '검토 요청', exact: true }).click();
  await page
    .getByRole('textbox', { name: '검토 의견', exact: true })
    .fill('마지막 문장을 더 쉽게 써 주세요.');
  await page.getByRole('button', { name: '수정 요청', exact: true }).click();
  await expect(page.getByRole('heading', { name: '수정 요청', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '원고 편집' }).click();
  await page
    .getByLabel('본문', { exact: true })
    .fill('쉽게 고친 원고입니다.\n\n직접 검토하고 승인합니다.');
  await page.getByRole('button', { name: '변경사항 저장', exact: true }).click();
  await approve(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '승인 원고 내보내기' }).click();
  const exportFile = await pending;
  const envelope = JSON.parse(readFileSync((await exportFile.path())!, 'utf8'));
  expect(envelope.targets[0].body).toContain('쉽게 고친 원고');
  await expect(page.getByRole('button', { name: '채널 연결 후 발행 가능' })).toBeDisabled();
  await page.screenshot({
    path: `test-results/offline-review-${info.project.name}.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '원고 편집' }).click();
  await page.getByLabel('콘텐츠 제목').fill('수정해서 다시 검토할 이야기');
  await page.getByRole('button', { name: '변경사항 저장', exact: true }).click();
  await expect(page.getByRole('heading', { name: '작성 중', exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '수정해서 다시 검토할 이야기', exact: true }),
  ).toBeVisible();
  expect(failures).toEqual([]);
  expect(network).toEqual([]);
});

test('backup restores approval, skips identical entries, preserves conflicts, and rejects an invalid batch atomically', async ({
  page,
}) => {
  await page.goto(entry);
  await create(page, '백업으로 보관할 이야기');
  await approve(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '백업 저장', exact: true }).click();
  const download = await pending;
  const backupPath = (await download.path())!;
  const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
  expect(backup.contents[0].status).toBe('approved');
  expect(
    backup.contents[0].history.some((item: { action: string }) => item.action === 'approved'),
  ).toBe(true);
  await page.getByRole('button', { name: '콘텐츠 삭제', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '콘텐츠 삭제', exact: true }).click();
  await expect(page.locator('.content-card')).toHaveCount(0);
  const upload = page.getByLabel('가져올 백업 파일');
  await upload.setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.locator('.content-card')).toHaveCount(1);
  await expect(page.locator('.content-card .status-badge')).toHaveText('승인 완료');
  await upload.setInputFiles({
    name: 'backup-again.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByRole('status')).toContainText('같은 원고 1개');
  await expect(page.locator('.content-card')).toHaveCount(1);
  await page.locator('.content-card').click();
  await page.getByRole('button', { name: '원고 편집' }).click();
  await page.getByLabel('콘텐츠 제목').fill('지금 작성 중인 최신 원고');
  await page.getByRole('button', { name: '변경사항 저장', exact: true }).click();
  await page.getByRole('button', { name: '콘텐츠 목록', exact: true }).click();
  await upload.setInputFiles({
    name: 'older-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.locator('.content-card')).toHaveCount(2);
  await expect(
    page.getByRole('heading', { name: '지금 작성 중인 최신 원고', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '백업으로 보관할 이야기 (복원본)', exact: true }),
  ).toBeVisible();
  const invalid = {
    ...backup,
    contents: [
      { ...backup.contents[0], id: randomUUID() },
      { ...backup.contents[0], id: randomUUID(), title: ' ' },
    ],
  };
  await upload.setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expect(page.getByRole('status')).toContainText('제목');
  await expect(page.locator('.content-card')).toHaveCount(2);
});

test('two open windows cannot overwrite a newer saved draft', async ({ page, context }) => {
  await page.goto(entry);
  await create(page, '두 창에서 확인할 원고');
  const other = await context.newPage();
  await other.goto(entry);
  await other.locator('.content-card').click();
  await page.getByLabel('콘텐츠 제목').fill('첫 번째 창에서 저장한 최신 제목');
  await page.getByRole('button', { name: '변경사항 저장', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '첫 번째 창에서 저장한 최신 제목', exact: true }),
  ).toBeVisible();
  await other.getByLabel('콘텐츠 제목').fill('두 번째 창의 오래된 변경');
  await other.getByRole('button', { name: '변경사항 저장', exact: true }).click();
  await expect(other.getByRole('alert')).toContainText('다른 창에서 변경된 내용');
  other.on('dialog', (dialog) => void dialog.accept());
  await other.reload();
  await expect(
    other.getByRole('heading', { name: '첫 번째 창에서 저장한 최신 제목', exact: true }),
  ).toBeVisible();
});

test('saved drafts and review history survive closing and restarting the browser', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'moa-local-profile-'));
  const options = {
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: ['--no-sandbox'],
  };
  let context = await chromium.launchPersistentContext(directory, options);
  try {
    await context.route('**/*', (route) =>
      route.request().url() === entry ? route.continue() : route.abort('internetdisconnected'),
    );
    const page = await context.newPage();
    await page.goto(entry);
    await create(page, '브라우저를 꺼도 남아 있는 글');
    await page.getByRole('button', { name: '검토 요청', exact: true }).click();
    await expect(page.getByRole('heading', { name: '검토 대기', exact: true })).toBeVisible();
    await context.close();
    context = await chromium.launchPersistentContext(directory, options);
    await context.route('**/*', (route) =>
      route.request().url() === entry ? route.continue() : route.abort('internetdisconnected'),
    );
    const reopened = await context.newPage();
    await reopened.goto(entry);
    await expect(
      reopened.getByRole('heading', { name: '브라우저를 꺼도 남아 있는 글', exact: true }),
    ).toBeVisible();
    await expect(reopened.locator('.content-card .status-badge')).toHaveText('검토 대기');
    await reopened.locator('.content-card').click();
    await reopened.getByRole('button', { name: '변경 이력' }).click();
    await expect(reopened.locator('.history-panel').getByText('검토를 요청했어요.')).toBeVisible();
  } finally {
    await context.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

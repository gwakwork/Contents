import { expect, type Page } from '@playwright/test';

async function openMobileMenu(page: Page) {
  const menu = page.getByRole('button', { name: '메뉴 열기', exact: true });
  if (await menu.isVisible()) {
    const sidebar = page.locator('.sidebar');
    if (!(await sidebar.evaluate((element) => element.classList.contains('open'))))
      await menu.click();
    await expect(sidebar).toHaveClass(/\bopen\b/);
  }
}

// The landing page is planning. Legacy workflow suites deliberately open the library.
export async function openLibrary(page: Page) {
  const button = page
    .getByRole('navigation', { name: '주 메뉴' })
    .getByRole('button', { name: /^모든 콘텐츠/ });
  await expect(button).toBeAttached();
  await openMobileMenu(page);
  await button.click();
}

export async function openPlanning(page: Page) {
  const button = page
    .getByRole('navigation', { name: '주 메뉴' })
    .getByRole('button', { name: /^콘텐츠 기획/ });
  await expect(button).toBeAttached();
  await openMobileMenu(page);
  await button.click();
}

export async function openHome(page: Page) {
  const button = page.getByRole('button', { name: 'Narrative 홈', exact: true });
  await expect(button).toBeAttached();
  await openMobileMenu(page);
  await button.click();
}

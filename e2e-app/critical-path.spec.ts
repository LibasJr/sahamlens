import { expect, test, type Page } from '@playwright/test';

async function stubBrowserApis(page: Page) {
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/auth/me' || pathname === '/api/admin-status') {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'AUTH_REQUIRED' }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [], meta: { source: 'E2E_FIXTURE' } }) });
  });
}

async function expectDocumentSecurity(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
  expect(response, `${path} harus menghasilkan document response`).not.toBeNull();
  expect(response!.status(), `${path} tidak boleh 5xx`).toBeLessThan(500);
  const csp = response!.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("script-src-attr 'none'");
  expect(csp).toContain("style-src-elem 'self' 'nonce-");
  await expect(page.locator('main#lens-content')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await stubBrowserApis(page);
});

test('guest landing membuka shell publik dan panel LensAI', async ({ page }) => {
  await expectDocumentSecurity(page, '/');
  await expect(page.locator('button[aria-label="Ask LensAI"]')).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new Event('open-ai-chat')));
  await expect(page.getByRole('dialog', { name: 'LensAI Research' })).toBeVisible();
  await expect(page.getByLabel('Tanya LensAI tentang saham atau fitur SahamLens')).toBeVisible();
});

test('journey riset publik memuat screener, fundamental, dan backtest', async ({ page }) => {
  for (const path of ['/screener', '/fundamental', '/backtest']) {
    await test.step(path, async () => {
      await expectDocumentSecurity(page, path);
      await expect(page.locator('h1').first()).toBeVisible();
    });
  }
  await expect(page.getByRole('heading', { name: 'Strategy Builder + Backtester' })).toBeVisible();
});

test('portfolio dan watchlist menolak guest melalui redirect session boundary', async ({ page }) => {
  for (const path of ['/portfolio', '/watchlist']) {
    await test.step(path, async () => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(new RegExp(`/login\\?next=%2F${path.slice(1)}&notice=login_required`));
      await expect(page.getByText('Masuk ke Akun Anda')).toBeVisible();
    });
  }
});

test('admin tanpa cookie terverifikasi berhenti di admin login', async ({ page }) => {
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/admin-login/);
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
});

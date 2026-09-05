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

/**
 * Menunggu elemen yang hanya ada SETELAH hydration klien selesai.
 *
 * Komponen seperti AIChat sengaja dimuat `dynamic(..., { ssr: false })`, jadi ia
 * TIDAK pernah ada di HTML awal - baru muncul setelah bundle klien diunduh,
 * dieksekusi, dan chunk dinamisnya selesai. `waitUntil: 'domcontentloaded'`
 * selesai jauh sebelum itu.
 *
 * Ditambah lagi webServer di sini menjalankan `npm run dev`: Turbopack meng-
 * kompilasi rute saat pertama diakses, dan kompilasi itu gampang melewati
 * timeout bawaan 5 detik pada runner CI yang sedang terbebani.
 *
 * Gagalnya menyesatkan - terbaca "tombol tidak ada" (seolah UI hilang), padahal
 * yang terjadi "tombol belum sempat muncul". Karena itu tunggu kondisinya secara
 * eksplisit, JANGAN melonggarkan apa yang diperiksa.
 */
async function expectClientOnlyElement(page: Page, selector: string) {
  // Tunggu bundle klien benar-benar hidup dulu, bukan sekadar DOM terpasang.
  await page.waitForLoadState('networkidle');
  await expect(page.locator(selector)).toHaveCount(1, { timeout: 30_000 });
}

test.beforeEach(async ({ page }) => {
  await stubBrowserApis(page);
});

test('guest landing membuka shell publik dan panel LensAI', async ({ page }) => {
  await expectDocumentSecurity(page, '/');
  await expectClientOnlyElement(page, 'button[aria-label="Ask LensAI"]');
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
  // Kompilasi rute pertama di dev-server bisa menahan redirect lebih lama dari
  // batas bawaan 5 detik. Yang diperiksa tetap sama: guest WAJIB mendarat di
  // admin-login, bukan di /admin.
  await expect(page).toHaveURL(/\/admin-login/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
});

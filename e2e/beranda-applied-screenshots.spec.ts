import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { pageHtml } from './support/stylesheet';

/**
 * Potret HASIL TERAPAN beranda - HomeBrandHero dan HomeTodayBrief yang sungguhan,
 * dirender dengan data contoh di components/home/__tests__/beranda-applied-fixture.
 *
 * Bedanya dengan beranda-screenshots.spec.ts: yang itu memotret MOCK rancangan, yang ini
 * memotret komponen yang benar-benar dikirim ke pengguna. Keduanya perlu - mock untuk
 * menyepakati arah sebelum kode disentuh, potret terapan untuk membuktikan arah itu
 * benar-benar mendarat.
 *
 * Bukan uji regresi piksel: tidak ada baseline, dan tidak boleh ada selama rancangannya
 * masih berubah. Berkasnya ada untuk DILIHAT.
 */
const FIXTURE = path.resolve(__dirname, '__fixtures__/beranda-applied.html');
const OUT = path.resolve(__dirname, '__screenshots__');
const LEBAR = [375, 768, 1440] as const;

test.describe('potret beranda terapan', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true });
  });

  for (const lebar of LEBAR) {
    test(`beranda terapan di ${lebar}px`, async ({ page }) => {
      expect(
        fs.existsSync(FIXTURE),
        'e2e/__fixtures__/beranda-applied.html belum dibuat - jalankan `npm run test:responsive`',
      ).toBe(true);

      const markup = fs.readFileSync(FIXTURE, 'utf8');
      expect(markup.length, 'fixture terapan terlalu pendek - komponennya tidak merender').toBeGreaterThan(3000);

      await page.setViewportSize({ width: lebar, height: 1400 });
      await page.setContent(pageHtml(markup));
      await page.screenshot({ path: path.join(OUT, `beranda-terapan-${lebar}.png`), fullPage: true });

      const melebar = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(melebar, `beranda terapan menggulir horizontal di ${lebar}px`).toBe(false);
    });
  }
});

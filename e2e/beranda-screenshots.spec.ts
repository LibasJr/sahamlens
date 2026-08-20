import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { pageHtml } from './support/stylesheet';

/**
 * Potret mock KOMPOSISI beranda.
 *
 * KENAPA TERPISAH DARI workbench-screenshots. Yang itu memotret primitif berdampingan;
 * yang ini memotret susunan halamannya. Kegagalan V3 yang tercatat di
 * docs/notes/UTANG_V3_TAMPILAN_BELUM_BERUBAH_2026-08-20.md justru lolos dari potret
 * primitif: setiap primitif benar, halamannya tetap terbaca rata.
 *
 * Ini BUKAN uji regresi piksel. Tidak ada baseline, dan memang tidak boleh ada selama
 * rancangannya masih berubah. Berkasnya ada untuk DILIHAT sebelum halaman sungguhan
 * disentuh - itu langkah 2 pada "Jalan penyelesaian" di dokumen utang.
 */
const FIXTURE = path.resolve(__dirname, '__fixtures__/beranda.html');
const OUT = path.resolve(__dirname, '__screenshots__');
const LEBAR = [375, 768, 1440] as const;

test.describe('potret komposisi beranda', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true });
  });

  for (const lebar of LEBAR) {
    test(`beranda di ${lebar}px`, async ({ page }) => {
      expect(
        fs.existsSync(FIXTURE),
        'e2e/__fixtures__/beranda.html belum dibuat - jalankan vitest beranda-composition-fixture lebih dulu',
      ).toBe(true);

      const markup = fs.readFileSync(FIXTURE, 'utf8');
      expect(markup.length, 'fixture beranda terlalu pendek - komponennya tidak merender').toBeGreaterThan(3000);

      await page.setViewportSize({ width: lebar, height: 1400 });
      await page.setContent(pageHtml(markup));
      await page.screenshot({ path: path.join(OUT, `beranda-${lebar}.png`), fullPage: true });

      const melebar = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(melebar, `beranda menggulir horizontal di ${lebar}px`).toBe(false);
    });
  }
});

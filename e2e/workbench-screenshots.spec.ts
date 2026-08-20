import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { pageHtml } from './support/stylesheet';

/**
 * Potret primitif V3 di tiga lebar.
 *
 * KENAPA ADA. Kriteria sukses V3 seluruhnya visual, sementara gerbang lain di repo ini
 * hanya mengukur angka. Tanpa gambar untuk diperiksa, redesign ditulis sambil menebak.
 *
 * Ini BUKAN uji regresi piksel - tidak ada baseline yang dibandingkan, dan memang tidak
 * boleh ada: selama V3 berjalan, setiap fase memang mengubah tampilannya. Berkasnya ada
 * untuk DILIHAT sebelum sebuah fase diserahkan.
 *
 * Markupnya berasal dari komponen SUNGGUHAN, dirender di Vitest
 * (components/ui/__tests__/workbench-fixture.test.tsx) karena Playwright memasang
 * transform JSX-nya sendiri yang membuat komponen React tidak bisa dirender di dalam
 * runner ini. `npm run test:responsive` menjalankan keduanya berurutan.
 */
const FIXTURE = path.resolve(__dirname, '__fixtures__/workbench.html');
const OUT = path.resolve(__dirname, '__screenshots__');
const LEBAR = [375, 768, 1440] as const;

test.describe('potret workbench', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true });
  });

  for (const lebar of LEBAR) {
    test(`workbench di ${lebar}px`, async ({ page }) => {
      expect(
        fs.existsSync(FIXTURE),
        'e2e/__fixtures__/workbench.html belum dibuat - jalankan `npm run test:responsive`, bukan `playwright test` langsung',
      ).toBe(true);

      const markup = fs.readFileSync(FIXTURE, 'utf8');
      expect(markup.length, 'fixture workbench terlalu pendek - komponennya tidak merender').toBeGreaterThan(1500);

      await page.setViewportSize({ width: lebar, height: 1400 });
      await page.setContent(pageHtml(markup));
      await page.screenshot({ path: path.join(OUT, `workbench-${lebar}.png`), fullPage: true });

      const melebar = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(melebar, `workbench menggulir horizontal di ${lebar}px`).toBe(false);
    });
  }
});

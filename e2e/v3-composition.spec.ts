import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { pageHtml } from './support/stylesheet';

/**
 * Pengukuran komposisi V3 di enam lebar yang disebut PRD SEC.23.
 *
 * `responsive-contract.spec.ts` menjaga kontrak yang diwarisi V2 - target sentuh, tabel
 * Screener, kolom harga Watchlist. Berkas ini menjaga yang BARU: apakah primitif fase 1
 * benar-benar berperilaku seperti yang dijanjikan ketika dirender oleh CSS produksi.
 *
 * Markupnya berasal dari komponen sungguhan lewat fixture yang dirender Vitest
 * (components/ui/__tests__/workbench-fixture.test.tsx); Playwright memasang transform JSX
 * sendiri sehingga komponen React tidak bisa dirender di runner ini.
 */
const FIXTURE = path.resolve(__dirname, '__fixtures__/workbench.html');
const LEBAR = [375, 430, 768, 1024, 1280, 1440] as const;

function fixture(): string {
  expect(
    fs.existsSync(FIXTURE),
    'fixture belum dibuat - jalankan `npm run test:responsive`, bukan `playwright test` langsung',
  ).toBe(true);
  return fs.readFileSync(FIXTURE, 'utf8');
}

test.describe('komposisi V3 diukur, bukan dibaca', () => {
  test('MetricBand 2 kolom di ponsel dan 4 kolom begitu ada ruang', async ({ page }) => {
    // PRD SEC.13. Yang menentukan bukan kelas yang tertulis melainkan berapa kotak yang
    // benar-benar berbagi baris - dan itu hanya terlihat setelah CSS dijalankan.
    await page.setContent(pageHtml(fixture()));

    const kotakPerBaris = async () => page.evaluate(() => {
      const label = [...document.querySelectorAll('.lens-label')]
        .find((el) => el.textContent?.trim() === 'IHSG');
      const band = label?.parentElement?.parentElement;
      if (!band) return 0;
      const anak = [...band.children] as HTMLElement[];
      if (anak.length === 0) return 0;
      const atas = anak[0].getBoundingClientRect().top;
      return anak.filter((el) => Math.abs(el.getBoundingClientRect().top - atas) < 2).length;
    });

    await page.setViewportSize({ width: 375, height: 1200 });
    expect(await kotakPerBaris(), 'ponsel harus 2 kolom').toBe(2);

    await page.setViewportSize({ width: 1440, height: 1200 });
    expect(await kotakPerBaris(), 'desktop harus sebaris penuh').toBe(4);
  });

  test('angka metrik memakai lebar digit seragam', async ({ page }) => {
    // tabular-nums dinyatakan eksplisit di .lens-metric karena fallback stack (Consolas,
    // lalu monospace generik OS) tidak menjaminnya. Kalau ia hilang, kolom angka bergoyang
    // setiap kali nilainya berubah - dan itu tidak akan tertangkap pemindai sumber.
    await page.setContent(pageHtml(`
      <div class="lens-metric" id="a">111111</div>
      <div class="lens-metric" id="b">888888</div>
    `));
    await page.setViewportSize({ width: 1440, height: 400 });

    const lebarA = (await page.locator('#a').boundingBox())?.width ?? 0;
    const lebarB = (await page.locator('#b').boundingBox())?.width ?? 0;
    expect(lebarA).toBeGreaterThan(0);
    expect(Math.abs(lebarA - lebarB), 'digit tidak sama lebar - tabular-nums hilang').toBeLessThan(1);
  });

  test('lens-chip menjaga tinggi baris tetap ringkas', async ({ page }) => {
    // Dasar keputusan fase 5b: sel tabel Screener naik dari 10px ke 12px lewat lens-chip,
    // bukan lens-meta, karena line-height 1 mencegah tinggi barisnya ikut tumbuh. Kalau
    // suatu saat line-height itu hilang, seluruh tabel padat melonggar diam-diam.
    await page.setContent(pageHtml(`
      <span class="lens-chip" id="chip">120,5</span>
      <span class="lens-meta" id="meta">120,5</span>
    `));
    await page.setViewportSize({ width: 1024, height: 400 });

    const chip = await page.locator('#chip').boundingBox();
    const meta = await page.locator('#meta').boundingBox();
    expect(chip!.height).toBeLessThan(meta!.height);
  });

  test('tidak melebar ke samping di enam lebar PRD', async ({ page }) => {
    await page.setContent(pageHtml(fixture()));

    for (const lebar of LEBAR) {
      await page.setViewportSize({ width: lebar, height: 1200 });
      const melebar = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(melebar, `komposisi V3 menggulir horizontal di ${lebar}px`).toBe(false);
    }
  });

  test('temuan punya ritme vertikal yang seragam', async ({ page }) => {
    // Empat InsightRow berturut-turut. Jarak yang tidak seragam terbaca sebagai
    // pengelompokan yang sebenarnya tidak ada.
    await page.setContent(pageHtml(fixture()));
    await page.setViewportSize({ width: 1024, height: 1400 });

    const jarak = await page.evaluate(() => {
      const panah = [...document.querySelectorAll('[aria-hidden="true"]')]
        .filter((el) => ['↑', '↓', '→'].includes(el.textContent?.trim() ?? ''));
      const atas = panah.map((el) => el.getBoundingClientRect().top);
      return atas.slice(1).map((nilai, i) => Math.round(nilai - atas[i]));
    });

    expect(jarak.length, 'baris temuan tidak ditemukan').toBeGreaterThan(1);
    const unik = [...new Set(jarak)];
    expect(Math.max(...unik) - Math.min(...unik), `jarak antar temuan tidak seragam: ${jarak.join(', ')}`)
      .toBeLessThanOrEqual(2);
  });

  test('teks jawaban panjang dibatasi lebar baca', async ({ page }) => {
    // PRD SEC.20. max-w-prose di LensAI ada supaya baris tidak melewati panjang yang
    // nyaman dibaca; ini mengukur bahwa kelasnya memang menghasilkan batas itu.
    await page.setContent(pageHtml(`
      <div class="max-w-prose" id="jawaban">
        Momentum membaik dan harga bertahan di atas MA20 dengan volume yang menguat,
        sementara arus dana asing mencatat pembelian bersih dalam empat sesi terakhir.
      </div>
    `));
    await page.setViewportSize({ width: 1440, height: 400 });

    const lebar = (await page.locator('#jawaban').boundingBox())?.width ?? 0;
    expect(lebar).toBeGreaterThan(0);
    expect(lebar, 'baris jawaban terlalu lebar untuk dibaca nyaman').toBeLessThan(800);
  });
});

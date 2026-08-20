import { expect, test } from '@playwright/test';
import { classNameContaining, pageHtml, readSource } from './support/stylesheet';

/**
 * UTANG 6, catatan redesign v2: "verifikasi responsif bersifat statis - telaah kelas dan
 * breakpoint, bukan pengukuran di browser sungguhan".
 *
 * Test pemindai sumber yang sudah ada menjawab "apakah aturannya tertulis". Yang belum
 * pernah dijawab siapa pun adalah "apakah aturan itu benar-benar menghasilkan yang
 * dimaksud" - dan itu dua hal berbeda. `min-h-11` bisa saja tertulis dan tetap kalah oleh
 * aturan lain; `hidden sm:flex` bisa saja tertulis sementara breakpoint sm-nya digeser di
 * tailwind.config.js. Keduanya lolos pemindai sumber tanpa cela.
 *
 * Di sini CSS produksi dikompilasi sungguhan, kelasnya diambil dari berkas komponen, lalu
 * hasilnya DIUKUR di Chromium pada empat lebar yang disebut daftar QA.
 */

const LEBAR = {
  ponsel: 375,
  ponselBesar: 430,
  tablet: 768,
  tabletBesar: 1024,
  desktop: 1440,
} as const;

const TINGGI = 900;

/** Lantai target sentuh yang dipakai daftar QA - jauh di atas minimum WCAG 2.5.8 (24px). */
const TARGET_SENTUH_MIN = 44;

test.describe('kontrak responsif, diukur bukan dibaca', () => {
  test('tab sudut pandang emiten memenuhi target sentuh di SEMUA lebar', async ({ page }) => {
    // Kelas diambil dari komponennya. Tablet-lah yang paling sering meleset: ia mewarisi
    // ukuran kontrol desktop sementara alat masukannya tetap jari.
    const kelasTab = classNameContaining(
      readSource('components/StockPerspectiveNav.tsx'),
      ['min-h-11', 'inline-flex'],
    );

    await page.setContent(pageHtml(`
      <nav class="flex items-center gap-1">
        <a id="tab" href="#" class="${kelasTab}">Technical</a>
      </nav>
    `));

    for (const [nama, lebar] of Object.entries(LEBAR)) {
      await page.setViewportSize({ width: lebar, height: TINGGI });
      const kotak = await page.locator('#tab').boundingBox();
      expect(kotak, `tab tidak terukur di ${nama}`).not.toBeNull();
      expect(kotak!.height, `tinggi tab di ${nama} (${lebar}px)`).toBeGreaterThanOrEqual(TARGET_SENTUH_MIN);
    }
  });

  test('kolom harga Watchlist memang menghilang di bawah 640px', async ({ page }) => {
    // Pemindai sumber hanya bisa memastikan kelasnya tertulis. Yang menentukan apakah
    // pengguna ponsel benar-benar kehilangan kolom itu adalah breakpoint sm yang berlaku -
    // dan breakpoint bisa digeser di tailwind.config.js tanpa satu pun test merah.
    const watchlist = readSource('app/watchlist/page.tsx');
    const kolomDesktop = classNameContaining(watchlist, ['hidden', 'sm:flex', 'text-right']);
    const barisPonsel = classNameContaining(watchlist, ['sm:hidden', 'flex-wrap']);

    await page.setContent(pageHtml(`
      <div class="flex items-center gap-3">
        <div class="min-w-0 flex-1">
          <div id="ponsel" class="${barisPonsel}"><span>Rp 9.750</span><span>Diperbarui 16:15 WIB</span></div>
        </div>
        <div id="desktop" class="${kolomDesktop}"><span>Rp 9.750</span></div>
      </div>
    `));

    await page.setViewportSize({ width: LEBAR.ponsel, height: TINGGI });
    await expect(page.locator('#desktop')).toBeHidden();
    // Inti perbaikan utang 3: di ponsel harga TETAP terlihat lewat jalur lain.
    await expect(page.locator('#ponsel')).toBeVisible();

    await page.setViewportSize({ width: LEBAR.tabletBesar, height: TINGGI });
    await expect(page.locator('#desktop')).toBeVisible();
    // Dan tidak dobel di lebar yang menampilkan kolomnya.
    await expect(page.locator('#ponsel')).toBeHidden();
  });

  test('Screener menampilkan tabel penuh mulai 768px, kartu di bawahnya', async ({ page }) => {
    // Kontrak tablet Screener. Markupnya ada di ScreenerResults, bukan di halaman - membaca
    // berkas halaman akan membuat pemeriksaan ini hijau tanpa memeriksa apa pun.
    const results = readSource('components/screener/ScreenerResults.tsx');
    const tabel = classNameContaining(results, ['hidden', 'md:block']);
    const kartu = classNameContaining(results, ['md:hidden']);

    await page.setContent(pageHtml(`
      <div id="tabel" class="${tabel}">tabel</div>
      <div id="kartu" class="${kartu}">kartu</div>
    `));

    await page.setViewportSize({ width: LEBAR.ponselBesar, height: TINGGI });
    await expect(page.locator('#tabel')).toBeHidden();
    await expect(page.locator('#kartu')).toBeVisible();

    for (const lebar of [LEBAR.tablet, LEBAR.tabletBesar, LEBAR.desktop]) {
      await page.setViewportSize({ width: lebar, height: TINGGI });
      await expect(page.locator('#tabel'), `tabel di ${lebar}px`).toBeVisible();
      await expect(page.locator('#kartu'), `kartu di ${lebar}px`).toBeHidden();
    }
  });

  test('rentang tablet menaikkan lantai sentuh, bukan cuma ukuran huruf', async ({ page }) => {
    // globals.css punya blok @media (min-width: 768px) and (max-width: 1023px) yang
    // menaikkan min-height untuk setiap kontrol lewat :where(button, [role=button], ...).
    // Sebelum FIX-11 blok itu HANYA memuat aturan font-size, jadi tombol ikon 28px tetap
    // 28px di tablet. Tombol polos di sini justru intinya: yang diuji adalah LANTAI-nya,
    // yang berlaku tanpa satu kelas pun dipasang.
    await page.setContent(pageHtml(`<button id="tombol">Filter</button>`));

    await page.setViewportSize({ width: LEBAR.ponsel, height: TINGGI });
    const diPonsel = await page.locator('#tombol').boundingBox();

    await page.setViewportSize({ width: LEBAR.tablet, height: TINGGI });
    const diTablet = await page.locator('#tombol').boundingBox();

    expect(diPonsel).not.toBeNull();
    expect(diTablet).not.toBeNull();
    expect(diTablet!.height, 'lantai sentuh rentang tablet').toBeGreaterThanOrEqual(40);
    expect(diTablet!.height).toBeGreaterThanOrEqual(diPonsel!.height);
  });

  test('halaman tidak melebar ke samping di lebar ponsel', async ({ page }) => {
    // Gejala paling umum dari tata letak yang jebol - dan yang paling tidak mungkin
    // terlihat oleh pemindai sumber, karena penyebabnya selalu gabungan beberapa aturan.
    const kelasTab = classNameContaining(
      readSource('components/StockPerspectiveNav.tsx'),
      ['min-h-11', 'inline-flex'],
    );
    const kelasNav = classNameContaining(
      readSource('components/StockPerspectiveNav.tsx'),
      ['overflow-x-auto'],
    );

    await page.setContent(pageHtml(`
      <div class="w-full px-4">
        <nav class="${kelasNav}">
          ${['Technical', 'Fundamental', 'Flow', 'Valuation']
            .map((label) => `<a href="#" class="${kelasTab}">${label}</a>`)
            .join('')}
        </nav>
      </div>
    `));

    for (const lebar of [LEBAR.ponsel, LEBAR.ponselBesar]) {
      await page.setViewportSize({ width: lebar, height: TINGGI });
      const melebar = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(melebar, `dokumen menggulir horizontal di ${lebar}px`).toBe(false);
    }
  });
});

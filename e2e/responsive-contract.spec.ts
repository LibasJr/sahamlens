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

  test('label bilah navigasi bawah tidak keluar dari selnya', async ({ page }) => {
    // KEJADIANNYA, 20 Agustus 2026: bilah bawah memakai nama merek panjang sebagai label
    // ("LensMarket", "LensRadar", "LensConsensus"). Lima sel di layar 320px hanya selebar
    // 56px masing-masing, sedangkan "LensConsensus" terukur 101px - teksnya meluber keluar
    // selnya dan menimpa label tetangganya, di SETIAP halaman aplikasi.
    //
    // Yang diuji di sini mekanismenya, bukan daftar labelnya: label sepanjang apa pun harus
    // berhenti di batas selnya sendiri. Jadi test ini tetap berlaku kalau labelnya berubah.
    const sumber = readSource('components/MobileNav.tsx');
    const kelasWadah = classNameContaining(sumber, ['grid-cols-5', 'items-stretch']);
    const kelasSel = classNameContaining(sumber, ['min-h-14', 'flex-col']);
    const kelasLabel = classNameContaining(sumber, ['truncate', 'text-center']);

    const label = ['Beranda', 'Market', 'Radar', 'Analisis', 'Menu'];

    for (const lebar of [320, LEBAR.ponsel, LEBAR.ponselBesar]) {
      await page.setViewportSize({ width: lebar, height: TINGGI });
      // inset-x-3 pada .lens-mobile-nav: bilahnya 12px dari tiap tepi layar.
      await page.setContent(pageHtml(`
        <div style="width:${lebar - 24}px">
          <div class="${kelasWadah}">
            ${label.map((teks, i) => `<a href="#" data-i="${i}" class="${kelasSel}">
              <span class="${kelasLabel}">${teks}</span>
            </a>`).join('')}
          </div>
        </div>
      `));

      for (let i = 0; i < label.length; i += 1) {
        const sel = await page.locator(`[data-i="${i}"]`).boundingBox();
        const teks = await page.locator(`[data-i="${i}"] span`).boundingBox();
        expect(sel, `sel ${label[i]} tidak terukur di ${lebar}px`).not.toBeNull();
        expect(teks, `label ${label[i]} tidak terukur di ${lebar}px`).not.toBeNull();
        // Batas selnya, bukan batas layar: yang merusak tampilan adalah label yang
        // menabrak TETANGGANYA, dan itu terjadi jauh sebelum ada gulir horizontal.
        expect(teks!.x, `label "${label[i]}" keluar ke kiri selnya di ${lebar}px`).toBeGreaterThanOrEqual(sel!.x - 0.5);
        expect(
          teks!.x + teks!.width,
          `label "${label[i]}" keluar ke kanan selnya di ${lebar}px`,
        ).toBeLessThanOrEqual(sel!.x + sel!.width + 0.5);
      }

      // Dan di lebar ponsel yang wajar, label sependek ini tidak boleh sampai terpotong -
      // truncate itu pagar terakhir, bukan tampilan sehari-hari.
      if (lebar >= LEBAR.ponsel) {
        const terpotong = await page.evaluate(() =>
          [...document.querySelectorAll('a[data-i] span')]
            .filter((el) => el.scrollWidth > el.clientWidth + 1)
            .map((el) => el.textContent?.trim()),
        );
        expect(terpotong, `label terpotong di ${lebar}px`).toEqual([]);
      }
    }
  });
  /**
   * Label status yang keluar dari kotaknya di ponsel (dilaporkan pengguna 2026-08-23).
   *
   * Dua kotak di aplikasi ini berlebar TETAP sementara isinya label yang panjangnya
   * ditentukan mesin keputusan, bukan oleh yang menulis markupnya:
   *
   *   - gauge DecisionScoreCard: `size={150}` mati, sedangkan getSimpleDecisionLabel()
   *     bisa mengembalikan 'NETRAL / PANTAU'
   *   - kartu Valuasi Harga: separuh layar (grid-cols-2), sedangkan computeValuationLabel()
   *     bisa mengembalikan 'UNDERVALUED' - satu kata yang tidak bisa dipenggal
   *
   * Terukur sebelum diperbaiki: 'UNDERVALUED' menonjol keluar kartu di 320px, dan chip
   * gauge menyisakan 1px dari 150px. Yang kedua belum luber, tapi harness ini memakai
   * font sistem sedangkan produksi memakai Inter - sisa satu piksel bukan lulus, itu
   * kebetulan. Karena itu yang dijaga di sini BUKAN "tidak luber" melainkan ada CADANGAN.
   *
   * Daftar labelnya sengaja disalin dari kedua service-nya. Kalau di sana ditambahkan
   * label yang lebih panjang tanpa menambahkannya ke sini, test ini lulus tanpa memeriksa
   * yang baru - jadi kalau menambah label, tambahkan juga di bawah.
   */
  const CADANGAN_MIN = 4;

  test('chip putusan gauge tidak menghabiskan lebar kotaknya yang mati', async ({ page }) => {
    const gauge = readSource('components/ui/RadialScoreGauge.tsx');
    // Fragmen ditulis UTUH beserta spasinya. `classNameContaining` mencocokkan SUBSTRING,
    // jadi 'rounded' ikut cocok dengan 'rounded-full' - probe pertama untuk temuan ini
    // mengukur chip yang sama sekali lain gara-gara itu, dan hasilnya terbaca meyakinkan.
    const kelasReadout = classNameContaining(gauge, ['absolute inset-x-0 bottom-1']);
    const kelasChip = classNameContaining(gauge, ['lens-chip mt-1 max-w-full px-2 py-0.5 rounded-full']);

    // SimpleDecisionLabel di modules/eligibility/service/decision-presentation.service.ts
    const label = ['INFORMASI', 'DATA TERBATAS', 'TIDAK LAYAK', 'SINYAL POSITIF', 'SINYAL NEGATIF', 'NETRAL / PANTAU'];
    // Lebar kotak gauge di DecisionScoreCard - dikunci di sini supaya perubahan `size`
    // di sana tidak diam-diam melewati pemeriksaan ini.
    const LEBAR_GAUGE = 150;

    for (const [nama, lebar] of Object.entries(LEBAR)) {
      await page.setViewportSize({ width: lebar, height: TINGGI });
      for (const teks of label) {
        await page.setContent(pageHtml(`
          <div id="kotak" class="relative" style="width:${LEBAR_GAUGE}px;height:110px">
            <div class="${kelasReadout}">
              <div class="flex items-baseline justify-center gap-0.5"><span class="font-heading text-3xl font-black font-number tracking-tight">72</span></div>
              <div id="chip" class="${kelasChip}">${teks}</div>
            </div>
          </div>
        `));
        const chip = await page.locator('#chip').boundingBox();
        expect(chip, `chip "${teks}" tidak terukur di ${nama}`).not.toBeNull();
        expect(
          LEBAR_GAUGE - chip!.width,
          `chip "${teks}" di ${nama} (${lebar}px) menyisakan ${Math.round(LEBAR_GAUGE - chip!.width)}px dari ${LEBAR_GAUGE}px - terlalu mepet untuk font produksi yang berbeda dari font harness`,
        ).toBeGreaterThanOrEqual(CADANGAN_MIN);
      }
    }
  });

  test('label valuasi tetap di dalam kartunya sampai 320px', async ({ page }) => {
    const fundamental = readSource('components/fundamental/FundamentalOverview.tsx');
    const kelasGrid = classNameContaining(fundamental, ['grid w-full grid-cols-2 gap-3']);
    const kelasKartu = classNameContaining(fundamental, ['min-h-[64px] w-full rounded-xl border px-2 py-2 sm:px-3']);
    const kelasBaris = classNameContaining(fundamental, ['flex min-w-0 flex-wrap items-center justify-center gap-1.5']);
    const kelasTeks = classNameContaining(fundamental, ['min-w-0 break-words text-sm font-bold leading-tight']);

    // computeValuationLabel() di modules/fundamental/service/consensus-labels.service.ts
    const label = ['UNDERVALUED', 'OVERVALUED', 'FAIR VALUE', 'DATA TIDAK CUKUP'];

    // 320px ikut diuji dan BUKAN bagian dari LEBAR: di situlah satu-satunya kegagalan
    // terukur, dan menghapusnya dari daftar membuat test ini hijau tanpa arti.
    for (const lebar of [320, LEBAR.ponsel, LEBAR.ponselBesar, LEBAR.tablet]) {
      await page.setViewportSize({ width: lebar, height: TINGGI });
      for (const teks of label) {
        await page.setContent(pageHtml(`
          <div style="padding:20px">
            <div class="${kelasGrid}">
              <div class="min-w-0">
                <div id="kartu" class="${kelasKartu}">
                  <div class="${kelasBaris}">
                    <svg class="h-4 w-4 shrink-0"></svg>
                    <span id="teks" class="${kelasTeks}">${teks}</span>
                  </div>
                  <div class="mt-1 text-[11px] font-semibold opacity-80">MOS +25%</div>
                </div>
              </div>
              <div class="min-w-0"><div class="${kelasKartu}"><span class="${kelasTeks}">BAGUS</span></div></div>
            </div>
          </div>
        `));
        const kartu = await page.locator('#kartu').boundingBox();
        const label_ = await page.locator('#teks').boundingBox();
        expect(kartu, `kartu tidak terukur di ${lebar}px`).not.toBeNull();
        expect(label_, `label "${teks}" tidak terukur di ${lebar}px`).not.toBeNull();
        expect(label_!.x, `label "${teks}" keluar ke kiri kartunya di ${lebar}px`).toBeGreaterThanOrEqual(kartu!.x - 0.5);
        expect(
          label_!.x + label_!.width,
          `label "${teks}" keluar ke kanan kartunya di ${lebar}px`,
        ).toBeLessThanOrEqual(kartu!.x + kartu!.width + 0.5);
      }
    }
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Dua kegagalan nyata yang dijaga berkas ini.
 *
 * 1. FONT YANG NAMANYA SAJA. 23 September 2026 (`2fef5146`) `next/font/google` dilepas
 *    supaya build CI tidak mengambil berkas dari fonts.googleapis.com - benar sebagai
 *    perbaikan CI, tetapi diganti dengan stack sistem sehingga globals.css berbunyi
 *    `--font-inter: Arial` dan `--font-jetbrains-mono: 'Courier New'`. Selama satu hari
 *    penuh aplikasi TIDAK PERNAH menyajikan Inter sama sekali, meski seluruh peran
 *    tipografi dan konfigurasi Tailwind menyebut namanya. Nama token tetap benar,
 *    fontnya yang bohong.
 *
 *    Solusinya berkas woff2 ikut di-commit (`app/fonts/`) dan dimuat `next/font/local`:
 *    tidak ada permintaan jaringan saat build, dan keluarga fontnya benar-benar ada.
 *    Gerbang ini menjaga KEDUA sisi sekaligus - berganti ke `next/font/google` akan
 *    mengulang kegagalan CI, kembali ke stack sistem akan mengulang kegagalan font.
 *
 * 2. PERAN ANGKA YANG TIDAK SEJAJAR. Tujuan JetBrains Mono adalah digit berlebar sama,
 *    jadi kolom harga tidak bergoyang saat nilainya berubah. Peran numerik tanpa
 *    `font-variant-numeric: tabular-nums` terlihat benar di satu baris lalu bergeser di
 *    baris berikutnya - dan itu tidak terlihat di test lain mana pun.
 */
const ROOT = path.resolve(__dirname, '..');
const CSS_RAW = fs.readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf8');
const LAYOUT_RAW = fs.readFileSync(path.join(ROOT, 'app', 'layout.tsx'), 'utf8');
const FONT_DIR = path.join(ROOT, 'app', 'fonts');

/**
 * Buang komentar SEBELUM mencocokkan pola.
 *
 * Berkas ini menjaga "tidak ada next/font/google" dan "--font-inter bukan Arial" -
 * dan layout.tsx maupun globals.css sama-sama MENJELASKAN kedua kesalahan itu di
 * komentar, tepat di sebelah kodenya. Tanpa penyaring ini, gerbangnya merah karena
 * prosa dokumentasinya sendiri; itu cara termudah membuat sebuah gerbang hijau tanpa
 * memeriksa apa pun, dan sudah pernah terjadi di repo ini (lihat CLAUDE.md §2).
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const CSS = stripComments(CSS_RAW);
const LAYOUT = stripComments(LAYOUT_RAW);

/** Isi deklarasi sebuah peran, dari `.nama {` sampai `}` pertama. */
function peran(nama: string): string {
  const start = CSS.indexOf(`.${nama} {`);
  expect(start, `peran .${nama} tidak ditemukan di globals.css`).toBeGreaterThanOrEqual(0);
  const end = CSS.indexOf('}', start);
  return CSS.slice(start, end);
}

function ukuranPeran(nama: string): number {
  const cocok = peran(nama).match(/font-size:\s*([\d.]+)rem/);
  expect(cocok, `font-size ${nama} tidak ditemukan`).not.toBeNull();
  return Number.parseFloat(cocok![1]);
}

describe('font benar-benar dimuat, bukan hanya dinamai', () => {
  it('layout memakai next/font/local dan tidak pernah next/font/google', () => {
    expect(LAYOUT).toMatch(/import\s+localFont\s+from\s+'next\/font\/local'/);
    // Kalau baris ini gagal, build CI akan menuntut jaringan ke fonts.googleapis.com
    // lagi - persis kegagalan yang membuat 2fef5146 dibuat.
    expect(LAYOUT).not.toMatch(/next\/font\/google/);
    expect(LAYOUT.match(/localFont\(/g)?.length, 'dua keluarga: Inter + JetBrains Mono').toBe(2);
  });

  it('berkas woff2 kedua keluarga ikut di-commit dan benar-benar woff2', () => {
    expect(fs.existsSync(FONT_DIR), 'app/fonts/ hilang - font jadi stack sistem lagi').toBe(true);
    const berkas = fs.readdirSync(FONT_DIR).filter((nama) => nama.endsWith('.woff2'));
    // Penjaga jumlah: angka ini tidak boleh turun ke nol. Kalau berkas font dihapus,
    // keluarga font jatuh ke fallback sistem dan seluruh peran tipografi berbohong.
    expect(berkas.length, 'tidak ada berkas font sama sekali').toBeGreaterThanOrEqual(3);
    for (const nama of berkas) {
      const isi = fs.readFileSync(path.join(FONT_DIR, nama));
      expect(isi.subarray(0, 4).toString('latin1'), `${nama} bukan woff2`).toBe('wOF2');
      expect(isi.length, `${nama} terlalu kecil untuk font sungguhan`).toBeGreaterThan(10_000);
    }
    expect(berkas.some((nama) => nama.startsWith('inter'))).toBe(true);
    expect(berkas.some((nama) => nama.startsWith('jetbrains-mono'))).toBe(true);
  });

  it('setiap berkas yang dirujuk layout ada di app/fonts/', () => {
    const rujukan = [...LAYOUT.matchAll(/path:\s*'\.\/fonts\/([^']+)'/g)].map((m) => m[1]);
    expect(rujukan.length, 'layout tidak merujuk satu berkas font pun').toBeGreaterThanOrEqual(3);
    for (const nama of rujukan) {
      expect(fs.existsSync(path.join(FONT_DIR, nama)), `${nama} dirujuk tapi tidak ada`).toBe(true);
    }
  });

  it('variabel font di globals.css menunjuk ke font yang dimuat, bukan ke Arial', () => {
    const deklarasi = CSS.match(/--font-inter:\s*([^;]+);/)?.[1] ?? '';
    expect(deklarasi).toContain('var(--font-inter-src');
    // Arial boleh muncul sebagai cadangan TERAKHIR, tapi tidak boleh jadi pilihan pertama.
    expect(deklarasi.trim().startsWith('Arial'), '--font-inter mundur ke Arial lagi').toBe(false);
    expect(deklarasi).not.toMatch(/^var\(--font-inter-src\)\s*,/); // tanpa fallback = deklarasi batal

    const mono = CSS.match(/--font-jetbrains-mono:\s*([^;]+);/)?.[1] ?? '';
    expect(mono).toContain('var(--font-jetbrains-mono-src');
    expect(mono.trim().startsWith('Courier'), '--font-jetbrains-mono mundur ke Courier New lagi').toBe(false);
    expect(mono).not.toMatch(/^var\(--font-jetbrains-mono-src\)\s*,/);

    // Variabel sumber harus benar-benar dipasang layout ke elemen <html>.
    expect(LAYOUT).toContain("'--font-inter-src'");
    expect(LAYOUT).toContain("'--font-jetbrains-mono-src'");
    expect(LAYOUT).toMatch(/inter\.variable/);
    expect(LAYOUT).toMatch(/jetbrainsMono\.variable/);
  });
});

describe('peran numerik sejajar per digit', () => {
  const peranNumerik = ['lens-metric', 'lens-metric-lg', 'lens-display', 'lens-number'];

  it.each(peranNumerik)('%s memakai tabular-nums', (nama) => {
    expect(peran(nama)).toContain('tabular-nums');
  });

  it.each(peranNumerik.filter((nama) => nama !== 'lens-number'))('%s memakai mono', (nama) => {
    expect(peran(nama)).toMatch(/--font-jetbrains-mono/);
  });

  it('lens-number mengikuti ukuran konteksnya (tanpa font-size sendiri)', () => {
    expect(peran('lens-number')).not.toMatch(/font-size/);
  });

  it('lens-number dideklarasikan SETELAH peran ukuran yang ingin dikomposisikan', () => {
    // Urutan berkas adalah kontraknya: pada spesifisitas sama, deklarasi terakhir
    // menang. `.lens-meta lens-number` hanya menghasilkan mono kalau .lens-number
    // ditulis belakangan - kalau seseorang merapikan blok ini dan memindahkannya ke
    // atas, angka keuangan diam-diam kembali memakai Inter tanpa ada yang merah.
    const nomor = CSS.indexOf('.lens-number {');
    for (const peranUkuran of ['lens-meta', 'lens-label', 'lens-body-sm', 'lens-caption']) {
      expect(nomor, `.lens-number harus setelah .${peranUkuran}`).toBeGreaterThan(
        CSS.indexOf(`.${peranUkuran} {`),
      );
    }
  });

  it('peran numerik terurut: display di atas metric, metric-lg di atas metric', () => {
    const metric = ukuranPeran('lens-metric');
    const display = ukuranPeran('lens-display');
    const besar = ukuranPeran('lens-metric-lg');
    expect(display).toBeGreaterThan(metric);
    expect(besar).toBeGreaterThan(metric);
    // Sasaran audit: harga utama 28-30px, metrik besar 24-30px.
    expect(display).toBeGreaterThanOrEqual(1.75);
    expect(display).toBeLessThanOrEqual(1.875);
    expect(besar).toBeGreaterThanOrEqual(1.5);
    // Dan keduanya naik lagi di layar besar - bukan membeku di ukuran ponsel.
    // Blok 640px pertama di berkas ini bukan tempat peran tipografi diperbesar,
    // jadi cari blok yang benar-benar memuat perannya.
    const blok = [...CSS.matchAll(/@media \(min-width: 640px\) \{/g)].map((m) =>
      CSS.slice(m.index, m.index + 600),
    );
    expect(
      blok.some((isi) => /\.lens-metric-lg\s*\{\s*font-size:\s*[\d.]+rem/.test(isi)),
      'lens-metric-lg tidak pernah diperbesar untuk layar besar',
    ).toBe(true);
  });
});

describe('skala peran tetap berjenjang setelah penambahan peran baru', () => {
  it('peran UI duduk di antara body dan label', () => {
    const body = ukuranPeran('lens-body');
    const ui = ukuranPeran('lens-ui');
    const label = ukuranPeran('lens-label');
    expect(ui).toBeLessThan(body);
    expect(ui).toBeGreaterThanOrEqual(label);
  });

  it('eyebrow tidak lagi memakai ukuran mikro 10px', () => {
    // Sebelum 24 September 2026 ia 0.625rem (10px) - satu-satunya peran yang berbeda
    // antara desktop (10px) dan ponsel (lantai kompatibilitas mengangkatnya ke 12px).
    expect(ukuranPeran('lens-eyebrow')).toBeGreaterThanOrEqual(0.75);
  });
});

describe('penjaga struktural yang tidak boleh hilang', () => {
  it('lens-chip tidak boleh dipasang ke elemen struktur tabel', () => {
    // `html .lens-chip { display: inline-flex }` pada tr/th/td pernah merusak layout
    // tabel di produksi. Penjaganya harus tetap ada, bukan hanya "tidak diubah".
    expect(CSS).toMatch(/html :is\(table, thead, tbody, tfoot, tr, th, td\)\.lens-chip/);
  });

  it('lantai kompatibilitas ukuran tetap ada selama migrasi belum selesai', () => {
    // Dihapus hanya setelah `node scripts/audit-typography-ratchet.mjs` menunjukkan
    // arbitrary_total turun ke nol.
    expect(CSS).toMatch(/\.lens-main :where\(\.text-\\\[9px\\\], \.text-\\\[10px\\\], \.text-\\\[11px\\\]\)/);
  });
});

describe('jawaban LensAI nyaman dibaca, bukan microcopy', () => {
  /**
   * Blok deklarasi yang benar-benar menyetel `font-size` untuk sebuah selector.
   *
   * Selector `.ai-response h1` muncul dua kali: sekali di aturan bersama
   * (h1/h2/h3 => warna + margin) dan sekali di aturan ukurannya sendiri. Yang dicari
   * adalah blok yang memuat `font-size` - kalau aturan ukurannya dihapus, test ini
   * gagal menyebut selector-nya, bukan diam-diam membaca aturan warna.
   */
  function blokAi(selector: string): string {
    const blok: string[] = [];
    let dari = CSS.indexOf(selector);
    expect(dari, `${selector} tidak ditemukan di globals.css`).toBeGreaterThanOrEqual(0);
    while (dari >= 0) {
      const buka = CSS.indexOf('{', dari);
      if (buka < 0) break;
      blok.push(CSS.slice(buka, CSS.indexOf('}', buka)));
      dari = CSS.indexOf(selector, dari + 1);
    }
    const denganUkuran = blok.find((isi) => /font-size:/.test(isi));
    expect(denganUkuran, `${selector} tidak punya aturan font-size sendiri`).toBeDefined();
    return denganUkuran!;
  }

  /**
   * Ukuran dalam px dari blok deklarasi. globals.css menulis sebagian besar peran
   * dalam rem, jadi keduanya diterima dan dinormalkan ke px (akar 16px).
   */
  const px = (blok: string, apa: string): number => {
    const pxLangsung = blok.match(new RegExp(`${apa}:\\s*([\\d.]+)px`));
    if (pxLangsung) return Number.parseFloat(pxLangsung[1]);
    const rem = blok.match(new RegExp(`${apa}:\\s*([\\d.]+)rem`));
    if (rem) return Number.parseFloat(rem[1]) * 16;
    throw new Error(`${apa} tidak ditemukan pada blok: ${blok.slice(0, 120)}`);
  };

  it('.ai-response memakai ukuran bacaan, bukan 13px', () => {
    // 13px adalah ukuran yang brief audit larang sebagai default jawaban AI panjang -
    // 13px = ambang "tidak gagal", sedangkan jawaban LensAI bisa berhalaman-halaman.
    const blok = blokAi('.ai-response');
    expect(px(blok, 'font-size')).toBeGreaterThanOrEqual(15);
  });

  it('tinggi barisnya di rentang nyaman baca (1.6-1.7)', () => {
    const lh = Number.parseFloat(blokAi('.ai-response').match(/line-height:\s*([\d.]+);/)?.[1] ?? '0');
    expect(lh).toBeGreaterThanOrEqual(1.6);
    expect(lh).toBeLessThanOrEqual(1.7);
  });

  it('hierarki heading Markdown tetap berjenjang', () => {
    const h1 = px(blokAi('.ai-response h1'), 'font-size');
    const h2 = px(blokAi('.ai-response h2'), 'font-size');
    const h3 = px(blokAi('.ai-response h3'), 'font-size');
    expect(h1).toBeGreaterThan(h2);
    expect(h2).toBeGreaterThan(h3);
    // Sasaran audit: heading besar 20px, sub-bagian 15px.
    expect(h1).toBeGreaterThanOrEqual(20);
    expect(h3).toBeGreaterThanOrEqual(15);
  });

  it('kolom jawaban dibatasi lebar baca dan tidak memakai ukuran responsif yang turun', () => {
    const chat = fs.readFileSync(path.join(ROOT, 'components', 'AIChat.tsx'), 'utf8');
    // max-w-prose = 65ch - di dalam rentang 65-70ch yang diminta audit.
    expect(chat, 'kolom jawaban kehilangan batas lebar baca').toContain('max-w-prose');
    // Pesan LensAI dulu `text-base leading-relaxed sm:text-sm`: 16px di ponsel lalu
    // 14px di desktop. Peran `lens-body` (15px/1.6) membuat ukuran yang dideklarasikan
    // sama dengan yang dirender.
    expect(chat, 'pesan LensAI kembali memakai ukuran responsif yang mengecil').not.toContain(
      'text-base leading-relaxed sm:text-sm',
    );
    expect(chat).toContain('lens-body');
    // Input TETAP 16px di ponsel dengan sengaja: di bawah 16px, Safari iOS memperbesar
    // halaman saat papan ketik terbuka. Itu bukan kelalaian migrasi.
    expect(chat, 'input LensAI kehilangan 16px ponsel - papan ketik iOS akan memperbesar halaman')
      .toMatch(/text-base text-tv-text sm:min-h-0 sm:text-sm/);
  });
});
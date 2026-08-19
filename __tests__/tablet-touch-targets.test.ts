import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CELAH TABLET 768-1023px (FIX-11, audit UI/UX 2026-08-19).
 *
 * Rentang ini gampang hilang dari perhatian karena ia bukan "mobile" maupun "desktop":
 * pengembang menguji di 375px dan di 1440px, dan yang di tengah tidak pernah dilihat.
 * Padahal tablet mewarisi ukuran kontrol DESKTOP - varian `sm:`/`md:` yang mengecilkan
 * tombol sudah aktif di lebar itu - sementara alat masukannya tetap jari.
 *
 * Dua invarian di bawah tidak bisa dijaga tes visual di repo ini (tidak ada jsdom
 * maupun Playwright), jadi yang diperiksa adalah keberadaan aturannya di sumber. Itu
 * lebih lemah daripada mengukur piksel sungguhan, tapi jauh lebih kuat daripada
 * mengandalkan ingatan bahwa rentang ini pernah diurus - dan ia menangkap justru cara
 * paling mungkin keduanya hilang: seseorang merapikan CSS atau mengubah breakpoint
 * tabel tanpa tahu rentang tablet bergantung padanya.
 */

const ROOT = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf8');
// Markup tabelnya ada di ScreenerResults, bukan di app/screener/page.tsx - halaman itu
// tinggal merakit ScreenerControls + ScreenerResults. Membaca berkas halaman membuat
// gerbang ini hijau tanpa memeriksa apa pun.
const SCREENER = fs.readFileSync(
  path.join(ROOT, 'components', 'screener', 'ScreenerResults.tsx'),
  'utf8',
);

/** Isi blok @media rentang tablet, diambil dengan menghitung kurung. */
function tabletMediaBlock(): string {
  const marker = '@media (min-width: 768px) and (max-width: 1023px) {';
  const start = CSS.indexOf(marker);
  expect(start, 'blok media rentang tablet hilang dari globals.css').toBeGreaterThan(-1);

  let depth = 0;
  let i = start + marker.length - 1;
  for (; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++;
    else if (CSS[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return CSS.slice(start, i + 1);
}

describe('celah tablet 768-1023px', () => {
  const block = tabletMediaBlock();

  it('menaikkan target sentuh, bukan hanya ukuran huruf', () => {
    // Sebelum FIX-11 blok ini HANYA memuat aturan font-size. Kalau suatu saat kembali
    // begitu, tablet diam-diam kehilangan lantai target sentuhnya lagi.
    expect(block).toMatch(/min-height:\s*\d+px/);
  });

  it('lantai sentuhnya minimal 40px - jauh di atas minimum WCAG 2.5.8 (24px)', () => {
    const match = block.match(/min-height:\s*(\d+)px/);
    expect(match, 'aturan min-height tidak ditemukan di blok tablet').not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(40);
  });

  it('mencakup tombol dan tautan yang berperilaku seperti tombol', () => {
    expect(block).toContain("button");
    expect(block).toContain("[role='button']");
  });

  it('memakai :where() supaya spesifisitasnya nol dan komponen tetap bisa menang', () => {
    // Tanpa :where(), aturan ini akan mengalahkan ukuran yang sengaja dipilih komponen
    // dan satu-satunya jalan keluarnya jadi !important.
    expect(block).toMatch(/:where\([^)]*button/);
  });
});

describe('tabel screener di tablet', () => {
  it('tabel penuh muncul mulai md, bukan lg', () => {
    // Dengan `lg:`, tablet mendapat daftar kartu ponsel dan kehilangan 12 kolom.
    expect(SCREENER).toContain('hidden md:block overflow-x-auto');
    expect(SCREENER).not.toContain('hidden lg:block overflow-x-auto');
  });

  it('daftar kartu berhenti tepat di ambang yang sama - tidak tumpang tindih, tidak bolong', () => {
    // Kalau tabelnya md: tapi kartunya masih lg:hidden, rentang 768-1023 merender
    // KEDUANYA sekaligus.
    expect(SCREENER).toContain('md:hidden space-y-2');
    expect(SCREENER).not.toContain('lg:hidden space-y-2');
  });

  it('kolom kode saham tetap dibekukan - itu yang membuat gulir horizontal berguna', () => {
    // Tanpa kolom beku, menggulir ke kolom ke-10 di tablet berarti kehilangan konteks
    // saham mana yang sedang dibaca (FIX-3).
    expect(SCREENER).toContain('lens-table-sticky-col');
    expect(SCREENER).toContain('lens-table-sticky-col-2');
  });
});

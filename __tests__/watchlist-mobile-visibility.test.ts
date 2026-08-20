import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * UTANG 3, catatan redesign v2: di Watchlist seluruh kolom kanan memakai
 * `hidden sm:flex`, jadi di bawah 640px yang hilang bukan cuma cap kesegaran -
 * HARGA TERKINI ikut hilang. Yang tersisa di layar telepon hanyalah kode emiten,
 * label sinyal, dan persentase P&L: angka turunan tanpa angka asalnya.
 *
 * Watchlist adalah ruang PEMANTAUAN (PRD SEC.24) - permukaan yang justru paling sering
 * dibuka dari telepon di sela jam bursa. Menyembunyikan harga dan umurnya di sana
 * membalik prioritasnya.
 *
 * Repo ini tidak punya jsdom maupun Playwright, jadi yang bisa dijaga adalah aturan
 * tata letaknya di sumber. Itu lebih lemah daripada mengukur piksel sungguhan, tapi
 * menangkap justru cara paling mungkin perbaikan ini hilang: seseorang merapikan baris
 * watchlist dan mengembalikan harga ke satu kolom `hidden sm:*` saja.
 */

const ROOT = path.resolve(__dirname, '..');
const WATCHLIST = path.join(ROOT, 'app', 'watchlist', 'page.tsx');

/** lib/api/fetcher.ts pernah membuat ratchet adopsi gagal karena ia MENDOKUMENTASIKAN
 *  dirinya dengan kode di komentar. Pemindai apa pun di repo ini membuang komentar dulu
 *  (CLAUDE.md SEC.2) - kalau tidak, prosa bisa meluluskan gerbang. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function bacaWatchlist(): string {
  expect(
    fs.existsSync(WATCHLIST),
    'app/watchlist/page.tsx hilang - pindahkan gerbangnya, jangan biarkan lulus tanpa memeriksa',
  ).toBe(true);
  return stripComments(fs.readFileSync(WATCHLIST, 'utf8'));
}

/** Akhir tag pembuka yang dimulai di `start`, atau -1 kalau tidak ketemu.
 *  Tanda `>` di dalam string atribut tidak dihitung. */
function endOfOpeningTag(source: string, start: number): number {
  let quote: string | null = null;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '>') return i;
  }
  return -1;
}

/**
 * Rentang [awal, akhir) setiap elemen yang className-nya menyembunyikannya di bawah
 * breakpoint sm - yaitu `hidden` yang baru dibatalkan oleh varian `sm:`.
 *
 * Dicari lewat penghitungan tag, bukan lewat pencocokan daftar kelas persis. Kelas
 * tata letak berubah wajar (`w-28` bisa jadi `w-32`); yang tidak boleh berubah diam-diam
 * adalah harga hanya hidup di dalam salah satu elemen ini.
 */
function rentangTersembunyiDiBawahSm(source: string): Array<[number, number]> {
  const rentang: Array<[number, number]> = [];

  for (const match of source.matchAll(/className="([^"]*)"/g)) {
    const kelas = match[1];
    if (!/\bhidden\b/.test(kelas) || !/\bsm:(flex|block|grid|inline-flex|inline-block|table)\b/.test(kelas)) {
      continue;
    }

    const awalTag = source.lastIndexOf('<', match.index!);
    if (awalTag < 0) continue;
    const namaTag = source.slice(awalTag).match(/^<([A-Za-z][\w.]*)/)?.[1];
    if (!namaTag) continue;

    const akhirPembuka = endOfOpeningTag(source, awalTag);
    if (akhirPembuka < 0) continue;
    // Self-closing: elemennya habis di tag itu juga.
    if (source[akhirPembuka - 1] === '/') {
      rentang.push([awalTag, akhirPembuka + 1]);
      continue;
    }

    let depth = 1;
    let i = akhirPembuka + 1;
    while (i < source.length && depth > 0) {
      if (source.startsWith(`</${namaTag}`, i)) {
        depth--;
        if (depth === 0) {
          const tutup = source.indexOf('>', i);
          rentang.push([awalTag, tutup < 0 ? source.length : tutup + 1]);
          break;
        }
        i += namaTag.length + 3;
        continue;
      }
      if (source.startsWith(`<${namaTag}`, i) && /[\s/>]/.test(source[i + namaTag.length + 1] ?? '')) {
        depth++;
        i += namaTag.length + 1;
        continue;
      }
      i++;
    }
  }

  return rentang;
}

/** Berapa kali `needle` muncul DI LUAR setiap elemen yang tersembunyi di bawah sm. */
function kemunculanTerlihatDiTelepon(source: string, needle: string): number {
  const rentang = rentangTersembunyiDiBawahSm(source);
  let n = 0;
  let dari = 0;
  for (;;) {
    const at = source.indexOf(needle, dari);
    if (at < 0) return n;
    if (!rentang.some(([awal, akhir]) => at >= awal && at < akhir)) n++;
    dari = at + needle.length;
  }
}

describe('Watchlist di lebar telepon', () => {
  const source = bacaWatchlist();

  it('pemindainya benar-benar melihat kolom yang disembunyikan di bawah sm', () => {
    // Kalau angka ini jatuh ke nol, pemindainya yang rusak - bukan berarti tidak ada
    // lagi yang tersembunyi. Tanpa penjaga ini, gerbang di bawah lulus dengan sendirinya.
    expect(rentangTersembunyiDiBawahSm(source).length).toBeGreaterThan(0);
  });

  it('harga terkini punya jalur render yang terlihat di bawah 640px', () => {
    expect(kemunculanTerlihatDiTelepon(source, 'currentPrice.toLocaleString')).toBeGreaterThan(0);
  });

  it('cap kesegaran punya jalur render yang terlihat di bawah 640px', () => {
    expect(kemunculanTerlihatDiTelepon(source, 'kesegaran.shortLabel')).toBeGreaterThan(0);
  });

  it('cap kesegaran tetap memakai warna dan penjelasan dari describeFreshness', () => {
    // STALE wajib tetap tampil sebagai peringatan di telepon juga - menyalinnya sebagai
    // teks polos tanpa `tone` akan membuat data berumur tiga hari terbaca seperti harga
    // hari ini, persis hal yang dicegah shared/presentation/freshness-labels.ts.
    expect(source).toContain('describeFreshness');
    expect(source).toContain('kesegaran.tone');
    expect(source).toContain('kesegaran.detail');
  });
});

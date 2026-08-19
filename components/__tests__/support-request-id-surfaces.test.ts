import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Setiap response API melewati `runController`, yang selalu menyetel `X-Request-Id` dan
 * menyalin id yang sama ke `body.meta.requestId`. Id itulah satu-satunya benang yang
 * menyambungkan keluhan pengguna ke satu baris log server.
 *
 * MASALAH YANG DIJAGA: benangnya putus di lapisan terakhir. `apiRequest` sudah membawa
 * `requestId` pada setiap `ApiClientError`, tetapi kalau permukaan yang menampilkan
 * kegagalan tidak pernah merendernya, id itu hanya hidup di memori browser dan mati
 * bersama halaman. Laporan yang sampai ke dukungan berhenti di "screener error" - tidak
 * bisa dicari, tidak bisa dikorelasikan.
 *
 * Penjaga ini memindai sumber, bukan DOM: repo ini tidak punya jsdom maupun Playwright,
 * dan kontrak yang dijaga memang kontrak sumber - permukaan galat WAJIB merender
 * <ApiErrorHint> dan WAJIB mengisi propnya dari error yang tertangkap.
 */

const ROOT = path.resolve(__dirname, '../..');

/** Batas untuk pemindai yang membaca banyak berkas secara sinkron. Default vitest 5 detik
 *  terlalu ketat di Windows dan menghasilkan kegagalan yang tidak ada hubungannya dengan
 *  kontrak yang diuji. */
const BATAS_PEMINDAI_MS = 30_000;

/** Permukaan yang menampilkan kegagalan pemuatan data dan karenanya harus membawa ID
 *  dukungan. Daftar ini eksplisit: menebaknya dari pola "ada EmptyState galat" akan
 *  menangkap layar kosong biasa yang bukan kegagalan API. */
const PERMUKAAN_GALAT: { file: string; state: string }[] = [
  // Home dan Dashboard sudah membawanya sejak redesign v2; didaftarkan supaya tidak
  // hilang diam-diam saat komponennya dirapikan.
  { file: 'components/HomeWorkspace.tsx', state: 'supportRequestId' },
  { file: 'components/dashboard/DashboardLoadStates.tsx', state: 'requestId' },
  { file: 'components/AIChat.tsx', state: 'supportRequestId' },
  { file: 'components/screener/ScreenerResults.tsx', state: 'loadErrorRequestId' },
  { file: 'app/watchlist/page.tsx', state: 'watchlistErrorRequestId' },
  { file: 'app/compare/page.tsx', state: 'fetchErrorRequestId' },
];

/** Berkas yang MENANGKAP error dan harus meneruskan `requestId`-nya ke state. Terpisah
 *  dari daftar di atas karena penangkap dan perender tidak selalu berkas yang sama:
 *  Screener menangkap di halaman, merender di komponen hasil. */
const PENANGKAP: { file: string; setter: string }[] = [
  { file: 'app/screener/page.tsx', setter: 'setLoadErrorRequestId' },
  { file: 'app/watchlist/page.tsx', setter: 'setWatchlistErrorRequestId' },
  { file: 'app/compare/page.tsx', setter: 'setFetchErrorRequestId' },
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function baca(file: string): string {
  const full = path.join(ROOT, file);
  expect(fs.existsSync(full), `${file} hilang - pindahkan penjaganya, jangan biarkan lulus tanpa memeriksa`).toBe(true);
  return stripComments(fs.readFileSync(full, 'utf8'));
}

describe('ID request tampil di permukaan yang gagal memuat', () => {
  it('daftar penjaga tidak kosong', () => {
    // Tanpa penjaga hitung, menghapus seluruh isi daftar akan membuat file test ini
    // lulus tanpa memeriksa apa pun.
    expect(PERMUKAAN_GALAT.length).toBeGreaterThanOrEqual(6);
    expect(PENANGKAP.length).toBeGreaterThanOrEqual(3);
  });

  it.each(PERMUKAAN_GALAT)('$file merender ApiErrorHint dari $state', ({ file, state }, ) => {
    const src = baca(file);
    expect(src, `${file} tidak merender <ApiErrorHint>`).toContain('<ApiErrorHint');
    expect(src, `${file} merender <ApiErrorHint> tapi tidak dari ${state}`).toMatch(
      new RegExp(`<ApiErrorHint[^>]*requestId=\\{[^}]*\\b${state}\\b`),
    );
  }, BATAS_PEMINDAI_MS);

  it.each(PENANGKAP)('$file meneruskan requestId error ke $setter', ({ file, setter }) => {
    const src = baca(file);
    // `error.requestId` hanya ada pada ApiClientError, jadi penyempitan tipenya wajib -
    // membacanya dari `unknown` tidak akan lolos typecheck, dan membacanya dari objek
    // apa pun akan diam-diam menghasilkan undefined.
    expect(src, `${file} tidak memanggil ${setter}`).toContain(`${setter}(`);
    expect(src, `${file} memanggil ${setter} tanpa membaca requestId dari error`).toMatch(
      // Dibatasi titik koma, bukan kurung tutup: argumennya lazim berupa ternary yang
      // memanggil isApiClientError(error) lebih dulu, jadi kurung tutup pertama muncul
      // sebelum `requestId` sempat terbaca.
      new RegExp(`${setter}\\([^;]*requestId`),
    );
    expect(src, `${file} membaca requestId tanpa isApiClientError`).toContain('isApiClientError');
  }, BATAS_PEMINDAI_MS);

  it('ApiErrorHint tidak merender apa pun tanpa id', () => {
    // Prop-nya opsional di seluruh pemanggil: saat request berhasil, atau saat galat
    // datang tanpa response (jaringan putus), nilainya null. Panel dukungan kosong yang
    // tetap tampil akan menjanjikan id yang tidak ada.
    expect(baca('components/ui/ApiErrorHint.tsx')).toContain('if (!requestId) return null;');
  });
});

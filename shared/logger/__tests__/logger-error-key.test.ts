import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { logger } from '../logger';

/**
 * `logger.error` MENUNTUT kunci `err`, bukan `error`.
 *
 * Lihat implementasinya: hanya `err` yang diekstrak jadi errName/errMessage/errStack
 * DAN dikirim ke Sentry lewat captureException. Apa pun kunci lain jatuh ke `rest`,
 * lalu masuk `JSON.stringify` - dan `Error` tidak punya properti enumerable, jadi
 * hasilnya `{}`. Sentry pun hanya menerima captureMessage, tanpa stack.
 *
 * Ini bukan kerapian gaya. Kejadian nyata 21 Agustus 2026: job cron broker-summary-scan
 * gagal di produksi dan satu-satunya jejaknya adalah
 *
 *   {"level":"error","message":"Job broker-summary-scan gagal","error":{}}
 *
 * Tidak ada pesan, tidak ada stack, tidak ada exception di Sentry. Penyebabnya tidak
 * pernah bisa diketahui. Saat itu 17 pemanggil memakai kunci yang salah, 10 di antaranya
 * route cron - justru pekerjaan tak berpenunggu yang paling butuh galatnya terekam.
 */

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const ROOT = path.join(__dirname, '..', '..', '..');
const files = ['app', 'modules', 'shared', 'lib', 'components']
  .flatMap((dir) => walk(path.join(ROOT, dir)))
  .filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`));

const callers: { file: string; snippet: string }[] = [];
let totalErrorCalls = 0;
for (const file of files) {
  const source = stripComments(fs.readFileSync(file, 'utf8'));
  totalErrorCalls += (source.match(/logger\.error\(/g) || []).length;
  // Hanya logger.error - logger.warn memang tidak punya ekstraksi `err` sama sekali,
  // jadi `{ error: pesan }` di sana bukan kesalahan.
  //
  // Yang dicari adalah `error` di POSISI KUNCI: didahului `{` atau `,`. Tanpa syarat itu,
  // pemindainya ikut menuduh `{ err: error }` yang justru bentuk yang benar - kata
  // `error` di sana adalah nilai, bukan kunci.
  const re = /logger\.error\([^;]*?[{,]\s*error\s*[},:][^;]*?\)/g;
  for (const match of source.match(re) || []) {
    callers.push({
      file: path.relative(ROOT, file).split(path.sep).join('/'),
      snippet: match.replace(/\s+/g, ' ').slice(0, 120),
    });
  }
}

describe('logger.error memakai kunci err, bukan error', () => {
  it('pemindainya benar-benar menemukan pemanggil logger.error untuk diperiksa', () => {
    // Kalau angka ini jatuh ke nol, pemindainya yang rusak - bukan berarti tidak ada bug.
    expect(files.length).toBeGreaterThan(200);
    expect(totalErrorCalls).toBeGreaterThan(20);
  });

  it('tidak ada pemanggil yang melewatkan galat lewat kunci `error`', () => {
    expect(callers).toEqual([]);
  });
});

describe('perilaku logger.error', () => {
  afterEach(() => vi.restoreAllMocks());

  it('kunci `err` menghasilkan errMessage dan errStack yang bisa dibaca', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('uji', { err: new Error('penyebab sebenarnya') });

    const entry = JSON.parse(spy.mock.calls[0][0] as string);
    expect(entry.errName).toBe('Error');
    expect(entry.errMessage).toBe('penyebab sebenarnya');
    expect(entry.errStack).toContain('penyebab sebenarnya');
  });

  it('kunci `error` MEMANG menghasilkan {} - inilah yang dicegah gerbang di atas', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('uji', { error: new Error('hilang tanpa jejak') } as never);

    const entry = JSON.parse(spy.mock.calls[0][0] as string);
    expect(entry.error).toEqual({});
    expect(entry.errMessage).toBeUndefined();
  });
});

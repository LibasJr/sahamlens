import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'audit-frontend-only.mjs');

/**
 * Sembilan PR lintas beberapa hari. Larangan menyentuh backend yang hanya hidup di
 * dokumen akan dilanggar tanpa ada yang menyadarinya - dan pelanggarannya justru paling
 * mungkin terjadi saat seseorang sedang buru-buru menyelesaikan satu tampilan.
 */
function jalankan(files: string[]): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [SCRIPT, '--files', files.join('\n')], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('audit frontend-only', () => {
  it('skripnya ada', () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
  });

  it('meloloskan perubahan frontend', () => {
    const hasil = jalankan([
      'components/ui/SectionHeader.tsx',
      'app/globals.css',
      'shared/presentation/panel-result.ts',
    ]);
    expect(hasil.code).toBe(0);
  });

  it.each([
    'app/api/stock/[ticker]/route.ts',
    'modules/user/repository/user.repository.ts',
    'modules/technical/service/quote-summary.ts',
    'database/migrations/011_apa_saja.sql',
    'shared/auth/session.ts',
    'shared/http/api-client.ts',
  ])('menolak %s', (file) => {
    const hasil = jalankan([file]);
    expect(hasil.code).toBe(1);
    expect(hasil.out).toContain(file);
  });

  it('menyebut path pelanggarnya, bukan sekadar gagal', () => {
    // Gerbang yang cuma bilang "gagal" memaksa orang menebak; yang menyebut berkasnya
    // menyelesaikan percakapan dalam satu baris.
    const hasil = jalankan(['components/ui/SectionHeader.tsx', 'shared/auth/session.ts']);
    expect(hasil.out).toContain('shared/auth/session.ts');
    expect(hasil.out).not.toContain('components/ui/SectionHeader.tsx');
  });

  it('memakai pemisah path gaya posix di Windows', () => {
    // path.relative mengembalikan `app\api\...` di Windows; tanpa normalisasi, gerbang
    // ini menandai SETIAP berkas atau tidak satu pun - dan keduanya tidak memeriksa apa pun.
    const source = fs.readFileSync(SCRIPT, 'utf8');
    expect(source).toContain("split(path.sep).join('/')");
  });
}, 30_000);

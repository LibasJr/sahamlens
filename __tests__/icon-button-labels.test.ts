import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Audit nama aksesibel dijalankan sebagai gerbang CI, bukan sebagai tes - jadi yang
 * dijaga di sini adalah PEMASANGANNYA. Skrip audit yang benar tapi tidak tersambung ke
 * verify:prod maupun CI gagal secara senyap: ia tetap hijau saat dijalankan tangan dan
 * tidak pernah menghentikan apa pun.
 */

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'audit-icon-button-labels.mjs');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const CI = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');

describe('audit nama aksesibel kontrol ikon', () => {
  it('punya entri skrip npm', () => {
    expect(pkg.scripts?.['audit:a11y']).toBe('node scripts/audit-icon-button-labels.mjs');
  });

  it('ikut di verify:prod', () => {
    expect(pkg.scripts?.['verify:prod']).toContain('npm run audit:a11y');
  });

  it('ikut di gerbang CI', () => {
    expect(CI).toContain('npm run audit:a11y');
  });

  // Batas 30 detik, bukan 5 detik bawaan: kasus ini menjalankan proses node terpisah yang
  // memindai seluruh app/ + components/. Sendirian ia selesai ~1 detik, tapi saat suite
  // penuh berjalan paralel ia lewat 5 detik dan gagal sebagai "timeout" - kegagalan yang
  // tidak ada hubungannya dengan aksesibilitas dan menyesatkan siapa pun yang membacanya.
  it('hijau pada kode saat ini', () => {
    const out = execFileSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toMatch(/punya nama aksesibel/);
  }, 30_000);

  it('menuntut aria-label, bukan menerima title= sebagai pelabelan', () => {
    // Kalau suatu saat title= dianggap cukup, audit ini berhenti menemukan apa pun yang
    // berarti - title tidak pernah muncul di perangkat sentuh dan tidak bisa dibuka lewat
    // papan ketik, jadi ia tooltip, bukan nama.
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src).toContain("attrs.has('aria-label')");
    expect(src).not.toMatch(/if \(attrs\.has\('title'\)\) return;/);
  });
});

import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  findLatestXbrlReport,
  runFundamentalCrossCheck,
} from '../fundamental-cross-check-runner.service';
import { compareFundamentalField } from '../fundamental-cross-check.service';

vi.mock('../../../../shared/logger/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function tmpDirWith(files: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xcheck-'));
  for (const f of files) fs.writeFileSync(path.join(dir, f), '{}');
  return dir;
}

describe('findLatestXbrlReport', () => {
  it('memilih tahun terbaru', () => {
    const dir = tmpDirWith(['AADI-2025-AUDIT.json', 'AADI-2026-TW1.json']);
    expect(findLatestXbrlReport('AADI.JK', { dataDir: dir })?.year).toBe(2026);
  });

  it('pada tahun sama, auditan menang atas triwulanan', () => {
    const dir = tmpDirWith(['AADI-2026-TW2.json', 'AADI-2026-AUDIT.json', 'AADI-2026-TW1.json']);
    const ref = findLatestXbrlReport('AADI', { dataDir: dir });
    expect(ref?.period).toBe('AUDIT');
  });

  it('TW3 menang atas TW1', () => {
    const dir = tmpDirWith(['AADI-2026-TW1.json', 'AADI-2026-TW3.json']);
    expect(findLatestXbrlReport('AADI', { dataDir: dir })?.period).toBe('TW3');
  });

  it('emiten tanpa artefak mengembalikan null, bukan melempar', () => {
    const dir = tmpDirWith(['BBCA-2026-AUDIT.json']);
    expect(findLatestXbrlReport('AADI', { dataDir: dir })).toBeNull();
  });

  it('direktori tidak ada mengembalikan null', () => {
    expect(findLatestXbrlReport('AADI', { dataDir: '/tmp/tidak-ada-sama-sekali-xyz' })).toBeNull();
  });

  it('kode tidak valid ditolak - menutup path traversal', () => {
    const dir = tmpDirWith(['AADI-2026-AUDIT.json']);
    expect(findLatestXbrlReport('../../etc/passwd', { dataDir: dir })).toBeNull();
    expect(findLatestXbrlReport('AB', { dataDir: dir })).toBeNull();
  });

  it('sufiks .JK dinormalkan', () => {
    const dir = tmpDirWith(['AADI-2026-AUDIT.json']);
    expect(findLatestXbrlReport('aadi.jk', { dataDir: dir })?.ticker).toBe('AADI');
  });

  it('berkas milik emiten lain dengan awalan mirip tidak ikut terambil', () => {
    // "AADI-" tidak boleh cocok dengan "AADIX-..." seandainya ada.
    const dir = tmpDirWith(['AADI-2026-AUDIT.json', 'BBCA-2027-AUDIT.json']);
    expect(findLatestXbrlReport('AADI', { dataDir: dir })?.ticker).toBe('AADI');
  });
});

describe('runFundamentalCrossCheck', () => {
  it('emiten tanpa artefak dihitung missingXbrl, bukan menggagalkan proses', () => {
    const dir = tmpDirWith([]);
    const out = runFundamentalCrossCheck(
      { 'AADI.JK': { per: 10, pbv: 1.5 }, 'BBCA.JK': { per: 12 } },
      { dataDir: dir },
    );

    expect(out.missingXbrl).toBe(2);
    expect(out.compared).toBe(0);
  });

  it('artefak rusak tidak melempar - dihitung dilewati', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xcheck-bad-'));
    fs.writeFileSync(path.join(dir, 'AADI-2026-AUDIT.json'), 'bukan json sama sekali {{{');

    expect(() =>
      runFundamentalCrossCheck({ 'AADI.JK': { per: 10 } }, { dataDir: dir }),
    ).not.toThrow();
  });

  it('masukan kosong menghasilkan ringkasan nol, bukan galat', () => {
    const out = runFundamentalCrossCheck({}, { dataDir: tmpDirWith([]) });
    expect(out.compared).toBe(0);
    expect(out.worst).toEqual([]);
  });
});

// ===================================================================================
// GERBANG: runner ini TIDAK BOLEH jadi kode mati lagi.
//
// `crossCheckFundamentals` sempat hidup sebagai lapisan pembanding yang tidak pernah
// dipanggil siapa pun - terlihat seperti perlindungan, padahal tidak memeriksa apa pun.
// Gerbang ini gagal kalau jalur produksi berhenti memanggilnya.
// ===================================================================================
describe('gerbang: cross-check terpasang di jalur produksi', () => {
  it('route snapshot fundamental memanggil runFundamentalCrossCheck', () => {
    const repoRoot = path.resolve(__dirname, '../../../..');
    const routePath = path.join(repoRoot, 'app/api/cron/fundamental-snapshot/route.ts');
    const source = fs.readFileSync(routePath, 'utf8');

    // Komentar dibuang dulu: CLAUDE.md §2 - gerbang yang mencocokkan pola mentah bisa
    // diluluskan oleh prosa, dan itu membuatnya hijau tanpa memeriksa kode sungguhan.
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    expect(withoutComments).toContain('runFundamentalCrossCheck(');
  });

  it('menemukan artefak XBRL produksi untuk diperiksa', () => {
    // Kalau angka ini jatuh ke nol, pemindainya yang rusak - bukan berarti tidak ada
    // artefak. Penjaga jumlah wajib untuk gerbang pemindai (CLAUDE.md §2).
    const repoRoot = path.resolve(__dirname, '../../../..');
    const dir = path.join(repoRoot, 'data/idx-financial');
    if (!fs.existsSync(dir)) return; // CI tanpa artefak: gerbang ini tidak berlaku.

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(100);
  }, 30_000);
});

// ===================================================================================
// DER: definisi berbeda, bukan data rusak.
//
// Terukur pada 60 emiten produksi sebelum penanganan ini ada: 44 DIVERGE, hampir
// seluruhnya DER. XBRL memakai total liabilitas/ekuitas (neraca resmi), Yahoo memakai
// utang berbunga/ekuitas. Keduanya benar menurut definisinya masing-masing.
// ===================================================================================
describe('DER tidak menghasilkan divergensi palsu', () => {
  it('DER dengan definisi berbeda ditandai NOT_COMPARABLE, bukan DIVERGE', () => {
    // Angka nyata CMRY: 0,291 (total liabilitas) vs 0,00006 (utang berbunga).
    const out = compareFundamentalField('der', 0.2910455564656446, 0.00006);
    expect(out.verdict).toBe('NOT_COMPARABLE');
  });

  // ---------------------------------------------------------------------------------
  // PENJAGA ARAH. Ini yang membedakan aturan berarah dari pengecualian buta.
  //
  // Utang berbunga SELALU bagian dari total liabilitas, jadi xbrl >= yahoo menurut
  // definisi. Arah sebaliknya mustahil - dan itu gejala salah satuan, kelas bug yang
  // persis menyebabkan PBV terisi kurs USD/IDR selama berbulan-bulan.
  // ---------------------------------------------------------------------------------
  it('yahoo > xbrl tetap DIVERGE - arah itu mustahil menurut definisi', () => {
    // 0,4 vs 40 = rasio dibandingkan persen. Wajib tetap berbunyi.
    expect(compareFundamentalField('der', 0.4, 40).verdict).toBe('DIVERGE');
  });

  it('DER yang sepakat tetap AGREE, tidak tertelan NOT_COMPARABLE', () => {
    expect(compareFundamentalField('der', 0.4, 0.42).verdict).toBe('AGREE');
  });

  it('field lain tetap menghasilkan DIVERGE pada selisih besar', () => {
    // Penjaga terbalik: kalau ini ikut jadi NOT_COMPARABLE, pembandingnya lumpuh total.
    const out = compareFundamentalField('per', 10, 100);
    expect(out.verdict).toBe('DIVERGE');
  });

  it('PER yang sepakat tetap AGREE', () => {
    expect(compareFundamentalField('per', 10, 10.5).verdict).toBe('AGREE');
  });
});

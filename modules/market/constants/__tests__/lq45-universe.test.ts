import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CURRENT_LQ45_EFFECTIVE_FROM,
  CURRENT_LQ45_EFFECTIVE_TO,
  CURRENT_LQ45_UNIVERSE,
} from '../lq45-universe';
import { LQ45_CONSTITUENTS } from '@/lib/utils/blue-chip-index';

// Penjaga, bukan uji perilaku.
//
// Pada 2026-08-18 ditemukan TIGA daftar LQ45 yang saling bertentangan di sekitar proyek
// ini, dan tidak satu pun pernah dicocokkan ke pengumuman resmi IDX:
//
//   - lib/utils/blue-chip-index.ts       46 entri (mustahil), diakui hasil pengetahuan model
//   - modules/market/constants/...       45 entri, dari installer, klaim Peng-00148/BEI.POP/07-2026
//   - "List Emiten LQ45.csv" scrapper    daftar 2021 yang tampak segar karena namanya ter-update
//
// Yang berbahaya bukan salah satunya keliru - itu wajar untuk daftar yang dievaluasi
// dua kali setahun. Yang berbahaya adalah keliru TANPA ADA YANG MENYADARI: dua daftar
// dibaca dua pihak berbeda (badge Blue-chip vs overlay EOD IDX + skrip sinkronisasi),
// sehingga sepuluh emiten masuk universe overlay tanpa pernah punya artefak, dan tidak
// ada satu pun test yang gagal karenanya.
//
// Test di bawah menutup jalan itu. Ia TIDAK bisa memvalidasi kebenaran keanggotaan -
// hanya manusia dengan pengumuman IDX di tangan yang bisa.

const REPO_ROOT = path.resolve(__dirname, '../../../..');

describe('universe LQ45', () => {
  it('beranggotakan tepat 45 emiten', () => {
    // Indeks LQ45 beranggotakan 45 emiten menurut definisinya. Daftar lama berisi 46 dan
    // cacat itu lolos berbulan-bulan karena tidak ada yang menghitungnya.
    expect(CURRENT_LQ45_UNIVERSE).toHaveLength(45);
  });

  it('tidak berisi duplikat dan semuanya berformat 4 huruf + .JK', () => {
    expect(new Set(CURRENT_LQ45_UNIVERSE).size).toBe(CURRENT_LQ45_UNIVERSE.length);
    for (const ticker of CURRENT_LQ45_UNIVERSE) {
      expect(ticker).toMatch(/^[A-Z]{4}\.JK$/);
    }
  });

  it('hanya ada SATU daftar - badge Blue-chip membaca universe yang sama', () => {
    // Kalau seseorang menuliskan ulang daftar di blue-chip-index.ts, test ini gagal
    // sebelum penyimpangannya sempat menyebar ke UI.
    expect([...LQ45_CONSTITUENTS]).toEqual([...CURRENT_LQ45_UNIVERSE]);
  });

  it('skrip sinkronisasi membaca daftar yang sama dengan overlay', () => {
    // Sebelum konsolidasi, sync-idx-foreign-flow.py membaca blue-chip-index.ts sementara
    // overlay menyaring dengan lq45-universe.ts. Sepuluh emiten tidak pernah tersinkron.
    const script = fs.readFileSync(path.join(REPO_ROOT, 'scripts/sync-idx-foreign-flow.py'), 'utf8');
    expect(script).toContain('lq45-universe.ts');
    expect(script).toContain('CURRENT_LQ45_UNIVERSE');
    expect(script).not.toContain('LQ45_CONSTITUENTS');
  });

  it('periode berlakunya tercatat dan masuk akal', () => {
    expect(CURRENT_LQ45_EFFECTIVE_FROM).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CURRENT_LQ45_EFFECTIVE_TO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CURRENT_LQ45_EFFECTIVE_FROM < CURRENT_LQ45_EFFECTIVE_TO).toBe(true);
  });

  it('GAGAL setelah periode berlakunya habis, memaksa verifikasi ulang', () => {
    // IDX mengevaluasi ulang konstituen dua kali setahun. Daftar yang lewat periode
    // BUKAN sekadar usang - ia mengklaim keanggotaan yang sudah dicabut, dan di sini
    // dipakai memilih emiten mana yang datanya diambil dari sumber resmi Bursa.
    //
    // Kalau test ini gagal: buka pengumuman konstituen LQ45 terbaru di idx.co.id, perbarui
    // CURRENT_LQ45_UNIVERSE beserta CURRENT_LQ45_VERSION dan kedua tanggalnya. Jangan
    // hanya menggeser tanggalnya.
    const today = new Date().toISOString().slice(0, 10);
    expect(
      today <= CURRENT_LQ45_EFFECTIVE_TO,
      `Konstituen LQ45 di modules/market/constants/lq45-universe.ts kedaluwarsa sejak ${CURRENT_LQ45_EFFECTIVE_TO}. `
        + 'Cocokkan ke pengumuman resmi IDX (Data Pasar -> Indeks Saham -> LQ45), jangan menggeser tanggalnya saja.',
    ).toBe(true);
  });
});

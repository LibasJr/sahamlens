import { describe, expect, it } from 'vitest';
import { resolveIdxFinancialSyncTargets } from '../idx-financial-sync-targets';

/**
 * Kalender pelaporannya diverifikasi langsung ke endpoint BEI pada 22 Agustus 2026,
 * bukan disimpulkan dari peraturan:
 *
 *   2026 TW2   787 emiten sudah melapor
 *   2026 TW1   848 emiten sudah melapor
 *   2026 TW3     0 emiten
 *   2025 AUDIT 882 emiten sudah melapor
 *
 * Angka-angka itulah yang membenarkan aturan "Jul-Sep -> TW2 + TW1".
 */
const at = (iso: string) => new Date(iso);

describe('resolveIdxFinancialSyncTargets', () => {
  it('Agustus 2026: TW2 dan TW1 - keduanya terbukti punya pelapor nyata', () => {
    const targets = resolveIdxFinancialSyncTargets(at('2026-08-22T13:00:00+07:00'));
    expect(targets.map((t) => `${t.year}-${t.period}`)).toEqual(['2026-tw2', '2026-tw1']);
  });

  it('TIDAK pernah menarget periode yang belum jatuh tempo', () => {
    // TW3 2026 masih nol emiten pada Agustus 2026 - menariknya cuma buang permintaan.
    const targets = resolveIdxFinancialSyncTargets(at('2026-08-22T13:00:00+07:00'));
    expect(targets.map((t) => t.period)).not.toContain('tw3');
  });

  it('selalu dua periode - pelapor telat periode sebelumnya tetap terjemput', () => {
    for (const iso of ['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15']) {
      const targets = resolveIdxFinancialSyncTargets(at(`${iso}T12:00:00+07:00`));
      expect(targets).toHaveLength(2);
      expect(new Set(targets.map((t) => `${t.year}-${t.period}`)).size).toBe(2);
    }
  });

  it('Januari-Maret: laporan tahunan auditan tahun LALU, bukan tahun berjalan', () => {
    const targets = resolveIdxFinancialSyncTargets(at('2026-03-30T12:00:00+07:00'));
    expect(targets[0]).toMatchObject({ year: 2025, period: 'audit' });
  });

  it('April: berpindah ke TW1 tahun berjalan, audit lama masih ikut', () => {
    const targets = resolveIdxFinancialSyncTargets(at('2026-04-01T12:00:00+07:00'));
    expect(targets.map((t) => `${t.year}-${t.period}`)).toEqual(['2026-tw1', '2025-audit']);
  });

  it('Oktober-Desember: TW3 dan TW2 tahun berjalan', () => {
    const targets = resolveIdxFinancialSyncTargets(at('2026-11-05T12:00:00+07:00'));
    expect(targets.map((t) => `${t.year}-${t.period}`)).toEqual(['2026-tw3', '2026-tw2']);
  });

  /**
   * Jadwal bursa di repo ini SELALU dinilai di Asia/Jakarta. Tanggal 1 April 2026 pukul
   * 00.30 WIB masih 31 Maret di UTC - kalau bulan dibaca menurut UTC, sync akan menarget
   * audit tahun lalu padahal jendela TW1 sudah dibuka.
   */
  it('bulan dibaca menurut WIB, bukan UTC', () => {
    const targets = resolveIdxFinancialSyncTargets(new Date('2026-03-31T17:30:00Z'));
    expect(targets.map((t) => `${t.year}-${t.period}`)).toEqual(['2026-tw1', '2025-audit']);
  });

  it('setiap target menyertakan alasan yang bisa dibaca di log', () => {
    for (const target of resolveIdxFinancialSyncTargets(at('2026-08-22T13:00:00+07:00'))) {
      expect(target.reason.length).toBeGreaterThan(10);
    }
  });
});

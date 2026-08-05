import { describe, expect, it } from 'vitest';
import {
  DATA_SNAPSHOT_VERSION,
  SCORE_VERSION,
  SIGNAL_VERSION,
  VALUATION_VERSION,
  currentModelVersionStamp,
  partitionByScoreVersion,
} from '../model-version';

/**
 * FASE 1 - MODEL VERSIONING (audit Ronde 3, §9 "reproducibility & audit trail model").
 *
 * Alasan kuantitatifnya: `lens_radar_history` menyimpan skor dari mesin yang bobot &
 * ambangnya berubah beberapa kali dalam dua minggu terakhir. Tanpa penanda versi,
 * kalibrasi dan backtest memperlakukan skor dari DUA MODEL BERBEDA sebagai satu deret -
 * dan setiap kesimpulan dari deret campuran itu tidak mengukur model mana pun.
 *
 * Aturan yang ditegakkan di sini FAIL-CLOSED: baris tanpa versi DIKELUARKAN, bukan
 * diasumsikan versi sekarang. "Belum ditandai" bukan "sama dengan yang sekarang".
 */
describe('model-version (Fase 1)', () => {
  it('mengekspos empat versi yang tidak kosong', () => {
    for (const v of [SCORE_VERSION, VALUATION_VERSION, SIGNAL_VERSION, DATA_SNAPSHOT_VERSION]) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it('currentModelVersionStamp memuat lima field wajib dengan timestamp ISO', () => {
    const stamp = currentModelVersionStamp(new Date('2026-08-05T10:20:30.000Z'));

    expect(stamp.score_version).toBe(SCORE_VERSION);
    expect(stamp.valuation_version).toBe(VALUATION_VERSION);
    expect(stamp.signal_version).toBe(SIGNAL_VERSION);
    expect(stamp.data_snapshot_version).toBe(DATA_SNAPSHOT_VERSION);
    expect(stamp.calculation_timestamp).toBe('2026-08-05T10:20:30.000Z');
  });

  it('dataset satu versi diterima seluruhnya', () => {
    const rows = [
      { score_version: 'lens-score-v1.3.0', ticker: 'AAAA' },
      { score_version: 'lens-score-v1.3.0', ticker: 'BBBB' },
    ];
    const result = partitionByScoreVersion(rows);

    expect(result.version).toBe('lens-score-v1.3.0');
    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
    expect(result.mixed).toBe(false);
  });

  it('dataset campuran menolak versi minoritas dan menandai mixed', () => {
    const rows = [
      { score_version: 'lens-score-v1.3.0', ticker: 'AAAA' },
      { score_version: 'lens-score-v1.3.0', ticker: 'BBBB' },
      { score_version: 'lens-score-v1.3.0', ticker: 'CCCC' },
      { score_version: 'lens-score-v1.2.0', ticker: 'DDDD' },
    ];
    const result = partitionByScoreVersion(rows);

    expect(result.mixed).toBe(true);
    expect(result.version).toBe('lens-score-v1.3.0');
    expect(result.accepted).toHaveLength(3);
    expect(result.rejected.map((r) => r.ticker)).toEqual(['DDDD']);
    expect(result.rejectedReason).toContain('versi');
  });

  it('FAIL-CLOSED: baris tanpa score_version dikeluarkan, bukan dianggap versi sekarang', () => {
    const rows = [
      { score_version: 'lens-score-v1.3.0', ticker: 'AAAA' },
      { score_version: null, ticker: 'LEGACY1' },
      { ticker: 'LEGACY2' } as { score_version?: string | null; ticker: string },
      { score_version: '   ', ticker: 'LEGACY3' },
    ];
    const result = partitionByScoreVersion(rows);

    expect(result.accepted.map((r) => r.ticker)).toEqual(['AAAA']);
    expect(result.rejected.map((r) => r.ticker)).toEqual(['LEGACY1', 'LEGACY2', 'LEGACY3']);
    expect(result.unversionedCount).toBe(3);
  });

  it('dataset yang SELURUHNYA tanpa versi menghasilkan nol baris diterima', () => {
    const rows = [{ ticker: 'LEGACY1' }, { ticker: 'LEGACY2' }];
    const result = partitionByScoreVersion(rows);

    expect(result.version).toBeNull();
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
  });

  it('dataset kosong tidak melempar dan tidak mengarang versi', () => {
    const result = partitionByScoreVersion([]);

    expect(result.version).toBeNull();
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(0);
    expect(result.mixed).toBe(false);
  });

  it('filter versi eksplisit menang atas mayoritas', () => {
    const rows = [
      { score_version: 'lens-score-v1.3.0', ticker: 'AAAA' },
      { score_version: 'lens-score-v1.3.0', ticker: 'BBBB' },
      { score_version: 'lens-score-v1.2.0', ticker: 'CCCC' },
    ];
    const result = partitionByScoreVersion(rows, 'lens-score-v1.2.0');

    expect(result.version).toBe('lens-score-v1.2.0');
    expect(result.accepted.map((r) => r.ticker)).toEqual(['CCCC']);
    expect(result.rejected).toHaveLength(2);
  });
});

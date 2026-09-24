import { describe, expect, it } from 'vitest';

import {
  CROSS_CHECK_AFFIRMATIVE_CATEGORIES,
  CROSS_CHECK_SIGNAL_SOURCES,
  CROSS_CHECK_THRESHOLDS,
  buildCrossCheckRows,
  type CrossCheckLensRow,
  type CrossCheckOwnershipRow,
  type CrossCheckRecommendationRow,
} from '../cross-check.service';

const LENS: CrossCheckLensRow[] = [
  { ticker: 'AAAA', lensScore: 72, avgValue20d: 5_000_000_000 },
  { ticker: 'BBBB', lensScore: 40, avgValue20d: 200_000_000 },
  { ticker: 'CCCC', lensScore: null, avgValue20d: null },
];

const RECOMMENDATION: CrossCheckRecommendationRow[] = [
  { ticker: 'AAAA', category: 'STRONG BUY', totalScore: 81 },
  { ticker: 'BBBB', category: 'HOLD', totalScore: 55 },
  { ticker: 'CCCC', category: 'DATA TIDAK CUKUP', totalScore: 0 },
];

const OWNERSHIP: CrossCheckOwnershipRow[] = [
  { ticker: 'AAAA', latestPct: 31.5, latestDate: '2026-08-31', previousPct: 29.9, previousDate: '2026-07-31' },
  { ticker: 'BBBB', latestPct: 12.4, latestDate: '2026-08-31', previousPct: 14.1, previousDate: '2026-07-31' },
];

function signalOf(row: ReturnType<typeof buildCrossCheckRows>[number] | undefined, key: string) {
  if (!row) throw new Error('baris tidak ada');
  const found = row.signals.find((signal) => signal.key === key);
  if (!found) throw new Error(`sinyal ${key} tidak ada`);
  return found;
}

describe('buildCrossCheckRows', () => {
  const rows = buildCrossCheckRows({ lensRows: LENS, recommendations: RECOMMENDATION, ownership: OWNERSHIP });
  const byTicker = new Map(rows.map((row) => [row.ticker, row]));

  it('hanya menghitung sinyal berstatus CONFIRMED', () => {
    const aaaa = byTicker.get('AAAA');
    expect(aaaa?.confirmations).toBe(4);
    expect(aaaa?.signalsAvailable).toBe(4);

    const bbbb = byTicker.get('BBBB');
    expect(bbbb?.confirmations).toBe(0);
    expect(bbbb?.signalsAvailable).toBe(4);
  });

  it('tidak mengubah data yang tidak ada menjadi angka: UNAVAILABLE tetap null', () => {
    const cccc = byTicker.get('CCCC');
    const lensScore = signalOf(cccc, 'lensScore');
    const liquidity = signalOf(cccc, 'liquidity');
    const ownership = signalOf(cccc, 'foreignOwnership');

    expect(lensScore.status).toBe('UNAVAILABLE');
    expect(lensScore.value).toBeNull();
    expect(liquidity.status).toBe('UNAVAILABLE');
    expect(liquidity.value).toBeNull();
    // Emiten tanpa baris KSEI dua periode tidak boleh dianggap "asing keluar".
    expect(ownership.status).toBe('UNAVAILABLE');
    expect(ownership.value).toBeNull();
    expect(cccc?.confirmations).toBe(0);
    // Keempat sumber tidak memberi bacaan yang bisa dihitung: arsip kosong, likuiditas
    // kosong, KSEI belum punya dua periode, dan pemindaian menandai DATA TIDAK CUKUP.
    expect(cccc?.signalsAvailable).toBe(0);
  });

  it('memakai ambang yang dinyatakan terbuka', () => {
    expect(signalOf(byTicker.get('AAAA')!, 'lensScore').status).toBe('CONFIRMED');
    expect(signalOf(byTicker.get('AAAA')!, 'liquidity').status).toBe('CONFIRMED');
    expect(signalOf(byTicker.get('BBBB')!, 'lensScore').status).toBe('NOT_CONFIRMED');
    expect(signalOf(byTicker.get('BBBB')!, 'liquidity').status).toBe('NOT_CONFIRMED');
    expect(CROSS_CHECK_THRESHOLDS.lensScore).toBe(60);
    expect(CROSS_CHECK_THRESHOLDS.advValue20d).toBe(1_000_000_000);
  });

  it('memperlakukan kategori netral/negatif sebagai bukan konfirmasi dan DATA TIDAK CUKUP sebagai tidak tersedia', () => {
    expect(CROSS_CHECK_AFFIRMATIVE_CATEGORIES).toEqual(['STRONG BUY', 'BUY']);
    expect(signalOf(byTicker.get('BBBB')!, 'recommendation').status).toBe('NOT_CONFIRMED');
    expect(signalOf(byTicker.get('CCCC')!, 'recommendation').status).toBe('UNAVAILABLE');
  });

  it('mengukur arah kepemilikan asing, bukan menebaknya', () => {
    expect(signalOf(byTicker.get('AAAA')!, 'foreignOwnership').status).toBe('CONFIRMED');
    expect(signalOf(byTicker.get('BBBB')!, 'foreignOwnership').status).toBe('NOT_CONFIRMED');
    expect(signalOf(byTicker.get('AAAA')!, 'foreignOwnership').value).toBe(31.5);
  });

  it('menyertakan sumber pada setiap sinyal dan menjaga nilai mentahnya', () => {
    for (const row of rows) {
      for (const signal of row.signals) {
        expect(signal.source.length).toBeGreaterThan(0);
        expect(signal.source).toBe(CROSS_CHECK_SIGNAL_SOURCES[signal.key]);
        expect(signal.reason.length).toBeGreaterThan(0);
        expect(signal.value === null || typeof signal.value === 'number' || typeof signal.value === 'string').toBe(true);
      }
    }
  });

  it('mengurutkan konfirmasi terbanyak lebih dulu', () => {
    expect(rows[0]?.ticker).toBe('AAAA');
  });
});
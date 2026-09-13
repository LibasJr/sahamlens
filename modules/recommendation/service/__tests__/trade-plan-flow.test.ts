import { describe, expect, it } from 'vitest';
import type { OfficialForeignFlowAnalysis } from '../../../market';
import {
  MIN_OBSERVED_DAYS,
  calendarDaysSince,
  resolveTradePlanOfficialFlow,
} from '../trade-plan-flow';

const NOW = new Date('2026-09-13T10:00:00Z');

function analysis(over: Partial<OfficialForeignFlowAnalysis> = {}): OfficialForeignFlowAnalysis {
  return {
    netPressure20: 24.5,
    netPressureToday: 12.1,
    status: 'BULLISH',
    accumulationStatus: 'AKUMULASI',
    consecutiveBuyDays: 3,
    consecutiveSellDays: 0,
    positiveRatio20: 0.65,
    net5DBillion: 120.5,
    latestDate: '2026-09-11',
    observedDays: 20,
    ...over,
  };
}

describe('resolveTradePlanOfficialFlow', () => {
  it('meneruskan tekanan dan rasio saat artefak lengkap dan segar', () => {
    const resolved = resolveTradePlanOfficialFlow(analysis(), NOW);

    expect(resolved).toEqual({
      officialNetPressure20: 24.5,
      officialPositiveRatio20: 0.65,
      rejection: null,
      latestDate: '2026-09-11',
      observedDays: 20,
    });
  });

  it('menolak saat tidak ada artefak sama sekali', () => {
    const resolved = resolveTradePlanOfficialFlow(null, NOW);

    expect(resolved.rejection).toBe('NO_ARTIFACT');
    expect(resolved.officialNetPressure20).toBeNull();
    expect(resolved.officialPositiveRatio20).toBeNull();
  });

  // Kasus POOL.json: berkas ADA, 90 baris, semuanya nol. Nol bukan pengamatan -
  // melaporkannya sebagai "netral, data tersedia" adalah percaya diri palsu.
  it('menolak artefak yang ada tetapi tanpa transaksi asing sama sekali', () => {
    const resolved = resolveTradePlanOfficialFlow(
      analysis({ netPressure20: null, positiveRatio20: null, status: 'UNAVAILABLE' }),
      NOW,
    );

    expect(resolved.rejection).toBe('NO_FOREIGN_TURNOVER');
    expect(resolved.officialNetPressure20).toBeNull();
    // Tanggalnya tetap dilaporkan supaya pembaca tahu artefaknya ada, bukan hilang.
    expect(resolved.latestDate).toBe('2026-09-11');
  });

  it('menolak jendela yang terlalu pendek untuk disebut persistensi', () => {
    const resolved = resolveTradePlanOfficialFlow(
      analysis({ observedDays: MIN_OBSERVED_DAYS - 1 }),
      NOW,
    );

    expect(resolved.rejection).toBe('WINDOW_TOO_SHORT');
    expect(resolved.officialPositiveRatio20).toBeNull();
  });

  // Skrip sinkronisasi berhenti jalan -> berkas tetap terbaca, isinya tertinggal.
  // Pembacaan yang sukses bukan bukti kesegaran.
  it('menolak artefak basi meskipun berkasnya terbaca dengan sukses', () => {
    const resolved = resolveTradePlanOfficialFlow(
      analysis({ latestDate: '2026-08-20' }),
      NOW,
    );

    expect(resolved.rejection).toBe('STALE_ARTIFACT');
    expect(resolved.officialNetPressure20).toBeNull();
  });

  it('menerima akhir pekan panjang tanpa menyebutnya basi', () => {
    const resolved = resolveTradePlanOfficialFlow(
      analysis({ latestDate: '2026-09-09' }),
      NOW,
    );

    expect(resolved.rejection).toBeNull();
    expect(resolved.officialNetPressure20).toBe(24.5);
  });

  it('menolak tanggal yang tidak bisa diurai alih-alih menganggapnya segar', () => {
    const resolved = resolveTradePlanOfficialFlow(analysis({ latestDate: 'kemarin' }), NOW);

    expect(resolved.rejection).toBe('STALE_ARTIFACT');
  });

  it('meneruskan tekanan negatif apa adanya, bukan membuangnya sebagai tidak valid', () => {
    const resolved = resolveTradePlanOfficialFlow(
      analysis({ netPressure20: -31.2, positiveRatio20: 0.25, accumulationStatus: 'DISTRIBUSI' }),
      NOW,
    );

    expect(resolved.rejection).toBeNull();
    expect(resolved.officialNetPressure20).toBe(-31.2);
    expect(resolved.officialPositiveRatio20).toBe(0.25);
  });
});

describe('calendarDaysSince', () => {
  it('menghitung selisih hari kalender tanpa tergeser zona waktu', () => {
    expect(calendarDaysSince('2026-09-13', NOW)).toBe(0);
    expect(calendarDaysSince('2026-09-11', NOW)).toBe(2);
    expect(calendarDaysSince('2026-08-31', NOW)).toBe(13);
  });

  it('mengembalikan null untuk format yang bukan tanggal', () => {
    expect(calendarDaysSince('2026-9-1', NOW)).toBeNull();
    expect(calendarDaysSince('', NOW)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { calculateEmaSeries, calculateMacd, MACD_SLOW, MACD_SIGNAL } from '../ema';
import { analyzeEma, analyzeMacd } from '@/modules/technical';
import { computeMiniCouncil } from '@/lib/miniCouncil';
import { CONSENSUS_VOTE_THRESHOLDS } from '../decision-thresholds';

/**
 * SATU SUMBER EMA/MACD (2026-08-12).
 *
 * Aplikasi ini punya tiga salinan EMA: ema-analyzer, macd-analyzer, dan lib/miniCouncil.
 * Dua yang pertama sudah diperbaiki ke seed SMA pada audit 2026-08-05 (temuan L-3);
 * salinan ketiga tidak ikut, dan tetap di-seed dengan harga pertama. Karena miniCouncil
 * memberi makan kartu "Konsensus AI" sementara macd-analyzer memberi makan LensScore,
 * dua MACD berbeda untuk emiten yang sama tampil di layar yang sama.
 */

const CLOSES = Array.from({ length: 120 }, (_, i) => 1000 + Math.sin(i / 7) * 90 + i * 0.8);

function candles(closes: number[]) {
  return closes.map((close, i) => ({
    time: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    open: close - 2, high: close + 6, low: close - 6, close, volume: 1_000_000 + (i % 5) * 100_000,
  }));
}

function history(closes: number[]) {
  return closes.map((close, i) => ({
    Date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    Open: close - 2, High: close + 6, Low: close - 6, Close: close, AdjClose: close,
    Volume: 1_000_000 + (i % 5) * 100_000,
  }));
}

describe('calculateEmaSeries', () => {
  it('di-seed dengan SMA, BUKAN harga pertama', () => {
    const period = 10;
    const out = calculateEmaSeries(CLOSES, period);
    const sma = CLOSES.slice(0, period).reduce((a, b) => a + b, 0) / period;
    expect(out[0]).toBeCloseTo(sma, 10);
    expect(out[period - 1]).toBeCloseTo(sma, 10);
    // Seed lama = harga pertama. Kalau ini sama, bug L-3 kembali.
    expect(out[0]).not.toBeCloseTo(CLOSES[0]!, 6);
  });

  it('panjang keluaran sama dengan masukan', () => {
    expect(calculateEmaSeries(CLOSES, 20)).toHaveLength(CLOSES.length);
    expect(calculateEmaSeries(CLOSES, 50)).toHaveLength(CLOSES.length);
  });

  it('deret lebih pendek dari periode tidak melempar', () => {
    expect(calculateEmaSeries([100, 101, 102], 20)).toHaveLength(3);
    expect(calculateEmaSeries([], 20)).toEqual([]);
  });
});

describe('calculateMacd', () => {
  it('signal line dihitung hanya atas MACD line yang SAH', () => {
    const out = calculateMacd(CLOSES)!;
    // Rekonstruksi manual dari definisi: MACD sah mulai indeks MACD_SLOW - 1.
    const fast = calculateEmaSeries(CLOSES, 12);
    const slow = calculateEmaSeries(CLOSES, MACD_SLOW);
    const firstValid = MACD_SLOW - 1;
    const line = fast.slice(firstValid).map((v, i) => v - slow[i + firstValid]!);
    const sig = calculateEmaSeries(line, MACD_SIGNAL);
    expect(out.macdLine).toBeCloseTo(line[line.length - 1]!, 10);
    expect(out.macdSignal).toBeCloseTo(sig[sig.length - 1]!, 10);
    expect(out.macdHist).toBeCloseTo(out.macdLine - out.macdSignal, 10);
  });

  it('bar kurang -> null, bukan angka dari deret yang belum sah', () => {
    expect(calculateMacd(CLOSES.slice(0, MACD_SLOW + MACD_SIGNAL - 2))).toBeNull();
    expect(calculateMacd([])).toBeNull();
  });
});

/**
 * CROSS-CHECK. Kartu "Konsensus AI" dan LensScore tampil di halaman yang sama; kalau
 * MACD-nya berbeda, dua kartu itu bisa menunjuk arah berlawanan tanpa satu angka pun
 * yang salah - dan tidak ada test invarian yang bisa menangkapnya.
 */
describe('CROSS-CHECK - miniCouncil vs analyzer wajib satu angka', () => {
  it('MACD agent miniCouncil sepakat arah dengan analyzeMacd', () => {
    const council = computeMiniCouncil(candles(CLOSES) as never, false)!;
    const macdAgent = council.agents.find((a) => a.name === 'MACD')!;
    const analyzer = analyzeMacd(history(CLOSES), CLOSES[CLOSES.length - 1]!);
    const arahAnalyzer = analyzer.raw.macdHist! > 0 ? 'BUY' : 'SELL';
    expect(macdAgent.signal).toBe(arahAnalyzer);
  });

  it('EMA analyzer memakai deret yang sama dengan helper bersama', () => {
    const analyzer = analyzeEma(history(CLOSES), CLOSES[CLOSES.length - 1]!);
    const ema20 = calculateEmaSeries(CLOSES, 20);
    const ema50 = calculateEmaSeries(CLOSES, 50);
    expect(analyzer.raw.ema20).toBeCloseTo(ema20[ema20.length - 1]!, 10);
    expect(analyzer.raw.ema50).toBeCloseTo(ema50[ema50.length - 1]!, 10);
  });
});

/**
 * Agregasi suara. Sebelum 2026-08-12 miniCouncil memakai PLURALITAS - empat dari sepuluh
 * agen sudah cukup mengeluarkan perintah SELL. Pada suara yang sama, calculateConsensus()
 * di kartu sebelahnya menyebutnya HOLD karena butuh >= 60%.
 */
describe('agregasi suara miniCouncil', () => {
  function hitung(closes: number[]) {
    return computeMiniCouncil(candles(closes) as never, false)!;
  }

  it('verdict hanya keluar saat mencapai ambang konsensus bersama', () => {
    const naik = Array.from({ length: 300 }, (_, i) => 1000 + i * 4);
    const turun = Array.from({ length: 300 }, (_, i) => 4000 - i * 4);
    for (const c of [hitung(naik), hitung(turun)]) {
      if (c.finalSignal === 'BUY') expect(c.buyPct).toBeGreaterThanOrEqual(CONSENSUS_VOTE_THRESHOLDS.NORMAL);
      if (c.finalSignal === 'SELL') expect(c.sellPct).toBeGreaterThanOrEqual(CONSENSUS_VOTE_THRESHOLDS.NORMAL);
    }
  });

  it('ANTI-PLURALITAS: mayoritas tipis TIDAK lagi menghasilkan perintah', () => {
    // Deret berombak: agennya terpecah. Aturan lama akan mengeluarkan BUY/SELL dari
    // selisih satu-dua suara; aturan sekarang menahannya di HOLD dan menandai `divided`.
    const berombak = Array.from({ length: 300 }, (_, i) => 2000 + Math.sin(i / 4) * 150 + Math.cos(i / 11) * 80);
    const c = hitung(berombak);
    if (c.finalSignal !== 'HOLD') {
      expect(Math.max(c.buyPct, c.sellPct)).toBeGreaterThanOrEqual(CONSENSUS_VOTE_THRESHOLDS.NORMAL);
    } else if (c.divided) {
      expect(Math.max(c.buyPct, c.sellPct)).toBeLessThan(CONSENSUS_VOTE_THRESHOLDS.NORMAL);
      expect(c.holdPct).toBeLessThan(CONSENSUS_VOTE_THRESHOLDS.NORMAL);
    }
  });

  it('`divided` membedakan "terpecah" dari "netral"', () => {
    const berombak = Array.from({ length: 300 }, (_, i) => 2000 + Math.sin(i / 4) * 150);
    const c = hitung(berombak);
    // divided hanya boleh true saat HOLD dan tidak ada arah yang dominan.
    if (c.divided) {
      expect(c.finalSignal).toBe('HOLD');
      expect(c.holdPct).toBeLessThan(CONSENSUS_VOTE_THRESHOLDS.NORMAL);
    }
    expect(c.buyPct + c.sellPct + c.holdPct).toBeGreaterThanOrEqual(99);
  });
});

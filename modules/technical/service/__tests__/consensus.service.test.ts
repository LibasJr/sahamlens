import { describe, it, expect } from 'vitest';
import { calculateConsensus, dimensionOf, CONSENSUS_DIMENSION_WEIGHTS } from '../consensus.service';

// Regresi review kuantitatif 2026-08-05, temuan P1-5 & P1-6.

const vote = (label: string, decision: 'BULLISH' | 'BEARISH' | 'NEUTRAL', confidence = 70) =>
  ({ label, decision, confidence });

/** 10 analyzer yang dipakai recommendation.service.ts. */
const sepuluhAnalyzer = (arah: 'BULLISH' | 'BEARISH' | 'NEUTRAL') => [
  vote('EMA 20/50 Cross', arah),
  vote('RSI 14', arah),
  vote('MACD (12,26,9)', arah),
  vote('Volume Analysis', arah),
  vote('MA Trend IDX (20,50,200)', arah),
  vote('Volatility (ATR 14)', 'NEUTRAL'),
  vote('Momentum 1D/5D', arah),
  vote('Support & Resistance (20D)', arah),
  vote('SMA Score (5,10,20)', arah),
  vote('Market Flow Index', arah),
];

/** 12 analyzer yang dipakai app/api/stock/[ticker] - sama plus LensFlow & Bandarmology. */
const duaBelasAnalyzer = (arah: 'BULLISH' | 'BEARISH' | 'NEUTRAL') => [
  ...sepuluhAnalyzer(arah),
  vote('LensFlow (Estimasi Arus Dana Asing)', arah),
  vote('Bandarmology (CMF)', arah),
];

describe('P1-5 - konsensus tidak berubah karena jumlah analyzer berbeda antar halaman', () => {
  it('10 analyzer (Rekomendasi) dan 12 analyzer (Detail Saham) menghasilkan kategori yang SAMA', () => {
    const rekomendasi = calculateConsensus(sepuluhAnalyzer('BULLISH'));
    const detailSaham = calculateConsensus(duaBelasAnalyzer('BULLISH'));
    expect(detailSaham.kategori).toBe(rekomendasi.kategori);
    expect(detailSaham.bull_pct).toBe(rekomendasi.bull_pct);
  });

  it('menambah analyzer ke dimensi FLOW tidak menggeser persentase konsensus', () => {
    const dasar = calculateConsensus(sepuluhAnalyzer('BULLISH'));
    const ditambahBanyakFlow = calculateConsensus([
      ...sepuluhAnalyzer('BULLISH'),
      vote('Bandarmology (CMF)', 'BULLISH'),
      vote('LensFlow (Estimasi Arus Dana Asing)', 'BULLISH'),
      vote('Volume Spike Flow', 'BULLISH'),
    ]);
    expect(ditambahBanyakFlow.bull_pct).toBe(dasar.bull_pct);
  });

  it('kasus 7 bullish: dulu 70% (BUY) di satu halaman dan 58% (HOLD) di halaman lain', () => {
    const arah = (bullish: string[], list: ReturnType<typeof sepuluhAnalyzer>) =>
      list.map((a) => (bullish.includes(a.label) ? a : vote(a.label, 'NEUTRAL')));
    const bullishLabels = [
      'EMA 20/50 Cross', 'RSI 14', 'MACD (12,26,9)', 'Volume Analysis',
      'MA Trend IDX (20,50,200)', 'Momentum 1D/5D', 'SMA Score (5,10,20)',
    ];
    const a = calculateConsensus(arah(bullishLabels, sepuluhAnalyzer('BULLISH')));
    const b = calculateConsensus(arah(bullishLabels, duaBelasAnalyzer('BULLISH')));
    expect(a.kategori).toBe(b.kategori);
  });
});

describe('P1-6 - tren tidak lagi menguasai suara diam-diam', () => {
  it('empat analyzer tren berbagi SATU bobot dimensi, bukan empat suara terpisah', () => {
    const r = calculateConsensus(sepuluhAnalyzer('BULLISH'));
    const trend = r.dimensions.find((d) => d.dimension === 'TREND');
    expect(trend?.analyzers).toHaveLength(4);   // EMA, MACD, MA Trend, SMA
    expect(trend?.weight).toBe(CONSENSUS_DIMENSION_WEIGHTS.TREND);
  });

  it('tren bullish sendirian TIDAK cukup untuk BUY kalau dimensi lain bearish', () => {
    const r = calculateConsensus([
      vote('EMA 20/50 Cross', 'BULLISH'),
      vote('MACD (12,26,9)', 'BULLISH'),
      vote('MA Trend IDX (20,50,200)', 'BULLISH'),
      vote('SMA Score (5,10,20)', 'BULLISH'),
      vote('RSI 14', 'BEARISH'),
      vote('Momentum 1D/5D', 'BEARISH'),
      vote('Volume Analysis', 'BEARISH'),
      vote('Market Flow Index', 'BEARISH'),
      vote('Support & Resistance (20D)', 'BEARISH'),
    ]);
    // TREND 35 vs MOMENTUM 25 + FLOW 20 + STRUCTURE 15 = 60 bearish -> bukan BUY.
    expect(r.kategori).not.toBe('BUY');
    expect(r.kategori).not.toBe('STRONG BUY');
    expect(r.bear_pct).toBeGreaterThan(r.bull_pct);
  });

  it('dimensi yang analyzer-nya saling bertentangan menjadi NEUTRAL, tidak dipaksa memihak', () => {
    const r = calculateConsensus([
      vote('EMA 20/50 Cross', 'BULLISH'),
      vote('MACD (12,26,9)', 'BEARISH'),
      vote('RSI 14', 'BULLISH'),
    ]);
    const trend = r.dimensions.find((d) => d.dimension === 'TREND');
    expect(trend?.direction).toBe('NEUTRAL');
  });
});

describe('dimensionOf - pemetaan label ke dimensi', () => {
  it('seluruh turunan rata-rata bergerak masuk TREND', () => {
    expect(dimensionOf('EMA 20/50 Cross')).toBe('TREND');
    expect(dimensionOf('MACD (12,26,9)')).toBe('TREND');
    expect(dimensionOf('SMA Score (5,10,20)')).toBe('TREND');
    expect(dimensionOf('MA Trend IDX (20,50,200)')).toBe('TREND');
  });

  it('label tak dikenal masuk STRUCTURE, tidak dibuang diam-diam', () => {
    expect(dimensionOf('Indikator Baru Yang Belum Dipetakan')).toBe('STRUCTURE');
  });

  it('bobot dimensi berjumlah 100', () => {
    const total = Object.values(CONSENSUS_DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });
});

describe('konsensus - kasus batas', () => {
  it('daftar kosong tidak melempar', () => {
    const r = calculateConsensus([]);
    expect(r.kategori).toBe('HOLD');
    expect(r.total_models).toBe(0);
  });

  it('semua analyzer N/A (netral, confidence 0) -> HOLD, bukan BUY/SELL', () => {
    const r = calculateConsensus(sepuluhAnalyzer('NEUTRAL').map((a) => ({ ...a, confidence: 0 })));
    expect(r.kategori).toBe('HOLD');
    expect(r.bull_pct).toBe(0);
    expect(r.bear_pct).toBe(0);
  });

  it('median_skor hanya dari analyzer yang memberi arah (temuan M-16 tetap berlaku)', () => {
    const r = calculateConsensus([
      vote('RSI 14', 'BULLISH', 80),
      vote('MACD (12,26,9)', 'BULLISH', 90),
      vote('Volatility (ATR 14)', 'NEUTRAL', 0),
    ]);
    expect(r.median_skor).toBe(85);
  });
});

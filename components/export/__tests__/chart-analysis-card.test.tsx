import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ChartAnalysisCard from '../ChartAnalysisCard';
import type { PriceCandle } from '../PriceChartBlock';

/** Deret candle uji: naik-turun tetap, tanggal berurutan, volume menurun jelas. */
function deretUji(jumlah: number): PriceCandle[] {
  const deret: PriceCandle[] = [];
  for (let i = 0; i < jumlah; i += 1) {
    const hari = String((i % 28) + 1).padStart(2, '0');
    const bulan = String(Math.floor(i / 28) + 1).padStart(2, '0');
    const dasar = 5000 + Math.sin(i / 4) * 120 + i * 3;
    const buka = dasar + (i % 3) - 1;
    const tutup = dasar + (i % 5) - 2;
    deret.push({
      time: `2026-${bulan}-${hari}`,
      open: buka,
      high: Math.max(buka, tutup) + 18,
      low: Math.min(buka, tutup) - 18,
      close: tutup,
      volume: 1_000_000 + i * 10_000,
    });
  }
  return deret;
}

const DERET = deretUji(120);
/** Jendela yang digambar kartu: 90 sesi terakhir. Level uji diambil DARI rentang itu supaya
 *  perilaku "level di luar rentang tidak digambar" tidak tercampur dengan uji ini. */
const JENDELA = DERET.slice(-90);
const TERTINGGI = Math.max(...JENDELA.map((c) => c.high as number));
const TERENDAH = Math.min(...JENDELA.map((c) => c.low as number));
const angkaBulu = (v: number) => Math.round(v).toLocaleString('id-ID');

const PROPS_DASAR = {
  symbol: 'BBCA',
  stockName: 'Bank Central Asia Tbk',
  currentPrice: 6250,
  changePct: 0.4,
  volume: 89_400_000,
  priceHistory: DERET,
  pivots: {
    pp: (TERTINGGI + TERENDAH) / 2,
    s1: TERENDAH + 30,
    s2: TERENDAH + 10,
    r1: TERTINGGI - 30,
    r2: TERTINGGI - 10,
  },
  range52w: { high52w: 8750, low52w: 4820, currentPrice: 6250, positionPct: 36 },
  trends: [
    { timeframe: 'SHORT_TERM', label: 'Jangka pendek', status: 'BEARISH', detail: 'Harga di bawah EMA 20', benchmark: 'EMA20' },
    { timeframe: 'LONG_TERM', label: 'Jangka panjang', status: 'BULLISH', detail: 'MA 50 di atas MA 200', benchmark: 'MA200' },
  ],
  patterns: [],
  score: 61.4,
  consensusLabel: 'Netral',
  consensusTone: 'neutral' as const,
  tradingPlan: { atr14: 128, stopLoss: 6090, targetPrice1: 6570, riskPct: 2.6, rewardPct1: 5.1 },
  exportedAt: new Date('2026-09-26T05:00:00+07:00'),
};

describe('ChartAnalysisCard', () => {
  it('dipatok pada ukuran halaman 9:16 dengan area aman TikTok sebagai padding', () => {
    const markah = renderToStaticMarkup(<ChartAnalysisCard {...PROPS_DASAR} />);
    // 1080 x 1920: tidak ada penyesuaian skala yang perlu dilakukan saat ekspor.
    expect(markah).toContain('height:1920px');
    expect(markah).toContain('width:1080px');
    // padding atas 124 (150 area aman - 26 bingkai), bawah 294 (320 - 26).
    expect(markah).toContain('padding-top:124px');
    expect(markah).toContain('padding-bottom:294px');
  });

  it('menulis angka dari data, bukan angka contoh', () => {
    const markah = renderToStaticMarkup(<ChartAnalysisCard {...PROPS_DASAR} />);
    expect(markah).toContain('Rp 6.250');
    expect(markah).toContain('+0,4%');
    expect(markah).toContain('89,4 jt lembar');
    expect(markah).toContain('61/100');
    expect(markah).toContain('36%');
    expect(markah).toContain('Rp 128');
    expect(markah).toContain('Rp 6.570');
    expect(markah).toContain('Rp 6.090');
    expect(markah).toContain('Pivot harian');
    expect(markah).toContain('BEARISH');
  });

  it('menggambar grafik dan menandai level yang dihitung dari data', () => {
    const markah = renderToStaticMarkup(<ChartAnalysisCard {...PROPS_DASAR} />);
    expect(markah).toContain('data-candle');
    expect(markah).toContain('data-volume');
    expect(markah).toContain(`R1 ${angkaBulu(TERTINGGI - 30)}`);
    expect(markah).toContain(`S1 ${angkaBulu(TERENDAH + 30)}`);
    expect(markah).not.toContain('NaN');
  });

  it('menyebut data yang tidak ada apa adanya, bukan mengarang', () => {
    const markah = renderToStaticMarkup(
      <ChartAnalysisCard symbol="XXXX" priceHistory={[]} trends={[]} patterns={[]} />,
    );
    expect(markah).toContain('tidak tersedia');
    expect(markah).toContain('Grafik harga tidak tersedia');
    expect(markah).toContain('Tren multi-timeframe tidak tersedia');
    expect(markah).not.toContain('NaN');
  });

  it('selalu membawa penafian dan sumber data', () => {
    const markah = renderToStaticMarkup(<ChartAnalysisCard {...PROPS_DASAR} />);
    expect(markah).toContain('Bukan rekomendasi jual/beli');
    expect(markah).toContain('Sumber: candle harian bursa (EOD)');
  });
});
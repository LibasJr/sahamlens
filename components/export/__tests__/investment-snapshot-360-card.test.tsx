import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import InvestmentSnapshot360Card from '../InvestmentSnapshot360Card';

// Kartu ini diekspor sebagai GAMBAR. Tidak ada tooltip, tidak ada "selengkapnya", tidak
// ada cara pembaca memeriksa ulang angkanya. Yang dikunci di sini karena itu bukan tata
// letak, melainkan tiga kelas kekeliruan yang semuanya sudah pernah tercetak di repo ini:
//
//   1. nol dari penyedia data tampil sebagai fakta (bank ber-"DER 0,00x", "GPM 0.00%");
//   2. slot kosong diisi tebakan alih-alih dinyatakan kosong;
//   3. metrik yang tidak relevan untuk sektornya tetap dicetak (CR/DER untuk bank).
//
// Bentuk payload di bawah mengikuti payload nyata Studio: `stockRes` -> technical,
// `fundRes` -> fundamental/bank, `earningsRes`, `intrinsicRes`, `ownershipRes`. Nilainya
// diambil dari snapshot BBCA yang sudah dipakai fundamental-research-card.test.tsx,
// supaya yang diuji adalah bentuk data yang benar-benar dikirim API - bukan bentuk
// karangan yang kebetulan lolos.
const BBCA = {
  symbol: 'BBCA',
  stockName: 'PT Bank Central Asia Tbk',
  currentPrice: 6450,
  changePct: 0.78,
  volume: 82_000_000,
  dataTimestamp: '2026-09-04T09:14:00Z',
  consensusLabel: 'SINYAL BELI',
  consensusTone: 'positive' as const,
  score: 54,
  scoreBreakdown: { technical: 17, flow: 22, fundamental: 15 },
  bullPct: 46,
  bearPct: 18,
  neutralPct: 36,
  range52w: { high52w: 7200, low52w: 5100, currentPrice: 6450, positionPct: 64 },
  pivots: { pp: 6433, r1: 6520, r2: 6610, s1: 6340, s2: 6255 },
  trends: [
    { timeframe: 'SHORT_TERM', label: 'Jangka Pendek', status: 'BULLISH', detail: 'Harga di atas EMA20', benchmark: 'EMA20' },
    { timeframe: 'MEDIUM_TERM', label: 'Jangka Menengah', status: 'BULLISH', detail: 'Harga di atas MA50', benchmark: 'MA50' },
    { timeframe: 'LONG_TERM', label: 'Jangka Panjang', status: 'NEUTRAL', detail: 'Dekat MA200', benchmark: 'MA200' },
  ],
  patterns: [{ name: 'Bullish Engulfing', sentiment: 'BULLISH', reliability: 'HIGH', volumeConfirmed: true }],
  patternAsOf: '2026-09-03T00:00:00Z',
  tradingPlan: {
    entryZone: [6300, 6450] as [number, number],
    stopLoss: 6100,
    targetPrice1: 6900,
    targetPrice2: 7200,
    atr14: 120,
    riskPct: 5.4,
    rewardPct1: 7,
    riskRewardRatio: '1 : 2.3',
    bias: 'BULLISH_SETUP',
  },
  flowDetails: { cmf20: 0.12, netPressurePct: 4.2, bandarmologyStatus: 'BULLISH', foreignFlowStatus: 'NET BUY' },
  fundamentals: {
    marketCap: 792551724417024,
    trailingPE: 13.6612015,
    priceToBook: 2.9298046,
    returnOnEquity: 0.21818,
    profitMargins: 0.53118,
    dividendYield: 0.0591,
    revenueGrowth: 0.08,
    earningsGrowth: 0.11,
    // Yahoo mengirim 0 untuk bank: bukan pengukuran, melainkan metrik yang memang tidak
    // dilaporkan dalam pengertian yang sama di perbankan.
    grossMargins: 0,
    currentRatio: 0,
    debtToEquity: null,
  },
  bankFundamentals: {
    nimPct: 5.87,
    nplGrossPct: 2.1,
    casaPct: 81.2,
    ldrPct: 76.4,
    carPct: 29.4,
    periodEnd: '2026-06-30',
    quality: { status: 'PARTIAL', coveragePct: 60 },
  },
  profile: { sector: 'Financial Services', industry: 'Banks - Regional' },
  moat: { status: 'KUAT', supportive: 7, neutral: 2, caution: 1, available: 10, expected: 10, coveragePct: 100, supportPct: 70, pillars: [] },
  durability: { status: 'DURABLE', conclusion: 'ROE di atas biaya ekuitas sepanjang periode teramati.' },
  valuation: { fairValue: 7100, mos: 9.2, valuation: 'FAIR VALUE', method: 'DCF' },
  latestEarningsQuarter: {
    quarter: '2Q2026',
    periodEnd: '2026-06-30',
    reportedDate: '2026-07-24',
    actualEps: 121,
    estimatedEps: 118,
    surprisePct: 2.5,
    status: 'BEAT',
  },
  upcomingEarnings: { date: '2026-10-22', isEstimate: true, fiscalQuarter: '3Q2026' },
  ownership: {
    foreignPct: 29.3085,
    localPct: 13.2416,
    scriplessPct: 42.5501,
    observedDate: '2026-07-31',
    previous: { actualGapDays: 31, foreignPp: -0.016 },
  },
  exportedAt: new Date('2026-09-04T09:14:00Z'),
};

function render(overrides: Record<string, unknown> = {}): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToStaticMarkup(<InvestmentSnapshot360Card {...(BBCA as any)} {...(overrides as any)} />);
}

describe('InvestmentSnapshot360Card', () => {
  it('merangkum teknikal, fundamental, risiko, dan provenance dalam satu lembar', () => {
    const html = render();

    expect(html).toContain('Investment Snapshot 360°');
    expect(html).toContain('Struktur Teknikal');
    expect(html).toContain('Aliran Dana &amp; Level Kunci');
    expect(html).toContain('Earnings &amp; Kepemilikan');
    expect(html).toContain('Trade Structure');
    expect(html).toContain('Decision Strip');
    expect(html).toContain('Evidence Quality');
    expect(html).toContain('Data per 04 September 2026');
    expect(html).toContain('LensScore adalah keselarasan faktor, bukan probabilitas profit');
  });

  it('mencetak kedalaman teknikal yang sudah dihitung, bukan membuangnya', () => {
    const html = render();

    // Pola candle, pivot, distribusi suara, dan ATR semuanya sudah dihitung suite teknikal
    // dan sudah tampil di menu Teknikal - kartu ekspor pernah membuang seluruhnya.
    expect(html).toContain('Bullish Engulfing');
    expect(html).toContain('terkonfirmasi volume');
    expect(html).toContain('Pivot (PP)');
    expect(html).toContain('Resistance 1');
    expect(html).toContain('Support 2');
    expect(html).toContain('Bull 46%');
    expect(html).toContain('CMF20 +0,12');
    expect(html).toContain('1 : 2.3');
  });

  it('memakai metrik perbankan dan menolak nol yang bukan pengukuran', () => {
    const html = render();

    // Untuk bank: NIM/NPL/CASA/LDR/CAR, bukan gross margin dan current ratio.
    expect(html).toContain('NIM');
    expect(html).toContain('CASA');
    expect(html).toContain('LDR');
    expect(html).toContain('CAR');
    expect(html).not.toContain('Gross Profit Margin');
    // `currentRatio: 0` dan `grossMargins: 0` dari Yahoo tidak boleh tampil sebagai angka.
    expect(html).not.toContain('0.00x');
    expect(html).not.toContain('0.00%');
  });

  it('menandai data yang tidak tersedia tanpa mengarang keputusan', () => {
    const html = renderToStaticMarkup(
      <InvestmentSnapshot360Card symbol="XXXX" exportedAt={BBCA.exportedAt} />,
    );

    expect(html).toContain('DATA TERBATAS');
    expect(html).toContain('TRADEPLAN: TIDAK ACTIONABLE');
    expect(html).toContain('Tren belum tersedia');
    expect(html).toContain('Jadwal laporan berikutnya belum tersedia');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('N/A');
    expect(html).not.toContain('NaN');
  });

  it('tidak menyatakan konversi arus kas ketika salah satu sisinya hilang', () => {
    const html = render({
      profile: { sector: 'Consumer Defensive', industry: 'Packaged Foods' },
      bankFundamentals: null,
      fundamentals: { ...BBCA.fundamentals, operatingCashflow: 5e12, freeCashflow: null },
    });

    expect(html).toContain('konversi belum terukur');
    expect(html).not.toContain('NIM');
  });
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TechnicalExportCard from '../TechnicalExportCard';

// Snapshot data - angka karangan TIDAK akan memicu kelas kekeliruan yang dijaga.
// Tiga hal yang diperiksa:
//   1. Tidak ada fixed-height / crop / line-clamp / slice yang memotong evidence.
//   2. Semua analyzer dan dimensi konsensus dirender utuh.
//   3. Field tidak tersedia tampil 'N/A', bukan asumsi.
//   4. 'Data as of' DIBEDAKAN dari 'Diekspor pada'.

const BASE_PROPS = {
  symbol: 'BBCA.JK',
  finalSuggestion: 'NETRAL',
  finalSuggestionTone: 'neutral' as const,
  summaryId: 'Konsensus NETRAL: keselarasan arah antar dimensi 45% condong positif berbanding 35% condong negatif, dari 14 analyzer (9:5 berarah).',
  buyPct: 45,
  sellPct: 35,
  holdPct: 20,
  waitPct: 0,
  score: 58,
  coveragePct: 87,
  researchLabel: 'Untuk riset saja',
  scoreConfidence: 'Keyakinan sedang',
  advisoryStatus: { label: 'Untuk riset saja', title: 'Sinyal tetap ditampilkan sebagai bahan riset, bukan rekomendasi transaksi.' },
  freshnessLabel: 'Penutupan (EOD)',
  freshnessTone: 'text-tv-text',
  freshnessDetail: 'Bar terakhir 24 Sep 2026 15:00 WIB',
  dataTimestamp: '2026-09-24T08:00:00Z',
  provider: 'YAHOO_CHART',
  subScores: [
    { label: 'Technical', nilai: 62 },
    { label: 'Fundamental', nilai: 55 },
    { label: 'Flow', nilai: 51 },
  ],
  ringkasan: 'Arah teknikal masih campuran. Belum ada dominasi yang cukup lebar antar dimensi, jadi konteks harga dan flow menjadi lebih penting.',
  exportedAt: new Date('2026-09-24T10:30:00Z'),
  agents: [
    { label: 'EMA 20/50 Cross', value: 'EMA20: 6200, EMA50: 6100', decision: 'BULLISH', confidence: 65, dimension: 'TREND' },
    { label: 'RSI 14', value: 'RSI: 55.30', decision: 'BULLISH', confidence: 55, dimension: 'MOMENTUM' },
    { label: 'MACD', value: 'MACD: 12.5, Signal: 10.2', decision: 'BULLISH', confidence: 60, dimension: 'TREND' },
    { label: 'Volume', value: 'Vol: 1.2x avg', decision: 'BULLISH', confidence: 52, dimension: 'FLOW' },
    { label: 'Trend', value: 'Uptrend', decision: 'BULLISH', confidence: 70, dimension: 'TREND' },
    { label: 'Volatility', value: 'Low', decision: 'NEUTRAL', confidence: 45, dimension: 'VOLATILITY' },
    { label: 'Momentum', value: 'Positive', decision: 'BULLISH', confidence: 58, dimension: 'MOMENTUM' },
    { label: 'Support', value: 'S1: 6000', decision: 'BULLISH', confidence: 63, dimension: 'STRUCTURE' },
    { label: 'SMA Score (5,10,20)', value: 'Score: 4/5', decision: 'BULLISH', confidence: 80, dimension: 'TREND' },
    { label: 'Market Flow', value: 'Net buy', decision: 'BULLISH', confidence: 67, dimension: 'FLOW' },
    { label: 'ADX', value: 'ADX: 28', decision: 'BULLISH', confidence: 55, dimension: 'TREND' },
    { label: 'Bollinger', value: '%B: 0.65', decision: 'NEUTRAL', confidence: 48, dimension: 'VOLATILITY' },
    { label: 'Stochastic', value: 'K: 62, D: 58', decision: 'BULLISH', confidence: 60, dimension: 'MOMENTUM' },
    { label: 'OBV', value: 'Rising', decision: 'BULLISH', confidence: 54, dimension: 'FLOW' },
  ],
  dimensions: [
    { dimension: 'TREND', weight: 35, direction: 'BULLISH', votedAnalyzers: 6, analyzers: ['EMA 20/50 Cross', 'MACD', 'Trend', 'ADX', 'SMA Score (5,10,20)', 'Market Flow'] },
    { dimension: 'MOMENTUM', weight: 25, direction: 'BULLISH', votedAnalyzers: 3, analyzers: ['RSI 14', 'Momentum', 'Stochastic'] },
    { dimension: 'FLOW', weight: 20, direction: 'BULLISH', votedAnalyzers: 3, analyzers: ['Volume', 'Market Flow', 'OBV'] },
    { dimension: 'STRUCTURE', weight: 12, direction: 'BULLISH', votedAnalyzers: 1, analyzers: ['Support'] },
    { dimension: 'VOLATILITY', weight: 8, direction: 'NEUTRAL', votedAnalyzers: 1, analyzers: ['Bollinger'] },
  ],
};

function render(props: Record<string, unknown> = {}): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToStaticMarkup(<TechnicalExportCard {...(BASE_PROPS as any)} {...(props as any)} />);
}

describe('TechnicalExportCard - laporan penuh', () => {
  it('tidak punya fixed-height / line-clamp / slice yang memotong evidence', () => {
    const html = render();
    // Tidak ada h-[..px] tetap
    expect(html).not.toContain('h-[');
    expect(html).not.toContain('h-[1350px]');
    // Tidak ada line-clamp
    expect(html).not.toContain('line-clamp');
    // overflow-hidden di progress bar (h-4 rounded-full) BUKAN pemotong konten utama - itu wajar
    // yang dicek adalah tidak ada overflow-hidden di kontainer kartu utama
    const mainContainerMatch = html.match(/class="lens-export-dark[^"]*"/)?.[0] ?? '';
    expect(mainContainerMatch).not.toContain('overflow-hidden');
    // Tidak ada wrapper yang memotong isi utama (gap-8 flex-col)
    expect(html).not.toMatch(/overflow-hidden[^>]*flex flex-col gap-8/);
  });

  it('menampilkan seluruh analyzer utuh (14 analyzer, tidak dipotong 10)', () => {
    const html = render();
    // Semua 14 analyzer harus muncul
    expect(html).toContain('EMA 20/50 Cross');
    expect(html).toContain('RSI 14');
    expect(html).toContain('MACD');
    expect(html).toContain('Volume');
    expect(html).toContain('Trend');
    expect(html).toContain('Volatility');
    expect(html).toContain('Momentum');
    expect(html).toContain('Support');
    expect(html).toContain('SMA Score (5,10,20)');
    expect(html).toContain('Market Flow');
    expect(html).toContain('ADX');
    expect(html).toContain('Bollinger');
    expect(html).toContain('Stochastic');
    expect(html).toContain('OBV');
  });

  it('menampilkan semua dimensi konsensus (label + bobot + arah + bukti)', () => {
    const html = render();
    expect(html).toContain('TREND');
    expect(html).toContain('MOMENTUM');
    expect(html).toContain('FLOW');
    expect(html).toContain('STRUCTURE');
    expect(html).toContain('VOLATILITY');
    // Bobot
    expect(html).toContain('bobot 35');
    expect(html).toContain('bobot 25');
    expect(html).toContain('bobot 20');
    expect(html).toContain('bobot 12');
    expect(html).toContain('bobot 8');
    // Arah
    expect(html).toContain('BULLISH');
    expect(html).toContain('NEUTRAL');
    // Bukti (votedAnalyzers)
    expect(html).toContain('6 analyzer berarah');
    expect(html).toContain('3 analyzer berarah');
  });

  it('menampilkan field metadata lengkap (coverage, research, confidence, advisory)', () => {
    const html = render();
    expect(html).toContain('Kelengkapan data');
    expect(html).toContain('87%');
    expect(html).toContain('Status riset');
    expect(html).toContain('Untuk riset saja');
    expect(html).toContain('Keyakinan skor');
    expect(html).toContain('Keyakinan sedang');
    expect(html).toContain('Advisory');
  });

  it('menampilkan sub-skor Technical/Fundamental/Flow', () => {
    const html = render();
    expect(html).toContain('Technical');
    expect(html).toContain('Fundamental');
    expect(html).toContain('Flow');
    // HTML-nya: 62<span ...> / 100</span> — cek angka dan suffix terpisah
    expect(html).toContain('62');
    expect(html).toContain('55');
    expect(html).toContain('51');
    expect(html).toContain(' / 100');
  });

  it('menampilkan ringkasan deterministik utuh tanpa potongan', () => {
    const html = render();
    expect(html).toContain('Arah teknikal masih campuran');
    expect(html).toContain('konteks harga dan flow menjadi lebih penting');
  });

  it('BEDAKAN Data as of dari Diekspor pada', () => {
    const html = render();
    // Data asof (waktu pasar)
    expect(html).toContain('Data as of:');
    // Diekspor pada (waktu ekspor)
    expect(html).toContain('Diekspor pada:');
    // Keduanya berbeda - tidak boleh sama
    expect(html).toContain('24 Sep 2026'); // dataTimestamp
    // Diekspor pada = 17.30 WIB (UTC+7), dataTimestamp = 08:00 UTC = 15.00 WIB
    expect(html).toContain('17.30 WIB');
  });

  it('menampilkan disclaimer riset', () => {
    const html = render();
    expect(html).toContain('informasi riset deterministik');
    expect(html).toContain('bukan probabilitas harga atau rekomendasi transaksi');
  });

  it('field tidak tersedia tampil N/A, bukan asumsi', () => {
    const html = render({
      score: null,
      coveragePct: null,
      researchLabel: null,
      scoreConfidence: null,
      advisoryStatus: null,
      freshnessLabel: null,
      freshnessDetail: null,
      dataTimestamp: null,
      provider: null,
      subScores: [],
      ringkasan: null,
    });
    // N/A muncul untuk field yang null
    expect(html).toContain('N/A');
    // Tapi tidak ada asumsi numerik (tidak ada "0%" palsu)
    expect(html).not.toContain('0 / 100');
  });

  it('tetap merender tanpa dimensi (opsional)', () => {
    const html = render({ dimensions: [] });
    // Card tetap valid tanpa dimensi
    expect(html).toContain('BBCA');
    expect(html).toContain('Skor total');
  });

  it('tetap merender dengan minimal props (tidak crash)', () => {
    const html = render({
      symbol: 'TEST.JK',
      finalSuggestion: 'HOLD',
      finalSuggestionTone: 'neutral',
      summaryId: undefined,
      score: null,
      coveragePct: null,
      researchLabel: null,
      scoreConfidence: null,
      advisoryStatus: null,
      freshnessLabel: null,
      freshnessTone: null,
      freshnessDetail: null,
      dataTimestamp: null,
      provider: null,
      subScores: [],
      dimensions: [],
      ringkasan: null,
      agents: [],
      buyPct: 0,
      sellPct: 0,
      holdPct: 0,
    });
    expect(html).toContain('TEST');
    expect(html).toContain('Skor total');
  });
});

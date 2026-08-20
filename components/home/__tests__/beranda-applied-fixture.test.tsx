import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Potret HASIL TERAPAN - komponen beranda yang SUNGGUHAN, bukan mock komposisi.
 *
 * KENAPA ADA. Aplikasi ini tidak bisa dijalankan di mesin pengembang tanpa Postgres,
 * Redis, dan data pasar hulu, jadi selama delapan fase V3 tidak ada satu pun agen yang
 * pernah melihat halaman yang sedang diubahnya - dan hasilnya adalah
 * docs/notes/UTANG_V3_TAMPILAN_BELUM_BERUBAH_2026-08-20.md.
 *
 * Yang menutup celah itu bukan menjalankan seluruh Next.js, melainkan kenyataan bahwa
 * HomeBrandHero dan HomeTodayBrief menerima seluruh datanya lewat PROPS. Keduanya bisa
 * dirender dengan data contoh, lalu dipotret Playwright memakai CSS produksi. Yang
 * terlihat di gambar adalah komponen yang benar-benar dikirim ke pengguna.
 *
 * BATASNYA JUJUR: urutan bagian di HomeWorkspace tidak ikut terpotret di sini - ia
 * membutuhkan seluruh hook pengambilan data. Urutan itu dijaga oleh assertion sumber di
 * beranda-composition.test.ts, bukan oleh gambar ini.
 *
 * Angka contoh menyalin screenshot produksi 20 Agustus 2026 supaya perbandingan
 * sebelum/sesudah membandingkan halaman yang isinya sama.
 */

// next/navigation hanya hidup di dalam App Router. Hero memanggil useRouter untuk
// membuka halaman emiten saat pencarian dikirim - tidak ada navigasi yang terjadi saat
// render statis, jadi stub kosong sudah cukup dan tidak menyembunyikan perilaku apa pun.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const FIXTURE = path.resolve(__dirname, '../../../e2e/__fixtures__/beranda-applied.html');

const IHSG = { price: 6500.94, changePct: 1.67 };

const MARKET_PULSE = {
  breadth: { advancing: 74, declining: 13, total: 100 },
  regime: { label: 'Bull Expansion', posture: 'RISK_ON' as const, confidence: 95 },
  sectorHeatmap: [
    { sector: 'Healthcare', color: 'green', changePct: 1.91 },
    { sector: 'Basic Materials', color: 'green', changePct: 1.68 },
    { sector: 'Energy', color: 'green', changePct: 1.39 },
    { sector: 'Technology', color: 'green', changePct: 1.17 },
    { sector: 'Industrials', color: 'green', changePct: 0.91 },
    { sector: 'Infra & Transport', color: 'green', changePct: 0.77 },
    { sector: 'Consumer Defensive', color: 'green', changePct: 0.75 },
    { sector: 'Financial', color: 'green', changePct: 0.6 },
    { sector: 'Property', color: 'green', changePct: 0.52 },
    { sector: 'Consumer Cyclical', color: 'green', changePct: 0.52 },
    { sector: 'Telecom', color: 'green', changePct: 0.48 },
  ],
};

const RADAR = [
  { symbol: 'DMAS.JK', price: 169, changePct: 3.68, finalScore: 89, flagged: false, flagReason: null, topReasons: ['Uptrend sempurna P:169 > MA20:148 > MA50:141 > MA200:127'], signals: ['MACD bullish (Hist:2.06)'] },
  { symbol: 'STAA.JK', price: 1140, changePct: 4.11, finalScore: 88, flagged: false, flagReason: null, topReasons: ['MACD bullish (Hist:1.14)'], signals: [] },
  { symbol: 'TAPG.JK', price: 1915, changePct: 4.64, finalScore: 87, flagged: false, flagReason: null, topReasons: ['Uptrend sempurna P:1915 > MA20:1758 > MA50:1585'], signals: [] },
  { symbol: 'DGWG.JK', price: 332, changePct: 1.84, finalScore: 81, flagged: false, flagReason: null, topReasons: ['MACD bullish (Hist:3.07)'], signals: [] },
];

const TOP_LOSERS = [
  { symbol: 'KING.JK', changePct: -9.33, price: 408 },
  { symbol: 'DSSA.JK', changePct: -1.92, price: 1020 },
];

const DAILY_PICKS = {
  attractive: { count: 12 },
  breakout: { count: 5 },
  undervalue: { count: 7 },
  foreignAccumulation: { count: 4 },
  goldenCross: { count: 1, stale: true, items: ['JSMR'] },
  deadCross: { count: 3, stale: true, items: ['BMRI', 'BAIK', 'BANK'] },
};

async function markupTerapan(): Promise<string> {
  const { default: HomeBrandHero } = await import('../HomeBrandHero');
  const { default: HomeTodayBrief } = await import('../HomeTodayBrief');

  return renderToStaticMarkup(
    <div className="min-h-screen bg-tv-bg">
      <div className="mx-auto flex max-w-[1600px] flex-col space-y-10 p-4 md:p-6 lg:p-7">
        <HomeBrandHero />
        <HomeTodayBrief
          ihsg={IHSG}
          marketPulse={MARKET_PULSE}
          dailyPicks={DAILY_PICKS}
          radarItems={RADAR}
          topLosers={TOP_LOSERS}
          loadingMarket={false}
          loadingMarketPulse={false}
          loadingRadar={false}
          picksLoginRequired={false}
          picksNeedPro={false}
          marketPulseLoginRequired={false}
          marketPulseNeedPro={false}
          radarStale
        />
      </div>
    </div>,
  );
}

describe('potret hasil terapan beranda', () => {
  it('menulis fixture dari komponen produksi', async () => {
    const markup = await markupTerapan();
    fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
    fs.writeFileSync(FIXTURE, markup, 'utf8');
    expect(markup.length).toBeGreaterThan(3000);
  });

  it('hero tidak lagi merender blok IHSG-nya sendiri', async () => {
    // IHSG dulu tampil tiga kali di layar pertama: TopMarketBar, kartu kanan hero, lalu
    // MetricBand snapshot. Yang dicabut salinan ketiga - bukan angkanya.
    const markup = await markupTerapan();
    const hero = markup.slice(0, markup.indexOf('Hari ini') === -1 ? markup.length : markup.indexOf('Hari ini'));
    expect(hero).not.toContain('6.500,94');
    expect(hero).not.toContain('6,500.94');
  });

  it('penyangkalan tetap terbaca di layar pertama', async () => {
    // PRD SEC.5.6 "Trust Is Visible". Bentuknya boleh berubah, keberadaannya tidak.
    const markup = await markupTerapan();
    expect(markup).toContain('Alat analisis');
  });

  it('snapshot tetap membawa IHSG, breadth, regime, dan LensRadar', async () => {
    const markup = await markupTerapan();
    expect(markup).toContain('Bull Expansion');
    expect(markup).toContain('IHSG');
    expect(markup).toContain('Breadth');
    expect(markup).toContain('LensRadar');
  });
});

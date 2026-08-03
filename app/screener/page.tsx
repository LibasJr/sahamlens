'use me';
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { Sliders, Award, Shield, Zap, RefreshCw, Filter, CheckCircle } from 'lucide-react';

export default function ScreenerPage() {
  const router = useRouter();
  const [riskProfile, setRiskProfile] = useState<'Konservatif' | 'Moderat' | 'Agresif'>('Moderat');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const runScreener = async (profile: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/screener?profile=' + encodeURIComponent(profile));
      const json = await res.json();
      setData(res.ok ? json : null);
    } catch (e) {
      console.error(e);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runScreener(riskProfile);
  }, [riskProfile]);

  const top10 = data?.analysis?.top_10_stocks || [];

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <Header
        currentTicker=""
        onTickerChange={(t) => router.push(`/technical/${t.replace('.JK', '')}.JK`)}
        moduleTitle="Council AI Multi-Factor Screener"
        moduleBank="COUNCIL AI"
      />

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
        {/* Risk Profile Selection Bar */}
        <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-400">
              <Sliders className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-heading text-xl font-bold text-white tracking-tight">Seleksi Profil Risiko Investor</h1>
              <p className="text-xs text-tv-muted font-mono">
                Pilih toleransi risiko untuk memfilter 10 Saham IDX terbaik berdasarkan penilaian kuantitatif Council AI.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-tv-bg p-1.5 rounded-lg border border-tv-border">
            {(['Konservatif', 'Moderat', 'Agresif'] as const).map((profile) => (
              <button
                key={profile}
                onClick={() => setRiskProfile(profile)}
                className={`px-4 py-2 rounded-md font-mono text-xs font-bold transition-all ${
                  riskProfile === profile
                    ? 'bg-amber-400 text-black shadow-md'
                    : 'text-tv-text hover:bg-tv-hover hover:text-white'
                }`}
              >
                {profile}
              </button>
            ))}
          </div>
        </div>

        {/* Screener Results Table */}
        <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 space-y-4">
          <div className="flex items-center justify-between border-b border-tv-border pb-3">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-400" />
              <h3 className="font-heading font-bold text-base text-white">
                Top 10 Saham IDX - Profil {riskProfile}
              </h3>
            </div>
            <span className="text-xs font-mono text-tv-muted">
              Ranking skor komposit (bobot beda per profil): PER vs Sektor, ROE, DER, Div Yield, Revenue Growth, Bandarmology (Chaikin Money Flow)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-tv-border bg-tv-bg text-tv-muted uppercase text-[10px]">
                  <th className="p-3">#</th>
                  <th className="p-3">Ticker</th>
                  <th className="p-3">Nama Emiten</th>
                  <th className="p-3">Sektor</th>
                  <th className="p-3 text-right">PER / Sektor</th>
                  <th className="p-3 text-right">Rev Growth (TTM)</th>
                  <th className="p-3 text-right">ROE</th>
                  <th className="p-3 text-right">DER</th>
                  <th className="p-3 text-right">Div Yield</th>
                  <th className="p-3">Bandarmology</th>
                  <th className="p-3">Moat Rating</th>
                  <th className="p-3">Signal</th>
                  <th className="p-3">Pola Backtest</th>
                  <th className="p-3">Sentimen Berita</th>
                  <th className="p-3 text-right">52W High/Low</th>
                  <th className="p-3 text-right">Harga</th>
                  <th className="p-3 text-right">Volatilitas Harian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border/50">
                {top10.length === 0 && (
                  <tr>
                    <td colSpan={17} className="p-8 text-center text-tv-muted text-sm">
                      {loading ? (
                        <span className="inline-flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Memindai 114 saham likuid IDX...</span>
                      ) : 'Tidak ada saham yang memenuhi kriteria saat ini. Coba profil risiko lain atau muat ulang.'}
                    </td>
                  </tr>
                )}
                {top10.map((item: any, idx: number) => (
                  <tr key={item.ticker} className="hover:bg-tv-hover/50 transition-colors">
                    <td className="p-3 text-tv-muted font-bold">{idx + 1}</td>
                    <td className="p-3">
                      <span className="font-bold text-white px-2 py-0.5 rounded bg-tv-hover border border-tv-borderLight">
                        {item.ticker}
                      </span>
                    </td>
                    <td className="p-3 text-tv-text font-sans font-medium">{item.name}</td>
                    <td className="p-3 text-tv-muted">{item.sector}</td>
                    <td className="p-3 text-right font-bold text-white font-number">
                      {item.per}x <span className="text-[10px] text-tv-muted font-normal">({item.per_sector}x)</span>
                    </td>
                    <td className="p-3 text-right text-tv-green font-bold font-number">{item.rev_growth_ttm}</td>
                    <td className="p-3 text-right text-tv-accent font-bold font-number">{item.roe}</td>
                    <td className="p-3 text-right text-tv-text font-number">{item.der}</td>
                    <td className="p-3 text-right text-tv-yellow font-bold font-number">{item.div_yield}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.bandarmology === 'Akumulasi'
                          ? 'bg-tv-green/20 text-tv-green border border-tv-green/30'
                          : item.bandarmology === 'Distribusi'
                          ? 'bg-tv-red/20 text-tv-red border border-tv-red/30'
                          : 'bg-tv-hover text-tv-text'
                      }`}>
                        {item.bandarmology}
                      </span>
                    </td>
                    <td className="p-3 text-tv-text">{item.moat}</td>
                    <td className="p-3">
                      {item.signal ? (
                        <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded font-bold font-mono text-[10px] ${
                          item.signal.includes('BUY')
                            ? 'bg-tv-green/20 text-tv-green border border-tv-green/50'
                            : item.signal === 'SELL'
                            ? 'bg-tv-red/20 text-tv-red border border-tv-red/50'
                            : 'bg-tv-yellow/10 text-tv-yellow border border-tv-yellow/40'
                        }`}>
                          {item.signal}
                        </span>
                      ) : (
                        <span className="text-tv-muted text-[10px]">N/A</span>
                      )}
                    </td>
                    <td className="p-3 text-tv-text text-[11px]">
                      {item.pattern_tag || <span className="text-tv-muted">Tidak ada pola cocok</span>}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.sentiment === 'POSITIF'
                          ? 'bg-tv-green/20 text-tv-green border border-tv-green/30'
                          : item.sentiment === 'NEGATIF'
                          ? 'bg-tv-red/20 text-tv-red border border-tv-red/30'
                          : 'bg-tv-hover text-tv-text'
                      }`}>
                        {item.sentiment ? item.sentiment.charAt(0) + item.sentiment.slice(1).toLowerCase() : 'N/A'}
                      </span>
                    </td>
                    <td className="p-3 text-right text-white">
                      <span className="text-tv-green font-bold font-number">Rp {item.week52_high?.toLocaleString('id-ID')}</span> /{' '}
                      <span className="text-tv-red font-bold font-number">Rp {item.week52_low?.toLocaleString('id-ID')}</span>
                    </td>
                    <td className="p-3 text-right text-white">
                      <span className="text-tv-yellow font-bold font-number">Rp {item.entry?.toLocaleString('id-ID')}</span>
                    </td>
                    <td className="p-3 text-right text-tv-text font-number">
                      {item.atr_pct != null ? `±${item.atr_pct.toFixed(1)}%/hari` : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-tv-muted">
            Bandarmology = Chaikin Money Flow (posisi close di range High-Low + rasio volume 20 hari), estimasi tekanan beli/jual - BUKAN data broker/asing resmi (IDX tidak menyediakan feed itu gratis).
          </p>
          <p className="text-[10px] text-tv-muted">
            Signal = skor komposit Teknikal+Fundamental+Flow yang sama dengan Detail Saham/AI Pick (bukan angka terpisah). Pola Backtest = preset filter di menu Backtest yang SAAT INI cocok untuk saham ini (semua indikatornya BULLISH bersamaan) - &ldquo;Tidak ada pola cocok&rdquo; berarti jujur tidak ada, bukan kosong karena error. Sentimen Berita = hasil klasifikasi AI/kata kunci atas judul berita RSS riil yang menyebut saham ini - &ldquo;N/A&rdquo; berarti saham ini tidak disebut media dalam siklus data terakhir, bukan sentimen netral yang terukur.
          </p>
          <p className="text-[10px] text-tv-muted mt-2">
            Volatilitas Harian = rata-rata pergerakan 14 hari terakhir (ATR). Stop loss di bawah
            angka ini akan sering tersentuh oleh fluktuasi biasa - pengujian atas 4.705 sampel
            menunjukkan stop 5% tersentuh di 77% transaksi dan memangkas hampir seluruh
            keuntungan. Tentukan batas risikomu sendiri dengan mempertimbangkan angka ini.
          </p>
        </div>
      </div>
    </div>
  );
}

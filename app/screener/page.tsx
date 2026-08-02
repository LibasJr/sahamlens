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
              Filter: PER vs Sektor • ROE &gt; 15% • Bandarmology (proxy volume) Accumulation
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
                  <th className="p-3 text-right">Target Bull/Bear</th>
                  <th className="p-3 text-right">Entry / StopLoss</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border/50">
                {top10.length === 0 && (
                  <tr>
                    <td colSpan={13} className="p-8 text-center text-tv-muted text-sm">
                      {loading ? (
                        <span className="inline-flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Memindai ~50 saham likuid IDX...</span>
                      ) : 'Gagal memuat data screener. Coba refresh.'}
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
                    <td className="p-3 text-right text-tv-green font-bold font-number">{item.rev_growth_5yr}</td>
                    <td className="p-3 text-right text-tv-accent font-bold font-number">{item.roe}</td>
                    <td className="p-3 text-right text-tv-text font-number">{item.der}</td>
                    <td className="p-3 text-right text-tv-yellow font-bold font-number">{item.div_yield}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.bandarmology.includes('Big')
                          ? 'bg-tv-green/20 text-tv-green border border-tv-green/30'
                          : 'bg-tv-hover text-tv-text'
                      }`}>
                        {item.bandarmology}
                      </span>
                    </td>
                    <td className="p-3 text-tv-text">{item.moat}</td>
                    <td className="p-3 text-right text-white">
                      <span className="text-tv-green font-bold font-number">Rp {item.target_bull?.toLocaleString('id-ID')}</span> /{' '}
                      <span className="text-tv-red font-bold font-number">Rp {item.target_bear?.toLocaleString('id-ID')}</span>
                    </td>
                    <td className="p-3 text-right text-white">
                      <span className="text-tv-yellow font-bold font-number">Rp {item.entry?.toLocaleString('id-ID')}</span> /{' '}
                      <span className="text-tv-red font-bold font-number">Rp {item.stop_loss?.toLocaleString('id-ID')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-tv-muted">
            Bandarmology = estimasi tekanan beli/jual dari rasio volume harian, BUKAN data broker/asing resmi (IDX tidak menyediakan feed itu gratis).
          </p>
        </div>
      </div>
    </div>
  );
}

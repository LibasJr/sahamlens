'use client';

import React, { useState } from 'react';
import { Target, Activity, Play, Settings2, BarChart2, CheckSquare, Square, Zap } from 'lucide-react';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Input, Select, Button, PageContainer, Skeleton, EmptyState, LoadingFact, TickerAvatar } from '@/components/ui';
import PaywallModal from '@/components/PaywallModal';
// Import LANGSUNG dari file konstanta (bukan barrel modules/backtest) - pengecualian
// disengaja: komponen ini 'use client', barrel modules/backtest re-export service yang
// pakai fetch/logger server-only (precompute/simulate/live-filter-check), ikut kebawa ke
// bundle client kalau lewat barrel. File ini murni data (cuma import type), aman diimpor
// langsung. Sama BACKTEST_PRESETS dipakai modules/market/service/screener.service.ts
// (server, lewat barrel) supaya preset Backtest & tag pola Screener tidak bercabang.
import { BACKTEST_PRESETS } from '@/modules/backtest/constants/presets';
import { BACKTEST_LIMITATIONS } from '@/modules/backtest/constants/backtest-limitations';

const fmtRupiah = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;

/**
 * Angka dari API datang sebagai string terformat ("+12.4%", "-3.1%", "18.0%").
 * Pewarnaan sebelumnya memakai `.includes('+')`, sehingga apa pun yang tidak
 * membawa tanda plus - termasuk "0.00%" - diwarnai MERAH sebagai kerugian.
 * Di sini tandanya dibaca dari nilainya, bukan dari ada-tidaknya karakter.
 */
function parseSignedPct(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = parseFloat(value.replace(/[^0-9.,+-]/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function toneOf(value: unknown): string {
  const n = parseSignedPct(value);
  if (n == null || n === 0) return 'text-tv-text';
  return n > 0 ? 'text-tv-green' : 'text-tv-red';
}

/**
 * Tooltip kustom untuk equity curve. Bawaan Recharts menampilkan angka mentah
 * (mis. "104823194") tanpa format dan tanpa konteks. Yang menarik di grafik ini
 * bukan nilai absolut tiap garis, tapi SELISIHNYA - apakah strategi sedang unggul
 * atau tertinggal dari IHSG pada titik itu.
 */
function EquityTooltip({ active, payload, label, initialCapital }: any) {
  if (!active || !payload?.length) return null;
  const strategy = payload.find((p: any) => p.dataKey === 'Strategy')?.value as number | undefined;
  const ihsg = payload.find((p: any) => p.dataKey === 'IHSG')?.value as number | undefined;
  const gap = typeof strategy === 'number' && typeof ihsg === 'number' ? strategy - ihsg : null;
  const growthPct = typeof strategy === 'number' && initialCapital > 0
    ? ((strategy - initialCapital) / initialCapital) * 100
    : null;

  return (
    <div className="rounded-lg border border-tv-border bg-tv-card/95 px-3 py-2.5 shadow-2 backdrop-blur-sm">
      <div className="text-[10px] uppercase tracking-wide text-tv-muted">Bulan ke-{String(label).replace('M', '')}</div>
      <div className="mt-1.5 space-y-1">
        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-tv-text">
            <span className="h-2 w-2 rounded-sm bg-tv-green" /> Strategi
          </span>
          <span className="font-number font-semibold text-tv-text">{typeof strategy === 'number' ? fmtRupiah(strategy) : 'N/A'}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-tv-muted">
            <span className="h-2 w-2 rounded-sm bg-tv-muted" /> IHSG
          </span>
          <span className="font-number text-tv-muted">{typeof ihsg === 'number' ? fmtRupiah(ihsg) : 'N/A'}</span>
        </div>
      </div>
      {gap != null && (
        <div className="mt-2 border-t border-tv-border pt-1.5 text-[11px]">
          <span className="text-tv-muted">Selisih: </span>
          <span className={`font-number font-semibold ${gap >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
            {gap >= 0 ? '+' : '-'}{fmtRupiah(Math.abs(gap))}
          </span>
          {growthPct != null && (
            <span className="text-tv-muted"> · modal {growthPct >= 0 ? '+' : ''}{growthPct.toFixed(1)}%</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function BacktestPage() {
  const [modal, setModal] = useState(100000000);
  const [period, setPeriod] = useState(12);

  const availableFilters = [
    'EMA 20/50 Cross',
    'Volume vs Avg 20D',
    'RSI 14',
    'MACD',
    'Volatility (ATR 14)',
    'MA Trend IDX (20,50,200)',
    'Support & Resistance',
    'Market Flow Index',
    'SMA Score (5,10,20)'
  ];

  const presets = BACKTEST_PRESETS;

  const [selectedFilters, setSelectedFilters] = useState<string[]>(presets[0].filters);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  // "Live Filter Check" - BUKAN versi lama "Sinyal Hari Ini" yang dihapus 2026-08-03
  // (itu baca cache precompute harian, bisa berjam-jam basi). Ini fetch LIVE ke Yahoo
  // saat tombol diklik - state terpisah dari `results` (historis) supaya dua mode
  // tidak saling menimpa tampilan.
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveResults, setLiveResults] = useState<any>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  const toggleFilter = (f: string) => {
    if (selectedFilters.includes(f)) {
      setSelectedFilters(selectedFilters.filter(item => item !== f));
    } else {
      setSelectedFilters([...selectedFilters, f]);
    }
  };

  // Semua filter preset harus BULLISH bareng (lihat allBullish() di simulate.service.ts) -
  // makin banyak filter, sinyal makin jarang. Win rate tetap dihitung live dari data
  // historis tiap kombinasi, bukan angka tetap yang diklaim di sini.
  const applyPreset = (filters: string[]) => setSelectedFilters(filters);

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: selectedFilters, modal, period })
      });
      if (res.status === 401) {
        setShowLoginPrompt(true);
        setLoading(false);
        return;
      }
      if (res.status === 402) {
        setShowPaywall(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Gagal menjalankan backtest');
        setResults(null);
        setLoading(false);
        return;
      }
      setResults(data);
    } catch (e) {
      console.error(e);
      setError('Gagal menjalankan backtest');
    }
    setLoading(false);
  };

  const runLiveFilterCheck = async () => {
    setLiveLoading(true);
    setLiveError(null);
    try {
      const res = await fetch('/api/backtest/live-filter-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: selectedFilters })
      });
      if (res.status === 401) {
        setShowLoginPrompt(true);
        setLiveLoading(false);
        return;
      }
      if (res.status === 402) {
        setShowPaywall(true);
        setLiveLoading(false);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setLiveError(data?.error || 'Gagal menjalankan Live Filter Check');
        setLiveResults(null);
        setLiveLoading(false);
        return;
      }
      setLiveResults(data);
    } catch (e) {
      console.error(e);
      setLiveError('Gagal menjalankan Live Filter Check');
    }
    setLiveLoading(false);
  };

  const chartData = results?.equityCurve?.map((eq: number, idx: number) => ({
    month: `M${idx}`,
    Strategy: eq,
    IHSG: results.ihsgCurve[idx]
  })) || [];

  const dataAsOfLabel = results?.dataAsOf
    ? new Date(results.dataAsOf).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    // `flex h-screen` + anak `overflow-y-auto` membuat kontainer gulir kedua di dalam
    // <main> AppShell yang sudah menggulir. Disamakan dengan halaman lain.
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <div className="flex-1 flex flex-col">
        <header className="sticky top-0 z-20 border-b border-white/[0.055] bg-tv-bg/80 px-4 py-4 backdrop-blur-xl md:px-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-tv-blue text-white">
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-xl text-tv-text tracking-tight">Strategy Builder + AI Backtester</h1>
              <p className="text-xs text-tv-muted">Build custom rules and backtest on historical data</p>
            </div>
          </div>
        </header>

        {/* Tab "Sinyal Hari Ini" (baca cache precompute harian, bisa berjam-jam basi)
            dihapus 2026-08-03, dianggap tumpang tindih dengan AI Pick. Dibangun ulang
            sebagai "Live Filter Check" (arsitektur beda: fetch live ke Yahoo saat
            diklik, bukan baca cache) - beda dari AI Pick karena mengecek kombinasi
            filter SPESIFIK pilihan pengguna sendiri (mis. buat menerjemahkan bonus
            "Golden Cross" AI Pick ke saham lain yang kondisinya serupa SEKARANG),
            bukan skor komposit generik. */}
        <PageContainer className="px-6 pt-6">
          <p className="text-xs text-tv-muted">
            <b>Backtest Sekarang</b>: uji kombinasi filter ini ke data masa lalu (return, win rate,
            drawdown, 3-24 bulan terakhir). <b>Live Filter Check</b>: cek saham mana yang memenuhi
            kombinasi filter yang sama SEKARANG (data live, bukan simulasi).
          </p>
        </PageContainer>

        <PageContainer className="p-4 md:p-6 lg:p-7 grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Builder Panel */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1">
              <h3 className="font-heading font-bold text-tv-text flex items-center gap-2 mb-1 border-b border-tv-border pb-3">
                <Target className="w-5 h-5 text-tv-blue" /> Presets
              </h3>
              <p className="text-[10px] text-tv-muted mb-3">Win rate dihitung live dari data historis tiap kombinasi - bisa berubah, bukan angka tetap.</p>
              <div className="flex flex-col gap-2">
                {presets.map(p => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p.filters)}
                    className="text-left px-4 py-2 bg-tv-hover hover:bg-tv-borderLight rounded-md text-sm text-tv-text transition-colors"
                  >
                    {p.label}
                    <span className="block text-[10px] text-tv-muted font-normal">{p.filters.length} filter</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1">
              <h3 className="font-heading font-bold text-tv-text flex items-center gap-2 mb-4 border-b border-tv-border pb-3">
                <Settings2 className="w-5 h-5 text-tv-blue" /> LensTechnical
              </h3>
              <div className="space-y-2 mb-6 max-h-[300px] overflow-y-auto pr-2">
                {availableFilters.map(f => {
                  const isSelected = selectedFilters.includes(f);
                  return (
                    <div
                      key={f}
                      onClick={() => toggleFilter(f)}
                      className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors border ${isSelected ? 'bg-tv-blue/10 border-tv-blue/30' : 'bg-tv-bg border-tv-border hover:border-tv-borderLight'}`}
                    >
                      {isSelected ? <CheckSquare className="w-4 h-4 text-tv-blue" /> : <Square className="w-4 h-4 text-tv-muted" />}
                      <span className={`text-sm ${isSelected ? 'text-tv-blue font-bold' : 'text-tv-muted'}`}>{f}</span>
                    </div>
                  )
                })}
              </div>

              <div className="space-y-4 pt-4 border-t border-tv-border">
                <Input label="Modal Awal (Rp)" type="number" value={modal} onChange={e => setModal(Number(e.target.value))} className="font-number" />
                <Select label="Periode (Bulan)" value={period} onChange={e => setPeriod(Number(e.target.value))}>
                  <option value={3}>3 Bulan</option>
                  <option value={6}>6 Bulan</option>
                  <option value={12}>12 Bulan</option>
                  <option value={24}>24 Bulan</option>
                </Select>

                <Button
                  onClick={runBacktest}
                  disabled={loading || selectedFilters.length === 0}
                  loading={loading}
                  variant="secondary"
                  className="w-full !bg-tv-blue !text-white hover:!bg-tv-blue/90 mt-4"
                >
                  {!loading && <Play className="w-5 h-5" />}
                  Backtest Sekarang
                </Button>

                <Button
                  onClick={runLiveFilterCheck}
                  disabled={liveLoading || selectedFilters.length === 0}
                  loading={liveLoading}
                  variant="secondary"
                  className="w-full !bg-tv-green !text-white hover:!bg-tv-green/90"
                >
                  {!liveLoading && <Zap className="w-5 h-5" />}
                  Live Filter Check
                </Button>
                <p className="text-[10px] text-tv-muted -mt-2">
                  Cek saham mana di universe yang memenuhi kombinasi filter ini SEKARANG (data live, bukan simulasi historis).
                </p>
              </div>
            </div>
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-2 space-y-6">
                {/* Live Filter Check - hasil TERPISAH dari Backtest historis di bawah,
                    supaya dua konsep (live vs simulasi masa lalu) tidak tercampur
                    tampilannya. Muncul cuma kalau pengguna sudah klik tombolnya. */}
                {(liveLoading || liveError || liveResults) && (
                  <div className="bg-tv-card border border-tv-green/30 rounded-lg shadow-1 overflow-hidden">
                    <div className="p-4 border-b border-tv-border bg-tv-green/5 flex items-center justify-between flex-wrap gap-2">
                      <h3 className="font-heading text-sm font-bold text-tv-text flex items-center gap-2">
                        <Zap className="w-4 h-4 text-tv-green" /> Live Filter Check
                      </h3>
                      {liveResults?.matches?.[0]?.freshness && (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-tv-green/10 text-tv-green border border-tv-green/30">
                          {liveResults.matches[0].freshness === 'DELAYED' ? 'Data ~15-20 menit' : liveResults.matches[0].freshness === 'EOD' ? 'Data Penutupan (EOD)' : 'Data Basi'}
                        </span>
                      )}
                    </div>
                    <div className="p-4">
                      {liveLoading && (
                        <p className="text-sm text-tv-muted flex items-center gap-2"><Activity className="w-4 h-4 animate-spin" /> Mengecek {selectedFilters.length} filter ke seluruh universe...</p>
                      )}
                      {liveError && <p className="text-sm text-tv-red">{liveError}</p>}
                      {liveResults && !liveLoading && (
                        <>
                          {liveResults.message ? (
                            <p className="text-sm text-tv-muted">{liveResults.message}</p>
                          ) : (
                            <>
                              <p className="text-xs text-tv-muted mb-3">
                                {liveResults.matches.length} saham cocok kombinasi ini sekarang, dari {liveResults.filters.length} filter dipilih
                                {liveResults.skippedCount > 0 ? ` (${liveResults.skippedCount} saham gagal diambil, dilewati)` : ''}.
                                {liveResults.matches[0]?.dataTimestamp && (
                                  <> Data per {new Date(liveResults.matches[0].dataTimestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB.</>
                                )}
                              </p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="border-b border-tv-border text-xs text-tv-muted uppercase font-semibold tracking-wide">
                                      <th className="py-2 px-3">Saham</th>
                                      <th className="py-2 px-3 text-right">Harga</th>
                                      {/* Angka ini menghitung SEMUA 9 indikator yang
                                          bullish, bukan hanya yang dipilih pengguna
                                          (lihat bullishCount di live-filter-check.service.ts) -
                                          judul lama tidak menyatakan itu, sehingga "4/9"
                                          terbaca seolah 5 filter pilihan gagal. */}
                                      <th className="py-2 px-3 text-right">Total 9 indikator bullish</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-tv-border text-sm">
                                    {liveResults.matches.map((m: any) => (
                                      <tr key={m.ticker} className="hover:bg-tv-hover/30">
                                        <td className="py-2 px-3 font-bold font-number text-tv-text">
                                          <span className="inline-flex items-center gap-2">
                                            <TickerAvatar symbol={m.ticker} size="sm" />
                                            {m.ticker}
                                          </span>
                                        </td>
                                        <td className="py-2 px-3 text-right font-number text-tv-muted">
                                          {typeof m.price === 'number' ? `Rp ${m.price.toLocaleString('id-ID')}` : 'N/A'}
                                        </td>
                                        <td className="py-2 px-3 text-right font-number text-tv-green">{m.bullishCount}/9</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {error && (
                  <div className="bg-tv-card border border-tv-red/30 rounded-lg">
                    <EmptyState
                      illustration="empty"
                      title="Backtest gagal dijalankan"
                      description={error}
                      action={{ label: 'Coba lagi', onClick: runBacktest }}
                    />
                  </div>
                )}

                {!results && !loading && !error && (
                  <div className="bg-tv-card border border-tv-border rounded-lg min-h-[500px] flex items-center justify-center">
                    <EmptyState
                      illustration="search"
                      title="Belum ada simulasi dijalankan"
                      description={`${selectedFilters.length} filter terpilih. Setiap filter harus BULLISH bersamaan agar sebuah sinyal dihitung - makin banyak filter, makin sedikit sinyal yang muncul, dan makin kecil sampel hasilnya.`}
                      action={{ label: 'Backtest Sekarang', onClick: runBacktest }}
                    />
                  </div>
                )}

                {loading && (
                  <div className="bg-tv-card border border-tv-border rounded-lg min-h-[500px] p-4 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
                    </div>
                    <Skeleton className="h-64 w-full" />
                    <LoadingFact />
                  </div>
                )}

                {results && !loading && (
                  <>
                    {dataAsOfLabel && (
                      <p className="text-[11px] text-tv-muted">Data per {dataAsOfLabel} (diperbarui otomatis tiap hari, bukan real-time).</p>
                    )}
                    {results.message && (
                      <div className="bg-tv-card border border-tv-yellow/30 rounded-lg p-4 text-sm text-tv-yellow">
                        {results.message}
                      </div>
                    )}
                    {/* Metrics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-tv-card border border-tv-border rounded-lg p-4">
                        <div className="text-xs text-tv-muted mb-1">Return Strategi</div>
                        <div className={`text-xl font-bold font-number ${toneOf(results.return)}`}>{results.return}</div>
                      </div>
                      <div className="bg-tv-card border border-tv-border rounded-lg p-4">
                        <div className="text-xs text-tv-muted mb-1">Alpha vs IHSG ({results.ihsgReturn})</div>
                        <div className={`text-xl font-bold font-number ${toneOf(results.alpha)}`}>{results.alpha}</div>
                      </div>
                      <div className="bg-tv-card border border-tv-border rounded-lg p-4">
                        <div className="text-xs text-tv-muted mb-1">Win Rate ({results.totalTrades} trades)</div>
                        <div className="text-xl font-bold font-number text-tv-text">{results.winRate}</div>
                      </div>
                      <div className="bg-tv-card border border-tv-border rounded-lg p-4">
                        <div className="text-xs text-tv-muted mb-1">Max Drawdown</div>
                        <div className="text-xl font-bold font-number text-tv-red">{results.maxDD}</div>
                      </div>
                    </div>

                    {/* Storytelling: empat angka di atas dibaca sendiri-sendiri tidak
                        memberi tahu apakah strategi ini layak. Yang menentukan adalah
                        hubungan antar angka - terutama alpha terhadap drawdown, dan
                        apakah jumlah trade-nya cukup untuk disimpulkan sama sekali. */}
                    {(() => {
                      const alpha = parseSignedPct(results.alpha);
                      const dd = Math.abs(parseSignedPct(results.maxDD) ?? 0);
                      const trades = Number(results.totalTrades) || 0;
                      const notes: string[] = [];

                      if (trades > 0 && trades < 30) {
                        notes.push(`Hanya ${trades} trade dalam periode ini - terlalu sedikit untuk memisahkan keterampilan dari keberuntungan. Perpanjang periode atau kurangi jumlah filter.`);
                      }
                      if (alpha != null && alpha > 0 && dd > 0) {
                        notes.push(`Strategi unggul ${alpha.toFixed(1)} poin persen dari IHSG, dengan penurunan terdalam ${dd.toFixed(1)}%. Artinya untuk mengejar keunggulan itu, kamu harus sanggup menahan modal turun ${dd.toFixed(1)}% di tengah jalan tanpa menjual.`);
                      } else if (alpha != null && alpha <= 0) {
                        notes.push(`Strategi ini TIDAK mengalahkan IHSG pada periode tersebut. Membeli indeks langsung akan memberi hasil serupa atau lebih baik, dengan usaha jauh lebih sedikit.`);
                      }
                      if (notes.length === 0) return null;

                      return (
                        <div className="rounded-lg border border-tv-border bg-tv-card p-4 space-y-2">
                          {notes.map((n, i) => (
                            <p key={i} className="text-[11px] leading-relaxed text-tv-muted">{n}</p>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Chart */}
                    <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1">
                      <h3 className="font-heading text-sm font-bold text-tv-text mb-4">Equity Curve</h3>
                      <div className="h-64">
                        {/* Seluruh warna di chart ini masih hex palet LAMA: #10B981
                            (hijau lama), #8B94B6 (muted lama), #2C3A5A (border lama),
                            #152238 (card lama), #F3F4F6 (teks lama). Disamakan dengan
                            palet Lens yang berlaku. */}
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorStrategy" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22C55E" stopOpacity={0.32}/>
                                <stop offset="95%" stopColor="#22C55E" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="colorIHSG" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#94A3B8" stopOpacity={0.22}/>
                                <stop offset="95%" stopColor="#94A3B8" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="month" stroke="#1E293B" tick={{ fill: '#94A3B8', fontSize: 10 }} tickLine={false} />
                            <YAxis
                              stroke="#1E293B"
                              tick={{ fill: '#94A3B8', fontSize: 10 }}
                              tickLine={false}
                              domain={['auto', 'auto']}
                              width={52}
                              tickFormatter={(val) => `${(val / 1_000_000).toFixed(0)}jt`}
                            />
                            <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                            {/* Garis modal awal: tanpa ini, kurva yang seluruhnya di bawah
                                modal awal tetap terlihat "naik" karena sumbu Y otomatis. */}
                            <ReferenceLine
                              y={modal}
                              stroke="#2B3A55"
                              strokeDasharray="4 4"
                              label={{ value: 'Modal awal', position: 'insideTopLeft', fill: '#94A3B8', fontSize: 9 }}
                            />
                            <Tooltip
                              content={<EquityTooltip initialCapital={modal} />}
                              cursor={{ stroke: '#3B82F6', strokeWidth: 1, strokeDasharray: '3 3' }}
                            />
                            <Area type="monotone" dataKey="IHSG" stroke="#94A3B8" strokeWidth={1.5} fillOpacity={1} fill="url(#colorIHSG)" />
                            <Area type="monotone" dataKey="Strategy" stroke="#22C55E" strokeWidth={2} fillOpacity={1} fill="url(#colorStrategy)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex items-center justify-center gap-4 mt-4 text-xs">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-tv-green rounded-sm"></div> Strategy</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-tv-muted rounded-sm"></div> IHSG</div>
                      </div>
                    </div>

                    {/* Trades */}
                    <div className="bg-tv-card border border-tv-border rounded-lg shadow-1 overflow-hidden">
                      <div className="p-4 border-b border-tv-border bg-tv-bg/40">
                        <h3 className="font-heading text-sm font-bold text-tv-text">
                          Riwayat Trade {results.totalTrades > 30 ? `(30 terbaru dari ${results.totalTrades})` : ''}
                        </h3>
                      </div>
                      <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-tv-card border-b border-tv-border text-xs text-tv-muted uppercase font-semibold tracking-wide">
                            <th className="py-3 px-4">Date</th>
                            <th className="py-3 px-4">Symbol</th>
                            <th className="py-3 px-4">Buy Px</th>
                            <th className="py-3 px-4 text-right">PnL</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-tv-border text-sm">
                          {results.trades.map((t: any, idx: number) => (
                            <tr key={idx} className="hover:bg-tv-hover/30">
                              <td className="py-3 px-4 text-tv-muted">{t.date}</td>
                              <td className="py-3 px-4 text-tv-text font-bold font-number">
                                <span className="inline-flex items-center gap-2">
                                  <TickerAvatar symbol={t.symbol} size="sm" />
                                  {t.symbol}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-tv-muted font-number">Rp {t.buy}</td>
                              <td className={`py-3 px-4 text-right font-bold font-number ${toneOf(t.pnl)}`}>
                                {t.pnl}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    </div>

                    {/* Batasan simulasi (audit 2026-08-05, temuan M-12) - dua bias yang
                        membuat hasil di atas sistematis lebih baik dari kenyataan HARUS
                        terbaca bersama angkanya, bukan cuma tercatat di komentar kode. */}
                    <div className="bg-tv-card border border-tv-yellow/30 rounded-lg p-4 shadow-1">
                      <h3 className="font-heading text-sm font-bold text-tv-yellow mb-2">Batasan simulasi ini</h3>
                      <ul className="text-[11px] text-tv-muted leading-relaxed list-disc pl-4 space-y-1">
                        {BACKTEST_LIMITATIONS.map((l) => <li key={l}>{l}</li>)}
                        <li>Hasil masa lalu bukan jaminan hasil di masa depan.</li>
                      </ul>
                    </div>
                  </>
                )}

          </div>
        </PageContainer>
      </div>
      <PaywallModal
        open={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title="Daftar Dulu untuk Lihat Hasil"
        body="Backtest butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
      />
      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        title="Masa Trial 7 Hari Habis"
        body="Backtest butuh akun Pro setelah trial 7 hari berakhir."
        benefits={[
          'Unlimited LensTechnical (10 filter)',
          'LensRadar LIVE, LensAI & Compare Tool',
          'Watchlist & Alert unlimited',
        ]}
      />
      {/* Blok <style> .custom-scrollbar dihapus - warna hex palet lama, dan scrollbar
          global sudah ditata di app/globals.css. */}
    </div>
  );
}

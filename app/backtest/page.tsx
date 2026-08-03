'use client';

import React, { useState } from 'react';
import { Target, Activity, Play, Settings2, BarChart2, CheckSquare, Square, Menu, Zap } from 'lucide-react';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Input, Select, Button } from '@/components/ui';
import PaywallModal from '@/components/PaywallModal';

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

  // Dulu ada 10 preset, tapi 5 di antaranya duplikat: 'Bandar Accumulation',
  // 'Trend Following' dan 'Oversold Bounce' masing-masing adalah SUBSET persis dari
  // preset 4-filter di bawah (kombinasi sama, cuma kurang satu filter - hasilnya selalu
  // superset sinyal, bukan strategi beda). 'Konfirmasi Ketat' beririsan 3 dari 4 filter
  // dengan Trend Following Kuat. 'Breakout Hari Ini' dihapus karena kontradiktif: filter
  // Support & Resistance BULLISH artinya harga DEKAT SUPPORT dan Volatility BULLISH
  // artinya ATR RENDAH - dua-duanya kebalikan dari kondisi breakout.
  // Sisa 5 preset di bawah: tidak ada yang jadi subset preset lain, irisan maksimal 2 filter.
  const presets: { label: string; filters: string[] }[] = [
    { label: 'Momentum Breakout', filters: ['EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14'] },
    { label: 'Breakout Volume', filters: ['Volume vs Avg 20D', 'MACD', 'SMA Score (5,10,20)'] },
    // Nama sebelumnya "Akumulasi Real (CMF)" - indikatornya bukan Chaikin Money Flow,
    // melainkan rasio volume hari naik vs hari turun 14D (lihat market-flow.ts).
    { label: 'Akumulasi (A/D Volume)', filters: ['Market Flow Index', 'Volume vs Avg 20D', 'Support & Resistance', 'MACD'] },
    // Nama sebelumnya "Golden Cross Fresh" - analyzer EMA cuma bandingkan EMA20 vs EMA50
    // hari ini (kondisi tren), tidak mendeteksi cross yang BARU terjadi.
    { label: 'Trend Following Kuat', filters: ['MA Trend IDX (20,50,200)', 'EMA 20/50 Cross', 'SMA Score (5,10,20)', 'Volume vs Avg 20D'] },
    // Nama sebelumnya "Rebound Oversold" - RSI analyzer menyalakan BULLISH di dua rentang
    // (rsi < 40 DAN 50-70), jadi saham non-oversold ikut lolos. Klaim oversold dibuang.
    { label: 'Rebound Support', filters: ['RSI 14', 'Support & Resistance', 'Market Flow Index', 'Volatility (ATR 14)'] },
  ];

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
    <div className="flex h-screen bg-tv-bg">
      {/* Sidebar removed, handled by layout */}
      <div className="flex-1 flex flex-col min-h-screen overflow-y-auto custom-scrollbar">
        <header className="bg-tv-surface border-b border-tv-border px-6 py-4 sticky top-0 z-20 shadow-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
              className="md:hidden p-2 -ml-2 text-tv-muted hover:text-white rounded-lg hover:bg-white/5"
            >
              <Menu className="w-5 h-5" />
            </button>
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
        <div className="px-6 pt-6 max-w-[1600px] mx-auto w-full">
          <p className="text-xs text-tv-muted">
            <b>Backtest Sekarang</b>: uji kombinasi filter ini ke data masa lalu (return, win rate,
            drawdown, 3-24 bulan terakhir). <b>Live Filter Check</b>: cek saham mana yang memenuhi
            kombinasi filter yang sama SEKARANG (data live, bukan simulasi).
          </p>
        </div>

        <div className="p-6 max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">

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
                <Settings2 className="w-5 h-5 text-tv-blue" /> Algo Filters
              </h3>
              <div className="space-y-2 mb-6 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
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
                                      <th className="py-2 px-3 text-right">Indikator Bullish</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-tv-border text-sm">
                                    {liveResults.matches.map((m: any) => (
                                      <tr key={m.ticker} className="hover:bg-tv-hover/30">
                                        <td className="py-2 px-3 font-bold font-number text-tv-text">{m.ticker}</td>
                                        <td className="py-2 px-3 text-right font-number text-tv-muted">Rp {m.price.toLocaleString('id-ID')}</td>
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
                  <div className="bg-tv-card border border-tv-red/30 rounded-lg p-4 text-sm text-tv-red">
                    {error}
                  </div>
                )}

                {!results && !loading && !error && (
                  <div className="bg-tv-card border border-tv-border rounded-lg h-full min-h-[500px] flex flex-col items-center justify-center text-tv-muted">
                    <BarChart2 className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-sm text-center px-6">Pilih filter dan klik Backtest untuk melihat hasil simulasi.</p>
                  </div>
                )}

                {loading && (
                  <div className="bg-tv-card border border-tv-border rounded-lg h-full min-h-[500px] flex flex-col items-center justify-center text-tv-blue">
                    <Activity className="w-16 h-16 mb-4 animate-spin" />
                    <p className="text-sm text-center px-6">Memproses data historis & menjalankan algoritma...</p>
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
                        <div className={`text-xl font-bold font-number ${results.return.includes('+') ? 'text-tv-green' : 'text-tv-red'}`}>{results.return}</div>
                      </div>
                      <div className="bg-tv-card border border-tv-border rounded-lg p-4">
                        <div className="text-xs text-tv-muted mb-1">Alpha vs IHSG ({results.ihsgReturn})</div>
                        <div className={`text-xl font-bold font-number ${results.alpha.includes('+') ? 'text-tv-green' : 'text-tv-red'}`}>{results.alpha}</div>
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

                    {/* Chart */}
                    <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1">
                      <h3 className="font-heading text-sm font-bold text-tv-text mb-4">Equity Curve</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorStrategy" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="colorIHSG" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8B94B6" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#8B94B6" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="month" stroke="#2C3A5A" fontSize={10} tickLine={false} />
                            <YAxis stroke="#2C3A5A" fontSize={10} tickLine={false} domain={['auto', 'auto']} tickFormatter={(val) => `Rp${(val/1000000).toFixed(0)}M`} />
                            <CartesianGrid strokeDasharray="3 3" stroke="#2C3A5A" vertical={false} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#152238', borderColor: '#2C3A5A', fontSize: '12px' }}
                              itemStyle={{ color: '#F3F4F6' }}
                            />
                            <Area type="monotone" dataKey="Strategy" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorStrategy)" />
                            <Area type="monotone" dataKey="IHSG" stroke="#8B94B6" strokeWidth={2} fillOpacity={1} fill="url(#colorIHSG)" />
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
                              <td className="py-3 px-4 text-tv-text font-bold font-number">{t.symbol}</td>
                              <td className="py-3 px-4 text-tv-muted font-number">Rp {t.buy}</td>
                              <td className={`py-3 px-4 text-right font-bold font-number ${t.pnl.includes('+') ? 'text-tv-green' : 'text-tv-red'}`}>
                                {t.pnl}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    </div>
                  </>
                )}

          </div>
        </div>
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
          'Unlimited Technical Analyzer (10 filter)',
          'AI Pick LIVE, Council AI & Compare Tool',
          'Watchlist & Alert unlimited',
        ]}
      />
      <style dangerouslySetInnerHTML={{__html:`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0F141D; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2C3A5A; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3A4B75; }
      `}} />
    </div>
  );
}

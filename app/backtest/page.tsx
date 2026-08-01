'use client';

import React, { useState } from 'react';
import { Target, Activity, Play, Settings2, BarChart2, CheckSquare, Square, Menu } from 'lucide-react';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Input, Select, Button } from '@/components/ui';
import PaywallModal from '@/components/PaywallModal';

export default function BacktestPage() {
  const [activeTab, setActiveTab] = useState<'backtest' | 'live-signal'>('backtest');
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

  const [selectedFilters, setSelectedFilters] = useState<string[]>(['EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14']);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [liveSignalLoading, setLiveSignalLoading] = useState(false);
  const [liveSignalResults, setLiveSignalResults] = useState<any>(null);
  const [liveSignalError, setLiveSignalError] = useState<string | null>(null);

  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const toggleFilter = (f: string) => {
    if (selectedFilters.includes(f)) {
      setSelectedFilters(selectedFilters.filter(item => item !== f));
    } else {
      setSelectedFilters([...selectedFilters, f]);
    }
  };

  const applyPreset = (preset: string) => {
    if (preset === 'Momentum') {
      setSelectedFilters(['EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14']);
    } else if (preset === 'Accumulation') {
      setSelectedFilters(['Market Flow Index', 'MACD', 'Volume vs Avg 20D']);
    } else if (preset === 'Oversold') {
      setSelectedFilters(['RSI 14', 'Volatility (ATR 14)', 'Support & Resistance']);
    }
  };

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

  const runLiveSignal = async () => {
    setLiveSignalLoading(true);
    setLiveSignalError(null);
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: selectedFilters, mode: 'live-signal' })
      });
      if (res.status === 401) {
        setShowLoginPrompt(true);
        setLiveSignalLoading(false);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setLiveSignalError(data?.error || 'Gagal mengambil sinyal hari ini');
        setLiveSignalResults(null);
        setLiveSignalLoading(false);
        return;
      }
      setLiveSignalResults(data);
    } catch (e) {
      console.error(e);
      setLiveSignalError('Gagal mengambil sinyal hari ini');
    }
    setLiveSignalLoading(false);
  };

  const chartData = results?.equityCurve?.map((eq: number, idx: number) => ({
    month: `M${idx}`,
    Strategy: eq,
    IHSG: results.ihsgCurve[idx]
  })) || [];

  const dataAsOfLabel = results?.dataAsOf
    ? new Date(results.dataAsOf).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const liveSignalDataAsOfLabel = liveSignalResults?.dataAsOf
    ? new Date(liveSignalResults.dataAsOf).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
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

        <div className="px-6 pt-6 max-w-[1400px] mx-auto w-full">
          <div className="inline-flex bg-tv-card border border-tv-border rounded-lg p-1 gap-1">
            <button
              onClick={() => setActiveTab('backtest')}
              className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${activeTab === 'backtest' ? 'bg-tv-purple text-white' : 'text-tv-muted hover:text-tv-text'}`}
            >
              Backtest
            </button>
            <button
              onClick={() => setActiveTab('live-signal')}
              className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${activeTab === 'live-signal' ? 'bg-tv-purple text-white' : 'text-tv-muted hover:text-tv-text'}`}
            >
              Sinyal Hari Ini
            </button>
          </div>
        </div>

        <div className="p-6 max-w-[1400px] mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Builder Panel */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1">
              <h3 className="font-heading font-bold text-tv-text flex items-center gap-2 mb-4 border-b border-tv-border pb-3">
                <Target className="w-5 h-5 text-tv-purple" /> Presets
              </h3>
              <div className="flex flex-col gap-2">
                <button onClick={() => applyPreset('Momentum')} className="text-left px-4 py-2 bg-tv-hover hover:bg-tv-borderLight rounded-md text-sm text-tv-text transition-colors">Momentum Breakout</button>
                <button onClick={() => applyPreset('Accumulation')} className="text-left px-4 py-2 bg-tv-hover hover:bg-tv-borderLight rounded-md text-sm text-tv-text transition-colors">Bandar Accumulation</button>
                <button onClick={() => applyPreset('Oversold')} className="text-left px-4 py-2 bg-tv-hover hover:bg-tv-borderLight rounded-md text-sm text-tv-text transition-colors">Oversold Bounce</button>
              </div>
            </div>

            <div className="bg-tv-card border border-tv-border rounded-lg p-5 shadow-1">
              <h3 className="font-heading font-bold text-tv-text flex items-center gap-2 mb-4 border-b border-tv-border pb-3">
                <Settings2 className="w-5 h-5 text-tv-purple" /> Algo Filters
              </h3>
              <div className="space-y-2 mb-6 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {availableFilters.map(f => {
                  const isSelected = selectedFilters.includes(f);
                  return (
                    <div
                      key={f}
                      onClick={() => toggleFilter(f)}
                      className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors border ${isSelected ? 'bg-tv-purple/10 border-tv-purple/30' : 'bg-tv-bg border-tv-border hover:border-tv-borderLight'}`}
                    >
                      {isSelected ? <CheckSquare className="w-4 h-4 text-tv-purple" /> : <Square className="w-4 h-4 text-tv-muted" />}
                      <span className={`text-sm ${isSelected ? 'text-tv-purple font-bold' : 'text-tv-muted'}`}>{f}</span>
                    </div>
                  )
                })}
              </div>

              <div className="space-y-4 pt-4 border-t border-tv-border">
                {activeTab === 'backtest' && (
                  <>
                    <Input label="Modal Awal (Rp)" type="number" value={modal} onChange={e => setModal(Number(e.target.value))} className="font-number" />
                    <Select label="Periode (Bulan)" value={period} onChange={e => setPeriod(Number(e.target.value))}>
                      <option value={3}>3 Bulan</option>
                      <option value={6}>6 Bulan</option>
                      <option value={12}>12 Bulan</option>
                      <option value={24}>24 Bulan</option>
                    </Select>
                  </>
                )}

                <Button
                  onClick={activeTab === 'backtest' ? runBacktest : runLiveSignal}
                  disabled={(activeTab === 'backtest' ? loading : liveSignalLoading) || selectedFilters.length === 0}
                  loading={activeTab === 'backtest' ? loading : liveSignalLoading}
                  variant="secondary"
                  className="w-full !bg-tv-purple !text-white hover:!bg-tv-purple/90 mt-4"
                >
                  {!(activeTab === 'backtest' ? loading : liveSignalLoading) && <Play className="w-5 h-5" />}
                  {activeTab === 'backtest' ? 'Backtest Sekarang' : 'Cek Saham Cocok Hari Ini'}
                </Button>
              </div>
            </div>
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-2 space-y-6">
            {activeTab === 'backtest' && (
              <>
                {error && (
                  <div className="bg-tv-card border border-tv-red/30 rounded-lg p-4 text-sm text-tv-red">
                    {error}
                  </div>
                )}

                {!results && !loading && !error && (
                  <div className="bg-tv-card border border-tv-border rounded-lg h-full min-h-[500px] flex flex-col items-center justify-center text-tv-muted">
                    <BarChart2 className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-sm">Pilih filter dan klik Backtest untuk melihat hasil simulasi.</p>
                  </div>
                )}

                {loading && (
                  <div className="bg-tv-card border border-tv-border rounded-lg h-full min-h-[500px] flex flex-col items-center justify-center text-tv-purple">
                    <Activity className="w-16 h-16 mb-4 animate-spin" />
                    <p className="text-sm">Memproses data historis & menjalankan algoritma...</p>
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
                  </>
                )}
              </>
            )}

            {activeTab === 'live-signal' && (
              <>
                {liveSignalError && (
                  <div className="bg-tv-card border border-tv-red/30 rounded-lg p-4 text-sm text-tv-red">
                    {liveSignalError}
                  </div>
                )}

                {!liveSignalResults && !liveSignalLoading && !liveSignalError && (
                  <div className="bg-tv-card border border-tv-border rounded-lg h-full min-h-[500px] flex flex-col items-center justify-center text-tv-muted">
                    <BarChart2 className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-sm">Pilih filter dan klik Cek Saham Cocok Hari Ini untuk melihat saham yang cocok sekarang.</p>
                  </div>
                )}

                {liveSignalLoading && (
                  <div className="bg-tv-card border border-tv-border rounded-lg h-full min-h-[500px] flex flex-col items-center justify-center text-tv-purple">
                    <Activity className="w-16 h-16 mb-4 animate-spin" />
                    <p className="text-sm">Mencocokkan filter ke data harga hari ini...</p>
                  </div>
                )}

                {liveSignalResults && !liveSignalLoading && (
                  <>
                    {liveSignalDataAsOfLabel && (
                      <p className="text-[11px] text-tv-muted">Data per {liveSignalDataAsOfLabel} (diperbarui otomatis tiap hari, bukan real-time).</p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-tv-card border border-tv-border rounded-lg p-4">
                        <div className="text-xs text-tv-muted mb-1">Win Rate Historis (12 Bulan)</div>
                        <div className="text-xl font-bold font-number text-tv-text">{liveSignalResults.historicalStats.winRatePct.toFixed(0)}%</div>
                      </div>
                      <div className="bg-tv-card border border-tv-border rounded-lg p-4">
                        <div className="text-xs text-tv-muted mb-1">Return Historis (12 Bulan)</div>
                        <div className={`text-xl font-bold font-number ${liveSignalResults.historicalStats.returnPct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                          {liveSignalResults.historicalStats.returnPct >= 0 ? '+' : ''}{liveSignalResults.historicalStats.returnPct.toFixed(2)}%
                        </div>
                      </div>
                      <div className="bg-tv-card border border-tv-border rounded-lg p-4">
                        <div className="text-xs text-tv-muted mb-1">Alpha vs IHSG ({liveSignalResults.historicalStats.totalTrades} trades historis)</div>
                        <div className={`text-xl font-bold font-number ${liveSignalResults.historicalStats.alphaPct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                          {liveSignalResults.historicalStats.alphaPct >= 0 ? '+' : ''}{liveSignalResults.historicalStats.alphaPct.toFixed(2)}%
                        </div>
                      </div>
                    </div>

                    <div className="bg-tv-card border border-tv-border rounded-lg shadow-1 overflow-hidden">
                      <div className="p-4 border-b border-tv-border bg-tv-bg/40">
                        <h3 className="font-heading text-sm font-bold text-tv-text">
                          Saham Cocok Filter Ini Hari Ini ({liveSignalResults.matches.length})
                        </h3>
                      </div>
                      {liveSignalResults.matches.length === 0 ? (
                        <div className="p-6 text-sm text-tv-muted text-center">
                          Tidak ada saham yang cocok kombinasi filter ini hari ini.
                        </div>
                      ) : (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-tv-card border-b border-tv-border text-xs text-tv-muted uppercase font-semibold tracking-wide">
                              <th className="py-3 px-4">Symbol</th>
                              <th className="py-3 px-4">Harga</th>
                              <th className="py-3 px-4 text-right">Skor Indikator</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-tv-border text-sm">
                            {liveSignalResults.matches.map((m: any) => (
                              <tr key={m.symbol} className="hover:bg-tv-hover/30">
                                <td className="py-3 px-4 text-tv-text font-bold font-number">{m.symbol}</td>
                                <td className="py-3 px-4 text-tv-muted font-number">Rp {Math.round(m.price).toLocaleString('id-ID')}</td>
                                <td className="py-3 px-4 text-right font-bold font-number text-tv-text">{m.score}/9</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <PaywallModal
        open={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title="Daftar Dulu untuk Lihat Hasil"
        body="Backtest & Sinyal Hari Ini butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
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

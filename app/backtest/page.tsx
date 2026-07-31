'use client';

import React, { useState } from 'react';
import { Target, Activity, Play, Settings2, BarChart2, CheckSquare, Square, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function BacktestPage() {
  const [modal, setModal] = useState(100000000);
  const [period, setPeriod] = useState(12);
  
  const availableFilters = [
    'EMA 20/50 Cross',
    'Volume vs Avg 20D',
    'Foreign Flow',
    'RSI 14',
    'MACD',
    'Bollinger Bands',
    'MA Trend IDX (20,50,200)',
    'Support & Resistance',
    'Market Flow Index',
    'Trend Price vs MA200'
  ];

  const [selectedFilters, setSelectedFilters] = useState<string[]>(['EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14']);
  
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);

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
      setSelectedFilters(['Foreign Flow', 'Market Flow Index', 'MACD']);
    } else if (preset === 'Oversold') {
      setSelectedFilters(['RSI 14', 'Bollinger Bands', 'Support & Resistance']);
    }
  };

  const runBacktest = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: selectedFilters, modal, period })
      });
      const data = await res.json();
      setResults(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const chartData = results?.equityCurve?.map((eq: number, idx: number) => ({
    month: `M${idx}`,
    Strategy: eq,
    IHSG: results.ihsgCurve[idx]
  })) || [];

  return (
    <div className="flex h-screen bg-[#0f172a]">
      {/* Sidebar removed, handled by layout */}
      <div className="flex-1 flex flex-col min-h-screen overflow-y-auto custom-scrollbar">
        <header className="bg-[#131c2e] border-b border-[#1e293b] px-6 py-4 sticky top-0 z-20 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-xl text-white tracking-tight">Strategy Builder + AI Backtester</h1>
              <p className="text-xs text-gray-500 font-mono">Build custom rules and backtest on historical data</p>
            </div>
          </div>
        </header>

        <div className="p-6 max-w-[1400px] mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Builder Panel */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-5 shadow-1">
              <h3 className="font-bold text-white flex items-center gap-2 mb-4 border-b border-[#1e293b] pb-3">
                <Target className="w-5 h-5 text-purple-400" /> PRESETS
              </h3>
              <div className="flex flex-col gap-2">
                <button onClick={() => applyPreset('Momentum')} className="text-left px-4 py-2 bg-[#1e293b] hover:bg-[#334155] rounded-lg text-sm text-gray-300 transition-colors">Bank BUMN Momentum</button>
                <button onClick={() => applyPreset('Accumulation')} className="text-left px-4 py-2 bg-[#1e293b] hover:bg-[#334155] rounded-lg text-sm text-gray-300 transition-colors">Bandar Accumulation</button>
                <button onClick={() => applyPreset('Oversold')} className="text-left px-4 py-2 bg-[#1e293b] hover:bg-[#334155] rounded-lg text-sm text-gray-300 transition-colors">Oversold Bounce</button>
              </div>
            </div>

            <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-5 shadow-1">
              <h3 className="font-bold text-white flex items-center gap-2 mb-4 border-b border-[#1e293b] pb-3">
                <Settings2 className="w-5 h-5 text-purple-400" /> ALGO FILTERS
              </h3>
              <div className="space-y-2 mb-6 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {availableFilters.map(f => {
                  const isSelected = selectedFilters.includes(f);
                  return (
                    <div 
                      key={f}
                      onClick={() => toggleFilter(f)}
                      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors border ${isSelected ? 'bg-purple-500/10 border-purple-500/30' : 'bg-[#0f172a] border-[#1e293b] hover:border-gray-600'}`}
                    >
                      {isSelected ? <CheckSquare className="w-4 h-4 text-purple-400" /> : <Square className="w-4 h-4 text-gray-600" />}
                      <span className={`text-sm font-mono ${isSelected ? 'text-purple-300 font-bold' : 'text-gray-400'}`}>{f}</span>
                    </div>
                  )
                })}
              </div>

              <div className="space-y-4 pt-4 border-t border-[#1e293b]">
                <div>
                  <label className="text-xs text-gray-500 font-mono mb-1 block">Modal Awal (Rp)</label>
                  <input type="number" value={modal} onChange={e => setModal(Number(e.target.value))} className="w-full bg-[#0f172a] border border-[#1e293b] text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-mono mb-1 block">Periode (Bulan)</label>
                  <select value={period} onChange={e => setPeriod(Number(e.target.value))} className="w-full bg-[#0f172a] border border-[#1e293b] text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-purple-500">
                    <option value={3}>3 Bulan</option>
                    <option value={6}>6 Bulan</option>
                    <option value={12}>12 Bulan</option>
                    <option value={24}>24 Bulan</option>
                  </select>
                </div>
                
                <button 
                  onClick={runBacktest}
                  disabled={loading || selectedFilters.length === 0}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 mt-4"
                >
                  {loading ? <Activity className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                  BACKTEST SEKARANG
                </button>
              </div>
            </div>
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-2 space-y-6">
            {!results && !loading && (
              <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl h-full min-h-[500px] flex flex-col items-center justify-center text-gray-500">
                <BarChart2 className="w-16 h-16 mb-4 opacity-20" />
                <p className="font-mono text-sm">Pilih filter dan klik Backtest untuk melihat hasil simulasi.</p>
              </div>
            )}
            
            {loading && (
              <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl h-full min-h-[500px] flex flex-col items-center justify-center text-purple-500">
                <Activity className="w-16 h-16 mb-4 animate-spin" />
                <p className="font-mono text-sm">Memproses data historis & menjalankan algoritma...</p>
              </div>
            )}

            {results && !loading && (
              <>
                {/* Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-4">
                    <div className="text-xs text-gray-500 font-mono mb-1">Return Strategi</div>
                    <div className={`text-xl font-bold font-mono ${results.return.includes('+') ? 'text-green-400' : 'text-red-400'}`}>{results.return}</div>
                  </div>
                  <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-4">
                    <div className="text-xs text-gray-500 font-mono mb-1">Alpha vs IHSG ({results.ihsgReturn})</div>
                    <div className={`text-xl font-bold font-mono ${results.alpha.includes('+') ? 'text-green-400' : 'text-red-400'}`}>{results.alpha}</div>
                  </div>
                  <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-4">
                    <div className="text-xs text-gray-500 font-mono mb-1">Win Rate ({results.totalTrades} trades)</div>
                    <div className="text-xl font-bold font-mono text-white">{results.winRate}</div>
                  </div>
                  <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-4">
                    <div className="text-xs text-gray-500 font-mono mb-1">Max Drawdown</div>
                    <div className="text-xl font-bold font-mono text-red-400">{results.maxDD}</div>
                  </div>
                </div>

                {/* Chart */}
                <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-5 shadow-1">
                  <h3 className="text-sm font-bold text-white mb-4 font-mono">EQUITY CURVE</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorStrategy" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorIHSG" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#64748b" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#64748b" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="month" stroke="#334155" fontSize={10} tickLine={false} />
                        <YAxis stroke="#334155" fontSize={10} tickLine={false} domain={['auto', 'auto']} tickFormatter={(val) => `Rp${(val/1000000).toFixed(0)}M`} />
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', fontSize: '12px', fontFamily: 'monospace' }}
                          itemStyle={{ color: '#fff' }}
                        />
                        <Area type="monotone" dataKey="Strategy" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorStrategy)" />
                        <Area type="monotone" dataKey="IHSG" stroke="#64748b" strokeWidth={2} fillOpacity={1} fill="url(#colorIHSG)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center justify-center gap-4 mt-4 text-xs font-mono">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-500 rounded-sm"></div> Strategy</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 bg-slate-500 rounded-sm"></div> IHSG</div>
                  </div>
                </div>

                {/* Trades */}
                <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl shadow-1 overflow-hidden">
                  <div className="p-4 border-b border-[#1e293b] bg-slate-900/50">
                    <h3 className="text-sm font-bold text-white font-mono">SIMULATED TRADES (SAMPLE)</h3>
                  </div>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#131c2e] border-b border-[#1e293b] text-xs font-mono text-gray-400">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Symbol</th>
                        <th className="py-3 px-4">Buy Px</th>
                        <th className="py-3 px-4 text-right">PnL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e293b] text-sm font-mono">
                      {results.trades.map((t: any, idx: number) => (
                        <tr key={idx} className="hover:bg-[#1e293b]/30">
                          <td className="py-3 px-4 text-gray-400">{t.date}</td>
                          <td className="py-3 px-4 text-white font-bold">{t.symbol}</td>
                          <td className="py-3 px-4 text-gray-300">Rp {t.buy}</td>
                          <td className={`py-3 px-4 text-right font-bold ${t.pnl.includes('+') ? 'text-green-400' : 'text-red-400'}`}>
                            {t.pnl}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              </>
            )}
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html:`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0f172a; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
      `}} />
    </div>
  );
}

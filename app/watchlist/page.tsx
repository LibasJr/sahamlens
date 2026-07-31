'use client';

import React, { useState, useEffect } from 'react';
import { Trash2, AlertCircle, BellRing, Settings, ShieldCheck, Download, Plus, Activity, Search, Bell, RefreshCw, TrendingUp, TrendingDown, Wallet, ArrowDownCircle, ArrowUpCircle, Gauge, Sparkles } from 'lucide-react';
import PortfolioHealth from '@/components/PortfolioHealth';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import PaywallModal from '@/components/PaywallModal';
import { checkWatchlistLimit, refreshAdminStatus, FREE_LIMITS } from '@/lib/limits';
import { getTickerName } from '@/lib/trendingTickers';

interface WatchlistItem {
  symbol: string;
  buy_price: number;
  lot?: number;
  created_at: string;
}

interface AlertItem {
  id: string;
  symbol: string;
  conditionType: string;
  targetValue: string;
  isActive: boolean;
  createdAt: string;
}

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveData, setLiveData] = useState<Record<string, any>>({});

  // Form states
  const [newSymbol, setNewSymbol] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [lotAmount, setLotAmount] = useState('');
  
  const [alertSymbol, setAlertSymbol] = useState('');
  const [alertCondition, setAlertCondition] = useState('PRICE_BELOW');
  const [alertValue, setAlertValue] = useState('');

  const [showPaywall, setShowPaywall] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    refreshAdminStatus();
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user?.role === 'admin') {
          setIsAdmin(true);
        }
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchWatchlist();
    fetchAlerts();
  }, []);

  const fetchWatchlist = async () => {
    try {
      const res = await fetch('/api/watchlist');
      if (res.ok) {
        const json = await res.json();
        setWatchlist(json?.data || []);
      }
    } catch (e) {
      console.error('Failed to fetch watchlist', e);
    }
  };

  useEffect(() => {
    // Fetch live data for watchlist items
    if (watchlist.length > 0) {
      fetchLiveData();
    } else {
      setLoading(false);
    }
  }, [watchlist]);

  const fetchAlerts = async () => {
    try {
      const res = await fetch('/api/alert');
      if (res.ok) {
        const json = await res.json();
        setAlerts(json?.data || []);
      }
    } catch (e) {
      console.error('Failed to fetch alerts', e);
    }
  };

  const fetchLiveData = async () => {
    setLoading(true);
    const newData: Record<string, any> = {};
    for (const item of watchlist) {
      try {
        const res = await fetch(`/api/stock/${item.symbol.replace('.JK', '')}`);
        if (res.ok) {
          newData[item.symbol] = await res.json();
        }
      } catch (e) {
        console.error(`Failed to fetch data for ${item.symbol}`);
      }
    }
    setLiveData(newData);
    setLoading(false);
  };

  const addWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol) return;

    const symbol = newSymbol.toUpperCase().replace('.JK', '') + '.JK';
    const price = parseFloat(buyPrice) || 0;
    const isNewSymbol = !watchlist.some(w => w.symbol === symbol);

    if (isNewSymbol) {
      const limit = checkWatchlistLimit(watchlist.length);
      if (!limit.allowed) {
        setShowPaywall(true);
        return;
      }
    }

    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, buy_price: price, lot: lotAmount ? parseInt(lotAmount) : null })
      });
      if (res.ok) {
        fetchWatchlist();
      }
    } catch (err) {
      console.error('Failed to add to watchlist', err);
    }

    setNewSymbol('');
    setBuyPrice('');
    setLotAmount('');
  };

  const removeWatchlist = async (symbol: string) => {
    try {
      await fetch(`/api/watchlist?symbol=${symbol}`, { method: 'DELETE' });
      fetchWatchlist();
      
      const newLiveData = { ...liveData };
      delete newLiveData[symbol];
      setLiveData(newLiveData);
    } catch (err) {
      console.error('Failed to remove from watchlist', err);
    }
  };

  const addAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertSymbol) return;

    const needsValue = alertCondition === 'PRICE_BELOW' || alertCondition === 'PRICE_ABOVE';
    // Backend (alertSchema) mewajibkan targetValue berupa number, tapi state ini bersumber
    // dari <input type="number"> yang selalu berupa string di React - sebelumnya string
    // mentah ("400") dikirim langsung dan ditolak validasi Zod, gagal 400 tanpa pesan apa
    // pun ke user (klik "Set Alert" terlihat seperti tidak terjadi apa-apa).
    const parsedValue = alertValue.trim() ? Number(alertValue) : null;
    if (needsValue && (parsedValue === null || Number.isNaN(parsedValue))) {
      alert('Target Nilai wajib diisi dengan angka.');
      return;
    }

    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
          await Notification.requestPermission();
        }
      }

      const res = await fetch('/api/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: alertSymbol.toUpperCase().replace('.JK', '') + '.JK',
          conditionType: alertCondition,
          targetValue: needsValue ? parsedValue : null
        })
      });

      if (res.ok) {
        fetchAlerts();
        setAlertSymbol('');
        setAlertValue('');
      } else {
        const errBody = await res.json().catch(() => null);
        alert(errBody?.error || errBody?.message || 'Gagal membuat alert. Coba lagi.');
      }
    } catch (err) {
      console.error('Failed to add alert', err);
      alert('Gagal membuat alert. Coba lagi.');
    }
  };

  const removeAlert = async (id: string) => {
    try {
      await fetch(`/api/alert?id=${id}`, { method: 'DELETE' });
      fetchAlerts();
    } catch (err) {
      console.error('Failed to remove alert', err);
    }
  };

  const triggerCron = async () => {
    try {
      const res = await fetch('/api/alerts/check');
      const json = await res.json();
      
      if (json.triggeredAlerts && json.triggeredAlerts.length > 0) {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          json.triggeredAlerts.forEach((alert: any) => {
            new Notification('SahamLens Alert', {
              body: alert.message
            });
          });
        } else {
          alert(`Cron triggered! Alerts:\n` + json.triggeredAlerts.map((a: any) => a.message).join('\n\n'));
        }
      } else {
        alert(`Cron triggered. No new alerts triggered. (Checked ${json.checked})`);
      }
      
      fetchAlerts();
    } catch (e) {
      console.error('Failed to trigger cron', e);
    }
  };

  const positioned = watchlist.filter(w => w.buy_price > 0 && (w.lot || 0) > 0);
  const totalInvested = positioned.reduce((sum, w) => sum + w.buy_price * (w.lot || 0) * 100, 0);
  const totalCurrent = positioned.reduce((sum, w) => sum + (liveData[w.symbol]?.price || 0) * (w.lot || 0) * 100, 0);
  const totalPnlPct = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;
  const activeAlertsCount = alerts.filter(a => a.isActive).length;

  return (
    <div className="flex-1 flex flex-col bg-[#0B1121] min-h-screen">
      <header className="bg-gradient-to-r from-[#0A1931] to-[#131c2e] border-b border-[#1e293b] px-6 py-6 sticky top-0 z-20 shadow-md">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-xl text-white tracking-tight font-heading">Watchlist & Alerts</h2>
              <p className="text-xs text-gray-400 font-mono">Pantau portofolio dan set notifikasi hp (Push Notification)</p>
            </div>
          </div>
          <button
            onClick={fetchLiveData}
            disabled={loading}
            className="bg-white/5 border border-white/10 hover:bg-white/10 px-4 py-2 rounded-full text-white flex items-center gap-2 transition-colors disabled:opacity-50 text-xs font-mono font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40"><Wallet className="w-3 h-3" /> Nilai Posisi</div>
            <div className="mt-1 text-[16px] font-bold text-white font-number">{totalCurrent > 0 ? `Rp ${Math.round(totalCurrent).toLocaleString('id-ID')}` : '-'}</div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40">{totalPnlPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />} Total P&L</div>
            <div className={`mt-1 text-[16px] font-bold font-number ${totalPnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{totalInvested > 0 ? `${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%` : '-'}</div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40"><Activity className="w-3 h-3" /> Saham Dipantau</div>
            <div className="mt-1 text-[16px] font-bold text-white font-number">{watchlist.length} / {FREE_LIMITS.WATCHLIST === Infinity ? '∞' : FREE_LIMITS.WATCHLIST}</div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40"><BellRing className="w-3 h-3" /> Alert Aktif</div>
            <div className="mt-1 text-[16px] font-bold text-white font-number">{activeAlertsCount}</div>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Watchlist Section */}
        <div className="lg:col-span-2 space-y-6">
          <PortfolioHealth
            watchlist={watchlist.map(item => {
              return {
                simbol: item.symbol,
                hargaBeli: item.buy_price || 0,
                hargaSekarang: liveData[item.symbol]?.price || 0,
                lot: item.lot,
                pnl: item.buy_price > 0 && liveData[item.symbol]?.price > 0 ? ((liveData[item.symbol]?.price - item.buy_price) / item.buy_price) * 100 : 0
              };
            })}
          />

          <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-5 shadow-1">
            <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4 border-b border-[#1e293b] pb-3">
              <Activity className="w-5 h-5 text-blue-400" />
              My Watchlist
            </h3>

            <form onSubmit={addWatchlist} className="flex gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <SymbolAutocomplete 
                  containerClassName="relative flex-1"
                  placeholder="Simbol (contoh: BBCA)" 
                  value={newSymbol}
                  onChange={(val) => setNewSymbol(val)}
                  className="w-full bg-[#0f172a] border border-[#1e293b] text-white rounded-lg pl-9 pr-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <input 
                type="number" 
                placeholder="Harga Beli (opsional)" 
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                className="w-48 bg-[#0f172a] border border-[#1e293b] text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500"
              />
              <input 
                type="number" 
                placeholder="Total Lot" 
                value={lotAmount}
                onChange={(e) => setLotAmount(e.target.value)}
                className="w-32 bg-[#0f172a] border border-[#1e293b] text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500"
              />
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-bold transition-colors">
                <Plus className="w-4 h-4" /> Add
              </button>
            </form>

            <div className="space-y-2.5">
              {watchlist.map((item) => {
                const data = liveData[item.symbol];
                const currentPrice = data?.price || 0;
                const pnl = item.buy_price > 0 && currentPrice > 0
                  ? ((currentPrice - item.buy_price) / item.buy_price) * 100
                  : 0;
                const isProfit = pnl >= 0;
                const code = item.symbol.replace('.JK', '');
                const companyName = getTickerName(code);

                const srAnalyzer = data?.analyzers?.find((a: any) => a.label?.includes('Support & Resistance'));
                const supportMatch = srAnalyzer?.value?.match(/Sup: ([\d.]+)/);
                const supportTarget = supportMatch ? supportMatch[1] : '';

                const scoreVal = data?.scoring?.total_score;
                const scoreColor = scoreVal == null ? '#64748b' : scoreVal < 40 ? '#ef4444' : scoreVal < 60 ? '#f59e0b' : '#10b981';
                const scoreLabel = scoreVal == null ? '...' : scoreVal < 40 ? 'SELL' : scoreVal < 60 ? 'HOLD' : 'BUY';

                return (
                  <div key={item.symbol} className="group rounded-xl border border-[#1e293b] bg-[#0f172a] hover:border-blue-500/40 hover:bg-[#111d33] transition-colors p-3.5 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-blue-500/10 border border-blue-500/25 flex items-center justify-center shrink-0 text-blue-400 font-bold text-[11px] font-mono">
                      {code.slice(0, 4)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white font-mono">{code}</span>
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded font-mono border"
                          style={{ backgroundColor: `${scoreColor}22`, borderColor: scoreColor, color: scoreColor }}
                        >
                          {scoreLabel}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 truncate">{companyName}</div>
                      {pnl < -20 && data?.scoring?.kategori?.includes('SELL') && supportTarget && (
                        <button
                          type="button"
                          onClick={() => { setAlertSymbol(item.symbol); setAlertCondition('PRICE_BELOW'); setAlertValue(supportTarget); }}
                          className="mt-1 flex items-center gap-1 text-[10px] text-yellow-400 hover:text-yellow-300"
                        >
                          <AlertCircle className="w-3 h-3" /> Suggest: Alert Support {supportTarget}
                        </button>
                      )}
                    </div>

                    <div className="hidden sm:flex flex-col items-end text-right shrink-0 w-28">
                      <span className="text-white font-mono font-bold text-sm">{currentPrice ? `Rp ${currentPrice.toLocaleString('id-ID')}` : '-'}</span>
                      <span className="text-[10px] text-gray-500 font-mono">Beli: {item.buy_price ? `Rp ${item.buy_price.toLocaleString('id-ID')}` : '-'} {item.lot ? `• ${item.lot} lot` : ''}</span>
                    </div>

                    <div className="shrink-0 w-20 text-right">
                      {item.buy_price ? (
                        <span className={`inline-flex items-center gap-1 font-bold px-2 py-1 rounded-lg text-xs font-number ${isProfit ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                          {isProfit ? <ArrowUpCircle className="w-3 h-3" /> : <ArrowDownCircle className="w-3 h-3" />}
                          {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                        </span>
                      ) : <span className="text-gray-600 text-xs">-</span>}
                    </div>

                    <button onClick={() => removeWatchlist(item.symbol)} className="shrink-0 p-2 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              {watchlist.length === 0 && (
                <div className="py-10 text-center rounded-xl border border-dashed border-[#1e293b]">
                  <Sparkles className="w-6 h-6 mx-auto mb-2 text-gray-600" />
                  <p className="text-sm font-mono text-gray-500">Belum ada saham di watchlist</p>
                  <p className="text-[11px] text-gray-600 mt-1">Tambahkan simbol saham lewat form di atas untuk mulai memantau.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Alerts Section */}
        <div className="space-y-6">
          <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-5 shadow-1">
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-3 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Bell className="w-5 h-5 text-yellow-400" />
                Push Notifications (HP/Browser)
              </h3>
              <button onClick={triggerCron} className="text-[10px] font-mono text-gray-500 hover:text-white underline">
                Test Cron
              </button>
            </div>

            <form onSubmit={addAlert} className="space-y-3 mb-6">
              <SymbolAutocomplete
                containerClassName="relative w-full"
                placeholder="Simbol (BBCA)"
                value={alertSymbol}
                onChange={(val) => setAlertSymbol(val)}
                className="w-full bg-[#0f172a] border border-[#1e293b] text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-yellow-500"
                required
              />
              <select 
                value={alertCondition}
                onChange={(e) => setAlertCondition(e.target.value)}
                className="w-full bg-[#0f172a] border border-[#1e293b] text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-yellow-500"
              >
                <option value="PRICE_BELOW">Harga Turun Di Bawah</option>
                <option value="PRICE_ABOVE">Harga Naik Di Atas</option>
                <option value="CONSENSUS_STRONG_BUY">Konsensus STRONG BUY</option>
                <option value="RSI_OVERSOLD">RSI Oversold (&lt; 30)</option>
              </select>
              {(alertCondition === 'PRICE_BELOW' || alertCondition === 'PRICE_ABOVE') && (
                <input 
                  type="number" 
                  placeholder="Target Nilai" 
                  value={alertValue}
                  onChange={(e) => setAlertValue(e.target.value)}
                  className="w-full bg-[#0f172a] border border-[#1e293b] text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-yellow-500"
                  required
                />
              )}
              <button type="submit" className="w-full bg-yellow-500/20 border border-yellow-500/50 hover:bg-yellow-500/40 text-yellow-500 px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-bold transition-colors font-mono">
                <Plus className="w-4 h-4" /> Set Alert
              </button>
            </form>

            <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
              {alerts.map(alert => {
                const AlertIcon = alert.conditionType === 'PRICE_BELOW' ? ArrowDownCircle
                  : alert.conditionType === 'PRICE_ABOVE' ? ArrowUpCircle
                  : alert.conditionType === 'RSI_OVERSOLD' ? Gauge
                  : Sparkles;
                return (
                  <div key={alert.id} className={`p-3 rounded-lg border flex flex-col gap-2 ${alert.isActive ? 'bg-[#0f172a] border-[#1e293b]' : 'bg-[#0f172a]/50 border-[#1e293b]/50 opacity-50'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white font-mono">{displayTicker(alert.symbol)}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${alert.isActive ? 'bg-tv-green/20 text-tv-green' : 'bg-gray-500/20 text-gray-400'}`}>
                          {alert.isActive ? 'ACTIVE' : 'TRIGGERED'}
                        </span>
                        <button onClick={() => removeAlert(alert.id)} className="text-gray-500 hover:text-red-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 font-mono flex items-center gap-1.5">
                      <AlertIcon className="w-3.5 h-3.5 shrink-0" />
                      {alert.conditionType === 'PRICE_BELOW' && `Harga < ${alert.targetValue}`}
                      {alert.conditionType === 'PRICE_ABOVE' && `Harga > ${alert.targetValue}`}
                      {alert.conditionType === 'CONSENSUS_STRONG_BUY' && `Konsensus STRONG BUY`}
                      {alert.conditionType === 'RSI_OVERSOLD' && `RSI Oversold`}
                    </div>
                  </div>
                );
              })}
              {alerts.length === 0 && (
                <div className="text-center text-sm font-mono text-gray-500 py-4">
                  Belum ada alert aktif
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        title={`Watchlist Free Max ${FREE_LIMITS.WATCHLIST} Saham`}
        body={`Kamu sudah punya ${watchlist.slice(0, 3).map(w => displayTicker(w.symbol)).join(', ')}. Upgrade Pro untuk watchlist unlimited + sync Telegram.`}
        benefits={[
          'Watchlist unlimited (bukan cuma 3 saham)',
          'Sinkronisasi alert ke Telegram (Libas Bot)',
          'Semua fitur Pro lainnya',
        ]}
        waText="Halo, saya mau upgrade ke SahamLens Pro (Rp149.000/bulan) - kena limit watchlist"
        ctaLabel="Upgrade Pro"
        secondaryLabel="Nanti"
      />
    </div>
  );
}

function displayTicker(symbol: string) {
  return symbol.replace('.JK', '');
}

'use client';

import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  Trash2, 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle,
  RefreshCw,
  Search,
  Activity
} from 'lucide-react';
import PortfolioHealth from '@/components/PortfolioHealth';
import PaywallModal from '@/components/PaywallModal';
import { checkWatchlistLimit, refreshAdminStatus, FREE_LIMITS } from '@/lib/limits';

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

  useEffect(() => {
    refreshAdminStatus();
  }, []);

  useEffect(() => {
    fetchWatchlist();
    fetchAlerts();
  }, []);

  const fetchWatchlist = async () => {
    try {
      const res = await fetch('/api/watchlist');
      if (res.ok) {
        const data = await res.json();
        setWatchlist(data || []);
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
        setAlerts(json.alerts || []);
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

    try {
      const res = await fetch('/api/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: alertSymbol.toUpperCase().replace('.JK', '') + '.JK',
          conditionType: alertCondition,
          targetValue: alertValue
        })
      });
      
      if (res.ok) {
        fetchAlerts();
        setAlertSymbol('');
        setAlertValue('');
      }
    } catch (err) {
      console.error('Failed to add alert', err);
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
      alert(`Cron triggered. Messages sent: ${json.triggered || 0}`);
      fetchAlerts();
    } catch (e) {
      console.error('Failed to trigger cron', e);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0f172a] min-h-screen">
      <header className="bg-[#131c2e] border-b border-[#1e293b] px-6 py-4 sticky top-0 z-20 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-white tracking-tight">Watchlist & Alerts</h2>
              <p className="text-xs text-gray-500 font-mono">Pantau portofolio dan set notifikasi Telegram</p>
            </div>
          </div>
          <button
            onClick={fetchLiveData}
            disabled={loading}
            className="bg-[#1e293b] border border-[#334155] hover:bg-[#334155] px-3 py-1.5 rounded-full text-white flex items-center gap-2 transition-colors disabled:opacity-50 text-xs font-mono"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
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
                pnl: item.buy_price > 0 && liveData[item.symbol]?.price > 0 ? ((liveData[item.symbol]?.price - item.buy_price) / item.buy_price) * 100 : 0
              };
            })} 
          />

          <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-5 shadow-lg">
            <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4 border-b border-[#1e293b] pb-3">
              <Activity className="w-5 h-5 text-blue-400" />
              My Watchlist
            </h3>

            <form onSubmit={addWatchlist} className="flex gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="Simbol (contoh: BBCA)" 
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
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

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1e293b] text-xs font-mono text-gray-400 uppercase tracking-wider">
                    <th className="pb-3 pl-2">Simbol</th>
                    <th className="pb-3">Harga Saat Ini</th>
                    <th className="pb-3">Harga Beli</th>
                    <th className="pb-3">Lot</th>
                    <th className="pb-3">PnL %</th>
                    <th className="pb-3">Skor AI</th>
                    <th className="pb-3 text-right pr-2">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e293b]">
                  {watchlist.map((item) => {
                    const data = liveData[item.symbol];
                    const currentPrice = data?.price || 0;
                    const pnl = item.buy_price > 0 && currentPrice > 0 
                      ? ((currentPrice - item.buy_price) / item.buy_price) * 100 
                      : 0;
                    const isProfit = pnl >= 0;

                    const srAnalyzer = data?.analyzers?.find((a: any) => a.label?.includes('Support & Resistance'));
                    const supportMatch = srAnalyzer?.value?.match(/Sup: ([\d.]+)/);
                    const supportTarget = supportMatch ? supportMatch[1] : '';

                    return (
                      <tr key={item.symbol} className="hover:bg-[#1e293b]/50 transition-colors">
                        <td className="py-3 pl-2 text-white font-mono">
                          <div className="font-bold">{item.symbol}</div>
                          {pnl < -20 && data?.scoring?.kategori?.includes('SELL') && supportTarget && (
                            <div className="text-[10px] text-yellow-400 mt-1 cursor-pointer" onClick={() => { 
                              setAlertSymbol(item.symbol); 
                              setAlertCondition('PRICE_BELOW'); 
                              setAlertValue(supportTarget);
                            }}>
                              <AlertCircle className="w-3 h-3 inline mr-1" /> Suggest: Alert Support {supportTarget}
                            </div>
                          )}
                        </td>
                        <td className="py-3 text-white font-mono">
                          {currentPrice ? `Rp ${currentPrice.toLocaleString()}` : '-'}
                        </td>
                        <td className="py-3 text-white font-mono">
                          {item.buy_price ? `Rp ${item.buy_price.toLocaleString('id-ID')}` : '-'}
                        </td>
                        <td className="py-3 text-white font-mono text-sm">
                          {item.lot || '-'}
                        </td>
                        <td className="py-3 text-white font-mono">
                          {item.buy_price ? (
                            <span className={`font-bold px-2 py-1 rounded-lg ${isProfit ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                              {pnl.toFixed(2)}%
                            </span>
                          ) : '-'}
                        </td>
                        <td className="py-3 font-mono">
                          {data?.scoring ? (
                            <span className="px-2 py-1 rounded text-sm font-bold text-white border" style={{
                              backgroundColor: data.scoring.total_score < 40 ? '#ef444433' : data.scoring.total_score < 60 ? '#f59e0b33' : '#10b98133',
                              borderColor: data.scoring.total_score < 40 ? '#ef4444' : data.scoring.total_score < 60 ? '#f59e0b' : '#10b981',
                              color: data.scoring.total_score < 40 ? '#ef4444' : data.scoring.total_score < 60 ? '#f59e0b' : '#10b981'
                            }}>
                              {data.scoring.total_score} {data.scoring.total_score < 40 ? 'SELL' : data.scoring.total_score < 60 ? 'HOLD' : 'BUY'}
                            </span>
                          ) : 'Loading...'}
                        </td>
                        <td className="py-3 pr-2 text-right">
                          <button onClick={() => removeWatchlist(item.symbol)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {watchlist.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm font-mono text-gray-500">
                        Belum ada saham di watchlist
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Alerts Section */}
        <div className="space-y-6">
          <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-5 shadow-lg">
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-3 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Bell className="w-5 h-5 text-yellow-400" />
                Telegram Alerts
              </h3>
              <button onClick={triggerCron} className="text-[10px] font-mono text-gray-500 hover:text-white underline">
                Test Cron
              </button>
            </div>

            <form onSubmit={addAlert} className="space-y-3 mb-6">
              <input 
                type="text" 
                placeholder="Simbol (BBCA)" 
                value={alertSymbol}
                onChange={(e) => setAlertSymbol(e.target.value)}
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
              {alerts.map(alert => (
                <div key={alert.id} className={`p-3 rounded-lg border flex flex-col gap-2 ${alert.isActive ? 'bg-[#0f172a] border-[#1e293b]' : 'bg-[#0f172a]/50 border-[#1e293b]/50 opacity-50'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white font-mono">{alert.symbol}</span>
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
                    <AlertCircle className="w-3.5 h-3.5" />
                    {alert.conditionType === 'PRICE_BELOW' && `Harga < ${alert.targetValue}`}
                    {alert.conditionType === 'PRICE_ABOVE' && `Harga > ${alert.targetValue}`}
                    {alert.conditionType === 'CONSENSUS_STRONG_BUY' && `Konsensus STRONG BUY`}
                    {alert.conditionType === 'RSI_OVERSOLD' && `RSI Oversold`}
                  </div>
                </div>
              ))}
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

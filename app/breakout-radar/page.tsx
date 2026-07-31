'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Target, Activity, ArrowUpRight, Clock, ChevronRight } from 'lucide-react';
import { getUsedSymbolsToday, FREE_LIMITS } from '@/lib/limits';
import PaywallModal from '@/components/PaywallModal';
import AskAIButton from '@/components/AskAIButton';

const displayTicker = (s: string) => s.replace('.JK', '').replace('.JK', '');


export default function BreakoutRadarPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [usedSymbolsToday, setUsedSymbolsToday] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/breakout-radar', { cache: 'no-store' });
        const json = await res.json();
        
        if (res.status === 402 || json.code === 'SUBSCRIPTION_REQUIRED') {
          setUsedSymbolsToday(getUsedSymbolsToday());
          setShowPaywall(true);
          return;
        }

        if (res.ok) {
          const items = json.data || [];
          setData(items);
          setLastUpdate(new Date(json.lastUpdate));
          
          // Kirim data breakout ke AI Chat supaya jawaban AI lebih substantif
          window.dispatchEvent(new CustomEvent('update-ai-context', { 
            detail: {
              symbol: 'BREAKOUT_RADAR',
              recommendations: items.map((r: any) => ({
                ticker: r.symbol,
                price: r.price,
                change: r.change,
                score: r.score,
                signals: r.signals,
                rr: r.rr
              }))
            }
          }));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatTime = (d: Date) => {
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
  };

  return (
    <div className="flex h-screen bg-[#0f172a]">
      {/* Sidebar removed, handled by layout */}
      <div className="flex-1 flex flex-col min-h-screen overflow-y-auto custom-scrollbar">
        {/* Header */}
        <header className="bg-[#131c2e] border-b border-[#1e293b] px-6 py-4 sticky top-0 z-20 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-teal-500/10 border border-teal-500/30 text-teal-400">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-bold text-xl text-white tracking-tight flex items-center gap-2">
                  BREAKOUT RADAR LIVE
                  <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded font-mono animate-pulse">LIVE</span>
                </h1>
                <p className="text-xs text-gray-400 font-mono flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3" /> Update: {lastUpdate ? formatTime(lastUpdate) : 'Loading...'} - No Polling
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="p-6 max-w-[1200px] mx-auto w-full">
          <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-[#1e293b] flex items-center justify-between bg-slate-900/50">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-teal-400" />
                  Top LQ45 Breakout Watchlist
                </h2>
                <p className="text-xs text-gray-500 font-mono mt-1">Scanning 15 bluechip stocks based on momentum algorithms</p>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0f172a] text-gray-400 text-xs uppercase font-mono tracking-wider border-b border-[#1e293b]">
                    <th className="py-3 px-4">Symbol</th>
                    <th className="py-3 px-4">Price</th>
                    <th className="py-3 px-4">Signal</th>
                    <th className="py-3 px-4">Score (0-8)</th>
                    <th className="py-3 px-4">RR Ratio</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e293b]">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center text-gray-500 font-mono">
                        <Activity className="w-8 h-8 text-teal-500/50 animate-spin mx-auto mb-3" />
                        Scanning Market...
                      </td>
                    </tr>
                  ) : data.length > 0 ? (
                    data.map((item, idx) => {
                      const isHighConf = item.score >= 5;
                      const isUp = item.change && !item.change.startsWith('-');
                      return (
                        <tr key={item.symbol} className="hover:bg-[#1e293b]/50 transition-colors group">
                          <td className="py-4 px-4 font-bold text-white font-mono flex items-center gap-3">
                            <span className="text-gray-500 text-xs w-4">{idx + 1}</span>
                            {item.symbol}
                          </td>
                          <td className="py-4 px-4 font-mono">
                            <div className="text-white font-bold">Rp {item.price.toLocaleString()}</div>
                            <div className={`text-[10px] ${isUp ? 'text-teal-400' : 'text-red-400'} flex items-center`}>
                              {isUp && <ArrowUpRight className="w-3 h-3 mr-0.5" />}
                              {item.change}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex flex-wrap gap-1.5 max-w-[250px]">
                              {item.signals?.map((sig: string) => (
                                <span key={sig} className="text-[9px] font-mono font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded">
                                  {sig}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-3 w-40">
                              <span className={`font-bold font-mono text-sm ${isHighConf ? 'text-teal-400' : 'text-yellow-400'}`}>
                                {item.score}
                              </span>
                              <div className="flex-1 bg-[#0f172a] rounded-full h-2.5 border border-[#1e293b] overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all duration-1000 ${isHighConf ? 'bg-gradient-to-r from-teal-500 to-teal-400' : 'bg-gradient-to-r from-yellow-500 to-yellow-400'}`} 
                                  style={{ width: `${(item.score / 8) * 100}%` }}
                                ></div>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="bg-[#1e293b] text-gray-300 font-mono text-xs px-2 py-1 rounded border border-[#334155]">
                              {item.rr}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-2 ml-auto">
                              <AskAIButton prompt={`Saham ${item.symbol} saat ini masuk dalam Breakout Radar dengan skor ${item.score}/8 dan sinyal: ${item.signals?.join(', ')}. Harga saat ini Rp ${item.price} (${item.change}). Risk to reward ratio (RR) adalah ${item.rr}. Tolong berikan analisa mendalam apakah saham ini layak dibeli untuk breakout atau hanya false breakout?`} />
                              <button 
                                onClick={() => router.push(`/dashboard?symbol=${item.symbol}`)}
                                className="bg-teal-500 hover:bg-teal-400 text-[#0f172a] text-xs font-bold font-mono px-3 py-1.5 rounded flex items-center justify-center gap-1 transition-colors"
                              >
                                Analisa <ChevronRight className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-gray-500 font-mono">
                        Tidak ada sinyal breakout saat ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html:`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0f172a; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
      `}} />

      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        title="Limit Gratis Habis"
        body={`Kamu sudah pakai ${FREE_LIMITS.analisaPerHari}/${FREE_LIMITS.analisaPerHari} analisa hari ini${usedSymbolsToday.length ? ` (${usedSymbolsToday.slice(0, 3).map(displayTicker).join(', ')}${usedSymbolsToday.length > 3 ? ', dll' : ''})` : ''}. Upgrade Pro Rp 149k/bulan untuk unlimited 10 filters + Breakout Radar LIVE.`}
        benefits={[
          'Unlimited Technical Analyzer (10 filter)',
          'Breakout Radar LIVE',
          'Fundamental Analyzer + Watchlist unlimited',
        ]}
        waText="Halo, saya mau upgrade ke SahamLens Pro (Rp149.000/bulan) - kena limit analisa harian"
        ctaLabel="Upgrade Pro"
        secondaryLabel="Tunggu Besok"
      />
    </div>
  );
}

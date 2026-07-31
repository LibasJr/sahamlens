'use client';

import React, { useState, useEffect } from 'react';
import { 
  Building, 
  TrendingUp, 
  TrendingDown,
  Activity,
  AlertCircle
} from 'lucide-react';

interface BandarFlowProProps {
  symbol: string;
}

export default function BandarFlowPro({ symbol }: BandarFlowProProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFlowData = async () => {
      setLoading(true);
      try {
        const cleanSymbol = symbol.replace('.JK', '');
        const res = await fetch(`/api/flow/${cleanSymbol}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error('Failed to fetch flow data', err);
      } finally {
        setLoading(false);
      }
    };
    
    if (symbol) {
      fetchFlowData();
    }
  }, [symbol]);

  if (loading) {
    return (
      <div className="w-full h-48 flex items-center justify-center bg-tv-bg border border-tv-border rounded-xl">
        <Activity className="w-6 h-6 text-tv-green animate-spin" />
        <span className="ml-3 text-sm font-mono text-tv-muted">Analisa Bandar Flow...</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="bg-tv-bg border border-tv-border rounded-xl p-5 shadow-1 flex flex-col gap-6">
      
      {/* Header & Status */}
      <div className="flex items-center justify-between border-b border-tv-border pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 border border-purple-500/30 rounded-lg">
            <Building className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="font-bold text-white text-lg font-mono">Bandar & Foreign Flow</h3>
            <p className="text-xs text-tv-muted font-mono">Analisa pergerakan bandar & asing</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {data.summary.status === 'AKUMULASI' && (
            <div className="px-4 py-1.5 rounded-full bg-tv-green/20 border border-tv-green text-tv-green font-bold text-sm font-mono animate-pulse">
              AKUMULASI
            </div>
          )}
          {data.summary.status === 'DISTRIBUSI' && (
            <div className="px-4 py-1.5 rounded-full bg-tv-red/20 border border-tv-red text-tv-red font-bold text-sm font-mono">
              DISTRIBUSI
            </div>
          )}
          {data.summary.status === 'NETRAL' && (
            <div className="px-4 py-1.5 rounded-full bg-gray-500/20 border border-gray-500 text-gray-400 font-bold text-sm font-mono">
              NETRAL
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Foreign Flow Bar Chart */}
        <div className="flex flex-col gap-4">
          
          {/* Smart Money Divergence Alert */}
          {(() => {
            const foreignNet = data.foreignFlow20D.reduce((sum: number, d: any) => sum + d.netValue, 0);
            const topBuyersTotal = data.topBuyers.reduce((sum: number, b: any) => sum + b.volume, 0);
            const topSellersTotal = data.topSellers.reduce((sum: number, s: any) => sum + s.volume, 0);
            const bandarNet = topBuyersTotal - topSellersTotal;

            let status = "KONFIRMASI BEARISH";
            let message = "⚠️ Asing & Bandar distribusi - Hati-hati";
            let color = "bg-red-900/20 border-red-500 text-red-400";
            let badgeColor = "bg-red-500 text-white";

            if (foreignNet < -5 && bandarNet > 50000) {
              status = "DIVERGENSI BULLISH";
              message = `⚠️ Bandar serok saat asing buang - Hidden Accumulation +${Math.round(bandarNet/1000)}k lot. Potensi rebound jika tahan di atas Support.`;
              color = "bg-yellow-900/20 border-yellow-500 text-yellow-400";
              badgeColor = "bg-yellow-500 text-white";
            } else if (foreignNet > 5 && bandarNet < -50000) {
              status = "DIVERGENSI BEARISH";
              message = `⚠️ Asing masuk tapi bandar distribusi - Hati-hati fake pump (Net -${Math.abs(Math.round(bandarNet/1000))}k lot).`;
              color = "bg-orange-900/20 border-orange-500 text-orange-400";
              badgeColor = "bg-orange-500 text-white";
            } else if (foreignNet > 0 && bandarNet > 0) {
              status = "KONFIRMASI BULLISH";
              message = "✅ Asing & Bandar akumulasi bareng - Sangat Positif";
              color = "bg-[#14b8a6]/20 border-[#14b8a6] text-[#14b8a6]";
              badgeColor = "bg-[#14b8a6] text-white";
            }

            return (
              <div className={`w-full p-4 rounded-lg border ${color} flex flex-col gap-2`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold font-mono">
                    <AlertCircle className="w-4 h-4" />
                    {status}
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badgeColor}`}>
                    CONF 85%
                  </span>
                </div>
                <div className="text-xs font-mono opacity-90 leading-relaxed">
                  {message}
                </div>
              </div>
            );
          })()}

          <div className="bg-tv-card rounded-lg p-4 border border-tv-border flex-1">
            <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-white font-mono">Foreign Net Buy 20 Hari</h4>
            <span className={`text-xs font-bold font-mono ${data.summary.net5D > 0 ? 'text-tv-green' : 'text-tv-red'}`}>
              5D Net: {data.summary.net5D > 0 ? '+' : ''}{data.summary.net5D} M
            </span>
          </div>
          
          <div className="flex items-end h-32 gap-1 w-full justify-between mt-4">
            {data.foreignFlow20D.map((d: any, i: number) => {
              const maxAbs = Math.max(...data.foreignFlow20D.map((x: any) => Math.abs(x.netValue)));
              const heightPct = (Math.abs(d.netValue) / (maxAbs || 1)) * 100;
              const isPos = d.netValue >= 0;
              return (
                <div key={i} className="flex-1 flex flex-col justify-end items-center group relative">
                  <div 
                    className={`w-full rounded-t-sm transition-all duration-300 ${isPos ? 'bg-tv-green' : 'bg-tv-red'}`} 
                    style={{ height: `${Math.max(5, heightPct)}%`, opacity: isPos ? 0.8 : 0.7 }} 
                  />
                  {/* Tooltip */}
                  <div className="absolute -top-8 bg-black/80 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none">
                    {d.date}: {d.netValue}M
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </div>

        {/* Broker Summary */}
        <div className="bg-tv-card rounded-lg p-4 border border-tv-border">
           <h4 className="text-sm font-bold text-white font-mono mb-4 flex items-center justify-between">
             Top 3 Broker Akumulasi vs Distribusi
             {data.summary.sentiment === 'Sangat Positif' && (
                <span className="text-[10px] bg-tv-green/20 text-tv-green px-2 py-1 rounded border border-tv-green/30 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Sangat Positif
                </span>
             )}
             {data.summary.sentiment === 'Sangat Negatif' && (
                <span className="text-[10px] bg-tv-red/20 text-tv-red px-2 py-1 rounded border border-tv-red/30 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" /> Sangat Negatif
                </span>
             )}
           </h4>

           <div className="grid grid-cols-2 gap-4">
             {/* Buy */}
             <div className="space-y-2">
               <div className="text-xs font-mono text-tv-green border-b border-tv-border pb-1">Top Buyers</div>
               {data.topBuyers.map((b: any, i: number) => (
                 <div key={i} className="flex items-center justify-between text-sm font-mono">
                   <div className="flex items-center gap-2">
                     <span className="w-4 text-tv-muted">{i+1}.</span>
                     <span className="font-bold text-white bg-[#1e293b] px-1 rounded">{b.broker}</span>
                   </div>
                   <span className="text-tv-green">{b.volume.toLocaleString()}</span>
                 </div>
               ))}
             </div>

             {/* Sell */}
             <div className="space-y-2">
               <div className="text-xs font-mono text-tv-red border-b border-tv-border pb-1">Top Sellers</div>
               {data.topSellers.map((s: any, i: number) => (
                 <div key={i} className="flex items-center justify-between text-sm font-mono">
                   <div className="flex items-center gap-2">
                     <span className="w-4 text-tv-muted">{i+1}.</span>
                     <span className="font-bold text-white bg-[#1e293b] px-1 rounded">{s.broker}</span>
                   </div>
                   <span className="text-tv-red">{s.volume.toLocaleString()}</span>
                 </div>
               ))}
             </div>
           </div>
        </div>

      </div>
    </div>
  );
}

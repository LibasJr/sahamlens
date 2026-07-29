'use client';

import React from 'react';
import { AlertTriangle, ShieldCheck, Activity, PieChart } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface WatchlistItem {
  simbol: string;
  hargaBeli: number;
  hargaSekarang: number;
  pnl: number;
  skorAI?: number;
  status?: string;
  lot?: number;
}

export default function PortfolioHealth({ watchlist }: { watchlist: WatchlistItem[] }) {
  const router = useRouter();
  
  if (!watchlist || watchlist.length === 0) return null;

  // Mock sector mapping for demonstration
  const getSector = (symbol: string) => {
    if (symbol.includes('BBCA') || symbol.includes('BBRI') || symbol.includes('BMRI')) return 'Financials';
    if (symbol.includes('ICBP') || symbol.includes('AMRT')) return 'Consumer Defensive';
    if (symbol.includes('ADRO') || symbol.includes('PTBA')) return 'Energy';
    if (symbol.includes('DGWG') || symbol.includes('BRPT')) return 'Basic Materials';
    return 'Other';
  };

  // Calculate portfolio metrics
  let totalValue = 0;
  let totalPnLAmount = 0;
  let totalCost = 0;
  
  const sectors: Record<string, number> = {};

  watchlist.forEach(item => {
    const lot = item.lot || 100; // default 100 lot for demo
    const cost = item.hargaBeli * lot * 100;
    const value = item.hargaSekarang * lot * 100;
    const pnlAmount = value - cost;
    
    totalValue += value;
    totalCost += cost;
    totalPnLAmount += pnlAmount;

    const sector = getSector(item.simbol);
    sectors[sector] = (sectors[sector] || 0) + value;
  });

  const totalPnLPct = totalCost > 0 ? (totalPnLAmount / totalCost) * 100 : 0;
  
  // Calculate concentration risk
  let maxConcentration = 0;
  let topSector = '';
  
  Object.entries(sectors).forEach(([sector, value]) => {
    const pct = (value / totalValue) * 100;
    if (pct > maxConcentration) {
      maxConcentration = pct;
      topSector = sector;
    }
  });

  const isHighRisk = maxConcentration > 60 || watchlist.length === 1;
  const diversificationScore = Math.max(0, 100 - (maxConcentration - 30) * 1.5 - (watchlist.length === 1 ? 50 : 0));

  return (
    <div className="bg-tv-card border border-tv-border rounded-xl shadow-lg mb-6 overflow-hidden">
      <div className="p-4 border-b border-tv-border bg-slate-900/50 flex items-center justify-between">
        <h2 className="font-bold text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" /> PORTFOLIO HEALTH CHECK
        </h2>
        <span className={`px-2 py-1 rounded text-xs font-bold font-mono ${diversificationScore > 60 ? 'bg-tv-green/20 text-tv-green' : 'bg-tv-red/20 text-tv-red'}`}>
          SKOR: {Math.round(diversificationScore)}/100
        </span>
      </div>

      <div className="p-5 flex flex-col md:flex-row gap-6">
        <div className="flex-1 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-tv-bg border border-tv-border rounded-lg p-3">
              <div className="text-xs text-tv-muted font-mono mb-1">Total Value</div>
              <div className="text-xl font-bold text-white font-mono">Rp {totalValue.toLocaleString()}</div>
            </div>
            <div className="bg-tv-bg border border-tv-border rounded-lg p-3">
              <div className="text-xs text-tv-muted font-mono mb-1">Total PnL</div>
              <div className={`text-xl font-bold font-mono ${totalPnLPct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                {totalPnLPct >= 0 ? '+' : ''}{totalPnLPct.toFixed(2)}%
                <span className="text-xs ml-2 text-tv-muted opacity-80">({totalPnLAmount < 0 ? '-' : '+'}Rp {Math.abs(totalPnLAmount).toLocaleString()})</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 text-sm font-mono">
            <PieChart className="w-4 h-4 text-tv-muted" />
            <span className="text-tv-muted">Diversifikasi: </span>
            <span className={`font-bold ${isHighRisk ? 'text-tv-red' : 'text-tv-green'}`}>
              {isHighRisk ? '🔴 BURUK' : '🟢 BAIK'} - {maxConcentration.toFixed(0)}% di {topSector}
            </span>
          </div>
        </div>

        <div className={`flex-1 border rounded-lg p-4 flex flex-col justify-between ${isHighRisk ? 'bg-red-500/10 border-red-500/30' : 'bg-blue-500/10 border-blue-500/30'}`}>
          <div className="flex items-start gap-3">
            {isHighRisk ? <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" /> : <ShieldCheck className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />}
            <div>
              <h3 className={`font-bold text-sm mb-1 ${isHighRisk ? 'text-red-400' : 'text-blue-400'}`}>
                {isHighRisk ? 'High Concentration Risk' : 'Healthy Portfolio Allocation'}
              </h3>
              <p className="text-xs font-mono text-gray-300 leading-relaxed">
                {watchlist.length === 1 && topSector === 'Basic Materials' 
                  ? `Porto kamu 100% di 1 sektor & 1 saham doang. Kalau ${watchlist[0].simbol} ARB lagi, porto -7% lagi. Saran: tambah 1 bank (BBCA/BBRI) + 1 consumer (ICBP/AMRT) biar beta turun.`
                  : isHighRisk 
                  ? `Cukup berisiko, ${maxConcentration.toFixed(0)}% asetmu terkonsentrasi di sektor ${topSector}. Kurangi eksposur dan diversifikasi ke sektor lain.`
                  : `Cukup terdiversifikasi. Alokasi per sektor terdistribusi dengan baik.`}
              </p>
            </div>
          </div>
          
          <button 
            onClick={() => router.push('/recommendations')}
            className={`mt-4 text-xs font-bold font-mono px-4 py-2 rounded self-start transition-colors ${
              isHighRisk ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            Lihat Rekomendasi Diversifikasi &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}

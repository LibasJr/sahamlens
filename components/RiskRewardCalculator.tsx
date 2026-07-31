'use client';

import React from 'react';
import { Target, TrendingDown, TrendingUp, AlertCircle } from 'lucide-react';

interface RiskRewardCalculatorProps {
  currentPrice: number;
  analyzers: any[];
}

export default function RiskRewardCalculator({ currentPrice, analyzers }: RiskRewardCalculatorProps) {
  // Extract Support and Resistance
  const srAnalyzer = analyzers.find(a => a.label?.includes('Support & Resistance'));
  const srMatch = srAnalyzer?.value?.match(/Sup: ([\d.]+), Res: ([\d.]+)/);
  const support = srMatch ? parseFloat(srMatch[1]) : 0;
  const resistance = srMatch ? parseFloat(srMatch[2]) : 0;

  // Extract MA20
  const trendAnalyzer = analyzers.find(a => a.label?.includes('Trend Analysis'));
  const maMatch = trendAnalyzer?.value?.match(/MA20:([\d.]+)/);
  const ma20 = maMatch ? parseFloat(maMatch[1]) : 0;

  if (!support || !resistance || !currentPrice) return null;

  const risk = currentPrice - support;
  const reward = resistance - currentPrice;
  
  // Prevent division by zero or negative risk
  if (risk <= 0) {
    return (
      <div className="bg-tv-card border border-[#14b8a6]/20 rounded-xl p-5 shadow-lg mb-6">
         <h3 className="text-base font-bold text-white flex items-center gap-2 mb-3">
          <Target className="w-5 h-5 text-[#14b8a6]" />
          RISK/REWARD AUTO
        </h3>
        <p className="text-sm font-mono text-tv-muted">Harga di bawah atau sama dengan support. Tunggu konsolidasi.</p>
      </div>
    );
  }

  const rrRatio = reward / risk;
  const riskPct = (risk / currentPrice) * 100;
  const rewardPct = (reward / currentPrice) * 100;

  let badgeColor = "bg-red-500/20 text-red-400 border-red-500/30";
  let label = "TIDAK LAYAK";
  if (rrRatio >= 2) {
    badgeColor = "bg-[#14b8a6]/20 text-[#14b8a6] border-[#14b8a6]/30";
    label = "LAYAK";
  } else if (rrRatio >= 1) {
    badgeColor = "bg-yellow-400/20 text-yellow-400 border-yellow-400/30";
    label = "LUMAYAN";
  }

  let maWarning = null;
  if (ma20 && currentPrice < ma20) {
    const maRisk = ((ma20 - currentPrice) / currentPrice) * 100;
    const newRR = reward / (ma20 - support);
    maWarning = {
      text: `Di bawah MA20 (${ma20.toFixed(0)}) - Risk tambah ${maRisk.toFixed(1)}%`,
      recom: `Tunggu breakout ${ma20.toFixed(0)} dulu, RR jadi 1:${newRR.toFixed(1)} - Kurang menarik`
    };
  }

  return (
    <div className="bg-tv-card border border-[#14b8a6]/20 rounded-xl p-5 shadow-lg mb-6">
      <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4 border-b border-tv-border pb-3">
        <Target className="w-5 h-5 text-[#14b8a6]" />
        RISK/REWARD AUTO
      </h3>
      
      <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
        <div className="flex-1 w-full space-y-4">
          <div className="flex items-center justify-between text-sm font-mono bg-tv-bg p-3 rounded-lg border border-tv-border">
            <div className="flex flex-col">
              <span className="text-tv-muted text-xs">Entry</span>
              <span className="text-white font-bold">Rp {currentPrice.toLocaleString()}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-tv-muted text-xs flex items-center gap-1"><TrendingDown className="w-3 h-3 text-red-400"/> SL</span>
              <span className="text-red-400 font-bold">Rp {support.toLocaleString()} <span className="text-[10px]">(-{riskPct.toFixed(1)}%)</span></span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-tv-muted text-xs flex items-center gap-1"><TrendingUp className="w-3 h-3 text-[#14b8a6]"/> TP</span>
              <span className="text-[#14b8a6] font-bold">Rp {resistance.toLocaleString()} <span className="text-[10px]">(+{rewardPct.toFixed(1)}%)</span></span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-white font-mono">RR Ratio: 1:{rrRatio.toFixed(2)}</span>
            <span className={`text-[10px] font-bold px-2 py-1 rounded border ${badgeColor}`}>
              [{label}]
            </span>
          </div>
        </div>

        {maWarning && (
          <div className="flex-1 w-full bg-red-900/10 border border-red-500/20 rounded-lg p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-yellow-400">
              <AlertCircle className="w-4 h-4" /> Posisi MA20
            </div>
            <div className="text-xs font-mono text-white opacity-80">
              {maWarning.text}
            </div>
            <div className="text-[11px] font-mono text-tv-muted italic mt-1">
              Rekomendasi: &quot;{maWarning.recom}&quot;
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

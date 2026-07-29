'use client';

import React from 'react';
import { Layers, RefreshCw, Lock } from 'lucide-react';

// Filter yang tetap terlihat jelas di free tier - cocok dengan comment spek:
// "cuma EMA, RSI, MA Trend". Dicocokkan berdasarkan label (bukan posisi index)
// supaya tidak salah pilih kalau urutan analyzer dari API berubah.
const FREE_VISIBLE_KEYWORDS = ['EMA', 'RSI', 'MA Trend'];

function isVisibleForFree(label: string) {
  return FREE_VISIBLE_KEYWORDS.some((k) => label.includes(k));
}

interface AlgoFiltersProps {
  analyzers: any[];
  sortByConfidence: boolean;
  setSortByConfidence: (v: boolean) => void;
  getAccuracyPct: (label: string) => string;
  onAskAI: (algo: any) => void;
  isAdmin?: boolean;
}

export default function AlgoFilters({
  analyzers,
  sortByConfidence,
  setSortByConfidence,
  getAccuracyPct,
  onAskAI,
  isAdmin = false,
}: AlgoFiltersProps) {
  const lockedAnalyzers = isAdmin ? [] : analyzers.filter((a) => !isVisibleForFree(a.label));

  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-lg">
      <div className="flex justify-between items-center border-b border-tv-border pb-3 mb-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-tv-accent" />
          Algo Filters
        </h3>
        <button
          onClick={() => setSortByConfidence(!sortByConfidence)}
          className={`text-xs px-2 py-1 rounded border transition-colors ${sortByConfidence ? 'bg-tv-accent/20 border-tv-accent text-tv-accent' : 'border-tv-border text-tv-muted hover:text-white'}`}
        >
          Sort by Confidence
        </button>
      </div>

      {!isAdmin && lockedAnalyzers.length > 0 && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-tv-yellow/10 border border-tv-yellow/30 text-tv-yellow text-xs font-mono flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 flex-shrink-0" />
          {lockedAnalyzers.length} filter terkunci ({lockedAnalyzers.slice(0, 2).map((a) => a.label).join(', ')}, dll) - Buka di Pro
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
        {analyzers.length > 0 ? analyzers.map((algo: any, idx: number) => {
          const isTop3 = sortByConfidence && idx < 3;
          const isFreeVisible = isVisibleForFree(algo.label);
          const locked = !isAdmin && !isFreeVisible;

          if (locked) {
            return (
              <div key={idx} className="relative p-3 rounded-lg bg-tv-bg border border-tv-border flex flex-col gap-2 overflow-hidden">
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-tv-bg/70 backdrop-blur-[3px]">
                  <span className="flex items-center gap-1 text-[10px] font-bold text-tv-yellow bg-tv-yellow/10 border border-tv-yellow/40 px-2 py-1 rounded-full">
                    🔒 Pro
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm blur-sm select-none">
                  <span className="text-white font-bold">{algo.label}</span>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-tv-yellow/20 text-tv-yellow">
                    {algo.decision}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs font-mono text-tv-muted blur-sm select-none">
                  <span>{algo.value}</span>
                  <span className="text-white">Conf: {algo.confidence}%</span>
                </div>
              </div>
            );
          }

          return (
            <div key={idx} className={`p-3 rounded-lg bg-tv-bg border flex flex-col gap-2 ${isTop3 ? 'border-tv-green shadow-[0_0_10px_rgba(34,171,148,0.2)]' : 'border-tv-border'}`}>
              <div className="flex justify-between items-center text-sm">
                <span className="text-white font-bold">{algo.label}</span>
                <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                  algo.decision === 'BULLISH' ? 'bg-tv-green/20 text-tv-green' :
                  algo.decision === 'BEARISH' ? 'bg-tv-red/20 text-tv-red' :
                  'bg-tv-yellow/20 text-tv-yellow'
                }`}>
                  {algo.decision}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs font-mono text-tv-muted">
                <span>{algo.value}</span>
                <span className="text-white">Conf: {algo.confidence}%</span>
              </div>
              <div className="flex justify-between items-center text-[10px] pt-2 border-t border-tv-hover">
                <div>
                  <span className="text-tv-muted block">Hist. Accuracy (Local)</span>
                  <span className="font-bold text-tv-accent">{getAccuracyPct(algo.label)}</span>
                </div>
                <button
                  onClick={() => onAskAI(algo)}
                  className="bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/30 px-2 py-1 rounded transition-colors flex items-center gap-1"
                >
                  ✨ Tanya AI
                </button>
              </div>
            </div>
          );
        }) : (
          <div className="col-span-full text-center py-10 text-tv-muted text-sm flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-tv-borderLight" />
            Running AI Algorithms...
          </div>
        )}
      </div>
    </div>
  );
}

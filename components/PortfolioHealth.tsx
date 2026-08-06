'use client';

import React from 'react';
import { AlertTriangle, ShieldCheck, Activity, PieChart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle } from './ui/Card';
import { Badge } from './ui/Badge';

interface WatchlistItem {
  simbol: string;
  hargaBeli: number | null | undefined;
  hargaSekarang: number | null | undefined;
  pnl: number;
  skorAI?: number;
  status?: string;
  lot?: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export default function PortfolioHealth({ watchlist }: { watchlist: WatchlistItem[] }) {
  const router = useRouter();

  if (!watchlist || watchlist.length === 0) return null;

  let totalValue = 0;
  let totalPnLAmount = 0;
  let totalCost = 0;
  const positions: Record<string, number> = {};

  watchlist.forEach((item) => {
    if (
      !isFiniteNumber(item.hargaBeli) ||
      !isFiniteNumber(item.hargaSekarang) ||
      !isFiniteNumber(item.lot) ||
      item.hargaBeli < 0 ||
      item.hargaSekarang < 0 ||
      item.lot <= 0
      || item.hargaBeli <= 0
      || item.hargaSekarang <= 0
    ) {
      return;
    }

    const cost = item.hargaBeli * item.lot * 100;
    const value = item.hargaSekarang * item.lot * 100;
    const pnlAmount = value - cost;

    totalValue += value;
    totalCost += cost;
    totalPnLAmount += pnlAmount;

    const symbol = item.simbol.toUpperCase();
    positions[symbol] = (positions[symbol] || 0) + value;
  });

  if (totalValue <= 0) return null;

  const totalPnLPct = totalCost > 0 ? (totalPnLAmount / totalCost) * 100 : 0;
  const positionCount = Object.keys(positions).length;
  let maxConcentration = 0;
  let topPosition = '';

  Object.entries(positions).forEach(([symbol, value]) => {
    const pct = (value / totalValue) * 100;
    if (pct > maxConcentration) {
      maxConcentration = pct;
      topPosition = symbol;
    }
  });

  const isHighRisk = maxConcentration > 60 || positionCount === 1;
  const diversificationScore = Math.max(
    0,
    100 - (maxConcentration - 30) * 1.5 - (positionCount === 1 ? 50 : 0),
  );

  return (
    <Card padding="none" hoverable className="mb-6 overflow-hidden">
      <CardHeader className="p-4 border-b border-tv-border mb-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="w-5 h-5 text-tv-blue" /> Portfolio Health Check
        </CardTitle>
        <Badge variant={diversificationScore > 60 ? 'success' : 'danger'} className="font-number">
          Skor: {Math.round(diversificationScore)}/100
        </Badge>
      </CardHeader>

      <div className="p-5 flex flex-col md:flex-row gap-6">
        <div className="flex-1 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-tv-bg border border-tv-border rounded-lg p-3">
              <div className="text-xs text-tv-muted font-sans mb-1">Total Value</div>
              <div className="text-xl font-bold text-white font-number">
                Rp {totalValue.toLocaleString()}
              </div>
            </div>
            <div className="bg-tv-bg border border-tv-border rounded-lg p-3">
              <div className="text-xs text-tv-muted font-sans mb-1">Total PnL</div>
              <div className={`text-xl font-bold font-number ${totalPnLPct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                {totalPnLPct >= 0 ? '+' : ''}{totalPnLPct.toFixed(2)}%
                <span className="text-xs ml-2 text-tv-muted opacity-80">
                  ({totalPnLAmount < 0 ? '-' : '+'}Rp {Math.abs(totalPnLAmount).toLocaleString()})
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm font-sans">
            <PieChart className="w-4 h-4 text-tv-muted" />
            <span className="text-tv-muted">Konsentrasi posisi: </span>
            <span className={`font-bold ${isHighRisk ? 'text-tv-red' : 'text-tv-green'}`}>
              {isHighRisk ? 'TINGGI' : 'TERKENDALI'} - {maxConcentration.toFixed(0)}% di {topPosition}
            </span>
          </div>
        </div>

        <div className={`flex-1 border rounded-lg p-4 flex flex-col justify-between ${isHighRisk ? 'bg-red-500/10 border-red-500/30' : 'bg-blue-500/10 border-blue-500/30'}`}>
          <div className="flex items-start gap-3">
            {isHighRisk ? (
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <h3 className={`font-heading font-bold text-sm mb-1 ${isHighRisk ? 'text-red-400' : 'text-blue-400'}`}>
                {isHighRisk ? 'High Concentration Risk' : 'Healthy Portfolio Allocation'}
              </h3>
              <p className="text-xs font-sans text-gray-300 leading-relaxed">
                {isHighRisk
                  ? `Cukup berisiko, ${maxConcentration.toFixed(0)}% nilai portofolio terkonsentrasi di ${topPosition}. Evaluasi batas eksposur per saham sebelum menambah posisi.`
                  : 'Konsentrasi posisi masih terkendali berdasarkan data lot dan harga yang tersedia.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => router.push('/breakout-radar')}
            className={`mt-4 text-xs font-bold font-sans px-4 py-2 rounded self-start transition-colors ${
              isHighRisk ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            Buka Breakout Radar &rarr;
          </button>
        </div>
      </div>
    </Card>
  );
}

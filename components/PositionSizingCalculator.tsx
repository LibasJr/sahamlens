import React, { useState, useMemo } from 'react';
import { Shield, Calculator, AlertTriangle, TrendingUp, TrendingDown, CheckCircle2, DollarSign, Copy, Check, X } from 'lucide-react';
import { Card, CardHeader, CardTitle, Badge } from '@/components/ui';
import { calculatePositionSize } from '@/lib/utils/position-sizer';
import { formatRupiah } from '@/shared/config/pricing';
import { Button as PrimitiveButton } from '@/components/ui/Button';
import { copyText } from '@/shared/browser/copy-text';

interface PositionSizingCalculatorProps {
  entryPrice: number;
  cutLossPrice: number;
  takeProfit1Price?: number | null;
  takeProfit2Price?: number | null;
  ticker: string;
}

const CAPITAL_PRESETS = [5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000];

export function PositionSizingCalculator({
  entryPrice,
  cutLossPrice,
  takeProfit1Price,
  takeProfit2Price,
  ticker,
}: PositionSizingCalculatorProps) {
  const [capital, setCapital] = useState<number>(10_000_000);
  const [riskPct, setRiskPct] = useState<number>(1.0);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const cleanTicker = ticker.replace('.JK', '');

  const result = useMemo(() => {
    return calculatePositionSize({
      capitalIdr: capital,
      riskTolerancePct: riskPct,
      entryPrice,
      cutLossPrice,
      takeProfit1Price,
      takeProfit2Price,
    });
  }, [capital, riskPct, entryPrice, cutLossPrice, takeProfit1Price, takeProfit2Price]);

  const handleCopyPlan = async () => {
    if (!result.isValid) return;
    const text = `🎯 TRADING PLAN SAHAMLENS (${cleanTicker})
• Entry: Rp ${entryPrice.toLocaleString('id-ID')}
• Cut Loss: Rp ${cutLossPrice.toLocaleString('id-ID')} (-${(((entryPrice - cutLossPrice) / entryPrice) * 100).toFixed(1)}%)
${takeProfit1Price ? `• Take Profit 1: Rp ${takeProfit1Price.toLocaleString('id-ID')} (+${result.reward1Pct}% • R:R 1:${result.riskRewardRatio1})\n` : ''}${takeProfit2Price ? `• Take Profit 2: Rp ${takeProfit2Price.toLocaleString('id-ID')} (+${result.reward2Pct}% • R:R 1:${result.riskRewardRatio2})\n` : ''}• Max Pembelian: ${result.maxLots.toLocaleString('id-ID')} Lot (${result.totalShares.toLocaleString('id-ID')} lembar • ${formatRupiah(result.totalPositionCostIdr)})
• Batas Risiko: ${riskPct}% (${formatRupiah(result.actualRiskLossIdr)})
• Alokasi Modal: ${result.portfolioAllocationPct}% dari ${formatRupiah(capital)}`;

    const copied = await copyText(text);
    setCopyState(copied ? 'copied' : 'error');
    window.setTimeout(() => setCopyState('idle'), 2000);
  };

  if (!entryPrice || !cutLossPrice || cutLossPrice >= entryPrice) {
    return null;
  }

  return (
    <Card variant="default" padding="lg" className="border-tv-border bg-tv-card shadow-2">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-tv-border">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tv-green/10 border border-tv-green/20 text-tv-green">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base font-bold text-tv-text flex items-center gap-2">
              Kalkulator Position Sizing ({cleanTicker})
              <Badge variant="success" className="text-[10px] py-0.5 px-2">Anti-Habis Modal</Badge>
            </CardTitle>
            <p className="text-xs text-tv-muted">
              Hitung batas aman jumlah lot agar risiko per trade terkunci di {riskPct}% modal
            </p>
          </div>
        </div>

        {/* 1-Click Copy Trading Plan Button */}
        <PrimitiveButton variant="bare" size="none"
          type="button"
          onClick={handleCopyPlan}
          title="Salin Rencana Trading ke Clipboard"
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
            copyState === 'copied'
              ? 'bg-emerald-500/20 text-emerald-500 dark:text-emerald-300 border-emerald-500/40 shadow-sm'
              : copyState === 'error'
                ? 'bg-tv-red/10 text-tv-red border-tv-red/30'
                : 'bg-tv-hover text-tv-muted hover:text-tv-text border-tv-border'
          }`}
        >
          {copyState === 'copied' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : copyState === 'error' ? <X className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copyState === 'copied' ? 'Tersalin!' : copyState === 'error' ? 'Gagal menyalin' : 'Salin Trading Plan'}</span>
        </PrimitiveButton>
      </CardHeader>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Interactive Inputs */}
        <div className="lg:col-span-5 space-y-4">
          {/* Modal Input */}
          <div>
            <label className="block text-xs font-semibold text-tv-muted mb-1.5">
              Total Modal Kas Trading (Rp)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-tv-muted font-number">
                Rp
              </span>
              <input
                type="number"
                min="500000"
                step="500000"
                value={capital}
                onChange={(e) => setCapital(Number(e.target.value) || 0)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-tv-bg border border-tv-border text-tv-text font-number text-sm font-bold focus:outline-none focus:border-tv-blue focus:ring-1 focus:ring-tv-blue transition-all"
              />
            </div>

            {/* Quick Capital Preset Pills */}
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {CAPITAL_PRESETS.map((p) => (
                <PrimitiveButton variant="bare" size="none"
                  key={p}
                  type="button"
                  onClick={() => setCapital(p)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold font-number transition-all ${
                    capital === p
                      ? 'bg-tv-blue/20 text-tv-blue border border-tv-blue/40 shadow-sm'
                      : 'bg-tv-hover text-tv-muted hover:text-tv-text border border-tv-border'
                  }`}
                >
                  Rp {(p / 1e6).toFixed(0)} Jt
                </PrimitiveButton>
              ))}
            </div>
          </div>

          {/* Risk Tolerance Selector */}
          <div>
            <label className="block text-xs font-semibold text-tv-muted mb-1.5">
              Toleransi Risiko Maksimal per Trade
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 0.5, label: '0.5% (Konservatif)' },
                { val: 1.0, label: '1.0% (Standar Pro)' },
                { val: 2.0, label: 'Agresif 2%' },
              ].map((item) => (
                <PrimitiveButton variant="bare" size="none"
                  key={item.val}
                  type="button"
                  onClick={() => setRiskPct(item.val)}
                  className={`p-2 rounded-xl text-left transition-all border ${
                    riskPct === item.val
                      ? 'bg-tv-green/15 border-tv-green/40 text-tv-green shadow-sm'
                      : 'bg-tv-hover/40 border-tv-border text-tv-muted hover:text-tv-text'
                  }`}
                >
                  <div className="font-number font-bold text-xs">{item.val}%</div>
                  <div className="lens-meta opacity-80 truncate">{item.label}</div>
                </PrimitiveButton>
              ))}
            </div>
          </div>

          {/* Current Setup Snapshot */}
          <div className="p-3 rounded-xl bg-tv-hover/30 border border-tv-border space-y-1.5 text-xs font-number">
            <div className="flex justify-between text-tv-muted">
              <span>Harga Entry:</span>
              <strong className="text-tv-text">Rp {entryPrice.toLocaleString('id-ID')}</strong>
            </div>
            <div className="flex justify-between text-tv-muted">
              <span>Batas Cut Loss:</span>
              <strong className="text-tv-red">Rp {cutLossPrice.toLocaleString('id-ID')} (-{(((entryPrice - cutLossPrice) / entryPrice) * 100).toFixed(1)}%)</strong>
            </div>
            <div className="flex justify-between text-tv-muted">
              <span>Risiko per Lembar:</span>
              <strong className="text-tv-text">Rp {result.riskPerShareIdr.toLocaleString('id-ID')}</strong>
            </div>
          </div>
        </div>

        {/* Right Column: Execution Output Banner & Scenarios */}
        <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
          {/* Main Execution Recommendation Box */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-tv-green/15 via-tv-green/5 to-transparent border border-tv-green/30 shadow-lg">
            <div className="text-[11px] font-bold text-tv-green uppercase tracking-wider mb-1">
              Rekomendasi Ukuran Posisi Maksimal
            </div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="font-heading text-3xl font-extrabold text-tv-text font-number">
                {result.maxLots.toLocaleString('id-ID')} <span className="text-lg font-bold text-tv-green">Lot</span>
              </span>
              <span className="text-xs text-tv-muted font-number">
                ({result.totalShares.toLocaleString('id-ID')} lembar • {formatRupiah(result.totalPositionCostIdr)})
              </span>
            </div>

            <div className="mt-3 pt-3 border-t border-tv-border flex items-center justify-between text-xs font-number flex-wrap gap-2">
              <div className="text-tv-muted">
                Alokasi Modal: <strong className="text-tv-text">{result.portfolioAllocationPct}%</strong>
              </div>
              <div className="text-tv-muted">
                Batas Kerugian Maksimal: <strong className="text-tv-red">{formatRupiah(result.actualRiskLossIdr)} ({result.actualRiskLossPct}%)</strong>
              </div>
            </div>
          </div>

          {/* Scenario Outcomes (Stop Loss vs Take Profit) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Cut Loss Scenario */}
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-500 dark:text-rose-400 mb-1">
                <TrendingDown className="h-3.5 w-3.5" />
                Skenario Kena Cut Loss
              </div>
              <div className="text-base font-bold text-tv-text font-number">
                -{formatRupiah(result.actualRiskLossIdr)}
              </div>
              <div className="text-[10px] text-tv-muted mt-0.5">
                Modal tersisa: {formatRupiah(Math.max(0, capital - result.actualRiskLossIdr))} ({100 - result.actualRiskLossPct}%)
              </div>
            </div>

            {/* Take Profit Scenario */}
            {result.reward1Idr !== null && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Skenario Kena TP 1 (R:R {result.riskRewardRatio1})
                </div>
                <div className="text-base font-bold text-emerald-600 dark:text-emerald-300 font-number">
                  +{formatRupiah(result.reward1Idr)}
                </div>
                <div className="text-[10px] text-tv-muted mt-0.5">
                  Estimasi profit +{result.reward1Pct}% dari modal posisi
                </div>
              </div>
            )}
          </div>

          {result.warnings.length > 0 && (
            <div className="p-3 rounded-xl bg-tv-gold/10 border border-tv-gold/30 text-xs text-tv-gold flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                {result.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

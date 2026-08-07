'use client';

import React from 'react';
import { Target, TrendingDown, TrendingUp, AlertCircle, Info } from 'lucide-react';

interface RiskRewardCalculatorProps {
  currentPrice: number;
  analyzers: any[];
}

/**
 * IMPORTANT:
 * Komponen ini TIDAK menghitung TP/CL resmi.
 *
 * Ia hanya menampilkan konteks Support/Resistance dari analyzer teknikal.
 * TP/CL executable SahamLens berasal dari server-side `buildLongTradingSetup()`
 * yang memakai market structure + ATR + fraksi harga IDX.
 *
 * Sebelumnya kartu ini menyebut support sebagai "SL" dan resistance sebagai "TP",
 * sehingga menghasilkan dua sumber kebenaran yang berbeda. Itu dihilangkan.
 */
export default function RiskRewardCalculator({ currentPrice, analyzers }: RiskRewardCalculatorProps) {
  const srAnalyzer = analyzers.find(a => a.label?.includes('Support & Resistance'));

  // Prefer raw numeric output bila analyzer menyediakannya.
  const rawSupport =
    typeof srAnalyzer?.raw?.support === 'number'
      ? srAnalyzer.raw.support
      : typeof srAnalyzer?.raw?.support?.price === 'number'
        ? srAnalyzer.raw.support.price
        : null;

  const rawResistance =
    typeof srAnalyzer?.raw?.resistance === 'number'
      ? srAnalyzer.raw.resistance
      : typeof srAnalyzer?.raw?.resistance?.price === 'number'
        ? srAnalyzer.raw.resistance.price
        : null;

  // Backward-compatible fallback untuk cache/analyzer lama.
  const srMatch = srAnalyzer?.value?.match(/Sup: ([\d.]+), Res: ([\d.]+)/);
  const support = rawSupport ?? (srMatch ? parseFloat(srMatch[1]) : 0);
  const resistance = rawResistance ?? (srMatch ? parseFloat(srMatch[2]) : 0);

  const trendAnalyzer = analyzers.find(a => a.label?.includes('MA Trend'));
  const maMatch = trendAnalyzer?.value?.match(/MA20:(\d+(?:\.\d+)?)/);
  const ma20 = typeof trendAnalyzer?.raw?.ma20 === 'number'
    ? trendAnalyzer.raw.ma20
    : maMatch ? parseFloat(maMatch[1]) : 0;

  if (!support || !resistance || !currentPrice) return null;

  const downsideToSupport = currentPrice - support;
  const upsideToResistance = resistance - currentPrice;

  if (downsideToSupport <= 0) {
    return (
      <div className="bg-tv-card border border-tv-green/20 rounded-lg p-5 shadow-1 mb-6">
        <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 mb-3">
          <Target className="w-5 h-5 text-tv-green" />
          Konteks Support / Resistance
        </h3>
        <p className="text-sm text-tv-muted">
          Harga berada di bawah atau sama dengan support terdekat. Kartu ini bukan sumber TP/CL resmi.
        </p>
      </div>
    );
  }

  const structureRatio = upsideToResistance > 0
    ? upsideToResistance / downsideToSupport
    : null;
  const downsidePct = (downsideToSupport / currentPrice) * 100;
  const upsidePct = (upsideToResistance / currentPrice) * 100;

  let maWarning = null;
  if (ma20 && currentPrice < ma20) {
    const maRisk = ((ma20 - currentPrice) / currentPrice) * 100;
    maWarning = {
      text: `Harga masih di bawah MA20 (${ma20.toFixed(0)}), jarak ke MA20 ${maRisk.toFixed(1)}%.`,
      recom: `Tunggu konfirmasi struktur/trend; jangan membaca support sebagai cut-loss otomatis.`
    };
  }

  return (
    <div className="bg-tv-card border border-tv-green/20 rounded-lg p-5 shadow-1 mb-6">
      <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 mb-4 border-b border-tv-border pb-3">
        <Target className="w-5 h-5 text-tv-green" />
        Konteks Support / Resistance
      </h3>

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-tv-blue/20 bg-tv-blue/5 p-3 text-xs text-tv-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-tv-blue" />
        <span>
          Support/Resistance di kartu ini adalah konteks struktur pasar, <strong className="text-tv-text">bukan TP/CL executable</strong>.
          TP/CL SahamLens dihitung oleh engine trading setup dari struktur + ATR + fraksi harga IDX.
        </span>
      </div>

      <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
        <div className="flex-1 w-full space-y-4">
          <div className="flex items-center justify-between text-sm font-number bg-tv-bg p-3 rounded-lg border border-tv-border">
            <div className="flex flex-col">
              <span className="text-tv-muted text-xs">Harga</span>
              <span className="text-tv-text font-bold">Rp {currentPrice.toLocaleString()}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-tv-muted text-xs flex items-center gap-1">
                <TrendingDown className="w-3 h-3 text-tv-red"/> Support
              </span>
              <span className="text-tv-red font-bold">
                Rp {support.toLocaleString()} <span className="text-[10px]">(-{downsidePct.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-tv-muted text-xs flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-tv-green"/> Resistance
              </span>
              <span className="text-tv-green font-bold">
                Rp {resistance.toLocaleString()} <span className="text-[10px]">({upsidePct >= 0 ? '+' : ''}{upsidePct.toFixed(1)}%)</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-tv-text font-number">
              Rasio ruang struktur: {structureRatio != null ? `1:${structureRatio.toFixed(2)}` : 'N/A'}
            </span>
            <span className="text-[10px] font-semibold px-2 py-1 rounded border border-tv-border text-tv-muted">
              BUKAN RR EKSEKUSI
            </span>
          </div>
        </div>

        {maWarning && (
          <div className="flex-1 w-full bg-tv-red/10 border border-tv-red/20 rounded-lg p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-tv-yellow">
              <AlertCircle className="w-4 h-4" /> Posisi MA20
            </div>
            <div className="text-xs text-tv-text opacity-80">
              {maWarning.text}
            </div>
            <div className="text-[11px] text-tv-muted italic mt-1">
              Catatan: &quot;{maWarning.recom}&quot;
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import React from 'react';

interface PriceRangeSliderProps {
  currentPrice: number;
  lowPrice: number;
  highPrice: number;
  label?: string;
  className?: string;
}

export function PriceRangeSlider({
  currentPrice,
  lowPrice,
  highPrice,
  label = 'Rentang Harga Hari Ini',
  className = '',
}: PriceRangeSliderProps) {
  if (!currentPrice || !lowPrice || !highPrice || highPrice <= lowPrice) {
    return null;
  }

  const range = highPrice - lowPrice;
  const rawPct = ((currentPrice - lowPrice) / range) * 100;
  const clampedPct = Math.max(0, Math.min(100, rawPct));

  return (
    <div className={`p-3 rounded-xl bg-tv-card border border-tv-border select-none ${className}`}>
      {/* Header Info */}
      <div className="flex items-center justify-between text-xs mb-2">
        <span className="font-semibold text-tv-muted">{label}</span>
        <span className="font-number font-bold text-tv-text text-[11px]">
          Posisi: <strong className={clampedPct >= 50 ? 'text-tv-green' : 'text-tv-red'}>{clampedPct.toFixed(0)}%</strong> dari Low
        </span>
      </div>

      {/* Visual Slider Bar Track */}
      <div className="relative h-2 w-full rounded-full bg-tv-hover overflow-visible my-3">
        {/* Active Gradient Fill Track */}
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 opacity-90"
          style={{ width: `${clampedPct}%` }}
        />

        {/* Glowing Live Indicator Dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
          style={{ left: `${clampedPct}%` }}
        >
          <div className="h-4 w-4 rounded-full bg-white border-2 border-tv-blue shadow-[0_0_10px_rgba(59,130,246,0.6)] animate-pulse" />
        </div>
      </div>

      {/* Bottom Range Limits */}
      <div className="flex items-center justify-between text-[11px] font-number text-tv-muted pt-0.5">
        <div>
          <span className="text-[9px] uppercase tracking-wider block opacity-70">Low</span>
          <strong className="text-tv-text">Rp {lowPrice.toLocaleString('id-ID')}</strong>
        </div>

        <div className="text-center">
          <span className="text-[9px] uppercase tracking-wider block opacity-70">Live</span>
          <strong className="text-tv-blue font-bold">Rp {currentPrice.toLocaleString('id-ID')}</strong>
        </div>

        <div className="text-right">
          <span className="text-[9px] uppercase tracking-wider block opacity-70">High</span>
          <strong className="text-tv-text">Rp {highPrice.toLocaleString('id-ID')}</strong>
        </div>
      </div>
    </div>
  );
}

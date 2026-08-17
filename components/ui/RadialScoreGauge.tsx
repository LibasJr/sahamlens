'use client';

import React from 'react';

interface RadialScoreGaugeProps {
  score: number; // 0 to 100
  label?: string;
  category?: 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL' | string;
  size?: number;
  className?: string;
}

export function RadialScoreGauge({
  score,
  label = 'Konsensus Kuantitatif',
  category,
  size = 180,
  className = '',
}: RadialScoreGaugeProps) {
  const clampedScore = Math.max(0, Math.min(100, isNaN(score) ? 0 : score));

  // Gauge calculations for a 180-degree semi-circle (top half)
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius; // Half circle arc length
  const progressOffset = circumference - (clampedScore / 100) * circumference;

  // Angle in radians for indicator dot
  const angleDeg = 180 - (clampedScore / 100) * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  const centerX = size / 2;
  const centerY = size / 2 + 10;
  const dotX = centerX + radius * Math.cos(angleRad);
  const dotY = centerY - radius * Math.sin(angleRad);

  // Dynamic color selection
  const getColor = (s: number) => {
    if (s >= 75) return { text: 'text-emerald-500 dark:text-emerald-400', stroke: '#10B981', glow: 'rgba(16, 185, 129, 0.4)', bg: 'bg-emerald-500/15' };
    if (s >= 60) return { text: 'text-teal-600 dark:text-teal-400', stroke: '#14B8A6', glow: 'rgba(20, 184, 166, 0.3)', bg: 'bg-teal-500/15' };
    if (s >= 45) return { text: 'text-amber-600 dark:text-amber-400', stroke: '#F59E0B', glow: 'rgba(245, 158, 11, 0.3)', bg: 'bg-amber-500/15' };
    if (s >= 30) return { text: 'text-orange-600 dark:text-orange-400', stroke: '#F97316', glow: 'rgba(249, 115, 22, 0.3)', bg: 'bg-orange-500/15' };
    return { text: 'text-rose-600 dark:text-rose-400', stroke: '#F43F5E', glow: 'rgba(244, 63, 94, 0.4)', bg: 'bg-rose-500/15' };
  };

  const theme = getColor(clampedScore);
  const height = size / 2 + 35;

  return (
    <div className={`flex flex-col items-center justify-center select-none ${className}`}>
      <div className="relative" style={{ width: size, height }}>
        <svg
          width={size}
          height={height}
          viewBox={`0 0 ${size} ${height}`}
          className="overflow-visible"
        >
          <defs>
            {/* Linear Gradient for Progress Arc */}
            <linearGradient id="scoreGaugeGrad" x1="0%" y1="100%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F43F5E" />
              <stop offset="35%" stopColor="#F59E0B" />
              <stop offset="65%" stopColor="#14B8A6" />
              <stop offset="100%" stopColor="#10B981" />
            </linearGradient>

            {/* Glowing filter */}
            <filter id="gaugeGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background Arc Track */}
          <path
            d={`M ${strokeWidth / 2} ${centerY} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${centerY}`}
            fill="none"
            stroke="currentColor"
            className="text-tv-border"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Value Progress Arc */}
          <path
            d={`M ${strokeWidth / 2} ${centerY} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${centerY}`}
            fill="none"
            stroke="url(#scoreGaugeGrad)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={progressOffset}
            style={{
              transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />

          {/* Pulsing Pointer Tip Dot */}
          <circle
            cx={dotX}
            cy={dotY}
            r={strokeWidth / 2 + 2}
            fill="#FFFFFF"
            stroke={theme.stroke}
            strokeWidth={3}
            filter="url(#gaugeGlow)"
            style={{
              transition: 'cx 0.8s cubic-bezier(0.16, 1, 0.3, 1), cy 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        </svg>

        {/* Center Score Readout */}
        <div className="absolute inset-x-0 bottom-1 flex flex-col items-center justify-center text-center">
          <div className="flex items-baseline justify-center gap-0.5">
            <span className={`font-heading text-3xl sm:text-4xl font-black font-number tracking-tight ${theme.text}`}>
              {Math.round(clampedScore)}
            </span>
            <span className="text-xs font-bold text-tv-muted font-number">/100</span>
          </div>

          {category && (
            <div className={`mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${theme.bg} ${theme.text} border-current/30 shadow-sm`}>
              {category}
            </div>
          )}
        </div>
      </div>

      {/* Scale Limits Legend */}
      <div className="flex justify-between w-full px-2 text-[10px] font-bold text-tv-muted font-number mt-0.5">
        <span className="text-rose-500 dark:text-rose-400/80">0 Bearish</span>
        <span className="text-amber-500 dark:text-amber-400/80">50 Netral</span>
        <span className="text-emerald-600 dark:text-emerald-400/80">100 Bullish</span>
      </div>

      {label && (
        <span className="text-[11px] text-tv-muted font-medium mt-1">
          {label}
        </span>
      )}
    </div>
  );
}

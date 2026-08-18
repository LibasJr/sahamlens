'use client';

import React, { useId } from 'react';

interface RadialScoreGaugeProps {
  score: number; // 0 to 100
  label?: string;
  category?: 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL' | string;
  size?: number;
  className?: string;
}

// Tangga warna yang SAMA dengan MarketRegimePanel, supaya dua pengukur skor di aplikasi
// ini tidak memakai dua bahasa warna yang berbeda: merah - warning - kuning - hijau -
// hijau paling pekat. Arah "makin pekat = makin kuat" berlaku di kedua tema (terang
// #116F2E -> #0F5E27, gelap #23C483 -> #1BAD72), jadi maknanya tidak berbalik.
//
// Palet Tailwind mentah yang dipakai sebelumnya (emerald/teal/amber/orange/rose) adalah
// nilai yang dirancang untuk latar gelap dan tidak punya pasangan terang. Terukur di
// kartu putih: text-amber-500 pada legenda 2,15:1 dan text-emerald-500 pada angka skor
// 2,54:1 - dua-duanya gagal, dan angka skor itu isi utama komponennya.
const SCORE_TONES = [
  { min: 75, text: 'text-tv-greenHover', bg: 'bg-tv-greenHover/15', token: '--lens-green-hover' },
  { min: 60, text: 'text-tv-green', bg: 'bg-tv-green/15', token: '--lens-green' },
  { min: 45, text: 'text-tv-yellow', bg: 'bg-tv-yellow/15', token: '--lens-yellow' },
  { min: 30, text: 'text-tv-warning', bg: 'bg-tv-warning/15', token: '--lens-warning' },
  { min: -Infinity, text: 'text-tv-red', bg: 'bg-tv-red/15', token: '--lens-red' },
] as const;

function toneFor(score: number) {
  return SCORE_TONES.find((tone) => score >= tone.min) ?? SCORE_TONES[SCORE_TONES.length - 1];
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

  const theme = toneFor(clampedScore);
  const height = size / 2 + 35;
  // id SVG bersifat GLOBAL di dokumen. Dua gauge dalam satu halaman menghasilkan id
  // kembar dan setiap url(#...) akan menunjuk ke definisi yang pertama saja.
  const uid = useId().replace(/:/g, '');
  const gradientId = `lens-gauge-grad-${uid}`;
  const glowId = `lens-gauge-glow-${uid}`;

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
            {/* stopColor lewat `style`, bukan atribut: atribut presentasi SVG diurai
                sebagai nilai atribut - bukan CSS - jadi var(--lens-*) tidak resolve. */}
            <linearGradient id={gradientId} x1="0%" y1="100%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: 'rgb(var(--lens-red))' }} />
              <stop offset="35%" style={{ stopColor: 'rgb(var(--lens-warning))' }} />
              <stop offset="65%" style={{ stopColor: 'rgb(var(--lens-yellow))' }} />
              <stop offset="100%" style={{ stopColor: 'rgb(var(--lens-green))' }} />
            </linearGradient>

            {/* Glowing filter */}
            <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
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
            stroke={`url(#${gradientId})`}
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
            strokeWidth={3}
            filter={`url(#${glowId})`}
            style={{
              // Isinya warna kartu, bukan putih mati: knob dibaca sebagai lubang yang
              // dilubangi pada busur, dan itu kontras di kedua tema. Putih mati hilang
              // di atas kartu putih tema terang.
              fill: 'rgb(var(--lens-card))',
              stroke: `rgb(var(${theme.token}))`,
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
            <div className={`lens-chip mt-1 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider border ${theme.bg} ${theme.text} border-current/30 shadow-sm`}>
              {category}
            </div>
          )}
        </div>
      </div>

      {/* Scale Limits Legend */}
      <div className="flex justify-between w-full px-2 text-[10px] font-bold text-tv-muted font-number mt-0.5">
        <span className="text-tv-red">0 Bearish</span>
        <span className="text-tv-yellow">50 Netral</span>
        <span className="text-tv-green">100 Bullish</span>
      </div>

      {label && (
        <span className="text-[11px] text-tv-muted font-medium mt-1">
          {label}
        </span>
      )}
    </div>
  );
}

'use client';

import React from 'react';

interface SectorIllustrationProps {
  sector?: string;
  ticker?: string;
  className?: string;
}

export default function SectorIllustration3D({ sector = '', ticker = '', className = '' }: SectorIllustrationProps) {
  const sym = ticker.toUpperCase().replace('.JK', '');
  const sec = sector.toLowerCase();

  // 1. BANK / FINANCIAL SERVICES (BBCA, BBRI, BMRI, BBNI)
  if (sec.includes('finan') || sec.includes('bank') || ['BBCA', 'BBRI', 'BMRI', 'BBNI', 'BRIS', 'BDMN', 'BBTN'].includes(sym)) {
    return (
      <div className={`relative flex items-center justify-center ${className}`}>
        <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-[0_10px_20px_rgba(59,130,246,0.35)]" fill="none">
          <defs>
            <linearGradient id="bankGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="50%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#1e1b4b" />
            </linearGradient>
            <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="100%" stopColor="#ca8a04" />
            </linearGradient>
            <linearGradient id="glassRoof" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.4" />
            </linearGradient>
          </defs>

          {/* Background Glow */}
          <circle cx="80" cy="80" r="65" fill="#1e3a8a" fillOpacity="0.25" filter="blur(15px)" />

          {/* 3D Isometric Skyscraper Left */}
          <path d="M 40 70 L 65 55 L 65 125 L 40 140 Z" fill="#1e293b" />
          <path d="M 65 55 L 85 65 L 85 135 L 65 125 Z" fill="#0f172a" />
          <path d="M 40 70 L 60 60 L 85 65 L 65 75 Z" fill="#334155" />

          {/* Skyscraper Windows */}
          <line x1="48" y1="80" x2="48" y2="125" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="3 4" />
          <line x1="56" y1="75" x2="56" y2="120" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="3 4" />
          <line x1="72" y1="75" x2="72" y2="125" stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="3 4" />

          {/* 3D Main Bank Headquarters (Center) */}
          <path d="M 65 45 L 110 20 L 110 115 L 65 138 Z" fill="url(#bankGrad)" />
          <path d="M 110 20 L 140 38 L 140 128 L 110 115 Z" fill="#1e1b4b" />
          <path d="M 65 45 L 95 30 L 140 38 L 110 52 Z" fill="url(#glassRoof)" />

          {/* Glowing Windows on Main Tower */}
          <rect x="75" y="55" width="6" height="8" rx="1" fill="#93c5fd" opacity="0.9" />
          <rect x="87" y="48" width="6" height="8" rx="1" fill="#93c5fd" opacity="0.9" />
          <rect x="99" y="42" width="6" height="8" rx="1" fill="#93c5fd" opacity="0.9" />

          <rect x="75" y="70" width="6" height="8" rx="1" fill="#93c5fd" opacity="0.9" />
          <rect x="87" y="63" width="6" height="8" rx="1" fill="#93c5fd" opacity="0.9" />
          <rect x="99" y="57" width="6" height="8" rx="1" fill="#93c5fd" opacity="0.9" />

          <rect x="75" y="85" width="6" height="8" rx="1" fill="#93c5fd" opacity="0.9" />
          <rect x="87" y="78" width="6" height="8" rx="1" fill="#93c5fd" opacity="0.9" />
          <rect x="99" y="72" width="6" height="8" rx="1" fill="#93c5fd" opacity="0.9" />

          {/* 3D Floating Digital Vault / Coin Base */}
          <ellipse cx="60" cy="120" rx="28" ry="12" fill="#0f172a" />
          <ellipse cx="60" cy="115" rx="28" ry="12" fill="url(#bankGrad)" />
          <ellipse cx="60" cy="115" rx="22" ry="8" fill="#1e40af" />

          {/* Giant 3D Golden Coins */}
          <g transform="translate(18, 90)">
            <ellipse cx="16" cy="16" rx="14" ry="8" fill="url(#goldGrad)" />
            <path d="M 2 16 L 2 22 C 2 26, 30 26, 30 22 L 30 16 Z" fill="#a16207" />
            <ellipse cx="16" cy="16" rx="11" ry="5" fill="#fef08a" />
            <text x="13" y="19" fill="#854d0e" fontSize="9" fontWeight="bold" fontFamily="monospace">$</text>
          </g>

          <g transform="translate(38, 108)">
            <ellipse cx="16" cy="16" rx="12" ry="6" fill="url(#goldGrad)" />
            <path d="M 4 16 L 4 21 C 4 24, 28 24, 28 21 L 28 16 Z" fill="#a16207" />
            <ellipse cx="16" cy="16" rx="9" ry="4" fill="#fef08a" />
            <text x="14" y="19" fill="#854d0e" fontSize="8" fontWeight="bold" fontFamily="monospace">Rp</text>
          </g>

          {/* Star Sparkles */}
          <path d="M 125 15 L 128 22 L 135 25 L 128 28 L 125 35 L 122 28 L 115 25 L 122 22 Z" fill="#67e8f9" />
          <path d="M 35 45 L 37 49 L 41 51 L 37 53 L 35 57 L 33 53 L 29 51 L 33 49 Z" fill="#fde047" />
        </svg>
      </div>
    );
  }

  // 2. MINING, COAL, GOLD & COMMODITIES (ITMG, PTBA, ADRO, ANTM, MDKA, INCO)
  if (sec.includes('energy') || sec.includes('basic') || sec.includes('min') || ['ITMG', 'PTBA', 'ADRO', 'ANTM', 'MDKA', 'INCO', 'MBMA', 'AMMN', 'BUMI'].includes(sym)) {
    return (
      <div className={`relative flex items-center justify-center ${className}`}>
        <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-[0_10px_20px_rgba(234,179,8,0.35)]" fill="none">
          <defs>
            <linearGradient id="goldBarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="100%" stopColor="#854d0e" />
            </linearGradient>
            <linearGradient id="coalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#475569" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
            <linearGradient id="gemGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#67e8f9" />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>
          </defs>

          {/* Background Glow */}
          <circle cx="80" cy="80" r="65" fill="#ca8a04" fillOpacity="0.2" filter="blur(15px)" />

          {/* Mountain / Mining Quarry Silhouette */}
          <path d="M 15 135 L 55 60 L 95 100 L 145 40 L 155 135 Z" fill="url(#coalGrad)" />
          <path d="M 60 70 L 105 135 L 30 135 Z" fill="#1e293b" opacity="0.6" />

          {/* 3D Mining Cart / Excavator Bucket */}
          <path d="M 45 95 L 115 95 L 105 130 L 55 130 Z" fill="#b45309" />
          <path d="M 45 95 L 60 80 L 130 80 L 115 95 Z" fill="#f59e0b" />
          <path d="M 115 95 L 130 80 L 120 115 L 105 130 Z" fill="#92400e" />

          {/* Wheels */}
          <circle cx="65" cy="135" r="9" fill="#334155" />
          <circle cx="65" cy="135" r="4" fill="#94a3b8" />
          <circle cx="95" cy="135" r="9" fill="#334155" />
          <circle cx="95" cy="135" r="4" fill="#94a3b8" />

          {/* Mountain of 3D Gold Bars & Diamonds inside cart */}
          <g transform="translate(60, 55)">
            {/* Gold Bar 1 */}
            <path d="M 5 25 L 35 25 L 30 35 L 0 35 Z" fill="url(#goldBarGrad)" />
            <path d="M 35 25 L 42 20 L 37 30 L 30 35 Z" fill="#a16207" />
            {/* Gold Bar 2 */}
            <path d="M 15 15 L 45 15 L 40 25 L 10 25 Z" fill="url(#goldBarGrad)" />
            {/* Diamond Crystal */}
            <polygon points="25,0 35,12 25,24 15,12" fill="url(#gemGrad)" />
          </g>

          {/* Pundi Kas / Sultan Dividen Gold Coins Overflowing */}
          <ellipse cx="40" cy="120" rx="10" ry="5" fill="url(#goldBarGrad)" />
          <ellipse cx="120" cy="125" rx="12" ry="6" fill="url(#goldBarGrad)" />

          {/* Sparkles */}
          <path d="M 85 20 L 88 28 L 96 31 L 88 34 L 85 42 L 82 34 L 74 31 L 82 28 Z" fill="#fef08a" />
          <path d="M 130 45 L 132 49 L 136 51 L 132 53 L 130 57 L 128 53 L 124 51 L 128 49 Z" fill="#67e8f9" />
        </svg>
      </div>
    );
  }

  // 3. TELECOMMUNICATION & TECHNOLOGY (TLKM, ISAT, EXCL, GOTO, BUKA)
  if (sec.includes('tech') || sec.includes('comm') || ['TLKM', 'ISAT', 'EXCL', 'GOTO', 'BUKA', 'MTDL', 'EMTK'].includes(sym)) {
    return (
      <div className={`relative flex items-center justify-center ${className}`}>
        <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-[0_10px_20px_rgba(168,85,247,0.35)]" fill="none">
          <defs>
            <linearGradient id="techGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c084fc" />
              <stop offset="50%" stopColor="#7e22ce" />
              <stop offset="100%" stopColor="#3b0764" />
            </linearGradient>
            <linearGradient id="neonCyan" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>

          {/* Background Glow */}
          <circle cx="80" cy="80" r="65" fill="#7e22ce" fillOpacity="0.25" filter="blur(15px)" />

          {/* 3D Satellite Dish / Tower Base */}
          <path d="M 50 140 L 110 140 L 95 90 L 65 90 Z" fill="#1e1b4b" stroke="#7e22ce" strokeWidth="1.5" />
          <line x1="60" y1="140" x2="75" y2="90" stroke="#a855f7" strokeWidth="2" />
          <line x1="100" y1="140" x2="85" y2="90" stroke="#a855f7" strokeWidth="2" />
          <line x1="80" y1="140" x2="80" y2="90" stroke="#c084fc" strokeWidth="2.5" />

          {/* Lattice Crosses */}
          <line x1="65" y1="125" x2="95" y2="105" stroke="#9333ea" strokeWidth="1" />
          <line x1="95" y1="125" x2="65" y2="105" stroke="#9333ea" strokeWidth="1" />

          {/* Main 5G Transmitter Head */}
          <circle cx="80" cy="65" r="16" fill="url(#techGrad)" stroke="#e9d5ff" strokeWidth="2" />
          <circle cx="80" cy="65" r="8" fill="#38bdf8" />
          <circle cx="80" cy="65" r="3" fill="#ffffff" />

          {/* Holographic Signal Waves */}
          <path d="M 55 45 A 35 35 0 0 1 105 45" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="6 4" />
          <path d="M 40 32 A 55 55 0 0 1 120 32" stroke="#c084fc" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M 28 20 A 75 75 0 0 1 132 20" stroke="#67e8f9" strokeWidth="2" strokeLinecap="round" strokeDasharray="8 6" />

          {/* Floating Data Bits / Icons */}
          <rect x="25" y="60" width="14" height="14" rx="3" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
          <text x="28" y="71" fill="#38bdf8" fontSize="8" fontWeight="bold" fontFamily="monospace">5G</text>

          <rect x="120" y="70" width="16" height="16" rx="4" fill="#1e293b" stroke="#c084fc" strokeWidth="1.5" />
          <text x="123" y="82" fill="#c084fc" fontSize="8" fontWeight="bold" fontFamily="monospace">AI</text>
        </svg>
      </div>
    );
  }

  // 4. CONSUMER GOODS, RETAIL & FMCG (UNVR, ICBP, INDF, MYOR, AMRT, MIDI)
  if (sec.includes('consum') || ['UNVR', 'ICBP', 'INDF', 'MYOR', 'AMRT', 'MIDI', 'GGRM', 'HMSP', 'KLBF', 'SIDO'].includes(sym)) {
    return (
      <div className={`relative flex items-center justify-center ${className}`}>
        <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-[0_10px_20px_rgba(236,72,153,0.35)]" fill="none">
          <defs>
            <linearGradient id="cartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f472b6" />
              <stop offset="50%" stopColor="#db2777" />
              <stop offset="100%" stopColor="#831843" />
            </linearGradient>
            <linearGradient id="boxGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>

          {/* Background Glow */}
          <circle cx="80" cy="80" r="65" fill="#db2777" fillOpacity="0.2" filter="blur(15px)" />

          {/* 3D Shopping Cart Body */}
          <path d="M 30 50 L 45 50 L 60 110 L 125 110 L 138 65 L 50 65" stroke="url(#cartGrad)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {/* Cart Grid */}
          <line x1="68" y1="65" x2="75" y2="110" stroke="#f472b6" strokeWidth="2" />
          <line x1="88" y1="65" x2="92" y2="110" stroke="#f472b6" strokeWidth="2" />
          <line x1="108" y1="65" x2="110" y2="110" stroke="#f472b6" strokeWidth="2" />
          <line x1="55" y1="85" x2="132" y2="85" stroke="#f472b6" strokeWidth="2" />

          {/* Cart Wheels */}
          <circle cx="70" cy="125" r="8" fill="#334155" stroke="#ec4899" strokeWidth="2" />
          <circle cx="118" cy="125" r="8" fill="#334155" stroke="#ec4899" strokeWidth="2" />

          {/* Goods / Packages Inside Cart */}
          {/* Box 1 (Instant Noodle / Package) */}
          <rect x="62" y="38" width="24" height="24" rx="4" fill="url(#boxGrad)" stroke="#b45309" strokeWidth="1.5" transform="rotate(-10 62 38)" />
          <text x="66" y="54" fill="#854d0e" fontSize="8" fontWeight="black" fontFamily="sans-serif">FMCG</text>

          {/* Box 2 (Beverage / Bottle) */}
          <rect x="90" y="30" width="18" height="30" rx="3" fill="#38bdf8" stroke="#0284c7" strokeWidth="1.5" transform="rotate(12 90 30)" />
          <rect x="94" y="24" width="10" height="6" rx="2" fill="#e0f2fe" />

          {/* Golden Crown on top of consumer brand */}
          <path d="M 80 10 L 86 20 L 98 12 L 94 28 L 66 28 L 62 12 L 74 20 Z" fill="#fbbf24" stroke="#d97706" strokeWidth="1" />
        </svg>
      </div>
    );
  }

  // 5. DEFAULT / INFRASTRUCTURE / INDUSTRIAL (ASII, BREN, JSMR, PGAS, etc.)
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-[0_10px_20px_rgba(16,185,129,0.35)]" fill="none">
        <defs>
          <linearGradient id="greenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="50%" stopColor="#059669" />
            <stop offset="100%" stopColor="#064e3b" />
          </linearGradient>
        </defs>

        {/* Background Glow */}
        <circle cx="80" cy="80" r="65" fill="#059669" fillOpacity="0.25" filter="blur(15px)" />

        {/* 3D Industrial Gear */}
        <g transform="translate(80, 80) rotate(15)">
          <circle cx="0" cy="0" r="45" fill="#1e293b" stroke="#10b981" strokeWidth="3" />
          <circle cx="0" cy="0" r="22" fill="#047857" />
          <circle cx="0" cy="0" r="10" fill="#0f172a" />
          {/* Cog teeth */}
          <rect x="-6" y="-52" width="12" height="12" fill="#10b981" rx="2" />
          <rect x="-6" y="40" width="12" height="12" fill="#10b981" rx="2" />
          <rect x="-52" y="-6" width="12" height="12" fill="#10b981" rx="2" />
          <rect x="40" y="-6" width="12" height="12" fill="#10b981" rx="2" />
        </g>

        {/* Green Energy Lightning Bolt */}
        <path d="M 85 20 L 60 75 L 82 75 L 72 135 L 105 65 L 82 65 Z" fill="#34d399" stroke="#ffffff" strokeWidth="1.5" />

        {/* Sparkles */}
        <path d="M 125 35 L 128 42 L 135 45 L 128 48 L 125 55 L 122 48 L 115 45 L 122 42 Z" fill="#6ee7b7" />
      </svg>
    </div>
  );
}

export interface Card3DTheme {
  id: string;
  name: string;
  sectorLabel: string;
  badgeLabel: string;
  // Background & Borders
  bgBase: string;
  outerBorder: string;
  specularLine: string;
  cardBorder: string;
  cardBg: string;
  glassTileBg: string;
  // Accents & Texts
  accentText: string;
  accentTextSecondary: string;
  accentBg: string;
  accentBorder: string;
  accentGradient: string;
  accentShadow: string;
  buttonGrad: string;
  // Ambient Orbs
  orbTop: string;
  orbMid: string;
  orbBottom: string;
  gridDotColor: string;
}

export const CARD_3D_THEMES: Record<string, Card3DTheme> = {
  // 1. OBSIDIAN CYBER NEON (High Contrast AMOLED Black + Mint Green + Cyan Laser)
  'obsidian-cyber': {
    id: 'obsidian-cyber',
    name: '⚡ Obsidian Cyber Neon (High Contrast)',
    sectorLabel: 'Quant Cyberpunk',
    badgeLabel: 'Obsidian Neon 3D',
    bgBase: '#000308',
    outerBorder: '#003322',
    specularLine: 'via-emerald-400/95',
    cardBorder: 'border-emerald-500/40',
    cardBg: 'from-[#02130d]/95 to-[#000805]/95',
    glassTileBg: 'from-[#031c12] to-[#010a06]',
    accentText: 'text-emerald-300',
    accentTextSecondary: 'text-cyan-300',
    accentBg: 'bg-emerald-500/25',
    accentBorder: 'border-emerald-400/50',
    accentGradient: 'from-emerald-400 via-teal-400 to-cyan-500',
    accentShadow: 'shadow-[0_0_35px_rgba(16,185,129,0.6)]',
    buttonGrad: 'from-emerald-500 via-teal-500 to-cyan-600',
    orbTop: 'from-emerald-500/40 via-teal-600/30',
    orbMid: 'bg-cyan-500/20',
    orbBottom: 'bg-emerald-700/30',
    gridDotColor: '#10b981',
  },

  // 2. IMPERIAL GOLD & WEALTH (Ultra Luxury Gold + Titanium Charcoal)
  'imperial-gold': {
    id: 'imperial-gold',
    name: '👑 Imperial Gold & Wealth (Luxury)',
    sectorLabel: 'Private Wealth & Asset',
    badgeLabel: 'Gold Luxury 3D',
    bgBase: '#080702',
    outerBorder: '#2e2405',
    specularLine: 'via-amber-300/95',
    cardBorder: 'border-amber-400/40',
    cardBg: 'from-[#231b05]/95 to-[#0e0a01]/95',
    glassTileBg: 'from-[#1e1704] to-[#0c0801]',
    accentText: 'text-amber-300',
    accentTextSecondary: 'text-yellow-200',
    accentBg: 'bg-amber-500/25',
    accentBorder: 'border-amber-400/50',
    accentGradient: 'from-yellow-300 via-amber-400 to-orange-600',
    accentShadow: 'shadow-[0_0_35px_rgba(245,158,11,0.6)]',
    buttonGrad: 'from-yellow-400 via-amber-500 to-orange-600',
    orbTop: 'from-yellow-400/40 via-amber-600/30',
    orbMid: 'bg-orange-500/20',
    orbBottom: 'bg-yellow-700/25',
    gridDotColor: '#f59e0b',
  },

  // 3. TOKYO QUANTUM VIOLET (Electric Violet + Neon Magenta + Ice Cyan)
  'tokyo-neon': {
    id: 'tokyo-neon',
    name: '🔮 Tokyo Quantum Violet (Tech/Crypto)',
    sectorLabel: 'Technology & Digital Alpha',
    badgeLabel: 'Tokyo Violet 3D',
    bgBase: '#060112',
    outerBorder: '#260a47',
    specularLine: 'via-fuchsia-400/95',
    cardBorder: 'border-purple-500/40',
    cardBg: 'from-[#230942]/95 to-[#0d021c]/95',
    glassTileBg: 'from-[#1e0739] to-[#0a0117]',
    accentText: 'text-fuchsia-300',
    accentTextSecondary: 'text-purple-300',
    accentBg: 'bg-fuchsia-500/25',
    accentBorder: 'border-fuchsia-400/50',
    accentGradient: 'from-fuchsia-400 via-purple-500 to-indigo-600',
    accentShadow: 'shadow-[0_0_35px_rgba(217,70,239,0.6)]',
    buttonGrad: 'from-fuchsia-500 via-purple-600 to-indigo-600',
    orbTop: 'from-fuchsia-500/40 via-purple-600/30',
    orbMid: 'bg-cyan-500/20',
    orbBottom: 'bg-pink-700/25',
    gridDotColor: '#e879f9',
  },

  // 4. BULLISH EMERALD MATRIX (Pure Profit Green + Bright Mint)
  'emerald-infra': {
    id: 'emerald-infra',
    name: '🟢 Bullish Emerald Matrix (High Growth)',
    sectorLabel: 'Infrastructure & High Growth',
    badgeLabel: 'Emerald Alpha 3D',
    bgBase: '#010c06',
    outerBorder: '#062e19',
    specularLine: 'via-emerald-300/95',
    cardBorder: 'border-emerald-400/40',
    cardBg: 'from-[#072c1c]/95 to-[#02130b]/95',
    glassTileBg: 'from-[#062417] to-[#020e07]',
    accentText: 'text-emerald-400',
    accentTextSecondary: 'text-teal-300',
    accentBg: 'bg-emerald-500/25',
    accentBorder: 'border-emerald-400/50',
    accentGradient: 'from-emerald-300 via-teal-500 to-cyan-600',
    accentShadow: 'shadow-[0_0_35px_rgba(16,185,129,0.6)]',
    buttonGrad: 'from-emerald-400 via-teal-500 to-cyan-600',
    orbTop: 'from-emerald-400/40 via-teal-600/30',
    orbMid: 'bg-cyan-500/20',
    orbBottom: 'bg-emerald-700/25',
    gridDotColor: '#34d399',
  },

  // 5. ROYAL SAPPHIRE & TITANIUM (Banking & Bluechips)
  'sapphire-bank': {
    id: 'sapphire-bank',
    name: '💎 Royal Sapphire (Banking/Bluechip)',
    sectorLabel: 'Financial & Bluechip',
    badgeLabel: 'Financial Blue 3D',
    bgBase: '#010614',
    outerBorder: '#0b1e47',
    specularLine: 'via-cyan-300/95',
    cardBorder: 'border-cyan-500/40',
    cardBg: 'from-[#0b224d]/95 to-[#040e24]/95',
    glassTileBg: 'from-[#091b3d] to-[#030919]',
    accentText: 'text-cyan-300',
    accentTextSecondary: 'text-blue-200',
    accentBg: 'bg-cyan-500/25',
    accentBorder: 'border-cyan-400/50',
    accentGradient: 'from-cyan-300 via-blue-500 to-indigo-700',
    accentShadow: 'shadow-[0_0_35px_rgba(6,182,212,0.6)]',
    buttonGrad: 'from-cyan-400 via-blue-500 to-indigo-600',
    orbTop: 'from-cyan-400/40 via-blue-600/30',
    orbMid: 'bg-emerald-500/20',
    orbBottom: 'bg-indigo-700/30',
    gridDotColor: '#38bdf8',
  },

  // 6. EMBER MAGMA & SOLAR GOLD (Energy, Mining & Commodities)
  'solar-mining': {
    id: 'solar-mining',
    name: '🌋 Ember Magma (Energy/Mining)',
    sectorLabel: 'Energy, Mining & Metals',
    badgeLabel: 'Magma Gold 3D',
    bgBase: '#0c0401',
    outerBorder: '#331204',
    specularLine: 'via-amber-400/95',
    cardBorder: 'border-orange-500/40',
    cardBg: 'from-[#2e1305]/95 to-[#120601]/95',
    glassTileBg: 'from-[#260e03] to-[#0d0400]',
    accentText: 'text-amber-400',
    accentTextSecondary: 'text-yellow-200',
    accentBg: 'bg-amber-500/25',
    accentBorder: 'border-amber-400/50',
    accentGradient: 'from-amber-300 via-orange-500 to-red-700',
    accentShadow: 'shadow-[0_0_35px_rgba(245,158,11,0.6)]',
    buttonGrad: 'from-amber-400 via-orange-500 to-red-600',
    orbTop: 'from-amber-400/40 via-orange-600/30',
    orbMid: 'bg-yellow-500/20',
    orbBottom: 'bg-red-700/25',
    gridDotColor: '#f97316',
  },

  // 7. CHAMPAGNE ROSE & MAGENTA (Consumer & Retail)
  'rose-fmcg': {
    id: 'rose-fmcg',
    name: '🌸 Champagne Rose (Consumer/Retail)',
    sectorLabel: 'Consumer & FMCG',
    badgeLabel: 'Consumer Rose 3D',
    bgBase: '#0d0108',
    outerBorder: '#36061c',
    specularLine: 'via-pink-300/95',
    cardBorder: 'border-pink-500/40',
    cardBg: 'from-[#2f081b]/95 to-[#13020b]/95',
    glassTileBg: 'from-[#260515] to-[#0d0107]',
    accentText: 'text-pink-300',
    accentTextSecondary: 'text-rose-200',
    accentBg: 'bg-pink-500/25',
    accentBorder: 'border-pink-400/50',
    accentGradient: 'from-pink-300 via-rose-500 to-amber-600',
    accentShadow: 'shadow-[0_0_35px_rgba(244,63,94,0.6)]',
    buttonGrad: 'from-pink-400 via-rose-500 to-amber-600',
    orbTop: 'from-pink-400/40 via-rose-600/30',
    orbMid: 'bg-amber-500/20',
    orbBottom: 'bg-purple-700/25',
    gridDotColor: '#f472b6',
  },

  // 8. RUBY CRIMSON & BIO TEAL (Healthcare & Pharma)
  'ruby-health': {
    id: 'ruby-health',
    name: '🩸 Ruby Crimson (Healthcare)',
    sectorLabel: 'Healthcare & Biotech',
    badgeLabel: 'Bio Ruby 3D',
    bgBase: '#0c0103',
    outerBorder: '#33050b',
    specularLine: 'via-rose-400/95',
    cardBorder: 'border-rose-500/40',
    cardBg: 'from-[#2e060d]/95 to-[#120104]/95',
    glassTileBg: 'from-[#26040a] to-[#0c0103]',
    accentText: 'text-rose-300',
    accentTextSecondary: 'text-pink-200',
    accentBg: 'bg-rose-500/25',
    accentBorder: 'border-rose-400/50',
    accentGradient: 'from-rose-300 via-red-500 to-teal-500',
    accentShadow: 'shadow-[0_0_35px_rgba(244,63,94,0.6)]',
    buttonGrad: 'from-rose-400 via-red-500 to-teal-600',
    orbTop: 'from-rose-400/40 via-red-600/30',
    orbMid: 'bg-teal-500/20',
    orbBottom: 'bg-indigo-700/25',
    gridDotColor: '#fb7185',
  },
};

export const THEME_KEYS = Object.keys(CARD_3D_THEMES);

/**
 * Otomatis mencocokkan tema 3D warna, pencahayaan, dan specular bevel
 * berdasarkan sektor / industri / kode saham emiten.
 */
export function getSector3DTheme(sector?: string, industry?: string, ticker?: string): Card3DTheme {
  const sym = (ticker || '').toUpperCase().replace('.JK', '');
  const haystack = `${sector || ''} ${industry || ''}`.toLowerCase();

  // 1. Bank & Financial
  if (
    haystack.includes('finan') ||
    haystack.includes('bank') ||
    ['BBCA', 'BBRI', 'BMRI', 'BBNI', 'BRIS', 'BDMN', 'BBTN', 'ARTO', 'BNGA', 'BTPS', 'NISP', 'MEGA'].includes(sym)
  ) {
    return CARD_3D_THEMES['sapphire-bank'];
  }

  // 2. Property & Industrial Estate (DMAS, BSDE, CTRA, PWON, SMRA, KIJA, SSIA)
  if (
    haystack.includes('real estate') ||
    haystack.includes('property') ||
    haystack.includes('estate') ||
    ['DMAS', 'BSDE', 'CTRA', 'PWON', 'SMRA', 'ASRI', 'DILD', 'KIJA', 'SSIA', 'BEST', 'APLN', 'LPKR'].includes(sym)
  ) {
    return CARD_3D_THEMES['imperial-gold'];
  }

  // 3. Energy, Mining & Commodities
  if (
    haystack.includes('energy') ||
    haystack.includes('basic') ||
    haystack.includes('min') ||
    haystack.includes('coal') ||
    haystack.includes('oil') ||
    ['ITMG', 'PTBA', 'ADRO', 'ANTM', 'MDKA', 'INCO', 'MBMA', 'AMMN', 'BUMI', 'MEDC', 'AKRA', 'PGAS', 'HRUM', 'INDY'].includes(sym)
  ) {
    return CARD_3D_THEMES['solar-mining'];
  }

  // 4. Tech & Telco
  if (
    haystack.includes('tech') ||
    haystack.includes('comm') ||
    haystack.includes('software') ||
    ['TLKM', 'ISAT', 'EXCL', 'GOTO', 'BUKA', 'MTDL', 'EMTK', 'SCMA', 'TOWR', 'TBIG', 'WIFI'].includes(sym)
  ) {
    return CARD_3D_THEMES['tokyo-neon'];
  }

  // 5. Consumer, FMCG & Retail
  if (
    haystack.includes('consum') ||
    haystack.includes('food') ||
    haystack.includes('beverage') ||
    ['UNVR', 'ICBP', 'INDF', 'MYOR', 'AMRT', 'MIDI', 'GGRM', 'HMSP', 'ACES', 'MAPI', 'CPIN', 'JPFA', 'CLEO'].includes(sym)
  ) {
    return CARD_3D_THEMES['rose-fmcg'];
  }

  // 6. Healthcare & Pharma
  if (
    haystack.includes('health') ||
    haystack.includes('pharma') ||
    ['KLBF', 'SIDO', 'HEAL', 'MIKA', 'SILO', 'TSPC', 'PRDA', 'KAEF', 'IRRA'].includes(sym)
  ) {
    return CARD_3D_THEMES['ruby-health'];
  }

  // 7. Infrastructure, Industrial & Green Energy (Default: Obsidian Cyber / Emerald Matrix)
  if (haystack.includes('infra') || haystack.includes('industr') || ['ASII', 'BREN', 'JSMR', 'AUTO'].includes(sym)) {
    return CARD_3D_THEMES['emerald-infra'];
  }

  // Fallback to High-Contrast Obsidian Cyber
  return CARD_3D_THEMES['obsidian-cyber'];
}

export function getRandomTheme(): Card3DTheme {
  const keys = THEME_KEYS;
  const randomIndex = Math.floor(Math.random() * keys.length);
  return CARD_3D_THEMES[keys[randomIndex]];
}

export function getThemeById(themeId?: string): Card3DTheme {
  if (themeId && CARD_3D_THEMES[themeId]) {
    return CARD_3D_THEMES[themeId];
  }
  return CARD_3D_THEMES['obsidian-cyber'];
}

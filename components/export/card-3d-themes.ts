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
    bgBase: '#000409',
    outerBorder: '#003824',
    specularLine: 'via-emerald-400/95',
    cardBorder: 'border-emerald-500/40',
    cardBg: 'from-[#021810]/95 to-[#000a06]/95',
    glassTileBg: 'from-[#032014] to-[#010c08]',
    accentText: 'text-emerald-300',
    accentTextSecondary: 'text-cyan-300',
    accentBg: 'bg-emerald-500/25',
    accentBorder: 'border-emerald-400/60',
    accentGradient: 'from-emerald-400 via-teal-400 to-cyan-400',
    accentShadow: 'shadow-[0_0_40px_rgba(16,185,129,0.65)]',
    buttonGrad: 'from-emerald-500 via-teal-500 to-cyan-500',
    orbTop: 'from-emerald-500/45 via-teal-600/30',
    orbMid: 'bg-cyan-500/25',
    orbBottom: 'bg-emerald-700/30',
    gridDotColor: '#10b981',
  },

  // 2. IMPERIAL GOLD & WEALTH (Ultra Luxury 24K Gold + Titanium Charcoal)
  'imperial-gold': {
    id: 'imperial-gold',
    name: '👑 Imperial Gold & Wealth (Luxury)',
    sectorLabel: 'Private Wealth & Asset',
    badgeLabel: 'Gold Luxury 3D',
    bgBase: '#090702',
    outerBorder: '#3b2c05',
    specularLine: 'via-amber-300/95',
    cardBorder: 'border-amber-400/45',
    cardBg: 'from-[#2b2005]/95 to-[#100b01]/95',
    glassTileBg: 'from-[#221904] to-[#0d0901]',
    accentText: 'text-amber-300',
    accentTextSecondary: 'text-yellow-200',
    accentBg: 'bg-amber-500/25',
    accentBorder: 'border-amber-400/60',
    accentGradient: 'from-yellow-300 via-amber-400 to-orange-500',
    accentShadow: 'shadow-[0_0_40px_rgba(245,158,11,0.65)]',
    buttonGrad: 'from-yellow-400 via-amber-500 to-orange-500',
    orbTop: 'from-yellow-400/45 via-amber-600/35',
    orbMid: 'bg-orange-500/25',
    orbBottom: 'bg-yellow-700/30',
    gridDotColor: '#f59e0b',
  },

  // 3. TOKYO QUANTUM VIOLET (Electric Violet + Neon Magenta + Ice Cyan)
  'tokyo-neon': {
    id: 'tokyo-neon',
    name: '🔮 Tokyo Quantum Violet (Tech/Crypto)',
    sectorLabel: 'Technology & Digital Alpha',
    badgeLabel: 'Tokyo Violet 3D',
    bgBase: '#060114',
    outerBorder: '#2d0c52',
    specularLine: 'via-fuchsia-400/95',
    cardBorder: 'border-purple-500/45',
    cardBg: 'from-[#280b4b]/95 to-[#0e021f]/95',
    glassTileBg: 'from-[#22093e] to-[#0c011a]',
    accentText: 'text-fuchsia-300',
    accentTextSecondary: 'text-purple-300',
    accentBg: 'bg-fuchsia-500/25',
    accentBorder: 'border-fuchsia-400/60',
    accentGradient: 'from-fuchsia-400 via-purple-500 to-indigo-500',
    accentShadow: 'shadow-[0_0_40px_rgba(217,70,239,0.65)]',
    buttonGrad: 'from-fuchsia-500 via-purple-600 to-indigo-600',
    orbTop: 'from-fuchsia-500/45 via-purple-600/35',
    orbMid: 'bg-cyan-500/25',
    orbBottom: 'bg-pink-700/30',
    gridDotColor: '#e879f9',
  },

  // 4. BULLISH EMERALD MATRIX (Pure Profit Green + Bright Mint)
  'emerald-infra': {
    id: 'emerald-infra',
    name: '🟢 Bullish Emerald Matrix (High Growth)',
    sectorLabel: 'Infrastructure & High Growth',
    badgeLabel: 'Emerald Alpha 3D',
    bgBase: '#010e07',
    outerBorder: '#08381e',
    specularLine: 'via-emerald-300/95',
    cardBorder: 'border-emerald-400/45',
    cardBg: 'from-[#083321]/95 to-[#02160d]/95',
    glassTileBg: 'from-[#072a1b] to-[#021008]',
    accentText: 'text-emerald-400',
    accentTextSecondary: 'text-teal-300',
    accentBg: 'bg-emerald-500/25',
    accentBorder: 'border-emerald-400/60',
    accentGradient: 'from-emerald-300 via-teal-400 to-cyan-500',
    accentShadow: 'shadow-[0_0_40px_rgba(16,185,129,0.65)]',
    buttonGrad: 'from-emerald-400 via-teal-500 to-cyan-600',
    orbTop: 'from-emerald-400/45 via-teal-600/35',
    orbMid: 'bg-cyan-500/25',
    orbBottom: 'bg-emerald-700/30',
    gridDotColor: '#34d399',
  },

  // 5. ROYAL SAPPHIRE & TITANIUM (Banking & Bluechips)
  'sapphire-bank': {
    id: 'sapphire-bank',
    name: '💎 Royal Sapphire (Banking/Bluechip)',
    sectorLabel: 'Financial & Bluechip',
    badgeLabel: 'Financial Blue 3D',
    bgBase: '#010718',
    outerBorder: '#0d2557',
    specularLine: 'via-cyan-300/95',
    cardBorder: 'border-cyan-500/45',
    cardBg: 'from-[#0d2a5e]/95 to-[#04112c]/95',
    glassTileBg: 'from-[#0a214b] to-[#030b1e]',
    accentText: 'text-cyan-300',
    accentTextSecondary: 'text-blue-200',
    accentBg: 'bg-cyan-500/25',
    accentBorder: 'border-cyan-400/60',
    accentGradient: 'from-cyan-300 via-blue-500 to-indigo-600',
    accentShadow: 'shadow-[0_0_40px_rgba(6,182,212,0.65)]',
    buttonGrad: 'from-cyan-400 via-blue-500 to-indigo-600',
    orbTop: 'from-cyan-400/45 via-blue-600/35',
    orbMid: 'bg-emerald-500/25',
    orbBottom: 'bg-indigo-700/35',
    gridDotColor: '#38bdf8',
  },

  // 6. EMBER MAGMA & SOLAR GOLD (Energy, Mining & Commodities)
  'solar-mining': {
    id: 'solar-mining',
    name: '🌋 Ember Magma (Energy/Mining)',
    sectorLabel: 'Energy, Mining & Metals',
    badgeLabel: 'Magma Gold 3D',
    bgBase: '#0e0401',
    outerBorder: '#3d1605',
    specularLine: 'via-amber-400/95',
    cardBorder: 'border-orange-500/45',
    cardBg: 'from-[#351606]/95 to-[#150701]/95',
    glassTileBg: 'from-[#2c1104] to-[#0f0400]',
    accentText: 'text-amber-400',
    accentTextSecondary: 'text-yellow-200',
    accentBg: 'bg-amber-500/25',
    accentBorder: 'border-amber-400/60',
    accentGradient: 'from-amber-300 via-orange-500 to-red-600',
    accentShadow: 'shadow-[0_0_40px_rgba(245,158,11,0.65)]',
    buttonGrad: 'from-amber-400 via-orange-500 to-red-600',
    orbTop: 'from-amber-400/45 via-orange-600/35',
    orbMid: 'bg-yellow-500/25',
    orbBottom: 'bg-red-700/30',
    gridDotColor: '#f97316',
  },

  // 7. CHAMPAGNE ROSE & MAGENTA (Consumer & Retail)
  'rose-fmcg': {
    id: 'rose-fmcg',
    name: '🌸 Champagne Rose (Consumer/Retail)',
    sectorLabel: 'Consumer & FMCG',
    badgeLabel: 'Consumer Rose 3D',
    bgBase: '#0e0109',
    outerBorder: '#3e0720',
    specularLine: 'via-pink-300/95',
    cardBorder: 'border-pink-500/45',
    cardBg: 'from-[#36091f]/95 to-[#16020c]/95',
    glassTileBg: 'from-[#2c0619] to-[#0f0108]',
    accentText: 'text-pink-300',
    accentTextSecondary: 'text-rose-200',
    accentBg: 'bg-pink-500/25',
    accentBorder: 'border-pink-400/60',
    accentGradient: 'from-pink-300 via-rose-500 to-amber-500',
    accentShadow: 'shadow-[0_0_40px_rgba(244,63,94,0.65)]',
    buttonGrad: 'from-pink-400 via-rose-500 to-amber-500',
    orbTop: 'from-pink-400/45 via-rose-600/35',
    orbMid: 'bg-amber-500/25',
    orbBottom: 'bg-purple-700/30',
    gridDotColor: '#f472b6',
  },

  // 8. RUBY CRIMSON & BIO TEAL (Healthcare & Pharma)
  'ruby-health': {
    id: 'ruby-health',
    name: '🩸 Ruby Crimson (Healthcare)',
    sectorLabel: 'Healthcare & Biotech',
    badgeLabel: 'Bio Ruby 3D',
    bgBase: '#0e0104',
    outerBorder: '#3d060e',
    specularLine: 'via-rose-400/95',
    cardBorder: 'border-rose-500/45',
    cardBg: 'from-[#35070f]/95 to-[#150105]/95',
    glassTileBg: 'from-[#2b050c] to-[#0e0103]',
    accentText: 'text-rose-300',
    accentTextSecondary: 'text-pink-200',
    accentBg: 'bg-rose-500/25',
    accentBorder: 'border-rose-400/60',
    accentGradient: 'from-rose-300 via-red-500 to-teal-400',
    accentShadow: 'shadow-[0_0_40px_rgba(244,63,94,0.65)]',
    buttonGrad: 'from-rose-400 via-red-500 to-teal-500',
    orbTop: 'from-rose-400/45 via-red-600/35',
    orbMid: 'bg-teal-500/25',
    orbBottom: 'bg-indigo-700/30',
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

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
  // 1. Perbankan & Jasa Keuangan (BBCA, BBRI, BMRI, BBNI, BRIS, BDMN)
  'sapphire-bank': {
    id: 'sapphire-bank',
    name: 'Royal Sapphire & Titanium (Banking)',
    sectorLabel: 'Financial & Banking',
    badgeLabel: 'Financial Blue 3D',
    bgBase: '#020614',
    outerBorder: '#0b1836',
    specularLine: 'via-cyan-400/80',
    cardBorder: 'border-blue-500/30',
    cardBg: 'from-[#0b1b3b]/95 to-[#050e22]/95',
    glassTileBg: 'from-[#081530] to-[#030918]',
    accentText: 'text-cyan-400',
    accentTextSecondary: 'text-blue-300',
    accentBg: 'bg-cyan-500/20',
    accentBorder: 'border-cyan-400/40',
    accentGradient: 'from-cyan-400 via-blue-600 to-indigo-800',
    accentShadow: 'shadow-[0_0_30px_rgba(6,182,212,0.45)]',
    buttonGrad: 'from-cyan-500 via-blue-600 to-indigo-600',
    orbTop: 'from-cyan-500/35 via-blue-600/25',
    orbMid: 'bg-emerald-500/15',
    orbBottom: 'bg-indigo-700/25',
    gridDotColor: '#38bdf8',
  },

  // 2. Energi, Batubara, Tambang Logam & Mineral (ITMG, PTBA, ADRO, ANTM, MDKA, INCO, BUMI)
  'solar-mining': {
    id: 'solar-mining',
    name: 'Solar Flare & Gold Luster (Energy/Mining)',
    sectorLabel: 'Energy & Mining',
    badgeLabel: 'Gold Energy 3D',
    bgBase: '#0d0602',
    outerBorder: '#291005',
    specularLine: 'via-amber-400/90',
    cardBorder: 'border-amber-500/30',
    cardBg: 'from-[#2a1306]/95 to-[#120702]/95',
    glassTileBg: 'from-[#200d04] to-[#0c0401]',
    accentText: 'text-amber-400',
    accentTextSecondary: 'text-yellow-300',
    accentBg: 'bg-amber-500/20',
    accentBorder: 'border-amber-400/40',
    accentGradient: 'from-amber-400 via-yellow-500 to-orange-700',
    accentShadow: 'shadow-[0_0_30px_rgba(245,158,11,0.45)]',
    buttonGrad: 'from-amber-500 via-orange-600 to-rose-600',
    orbTop: 'from-amber-500/35 via-orange-600/25',
    orbMid: 'bg-yellow-500/15',
    orbBottom: 'bg-red-700/20',
    gridDotColor: '#f59e0b',
  },

  // 3. Teknologi & Telekomunikasi (TLKM, ISAT, EXCL, GOTO, BUKA, MTDL)
  'violet-cyber': {
    id: 'violet-cyber',
    name: 'Cyberpunk Violet Neon (Tech/Telco)',
    sectorLabel: 'Technology & Telco',
    badgeLabel: 'Cyber Magenta 3D',
    bgBase: '#070214',
    outerBorder: '#1e0836',
    specularLine: 'via-fuchsia-400/85',
    cardBorder: 'border-fuchsia-500/30',
    cardBg: 'from-[#220a3d]/95 to-[#0f031c]/95',
    glassTileBg: 'from-[#1c0832] to-[#0a0114]',
    accentText: 'text-fuchsia-400',
    accentTextSecondary: 'text-purple-300',
    accentBg: 'bg-fuchsia-500/20',
    accentBorder: 'border-fuchsia-400/40',
    accentGradient: 'from-fuchsia-400 via-purple-600 to-indigo-700',
    accentShadow: 'shadow-[0_0_30px_rgba(217,70,239,0.45)]',
    buttonGrad: 'from-fuchsia-500 via-purple-600 to-indigo-600',
    orbTop: 'from-fuchsia-500/35 via-purple-600/25',
    orbMid: 'bg-cyan-500/15',
    orbBottom: 'bg-pink-600/20',
    gridDotColor: '#e879f9',
  },

  // 4. Konsumer Primer & Non-Primer, Retail, FMCG (UNVR, ICBP, INDF, MYOR, AMRT, MIDI)
  'rose-fmcg': {
    id: 'rose-fmcg',
    name: 'Champagne Rose & Magenta (FMCG/Retail)',
    sectorLabel: 'Consumer & FMCG',
    badgeLabel: 'Consumer Rose 3D',
    bgBase: '#0c0208',
    outerBorder: '#2b0717',
    specularLine: 'via-pink-400/85',
    cardBorder: 'border-pink-500/30',
    cardBg: 'from-[#290818]/95 to-[#13030b]/95',
    glassTileBg: 'from-[#210613] to-[#0c0107]',
    accentText: 'text-pink-400',
    accentTextSecondary: 'text-rose-300',
    accentBg: 'bg-pink-500/20',
    accentBorder: 'border-pink-400/40',
    accentGradient: 'from-pink-400 via-rose-600 to-amber-600',
    accentShadow: 'shadow-[0_0_30px_rgba(244,63,94,0.45)]',
    buttonGrad: 'from-pink-500 via-rose-600 to-amber-600',
    orbTop: 'from-pink-500/35 via-rose-600/25',
    orbMid: 'bg-amber-500/15',
    orbBottom: 'bg-purple-700/20',
    gridDotColor: '#f472b6',
  },

  // 5. Infrastruktur, Industri & Energi Terbarukan (ASII, BREN, JSMR, PGAS, AUTO)
  'emerald-infra': {
    id: 'emerald-infra',
    name: 'Quantum Emerald & Matrix (Infrastructure/ESG)',
    sectorLabel: 'Infrastructure & Industry',
    badgeLabel: 'Emerald Matrix 3D',
    bgBase: '#020b08',
    outerBorder: '#06261c',
    specularLine: 'via-emerald-400/85',
    cardBorder: 'border-emerald-500/30',
    cardBg: 'from-[#08291f]/95 to-[#03130e]/95',
    glassTileBg: 'from-[#06221a] to-[#020e0a]',
    accentText: 'text-emerald-400',
    accentTextSecondary: 'text-teal-300',
    accentBg: 'bg-emerald-500/20',
    accentBorder: 'border-emerald-400/40',
    accentGradient: 'from-emerald-400 via-teal-600 to-cyan-700',
    accentShadow: 'shadow-[0_0_30px_rgba(16,185,129,0.45)]',
    buttonGrad: 'from-emerald-500 via-teal-600 to-cyan-600',
    orbTop: 'from-emerald-500/35 via-teal-600/25',
    orbMid: 'bg-cyan-500/15',
    orbBottom: 'bg-blue-700/20',
    gridDotColor: '#34d399',
  },

  // 6. Properti & Real Estate (BSDE, CTRA, PWON, SMRA)
  'luxury-gold': {
    id: 'luxury-gold',
    name: 'Imperial Gold & Obsidian (Property)',
    sectorLabel: 'Property & Real Estate',
    badgeLabel: 'Gold Luxury 3D',
    bgBase: '#090802',
    outerBorder: '#241e05',
    specularLine: 'via-yellow-300/90',
    cardBorder: 'border-yellow-500/30',
    cardBg: 'from-[#231e06]/95 to-[#0f0c02]/95',
    glassTileBg: 'from-[#1c1805] to-[#0a0801]',
    accentText: 'text-yellow-400',
    accentTextSecondary: 'text-amber-300',
    accentBg: 'bg-yellow-500/20',
    accentBorder: 'border-yellow-400/40',
    accentGradient: 'from-yellow-300 via-amber-500 to-orange-700',
    accentShadow: 'shadow-[0_0_30px_rgba(234,179,8,0.45)]',
    buttonGrad: 'from-yellow-400 via-amber-500 to-orange-600',
    orbTop: 'from-yellow-400/35 via-amber-600/25',
    orbMid: 'bg-orange-500/15',
    orbBottom: 'bg-emerald-700/20',
    gridDotColor: '#facc15',
  },

  // 7. Kesehatan & Farmasi (KLBF, SIDO, HEAL, MIKA, SILO)
  'ruby-health': {
    id: 'ruby-health',
    name: 'Ruby Crimson & Bio-Teal (Healthcare)',
    sectorLabel: 'Healthcare & Pharma',
    badgeLabel: 'Bio Ruby 3D',
    bgBase: '#0c0304',
    outerBorder: '#28090d',
    specularLine: 'via-rose-400/85',
    cardBorder: 'border-rose-500/30',
    cardBg: 'from-[#280a0e]/95 to-[#120406]/95',
    glassTileBg: 'from-[#20080b] to-[#0c0204]',
    accentText: 'text-rose-400',
    accentTextSecondary: 'text-pink-300',
    accentBg: 'bg-rose-500/20',
    accentBorder: 'border-rose-400/40',
    accentGradient: 'from-rose-400 via-red-600 to-teal-600',
    accentShadow: 'shadow-[0_0_30px_rgba(244,63,94,0.45)]',
    buttonGrad: 'from-rose-500 via-red-600 to-teal-600',
    orbTop: 'from-rose-500/35 via-red-600/25',
    orbMid: 'bg-teal-500/15',
    orbBottom: 'bg-indigo-700/20',
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
    ['BBCA', 'BBRI', 'BMRI', 'BBNI', 'BRIS', 'BDMN', 'BBTN', 'ARTO', 'BNGA', 'BTPS'].includes(sym)
  ) {
    return CARD_3D_THEMES['sapphire-bank'];
  }

  // 2. Energy, Mining & Commodities
  if (
    haystack.includes('energy') ||
    haystack.includes('basic') ||
    haystack.includes('min') ||
    ['ITMG', 'PTBA', 'ADRO', 'ANTM', 'MDKA', 'INCO', 'MBMA', 'AMMN', 'BUMI', 'MEDC', 'AKRA', 'PGAS'].includes(sym)
  ) {
    return CARD_3D_THEMES['solar-mining'];
  }

  // 3. Tech & Telco
  if (
    haystack.includes('tech') ||
    haystack.includes('comm') ||
    ['TLKM', 'ISAT', 'EXCL', 'GOTO', 'BUKA', 'MTDL', 'EMTK', 'SCMA', 'TOWR', 'TBIG'].includes(sym)
  ) {
    return CARD_3D_THEMES['violet-cyber'];
  }

  // 4. Consumer, FMCG & Retail
  if (
    haystack.includes('consum') ||
    ['UNVR', 'ICBP', 'INDF', 'MYOR', 'AMRT', 'MIDI', 'GGRM', 'HMSP', 'ACES', 'MAPI', 'CPIN', 'JPFA'].includes(sym)
  ) {
    return CARD_3D_THEMES['rose-fmcg'];
  }

  // 5. Healthcare & Pharma
  if (
    haystack.includes('health') ||
    ['KLBF', 'SIDO', 'HEAL', 'MIKA', 'SILO', 'TSPC', 'PRDA', 'KAEF'].includes(sym)
  ) {
    return CARD_3D_THEMES['ruby-health'];
  }

  // 6. Property & Real Estate
  if (
    haystack.includes('real estate') ||
    haystack.includes('property') ||
    ['BSDE', 'CTRA', 'PWON', 'SMRA', 'ASRI', 'DILD'].includes(sym)
  ) {
    return CARD_3D_THEMES['luxury-gold'];
  }

  // 7. Infrastructure, Industrial & Green Energy (Default)
  return CARD_3D_THEMES['emerald-infra'];
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
  return CARD_3D_THEMES['sapphire-bank'];
}

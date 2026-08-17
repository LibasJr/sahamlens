export type MoatProxyStatus = 'KUAT' | 'CAMPURAN' | 'LEMAH' | 'DATA TERBATAS';

export interface FundamentalAnalyzerSnapshot {
  label?: unknown;
  value?: unknown;
  decision?: unknown;
  confidence?: unknown;
}

export interface MoatProxyIndicator {
  label: string;
  value: string;
  decision: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
}

export interface MoatProxyPillar {
  key: 'profitability' | 'margins' | 'growth' | 'balance_sheet';
  label: string;
  description: string;
  status: MoatProxyStatus;
  available: number;
  supportive: number;
  caution: number;
  indicators: MoatProxyIndicator[];
}

export interface DuPontAnalysisResult {
  netProfitMarginPct: number | null;
  assetTurnover: number | null;
  equityMultiplier: number | null;
  roePct: number | null;
  primaryDriver: 'MARGIN' | 'TURNOVER' | 'LEVERAGE' | 'DATA TERBATAS';
  explanation: string;
}

export interface MoatSourceItem {
  id: 'intangibles' | 'switching_costs' | 'network_effects' | 'cost_advantage' | 'efficient_scale';
  titleKey: string;
  score: 'KUAT' | 'MODERAT' | 'TERBATAS';
  evidence: string;
  basis: string;
}

export interface MoatProxyResult {
  status: MoatProxyStatus;
  available: number;
  expected: number;
  supportive: number;
  caution: number;
  neutral: number;
  supportPct: number | null;
  coveragePct: number;
  pillars: MoatProxyPillar[];
  dupont?: DuPontAnalysisResult;
  moatSources?: MoatSourceItem[];
}

const PILLAR_RULES: Array<{
  key: MoatProxyPillar['key'];
  label: string;
  description: string;
  metrics: string[][];
}> = [
  {
    key: 'profitability',
    label: 'Profitabilitas',
    description: 'Efisiensi menghasilkan laba dari modal dan aset.',
    metrics: [
      ['roe (profitability)', 'return on equity'],
      ['roa (efficiency)', 'return on assets'],
    ],
  },
  {
    key: 'margins',
    label: 'Kekuatan Margin',
    description: 'Ruang laba pada tingkat gross, operasi, dan laba bersih.',
    metrics: [['gross margin'], ['operating margin'], ['net profit margin']],
  },
  {
    key: 'growth',
    label: 'Pertumbuhan',
    description: 'Pertumbuhan pendapatan dan laba per saham terbaru.',
    metrics: [
      ['eps growth (qoq)', 'eps growth'],
      ['revenue growth (yoy)', 'revenue growth'],
    ],
  },
  {
    key: 'balance_sheet',
    label: 'Ketahanan Neraca',
    description: 'Leverage serta kemampuan memenuhi kewajiban jangka pendek.',
    metrics: [
      ['debt/equity (risk)', 'debt to equity'],
      ['current ratio (liquidity)', 'current ratio'],
      ['quick ratio (liquidity)', 'quick ratio'],
    ],
  },
];

const EXPECTED_INDICATORS = PILLAR_RULES.reduce((sum, rule) => sum + rule.metrics.length, 0);

function statusFromCounts(
  available: number,
  supportive: number,
  caution: number,
  minimumAvailable = 1,
): MoatProxyStatus {
  if (available < minimumAvailable) return 'DATA TERBATAS';
  const majority = Math.floor(available / 2) + 1;
  if (supportive >= majority && supportive > caution) return 'KUAT';
  if (caution >= majority && caution > supportive) return 'LEMAH';
  return 'CAMPURAN';
}

function normalizeAnalyzer(value: FundamentalAnalyzerSnapshot): MoatProxyIndicator | null {
  const label = typeof value.label === 'string' ? value.label.trim() : '';
  const displayValue = typeof value.value === 'string' ? value.value.trim() : '';
  const decision = value.decision;
  const confidence = typeof value.confidence === 'number' && Number.isFinite(value.confidence)
    ? value.confidence
    : 0;
  if (!label || !displayValue || displayValue.toUpperCase() === 'N/A' || confidence <= 0) return null;
  if (decision !== 'BULLISH' && decision !== 'BEARISH' && decision !== 'NEUTRAL') return null;
  return { label, value: displayValue, decision, confidence };
}

function parseNumericValue(valueStr?: string): number | null {
  if (!valueStr) return null;
  const cleaned = valueStr.replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function computeDuPontAnalysis(byLabel: Map<string, MoatProxyIndicator>): DuPontAnalysisResult {
  const roeInd = byLabel.get('roe (profitability)') || byLabel.get('return on equity');
  const roaInd = byLabel.get('roa (efficiency)') || byLabel.get('return on assets');
  const npmInd = byLabel.get('net profit margin');
  const derInd = byLabel.get('debt/equity (risk)') || byLabel.get('debt to equity');

  const roe = parseNumericValue(roeInd?.value);
  const roa = parseNumericValue(roaInd?.value);
  const npm = parseNumericValue(npmInd?.value);
  const der = parseNumericValue(derInd?.value);

  let assetTurnover: number | null = null;
  if (roa != null && npm != null && npm > 0) {
    assetTurnover = Math.round((roa / npm) * 100) / 100;
  }

  let equityMultiplier: number | null = null;
  if (roe != null && roa != null && roa > 0) {
    equityMultiplier = Math.round((roe / roa) * 100) / 100;
  } else if (der != null) {
    equityMultiplier = Math.round((1 + der) * 100) / 100;
  }

  if (npm == null || roe == null) {
    return {
      netProfitMarginPct: npm,
      assetTurnover,
      equityMultiplier,
      roePct: roe,
      primaryDriver: 'DATA TERBATAS',
      explanation: 'Data rasio laba belum lengkap untuk dekomposisi DuPont.',
    };
  }

  let primaryDriver: DuPontAnalysisResult['primaryDriver'] = 'MARGIN';
  let explanation = 'Profit margin yang tebal menjadi pendorong utama imbal hasil ekuitas (pricing power).';

  if (equityMultiplier != null && equityMultiplier > 3.0) {
    primaryDriver = 'LEVERAGE';
    explanation = 'Tingkat pengungkit hutang/leverage tinggi memperbesar ROE emiten.';
  } else if (assetTurnover != null && assetTurnover > 1.2) {
    primaryDriver = 'TURNOVER';
    explanation = 'Perputaran aset yang cepat dan efisiensi operasional menjadi penopang utama ROE.';
  }

  return {
    netProfitMarginPct: npm,
    assetTurnover,
    equityMultiplier,
    roePct: roe,
    primaryDriver,
    explanation,
  };
}

export function computeMoatSources(byLabel: Map<string, MoatProxyIndicator>): MoatSourceItem[] {
  const roe = parseNumericValue((byLabel.get('roe (profitability)') || byLabel.get('return on equity'))?.value);
  const roa = parseNumericValue((byLabel.get('roa (efficiency)') || byLabel.get('return on assets'))?.value);
  const grossMargin = parseNumericValue(byLabel.get('gross margin')?.value);
  const opMargin = parseNumericValue(byLabel.get('operating margin')?.value);
  const netMargin = parseNumericValue(byLabel.get('net profit margin')?.value);
  const revGrowth = parseNumericValue((byLabel.get('revenue growth (yoy)') || byLabel.get('revenue growth'))?.value);
  const der = parseNumericValue((byLabel.get('debt/equity (risk)') || byLabel.get('debt to equity'))?.value);

  const items: MoatSourceItem[] = [
    {
      id: 'intangibles',
      titleKey: 'moatEnhance.intangiblesTitle',
      score: (grossMargin != null && grossMargin > 40) || (opMargin != null && opMargin > 20) ? 'KUAT' : (opMargin != null && opMargin > 10) ? 'MODERAT' : 'TERBATAS',
      evidence: opMargin != null ? `Operating Margin ${opMargin.toFixed(1)}%` : 'Data margin terbatas',
      basis: 'Kekuatan merek dan keunggulan produk tercermin dari margin operasi tebal.',
    },
    {
      id: 'switching_costs',
      titleKey: 'moatEnhance.switchingCostTitle',
      score: (roe != null && roe > 18 && (netMargin != null && netMargin > 12)) ? 'KUAT' : (roe != null && roe > 12) ? 'MODERAT' : 'TERBATAS',
      evidence: roe != null ? `ROE ${roe.toFixed(1)}% & Net Margin ${netMargin ?? '-'}%` : 'Data profitabilitas terbatas',
      basis: 'Keterikatan pelanggan dan biaya berpindah tinggi menjaga konsistensi laba bersih.',
    },
    {
      id: 'network_effects',
      titleKey: 'moatEnhance.networkEffectTitle',
      score: (revGrowth != null && revGrowth > 15 && (netMargin != null && netMargin > 10)) ? 'KUAT' : (revGrowth != null && revGrowth > 5) ? 'MODERAT' : 'TERBATAS',
      evidence: revGrowth != null ? `Pertumbuhan Pendapatan ${revGrowth > 0 ? '+' : ''}${revGrowth.toFixed(1)}% YoY` : 'Data pertumbuhan terbatas',
      basis: 'Nilai platform meningkat seiring bertambahnya transaksi tanpa menekan margin.',
    },
    {
      id: 'cost_advantage',
      titleKey: 'moatEnhance.costAdvantageTitle',
      score: (grossMargin != null && grossMargin > 30) && (roa != null && roa > 8) ? 'KUAT' : (grossMargin != null && grossMargin > 20) ? 'MODERAT' : 'TERBATAS',
      evidence: grossMargin != null ? `Gross Margin ${grossMargin.toFixed(1)}% & ROA ${roa ?? '-'}%` : 'Data efisiensi terbatas',
      basis: 'Struktur biaya rendah dan skala produksi masif memberikan keunggulan harga.',
    },
    {
      id: 'efficient_scale',
      titleKey: 'moatEnhance.efficientScaleTitle',
      score: (der != null && der < 1.0 && (roa != null && roa > 7)) ? 'KUAT' : (der != null && der < 2.0) ? 'MODERAT' : 'TERBATAS',
      evidence: der != null ? `DER ${der.toFixed(2)}x & ROA ${roa ?? '-'}%` : 'Data solvabilitas terbatas',
      basis: 'Pasar terkonsolidasi dan disiplin alokasi belanja modal yang sehat.',
    },
  ];

  return items;
}

export function buildMoatProxy(analyzers: FundamentalAnalyzerSnapshot[]): MoatProxyResult {
  const normalized = analyzers.map(normalizeAnalyzer).filter((item): item is MoatProxyIndicator => item !== null);
  const byLabel = new Map(normalized.map((item) => [item.label.toLowerCase(), item]));

  const pillars = PILLAR_RULES.map((rule): MoatProxyPillar => {
    const indicators = rule.metrics
      .map((aliases) => aliases.map((label) => byLabel.get(label)).find((item) => item !== undefined))
      .filter((item): item is MoatProxyIndicator => item !== undefined);
    const supportive = indicators.filter((item) => item.decision === 'BULLISH').length;
    const caution = indicators.filter((item) => item.decision === 'BEARISH').length;
    return {
      key: rule.key,
      label: rule.label,
      description: rule.description,
      status: statusFromCounts(indicators.length, supportive, caution),
      available: indicators.length,
      supportive,
      caution,
      indicators,
    };
  });

  const available = pillars.reduce((sum, pillar) => sum + pillar.available, 0);
  const supportive = pillars.reduce((sum, pillar) => sum + pillar.supportive, 0);
  const caution = pillars.reduce((sum, pillar) => sum + pillar.caution, 0);
  const neutral = available - supportive - caution;
  const dupont = computeDuPontAnalysis(byLabel);
  const moatSources = computeMoatSources(byLabel);

  return {
    status: statusFromCounts(available, supportive, caution, Math.ceil(EXPECTED_INDICATORS / 2)),
    available,
    expected: EXPECTED_INDICATORS,
    supportive,
    caution,
    neutral,
    supportPct: available > 0 ? Math.round((supportive / available) * 100) : null,
    coveragePct: Math.round((available / EXPECTED_INDICATORS) * 100),
    pillars,
    dupont,
    moatSources,
  };
}

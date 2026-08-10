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
  };
}

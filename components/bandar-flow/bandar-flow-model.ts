export type FlowPoint = {
  date?: string;
  close?: unknown;
  netValueBillion?: unknown;
  netForeignValueBillion?: unknown;
  [key: string]: unknown;
};

export type FlowSummaryLike = {
  status?: unknown;
  accumulationStreak?: unknown;
  distributionStreak?: unknown;
  streak?: unknown;
  foreignBuyVolume?: unknown;
  foreignSellVolume?: unknown;
  [key: string]: unknown;
};

export function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function formatFlowBillion(value: unknown): string {
  const numeric = finiteNumber(value);
  if (numeric === null) return 'N/A';
  return `${numeric > 0 ? '+' : ''}${numeric.toFixed(2)} M`;
}

export function formatFlowInteger(value: unknown, locale: 'id-ID' | 'en-US'): string {
  const numeric = finiteNumber(value);
  if (numeric === null) return 'N/A';
  return numeric.toLocaleString(locale, { maximumFractionDigits: 0 });
}

export function formatFlowValue(value: unknown): string {
  const numeric = finiteNumber(value);
  return numeric === null ? 'N/A' : `${numeric}M`;
}

export function buildBandarFlowModel(
  flow: FlowPoint[],
  summary: FlowSummaryLike,
  activeFlowIdx: number | null,
) {
  const accumulationStreak = finiteNumber(summary.accumulationStreak) ?? finiteNumber(summary.streak) ?? 0;
  const distributionStreak = finiteNumber(summary.distributionStreak) ?? 0;
  const isStrong = accumulationStreak >= 3 || distributionStreak >= 3;
  const status = typeof summary.status === 'string' ? summary.status : 'NETRAL';
  const flowTier =
    status === 'AKUMULASI'
      ? isStrong ? 'STRONG ACCUMULATION' : 'ACCUMULATION'
      : status === 'DISTRIBUSI'
        ? isStrong ? 'STRONG DISTRIBUTION' : 'DISTRIBUTION'
        : 'NEUTRAL';

  const fallbackIndex = Math.max(0, flow.length - 1);
  const activeIdx = activeFlowIdx != null && flow[activeFlowIdx] ? activeFlowIdx : fallbackIndex;
  const activeBar = flow[activeIdx] ?? null;
  const activeBarValue = activeBar
    ? finiteNumber(activeBar.netValueBillion) ?? finiteNumber(activeBar.netForeignValueBillion) ?? 0
    : 0;

  const maxAbsFlow = flow.length
    ? Math.max(...flow.map((point) => Math.abs(finiteNumber(point.netValueBillion) ?? finiteNumber(point.netForeignValueBillion) ?? 0)))
    : 0;
  const closes = flow.map((point) => finiteNumber(point.close)).filter((value): value is number => value !== null);
  const minClose = closes.length ? Math.min(...closes) : null;
  const maxClose = closes.length ? Math.max(...closes) : null;
  const closeRange = minClose !== null && maxClose !== null ? maxClose - minClose : 0;
  const pricePoints = flow
    .map((point, index) => {
      const close = finiteNumber(point.close);
      if (close === null || minClose === null) return null;
      const x = flow.length > 1 ? (index / (flow.length - 1)) * 100 : 50;
      const y = closeRange > 0 ? 100 - ((close - minClose) / closeRange) * 90 - 5 : 50;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .filter((point): point is string => point !== null)
    .join(' ');

  const buyVolume = finiteNumber(summary.foreignBuyVolume);
  const sellVolume = finiteNumber(summary.foreignSellVolume);
  const compositionTotal = (buyVolume ?? 0) + (sellVolume ?? 0);
  const buyPct = compositionTotal > 0 ? ((buyVolume ?? 0) / compositionTotal) * 100 : null;

  return {
    accumulationStreak,
    distributionStreak,
    isStrong,
    flowTier,
    activeIdx,
    activeBar,
    activeBarValue,
    maxAbsFlow,
    pricePoints,
    buyVolume,
    sellVolume,
    buyPct,
    borderAccent:
      status === 'AKUMULASI'
        ? 'border-l-tv-green'
        : status === 'DISTRIBUSI'
          ? 'border-l-tv-red'
          : 'border-l-tv-border',
  } as const;
}

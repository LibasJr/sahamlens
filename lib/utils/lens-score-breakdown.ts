interface AnalyzerEntry {
  label?: string;
  decision?: string;
  confidence?: number;
  raw?: { atr?: number | null };
}

export function momentumScore(analyzers: AnalyzerEntry[]): number | null {
  const entry = analyzers.find((a) => a.label?.includes('Momentum'));
  if (!entry || typeof entry.confidence !== 'number') return null;
  if (entry.decision === 'BULLISH') return entry.confidence;
  if (entry.decision === 'BEARISH') return 100 - entry.confidence;
  return 50;
}

export function riskScore(analyzers: AnalyzerEntry[], currentPrice: number): number | null {
  if (typeof currentPrice !== 'number' || currentPrice <= 0) return null;
  const entry = analyzers.find((a) => a.label?.includes('Volatility'));
  const atr = entry?.raw?.atr;
  if (typeof atr !== 'number') return null;
  const volatilityPct = (atr / currentPrice) * 100;
  return Math.max(0, Math.min(100, Math.round(100 - volatilityPct * 15)));
}

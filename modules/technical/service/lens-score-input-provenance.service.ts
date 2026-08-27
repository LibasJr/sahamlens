import {
  provenancedValue,
  type FinancialValueProvenance,
  type ProvenancedFinancialValue,
} from '@/shared/finance/provenance';

type Scalar = number | string | null;
type ProvenanceMap = Record<string, ProvenancedFinancialValue<Scalar>>;

export interface LensScoreInputProvenance {
  technical: ProvenanceMap;
  fundamental: ProvenanceMap;
  flow: ProvenanceMap;
}

function scalar(value: unknown): value is Scalar {
  return value === null || typeof value === 'number' || typeof value === 'string';
}

function add(
  target: ProvenanceMap,
  key: string,
  value: unknown,
  provenance: FinancialValueProvenance,
): void {
  if (!scalar(value)) return;
  target[key] = provenancedValue(value, provenance);
}

export function buildLensScoreInputProvenance(args: {
  technical: Record<string, unknown>;
  fundamental: Record<string, unknown>;
  flow: Record<string, unknown>;
}): LensScoreInputProvenance {
  const technical: ProvenanceMap = {};
  const fundamental: ProvenanceMap = {};
  const flow: ProvenanceMap = {};

  const yahooChart: FinancialValueProvenance = {
    source: 'YAHOO_CHART',
    confidence: 'unknown',
    isEstimated: false,
    note: 'Harga, volume, MA, dan perubahan harga berasal atau diturunkan deterministik dari seri chart yang dipakai LensScore.',
  };
  const analyzer: FinancialValueProvenance = {
    source: 'TECHNICAL_ANALYZERS',
    confidence: 'unknown',
    isEstimated: false,
    note: 'Nilai indikator adalah raw output analyzer yang sama dengan input LensScore.',
  };
  const yahooFundamental: FinancialValueProvenance = {
    source: 'YAHOO_QUOTE_SUMMARY',
    confidence: 'unknown',
    isEstimated: false,
    note: 'Snapshot fundamental/sector yang dipakai langsung oleh pipeline LensScore.',
  };
  const normalizedEarnings: FinancialValueProvenance = {
    source: 'NORMALIZED_EARNINGS_HISTORY',
    confidence: 'unknown',
    isEstimated: false,
    note: 'ROE ternormalisasi dihitung deterministik dari histori earnings untuk penjaga siklus; null bila tidak tersedia/tidak relevan.',
  };
  const derivedFlow: FinancialValueProvenance = {
    source: 'YAHOO_CHART_DERIVED_FLOW',
    confidence: 'unknown',
    isEstimated: false,
    note: 'Flow metrics diturunkan deterministik dari price/volume history yang sama dengan pipeline analisis saham.',
  };

  for (const [key, value] of Object.entries(args.technical)) {
    const source = key === 'rsi' || key.startsWith('macd') ? analyzer : yahooChart;
    add(technical, key, value, source);
  }

  for (const [key, value] of Object.entries(args.fundamental)) {
    if (key === 'normalizedRoe') {
      add(fundamental, key, value, normalizedEarnings);
      continue;
    }
    if (key === 'sector' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [sectorKey, sectorValue] of Object.entries(value as Record<string, unknown>)) {
        add(fundamental, `sector.${sectorKey}`, sectorValue, yahooFundamental);
      }
      continue;
    }
    add(fundamental, key, value, yahooFundamental);
  }

  for (const [key, value] of Object.entries(args.flow)) {
    add(flow, key, value, derivedFlow);
  }

  return { technical, fundamental, flow };
}

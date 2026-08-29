import type { CapTier } from './cap-tier';

export type ForeignFlowInterpretationKind =
  | 'FOREIGN_FLOW_ACTIVE'
  | 'DOMESTIC_DRIVEN_CONTEXT'
  | 'FOREIGN_FLOW_SPARSE';

export type ForeignFlowSource = 'IDX_OFFICIAL_API' | 'YAHOO_CMF_PROXY' | string | null | undefined;

export interface ForeignFlowInterpretationInput {
  capTier: CapTier;
  isLq45: boolean;
  source: ForeignFlowSource;
}

export interface ForeignFlowInterpretation {
  kind: ForeignFlowInterpretationKind;
  label: string;
  shortLabel: string;
  detail: string;
  badgeVariant: 'info' | 'neutral' | 'warning';
}

export function getForeignFlowInterpretation(input: ForeignFlowInterpretationInput): ForeignFlowInterpretation {
  const officialFlowAvailable = input.source === 'IDX_OFFICIAL_API';

  if (!officialFlowAvailable) {
    return {
      kind: 'FOREIGN_FLOW_SPARSE',
      label: 'Foreign-flow sparse',
      shortLabel: 'Flow asing terbatas',
      detail: 'Data foreign flow resmi IDX belum tersedia untuk jendela ini. Jangan membaca proxy arus dana sebagai transaksi asing murni.',
      badgeVariant: 'warning',
    };
  }

  if (input.capTier === 'SMALL_OR_THIN_CURRENT' && !input.isLq45) {
    return {
      kind: 'DOMESTIC_DRIVEN_CONTEXT',
      label: 'Domestic-driven context',
      shortLabel: 'Domestic-driven',
      detail: 'Foreign flow resmi tersedia, tetapi emiten small/thin lebih mudah digerakkan transaksi domestik. Pakai LensFlow sebagai konteks, bukan satu-satunya filter.',
      badgeVariant: 'warning',
    };
  }

  return {
    kind: 'FOREIGN_FLOW_ACTIVE',
    label: 'Foreign-flow active',
    shortLabel: 'Foreign-flow active',
    detail: 'Foreign flow resmi IDX tersedia dan konteks likuiditas saat ini lebih memadai untuk membaca tekanan asing.',
    badgeVariant: 'info',
  };
}

export function getFlowSourceFromAnalyzers(analyzers: unknown): ForeignFlowSource {
  if (!Array.isArray(analyzers)) return null;
  const flowAnalyzer = analyzers.find((analyzer) => {
    if (!analyzer || typeof analyzer !== 'object') return false;
    const row = analyzer as Record<string, unknown>;
    const raw = row.raw && typeof row.raw === 'object' ? row.raw as Record<string, unknown> : null;
    return row.dimension === 'FLOW' && raw?.source === 'IDX_OFFICIAL_API';
  });
  return flowAnalyzer ? 'IDX_OFFICIAL_API' : null;
}

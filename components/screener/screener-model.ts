export type ColumnKey = 'ticker' | 'name' | 'sector' | 'per' | 'rev_growth_ttm' | 'roe' | 'der'
  | 'div_yield' | 'bandarmology' | 'moat' | 'signal' | 'pattern_tag' | 'sentiment'
  | 'week52_high' | 'entry' | 'atr_pct' | 'market_cap' | 'adv20_idr';

export interface SortableColumn {
  key: ColumnKey;
  label: string;
  align?: 'right';
  getValue: (item: any) => string | number | null | undefined;
}

export function parseFormattedNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[+%x\s]/g, '').replace(',', '.');
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export const SORTABLE_COLUMNS: SortableColumn[] = [
  { key: 'ticker', label: 'Ticker', getValue: (i) => i.ticker },
  { key: 'name', label: 'Nama Emiten', getValue: (i) => i.name },
  { key: 'sector', label: 'Sektor', getValue: (i) => i.sector },
  { key: 'per', label: 'PER / Sektor', align: 'right', getValue: (i) => i.per },
  { key: 'rev_growth_ttm', label: 'Rev Growth (TTM)', align: 'right', getValue: (i) => parseFormattedNumber(i.rev_growth_ttm) },
  { key: 'roe', label: 'ROE', align: 'right', getValue: (i) => parseFormattedNumber(i.roe) },
  { key: 'der', label: 'DER', align: 'right', getValue: (i) => parseFormattedNumber(i.der) },
  { key: 'div_yield', label: 'Div Yield', align: 'right', getValue: (i) => parseFormattedNumber(i.div_yield) },
  { key: 'bandarmology', label: 'Bandarmology', getValue: (i) => i.bandarmology },
  { key: 'moat', label: 'Kualitas Profit', getValue: (i) => i.moat },
  { key: 'signal', label: 'Sinyal / Status', getValue: (i) => i.decision?.action ?? i.signal },
  { key: 'pattern_tag', label: 'Pola Backtest', getValue: (i) => i.pattern_tag },
  { key: 'sentiment', label: 'Sentimen Berita', getValue: (i) => i.sentiment },
  { key: 'week52_high', label: '52W High/Low', align: 'right', getValue: (i) => i.week52_high },
  { key: 'entry', label: 'Harga', align: 'right', getValue: (i) => i.entry },
  { key: 'atr_pct', label: 'Volatilitas Harian', align: 'right', getValue: (i) => i.atr_pct },
  { key: 'market_cap', label: 'Market Cap', align: 'right', getValue: (i) => i.market_cap },
  { key: 'adv20_idr', label: 'Likuiditas (ADV20)', align: 'right', getValue: (i) => i.adv20_idr },
];

export function compareValues(a: string | number | null | undefined, b: string | number | null | undefined, dir: 'asc' | 'desc'): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const result = typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), 'id');
  return dir === 'asc' ? result : -result;
}

export const TEMPLATES_STORAGE_KEY = 'sahamlens:screener-templates';

export interface ScreenerTemplate {
  name: string;
  riskProfile: 'Konservatif' | 'Moderat' | 'Agresif';
  sector: string;
  maxPrice: string;
  minMarketCapTriliun: string;
  minLiquidityMiliar: string;
}

export function loadTemplates(): ScreenerTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(TEMPLATES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const GUEST_VISIBLE_RESULT_COUNT = 2;

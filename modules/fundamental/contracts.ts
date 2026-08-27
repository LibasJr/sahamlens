// Kontrak untuk app/fundamental/page.tsx (dan komponen di bawahnya) - dipakai untuk
// menghilangkan `any` di sekitar hasil gabungan /api/stock/[ticker] + /api/fundamental/
// [ticker]. Halaman ini menggabungkan (merge) kedua response secara manual di client
// (lihat fetchAnalyzerData), jadi tipenya didefinisikan di sini alih-alih diturunkan
// langsung dari satu return type service - mencerminkan bentuk gabungan yang nyata.

// Semua analyzer fundamental (pe-analyzer.ts, roe-analyzer.ts, dst di
// modules/fundamental/service/analyzers/) mengembalikan bentuk seragam ini - beda
// dengan analyzer teknikal yang tiap satu punya `raw` sendiri (lihat
// modules/recommendation/service/recommendation.service.ts untuk kasus itu).
export interface FundamentalAnalyzerResult {
  label: string;
  value: string;
  decision: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
}

// Bentuk sukses computeCurrentFundamentalAnalysis() (modules/fundamental/service/
// current-fundamental-analysis.service.ts) yang menjadi body /api/fundamental/[ticker]
// saat request tanpa ?as_of. Field yang tidak dipakai frontend sengaja tidak
// dicantumkan di sini (mis. `bankFundamentals`, `dataQuality`) - tambahkan kalau
// suatu saat dipakai, jangan menebak bentuknya.
export interface FundamentalApiResponse {
  ticker: string;
  price: number | null;
  analyzers: FundamentalAnalyzerResult[];
  consensus?: string;
  fundamentalQuality?: string;
  bestPerformer?: FundamentalAnalyzerResult;
  stock: {
    symbol: string;
    current_price: number | null;
    name: string;
    change_pct: number | null;
    volume: number | null;
    // Digabungkan manual dari /api/stock (lihat fetchAnalyzerData) - tidak ada di
    // computeCurrentFundamentalAnalysis() asli.
    history?: unknown[];
    listing_board?: unknown;
  };
  profile: {
    sector: string;
    industry: string;
    description?: string;
    website: string;
  };
  fundamentals: Record<string, number | string | null>;
  provenance?: {
    fundamentals?: Record<string, ProvenancedFinancialValue<number | string | null>>;
  };
  // Digabungkan manual dari /api/stock._meta (lihat fetchAnalyzerData).
  _meta?: { dataTimestamp?: string | null; [key: string]: unknown } | null;
}

// Bentuk minimal /api/stock/[ticker] yang benar-benar dipakai halaman ini (cuma
// diambil history + _meta untuk di-merge ke response fundamental). Endpoint itu
// mengembalikan jauh lebih banyak field (scoring, decision, eligibility, dst) yang
// dipakai halaman lain (Technical) - tidak semuanya perlu dimodelkan di sini.
export interface StockApiResponseForFundamentalMerge {
  stock?: {
    current_price?: number | null;
    history?: unknown[];
    listing_board?: unknown;
  };
  _meta?: { dataTimestamp?: string | null; [key: string]: unknown } | null;
  scoring?: { kategori?: string };
  decision?: unknown;
  eligibility?: unknown;
}

import type { CompoundingYear, DividendPlanResult, DividendStock } from '@/modules/fundamental';

export type { CompoundingYear, DividendStock };

export interface DividendPlanApiResponse {
  quant: DividendPlanResult;
}
import type { ProvenancedFinancialValue } from '@/shared/finance/provenance';

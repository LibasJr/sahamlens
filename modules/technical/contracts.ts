import type { buildStockAnalysisResponse } from '@/modules/technical/service/stock-analysis-response.service';

// Body sukses /api/stock/[ticker], diturunkan dari assembler response tunggalnya.
// Dipakai Server Component app/technical/[symbol]/page.tsx untuk menghapus `any`
// saat membaca analyzers/consensus/scoring tanpa menduplikasi seluruh struktur besar.
export type StockAnalysisResponse = Awaited<ReturnType<typeof buildStockAnalysisResponse>>;
export type StockAnalyzerResult = StockAnalysisResponse['analyzers'][number];
export type StockConsensusData = NonNullable<StockAnalysisResponse['consensusData']>;
export type StockConsensusDimension = StockConsensusData['dimensions'][number];

// Barrel modules/fundamental - BUILD 002 (Refactor Domain). 13 analyzer rasio fundamental
// murni (fungsi dari data laporan keuangan -> sinyal), dipindah dari lib/fundamentals/.
export { analyze as analyzePe } from './service/analyzers/pe-analyzer';
export { analyze as analyzePbv } from './service/analyzers/pbv-analyzer';
export { analyze as analyzeRoe } from './service/analyzers/roe-analyzer';
export { analyze as analyzeRoa } from './service/analyzers/roa-analyzer';
export { analyze as analyzeDer } from './service/analyzers/der-analyzer';
export { analyze as analyzeCurrentRatio } from './service/analyzers/current-ratio-analyzer';
export { analyze as analyzeQuickRatio } from './service/analyzers/quick-ratio-analyzer';
export { analyze as analyzeDividend } from './service/analyzers/dividend-analyzer';
export { analyze as analyzeEpsGrowth } from './service/analyzers/eps-growth-analyzer';
export { analyze as analyzeRevenueGrowth } from './service/analyzers/revenue-growth-analyzer';
export { analyze as analyzeGrossMargin } from './service/analyzers/gross-margin-analyzer';
export { analyze as analyzeOperatingMargin } from './service/analyzers/operating-margin-analyzer';
export { analyze as analyzeNetMargin } from './service/analyzers/net-margin-analyzer';

// BUILD 004 (AI Architecture) - dipindah dari app/api/intrinsic/[ticker]/route.ts, dipakai
// baik oleh route itu sendiri maupun Valuation Agent di orkestrator multi-agent.
export { calculateIntrinsicValue, calculateDcfModel } from './service/dcf-valuation.service';

// Audit skor fundamental 2026-08-05 - pemisahan "murah/mahal" (valuasi, dari MOS) vs
// "bagus/buruk" (kualitas bisnis, dari vote 13-analyzer) yang sebelumnya tercampur jadi
// satu label "UNDERVALUED/OVERVALUED" yang salah kaprah. Lihat catatan lengkap di
// consensus-labels.service.ts.
export { computeFundamentalQuality, computeValuationLabel, type FundamentalQuality } from './service/consensus-labels.service';

// Backend real halaman /dividend (2026-08-01) - lihat dividend-plan.service.ts untuk
// alasan lengkap (menggantikan /api/live/[ticker] yang tidak pernah punya field quant.*).
export { fetchDividendUniverse, buildDividendPlan, type DividendStock, type DividendPlanResult } from './service/dividend-plan.service';

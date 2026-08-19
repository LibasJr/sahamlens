import { asOf } from '@/modules/fundamental/repository/fundamental-history.repository';
import { getBankFundamentalAsOf } from '@/modules/fundamental/repository/bank-fundamental.repository';
import { assessBankFundamentalQuality } from '@/modules/fundamental/service/bank-fundamental-quality.service';
import { fundamentalPitToAnalyzerPayload } from '@/modules/fundamental/service/fundamental-pit-adapter';
import { runFundamentalAnalyzerSuite } from './fundamental-analyzer-suite.service';

export async function buildPitFundamentalAnalysis(ticker: string, asOfDate: string) {
  const pit = await asOf(ticker, asOfDate);
  if (!pit) return null;

  const [pitPayload, bankFundamentals] = await Promise.all([
    Promise.resolve(fundamentalPitToAnalyzerPayload(pit)),
    getBankFundamentalAsOf(ticker, asOfDate),
  ]);
  const suite = await runFundamentalAnalyzerSuite(pitPayload);

  return {
    ticker,
    mode: 'PIT',
    requested_as_of: asOfDate,
    available: true,
    pit: {
      observed_date: pit.observedDate,
      period_end: pit.periodEnd,
    },
    price: null,
    analyzers: suite.analyzers,
    fundamentalQuality: suite.fundamentalQuality,
    bestPerformer: suite.bestPerformer,
    consensus: 'DATA PIT HISTORIS - valuasi current tidak digunakan',
    bankFundamentals: bankFundamentals
      ? { ...bankFundamentals, status: 'DATA_ONLY' as const, quality: assessBankFundamentalQuality(bankFundamentals) }
      : null,
    fundamentals: {
      marketCap: null,
      trailingPE: pit.per,
      forwardPE: null,
      priceToBook: pit.pbv,
      returnOnEquity: pit.roe == null ? null : pit.roe / 100,
      returnOnAssets: null,
      debtToEquity: pit.der == null ? null : pit.der * 100,
      currentRatio: pit.currentRatio,
      revenueGrowth: pit.revenueGrowth == null ? null : pit.revenueGrowth / 100,
      totalRevenue: null,
      ebitda: null,
      profitMargins: null,
      dividendYield: null,
      grossMargins: null,
      operatingMargins: null,
      netProfitMargins: null,
      nim: null,
    },
  };
}

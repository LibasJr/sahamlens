import { asOf } from '@/modules/fundamental/repository/fundamental-history.repository';
import { fundamentalPitToAnalyzerPayload } from '@/modules/fundamental/service/fundamental-pit-adapter';
import {
  analyzePe,
  analyzePbv,
  analyzeRoe,
  analyzeDer,
  analyzeCurrentRatio,
  analyzeRevenueGrowth,
  calculateIntrinsicValue,
} from '@/modules/fundamental';
import {
  analyzeEma,
  analyzeMacd,
  analyzeMomentum,
  analyzeRsi,
  analyzeSma,
  analyzeSupport,
  analyzeTrend,
  analyzeVolume,
  calculateRsi,
  fetchYahooHistory,
} from '@/modules/technical';
import { classifyFreshness } from '@/shared/http/freshness';
import { fetchCurrentFundamentalSource } from '@/modules/fundamental/service/current-fundamental-source.service';
import type { ChatIntent, CompareScope } from './chat-intent';
import type { ChatDateResolution } from './chat-date';
import { normalizeIdxTicker } from './extract-ticker';

export interface ChatDataRequest {
  intent: ChatIntent;
  compareScope: CompareScope;
  requestedMetrics: string[];
  tickers: string[];
  date: ChatDateResolution;
  prompt: string;
}

export interface ChatVerifiedDataResult {
  verifiedBlock: string;
  directResponse: string | null;
  dataError: string | null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function safe(value: unknown, suffix = ''): string {
  return finite(value) ? `${Number(value).toFixed(2)}${suffix}` : 'tidak tersedia';
}

function analyzerLine(result: { label: string; value: string; decision: string }): string {
  return `- ${result.label}: ${result.value} (${result.decision})`;
}

async function fetchCurrentFundamentalPayload(ticker: string): Promise<any | null> {
  try {
    return await fetchCurrentFundamentalSource(ticker, { timeoutMs: 8000 });
  } catch (error) {
    console.warn('[LensAI:data-router] current fundamental gagal', ticker, error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function currentFundamentalBlock(ticker: string): Promise<string> {
  const data = await fetchCurrentFundamentalPayload(ticker);
  if (!data) {
    return [
      `### ${ticker}`,
      '- Fundamental current: tidak tersedia dari backend saat ini.',
    ].join('\n');
  }

  const pe = analyzePe(data);
  const pbv = analyzePbv(data);
  const roe = analyzeRoe(data);
  const der = analyzeDer(data);
  const currentRatio = analyzeCurrentRatio(data);
  const revenueGrowth = analyzeRevenueGrowth(data);

  return [
    `### ${ticker}`,
    `- symbol: ${ticker}`,
    '- Mode: CURRENT FUNDAMENTAL',
    analyzerLine(pe),
    analyzerLine(pbv),
    analyzerLine(roe),
    analyzerLine(der),
    analyzerLine(currentRatio),
    analyzerLine(revenueGrowth),
  ].join('\n');
}

async function currentTechnicalBlock(ticker: string, requestedMetrics: string[]): Promise<string> {
  try {
    const chart = await fetchYahooHistory(ticker, '1y');
    if (!chart) {
      return [`### ${ticker}`, '- Technical current: tidak tersedia dari backend saat ini.'].join('\n');
    }

    const closes = chart.history.map((h) => h.AdjClose ?? h.Close);
    const freshness = classifyFreshness(chart.regularMarketTime);
    const onlyRsi = requestedMetrics.length === 1 && requestedMetrics[0] === 'rsi';

    if (onlyRsi) {
      const rsi = calculateRsi(closes, 14);
      return [
        `### ${ticker}`,
        `- symbol: ${ticker}`,
        '- Mode: CURRENT TECHNICAL',
        `- Harga terakhir: ${safe(chart.currentPrice)}`,
        rsi == null ? '- RSI 14: tidak tersedia' : `- RSI 14: ${rsi.toFixed(2)}`,
        `- Kesegaran data: ${freshness.freshness}${freshness.dataTimestamp ? ` (bar ${freshness.dataTimestamp})` : ''}`,
      ].join('\n');
    }

    const analyzers = [
      analyzeTrend(chart.history, chart.currentPrice),
      analyzeEma(chart.history, chart.currentPrice),
      analyzeSma(chart.history, chart.currentPrice),
      analyzeRsi(chart.history, chart.currentPrice),
      analyzeMacd(chart.history, chart.currentPrice),
      analyzeMomentum(chart.history, chart.currentPrice),
      analyzeVolume(chart.history, chart.currentPrice),
      analyzeSupport(chart.history, chart.currentPrice),
    ];

    return [
      `### ${ticker}`,
      `- symbol: ${ticker}`,
      '- Mode: CURRENT TECHNICAL',
      `- Harga terakhir: ${safe(chart.currentPrice)}`,
      ...analyzers.map(analyzerLine),
      `- Kesegaran data: ${freshness.freshness}${freshness.dataTimestamp ? ` (bar ${freshness.dataTimestamp})` : ''}`,
    ].join('\n');
  } catch (error) {
    console.warn('[LensAI:data-router] current technical gagal', ticker, error instanceof Error ? error.message : String(error));
    return [`### ${ticker}`, '- Technical current: gagal dibaca dari backend.'].join('\n');
  }
}

async function currentValuationBlock(ticker: string, requestedMetrics: string[]): Promise<string> {
  const fundamental = await currentFundamentalBlock(ticker);
  const narrowRatioQuery = requestedMetrics.length > 0 && requestedMetrics.every((metric) => metric === 'per' || metric === 'pbv');
  if (narrowRatioQuery) return fundamental;

  try {
    const dcf = await calculateIntrinsicValue(ticker);
    if (!dcf || !finite(dcf.fair_value) || dcf.fair_value <= 0) {
      return `${fundamental}\n- Valuasi intrinsic current: tidak tersedia.`;
    }

    return [
      fundamental,
      `- Nilai wajar model current: ${safe(dcf.fair_value)}`,
      `- Margin of Safety model current: ${safe(dcf.mos, '%')}`,
      '- Catatan: nilai wajar adalah keluaran model SahamLens, bukan fakta harga masa depan.',
    ].join('\n');
  } catch (error) {
    console.warn('[LensAI:data-router] current valuation gagal', ticker, error instanceof Error ? error.message : String(error));
    return `${fundamental}\n- Valuasi intrinsic current: gagal dibaca.`;
  }
}

async function historicalFundamentalBlock(ticker: string, requestedAsOf: string): Promise<{ block: string; available: boolean }> {
  try {
    const pit = await asOf(ticker, requestedAsOf);
    if (!pit) {
      return {
        available: false,
        block: [
          `### ${ticker}`,
          `- symbol: ${ticker}`,
          '- Mode: PIT HISTORICAL',
          `- requested_as_of: ${requestedAsOf}`,
          '- Fundamental PIT: TIDAK TERSEDIA sampai tanggal tersebut.',
          '- FAIL-CLOSED: jangan gunakan fundamental, harga, RSI, technical, DCF, news, valuation, atau flow current sebagai pengganti.',
        ].join('\n'),
      };
    }

    const payload = fundamentalPitToAnalyzerPayload(pit);
    const analyzers = [
      analyzePe(payload),
      analyzePbv(payload),
      analyzeRoe(payload),
      analyzeDer(payload),
      analyzeCurrentRatio(payload),
      analyzeRevenueGrowth(payload),
    ];

    return {
      available: true,
      block: [
        `### ${ticker}`,
        `- symbol: ${ticker}`,
        '- Mode: PIT HISTORICAL',
        `- requested_as_of: ${requestedAsOf}`,
        `- observed_date: ${pit.observedDate}`,
        `- period_end: ${pit.periodEnd ?? 'tidak tersedia'}`,
        `- PER: ${safe(pit.per, 'x')}`,
        `- PBV: ${safe(pit.pbv, 'x')}`,
        `- ROE: ${safe(pit.roe, '%')}`,
        `- DER: ${safe(pit.der, 'x')}`,
        `- Current Ratio: ${safe(pit.currentRatio, 'x')}`,
        `- Revenue Growth: ${safe(pit.revenueGrowth, '%')}`,
        '- Analyzer decision:',
        ...analyzers.map((result) => `  ${analyzerLine(result)}`),
        '- Data current TIDAK BOLEH dicampur ke analisis historical ini.',
      ].join('\n'),
    };
  } catch (error) {
    console.warn('[LensAI:data-router] historical PIT gagal', ticker, error instanceof Error ? error.message : String(error));
    return {
      available: false,
      block: [
        `### ${ticker}`,
        `- symbol: ${ticker}`,
        '- Mode: PIT HISTORICAL',
        `- requested_as_of: ${requestedAsOf}`,
        '- Fundamental PIT gagal dibaca.',
        '- FAIL-CLOSED: jangan mengganti dengan data current.',
      ].join('\n'),
    };
  }
}

async function stockGeneralBlock(ticker: string, requestedMetrics: string[]): Promise<string> {
  const [fundamental, technical] = await Promise.all([
    currentFundamentalBlock(ticker),
    currentTechnicalBlock(ticker, requestedMetrics),
  ]);
  return `${fundamental}\n${technical.replace(`### ${ticker}\n`, '')}`;
}

async function marketBlock(): Promise<string> {
  try {
    const chart = await fetchYahooHistory('^JKSE', '3mo');
    if (!chart) return '- Data IHSG current tidak tersedia dari backend saat ini.';
    const closes = chart.history.map((h) => h.AdjClose ?? h.Close);
    const rsi = calculateRsi(closes, 14);
    const freshness = classifyFreshness(chart.regularMarketTime);
    return [
      '- Simbol pasar: ^JKSE (IHSG)',
      '- Mode: CURRENT MARKET',
      `- Level terakhir: ${safe(chart.currentPrice)}`,
      rsi == null ? '- RSI 14 IHSG: tidak tersedia' : `- RSI 14 IHSG: ${rsi.toFixed(2)}`,
      `- Kesegaran data: ${freshness.freshness}${freshness.dataTimestamp ? ` (bar ${freshness.dataTimestamp})` : ''}`,
    ].join('\n');
  } catch (error) {
    console.warn('[LensAI:data-router] market data gagal', error instanceof Error ? error.message : String(error));
    return '- Data IHSG current gagal dibaca dari backend.';
  }
}

function noTickerResponse(): string {
  return 'Saya memahami jenis pertanyaannya, tetapi belum ada ticker emiten yang bisa di-resolve dengan aman dari pertanyaan, riwayat, atau halaman aktif. Sebutkan kode sahamnya, misalnya BBCA atau ADRO.';
}

export async function buildChatVerifiedData(request: ChatDataRequest): Promise<ChatVerifiedDataResult> {
  if (request.date.invalidDate) {
    return {
      verifiedBlock: '',
      directResponse: `Tanggal "${request.date.invalidDate}" tidak valid secara kalender. Saya tidak akan mengubahnya menjadi tanggal lain atau memakai data current sebagai pengganti.`,
      dataError: 'INVALID_DATE',
    };
  }

  if (request.date.incompleteDate) {
    return {
      verifiedBlock: '',
      directResponse: `Permintaan historical "${request.date.incompleteDate}" belum memiliki tanggal harian yang pasti. Untuk point-in-time yang aman, sebutkan tanggal lengkap, misalnya 30 April 2025.`,
      dataError: 'INCOMPLETE_DATE',
    };
  }

  if (request.intent === 'SAHAMLENS_PRODUCT_HELP' || request.intent === 'SMALL_TALK' || request.intent === 'UNKNOWN' || request.intent === 'FOLLOW_UP') {
    return { verifiedBlock: '', directResponse: null, dataError: null };
  }

  if (request.intent === 'MARKET_GENERAL') {
    if (request.date.mode === 'HISTORICAL') {
      return {
        verifiedBlock: '',
        directResponse: `Data pasar/index point-in-time historical untuk ${request.date.requestedAsOf ?? 'tanggal tersebut'} belum tersedia melalui router LensAI. Saya tidak akan menggantinya dengan level IHSG atau indikator current.`,
        dataError: 'HISTORICAL_MARKET_UNAVAILABLE',
      };
    }
    const block = await marketBlock();
    return {
      verifiedBlock: `\n## Data Terverifikasi Server (OTORITATIF):\n${block}`,
      directResponse: null,
      dataError: null,
    };
  }

  if (request.tickers.length === 0) {
    return { verifiedBlock: '', directResponse: noTickerResponse(), dataError: 'TICKER_REQUIRED' };
  }

  const tickers = request.tickers.map(normalizeIdxTicker);

  if (request.intent === 'TECHNICAL_HISTORICAL') {
    return {
      verifiedBlock: '',
      directResponse: `Data technical point-in-time historical untuk ${tickers.join(', ')} belum tersedia di backend SahamLens. Saya tidak akan menggantinya dengan RSI, harga, support/resistance, atau indikator current.`,
      dataError: 'HISTORICAL_TECHNICAL_UNAVAILABLE',
    };
  }

  if (request.date.mode === 'HISTORICAL') {
    const requestedAsOf = request.date.requestedAsOf!;
    const results = await Promise.all(tickers.map((ticker) => historicalFundamentalBlock(ticker, requestedAsOf)));
    const available = results.filter((result) => result.available).length;
    const verifiedBlock = `\n## Data Terverifikasi Server (OTORITATIF - HISTORICAL PIT):\n${results.map((result) => result.block).join('\n\n')}`;

    if (available === 0) {
      return {
        verifiedBlock,
        directResponse: `Data fundamental point-in-time untuk ${tickers.join(', ')} sampai ${requestedAsOf} belum tersedia, jadi saya tidak akan menggantinya dengan data saat ini.`,
        dataError: 'HISTORICAL_PIT_UNAVAILABLE',
      };
    }

    return { verifiedBlock, directResponse: null, dataError: available < results.length ? 'PARTIAL_DATA' : null };
  }

  let blocks: string[] = [];

  if (request.intent === 'FUNDAMENTAL_CURRENT') {
    blocks = await Promise.all(tickers.map(currentFundamentalBlock));
  } else if (request.intent === 'TECHNICAL_CURRENT') {
    blocks = await Promise.all(tickers.map((ticker) => currentTechnicalBlock(ticker, request.requestedMetrics)));
  } else if (request.intent === 'VALUATION') {
    blocks = await Promise.all(tickers.map((ticker) => currentValuationBlock(ticker, request.requestedMetrics)));
  } else if (request.intent === 'COMPARE_STOCKS') {
    if (request.compareScope === 'FUNDAMENTAL') {
      blocks = await Promise.all(tickers.map(currentFundamentalBlock));
    } else if (request.compareScope === 'TECHNICAL') {
      blocks = await Promise.all(tickers.map((ticker) => currentTechnicalBlock(ticker, request.requestedMetrics)));
    } else if (request.compareScope === 'VALUATION') {
      blocks = await Promise.all(tickers.map((ticker) => currentValuationBlock(ticker, request.requestedMetrics)));
    } else {
      blocks = await Promise.all(tickers.map((ticker) => stockGeneralBlock(ticker, request.requestedMetrics)));
    }
  } else if (request.intent === 'STOCK_GENERAL' || request.intent === 'BUY_SELL_RECOMMENDATION') {
    blocks = await Promise.all(tickers.map((ticker) => stockGeneralBlock(ticker, request.requestedMetrics)));
  }

  return {
    verifiedBlock: blocks.length
      ? `\n## Data Terverifikasi Server (OTORITATIF - CURRENT):\n${blocks.join('\n\n')}`
      : '',
    directResponse: null,
    dataError: null,
  };
}

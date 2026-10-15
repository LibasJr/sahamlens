import { asOf, listHistory } from '@/modules/fundamental/repository/fundamental-history.repository';
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
import { getAiPickScanWindow, getIdxMarketHoliday, type AiPickScanWindow } from '@/shared/calendar/idx-trading-calendar';
import { getMarketNews, getStockNews, type NewsItem } from '@/modules/news';
import { fetchCurrentFundamentalSource } from '@/modules/fundamental/service/current-fundamental-source.service';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { getMarketAwareTtlSec } from '@/shared/cache/ttl-policy';
import { asksAboutFuture, type ChatIntent, type CompareScope } from './chat-intent';
import type { ChatDateResolution } from './chat-date';
import { normalizeIdxTicker } from './extract-ticker';
import { normalizeChatText } from './chat-normalize';
import { finite, safe, analyzerLine, verifiedHeader } from './blocks/format';
import { marketMoversBlock, sectorAndBreadthBlock, macroBlock } from './blocks/market-blocks';
import {
  lensRadarPicksBlock,
  scoringMethodologyBlock,
  screenerBlock,
  backtestEvidenceBlock,
} from './blocks/lens-blocks';
import { dividendBlock, earningsBlock, calendarBlock, flowBlock, moatBlock, riskBlock, umaBlock } from './blocks/emiten-blocks';
import { ownershipFlowBlock } from './blocks/ownership-flow-blocks';
import { decisionBlock, tradingSetupBlock, predictionGuardBlock } from './blocks/decision-blocks';
import { portfolioBlock, watchlistBlock, LOGIN_REQUIRED_FOR_USER_DATA, type ChatUserContext } from './blocks/user-blocks';

const CAUSAL_QUESTION = /\b(kenapa|knp|mengapa|kok|penyebab|sebab|pemicu|katalis|sentimen|sentiment|berita|news|gara-?gara)\b/;

function idxSessionLines(window: AiPickScanWindow, marketHoliday: string | null): string[] {
  if (window === 'REGULAR_SESSION') {
    return [
      '- Status sesi IDX sekarang: BUKA (REGULAR_SESSION)',
      '- Wording wajib: tetap sebut timestamp bar harga; data Yahoo/penyedia bisa delay dan bukan tick real-time.',
    ];
  }

  if (window === 'FINAL_CLOSE') {
    return [
      '- Status sesi IDX sekarang: FINAL_CLOSE (snapshot penutupan, bukan sesi reguler berjalan)',
      '- Wording wajib: sebut sebagai data penutupan/sesi terakhir; jangan menggambarkan seolah perdagangan reguler masih live.',
    ];
  }

  if (marketHoliday) {
    return [
      `- Status sesi IDX sekarang: TUTUP (CLOSED: hari libur Bursa IDX — ${marketHoliday})`,
      '- Wording wajib: Bursa IDX sedang libur; angka IHSG di bawah adalah bar/sesi bursa terakhir yang tersedia, BUKAN pergerakan live hari ini.',
      '- Kalau pengguna bertanya "hari ini" atau "sekarang", jawab dulu bahwa Bursa IDX libur lalu bacakan data sesi terakhir beserta timestamp.',
    ];
  }

  return [
    '- Status sesi IDX sekarang: TUTUP (CLOSED: di luar sesi reguler/final close, termasuk malam/jeda/akhir pekan)',
    '- Wording wajib: pasar IDX sedang tutup; angka IHSG di bawah adalah bar/sesi bursa terakhir yang tersedia, BUKAN pergerakan live hari ini.',
    '- Kalau pengguna bertanya "hari ini" atau "sekarang", jawab dulu bahwa bursa sedang tutup lalu bacakan data sesi terakhir beserta timestamp.',
  ];
}

export interface ChatDataRequest {
  intent: ChatIntent;
  compareScope: CompareScope;
  requestedMetrics: string[];
  tickers: string[];
  date: ChatDateResolution;
  prompt: string;
  alsoIntents?: ChatIntent[];
  user?: ChatUserContext | null;
}

export interface ChatVerifiedDataResult {
  verifiedBlock: string;
  directResponse: string | null;
  dataError: string | null;
}

export interface ChatDataProvenance {
  sourceLabel: string;
  timestamp: string | null;
  freshness: string | null;
}

export function summarizeChatDataProvenance(verifiedBlock: string): ChatDataProvenance | null {
  if (!verifiedBlock.trim()) return null;

  const timestamp = verifiedBlock.match(/- Timestamp bar terakhir:\s*([^\n]+)/)?.[1]?.trim()
    ?? verifiedBlock.match(/Kesegaran data:[^\n]*\(bar\s+([^\)]+)\)/)?.[1]?.trim()
    ?? null;
  const freshness = verifiedBlock.match(/- Kesegaran data:\s*([^\n]+)/)?.[1]?.trim() ?? null;

  return {
    sourceLabel: 'Data terverifikasi SahamLens',
    timestamp: timestamp && timestamp !== 'tidak tersedia' ? timestamp : null,
    freshness,
  };
}

async function fetchCurrentFundamentalPayload(ticker: string): Promise<any | null> {
  try {
    return await fetchCurrentFundamentalSource(ticker, { timeoutMs: 8000 });
  } catch (error) {
    console.warn('[LensAI:data-router] current fundamental gagal', ticker, error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function recentFundamentalDeltaLines(ticker: string): Promise<string[]> {
  if (typeof listHistory !== 'function') return [];
  try {
    const rows = await listHistory(ticker);
    if (!Array.isArray(rows) || rows.length < 2) return [];
    const latest = rows[rows.length - 1]!;
    const prev = rows[rows.length - 2]!;
    const fmtDelta = (currVal: number | null, prevVal: number | null, unit = '') => {
      if (currVal == null || prevVal == null || !Number.isFinite(currVal) || !Number.isFinite(prevVal)) return null;
      const diff = currVal - prevVal;
      const sign = diff >= 0 ? '+' : '';
      return `${prevVal.toFixed(2)}${unit} -> ${currVal.toFixed(2)}${unit} (${sign}${diff.toFixed(2)}${unit})`;
    };
    const deltas = [
      ['ROE', fmtDelta(latest.roe, prev.roe, '%')],
      ['PER', fmtDelta(latest.per, prev.per, 'x')],
      ['PBV', fmtDelta(latest.pbv, prev.pbv, 'x')],
      ['DER', fmtDelta(latest.der, prev.der, 'x')],
      ['Revenue Growth', fmtDelta(latest.revenueGrowth, prev.revenueGrowth, '%')],
    ].filter(([, val]) => val !== null);

    if (deltas.length === 0) return [];
    return [
      `- Perubahan Historis Arsip PIT (${prev.observedDate} -> ${latest.observedDate}):`,
      ...deltas.map(([label, val]) => `  - ${label}: ${val}`),
    ];
  } catch {
    return [];
  }
}

async function currentFundamentalBlock(ticker: string): Promise<string> {
  const [data, deltaLines] = await Promise.all([
    fetchCurrentFundamentalPayload(ticker),
    recentFundamentalDeltaLines(ticker),
  ]);
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
    ...deltaLines,
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

    const a: any = dcf.assumptions ?? {};
    const usedMethods = Object.keys(dcf.methods ?? {});

    return [
      fundamental,
      `- Nilai wajar model current: ${safe(dcf.fair_value)}`,
      `- Margin of Safety model current: ${safe(dcf.mos, '%')}`,
      '- ASUMSI DI BALIK ANGKA DI ATAS (wajib disampaikan kalau ditanya dasarnya):',
      usedMethods.length ? `  - Metode yang benar-benar terpakai: ${usedMethods.join(', ')}` : '  - Metode terpakai: tidak tercatat',
      `  - Biaya ekuitas (CAPM per emiten): ${safe(a.cost_of_equity_pct, '%')}`,
      `  - Risk-free rate: ${safe(a.risk_free_rate_pct, '%')} + equity risk premium ${safe(a.equity_risk_premium_pct, '%')}${
        a.macro_set_on ? ` (asumsi makro ditetapkan ${a.macro_set_on})` : ''
      }`,
      `  - Beta yang dipakai: ${safe(a.beta_used)}${a.beta_source ? ` (sumber: ${a.beta_source})` : ''}`,
      `  - Pertumbuhan yang diasumsikan: ${safe(a.growth_pct, '%')}, pertumbuhan perpetual ${safe(a.perpetual_growth_pct, '%')}`,
      `  - PER wajar: ${safe(a.fair_per)}x${a.fair_per_basis ? ` (basis: ${a.fair_per_basis})` : ''}, PBV wajar: ${safe(a.fair_pbv)}x`,
      a.multiples_model ? `  - Model multiple: ${a.multiples_model}` : '',
      `  - PENTING: PBV*/PER* memakai biaya ekuitas CAPM per emiten di atas, sedangkan DDM dan`,
      `    perpetuitas FCF masih memakai tingkat diskonto TETAP ${safe(a.discount_rate_pct, '%')} untuk semua emiten.`,
      '    Jangan menyebutnya satu tingkat diskonto tunggal.',
      a.sector_weights_status === 'ARBITRARY_WEIGHTS_REMOVED'
        ? `  - Bobot numerik sektoral yang belum tervalidasi sudah dihapus; agregasi metode: ${a.sector_aggregation_method ?? 'equal-weight metode applicable yang tersedia'}.`
        : a.sector_weights_status === 'HYPOTHESIS_NOT_VALIDATED'
          ? '  - Bobot metode per sektor BELUM divalidasi terhadap forward return (status: hipotesis). Sebutkan ini kalau menjelaskan kenapa metode tertentu lebih berat.'
          : '',
      '- Catatan: nilai wajar adalah keluaran model SahamLens dengan parameter di atas -',
      '  bukan pengukuran, bukan konsensus analis, dan bukan target harga.',
    ]
      .filter(Boolean)
      .join('\n');
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
    const now = new Date();
    const sessionWindow = getAiPickScanWindow(now);
    const marketHoliday = getIdxMarketHoliday(now);

    const prev = chart.previousClose;
    const canDiff = prev != null && prev > 0 && finite(chart.currentPrice);
    const change = canDiff ? chart.currentPrice - prev! : null;
    const changePct = canDiff ? ((chart.currentPrice - prev!) / prev!) * 100 : null;
    const signed = (value: number, digits = 2) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;

    return [
      '- Simbol pasar: ^JKSE (IHSG)',
      '- Mode: CURRENT MARKET',
      ...idxSessionLines(sessionWindow, marketHoliday),
      `- Level terakhir: ${safe(chart.currentPrice)}`,
      prev == null ? '- Penutupan sebelumnya: tidak tersedia' : `- Penutupan sebelumnya: ${safe(prev)}`,
      change == null || changePct == null
        ? '- Perubahan: tidak tersedia (JANGAN mengarang persentase naik/turun)'
        : `- Perubahan: ${signed(change)} poin (${signed(changePct)}%) - INI SATU-SATUNYA angka perubahan yang boleh dipakai`,
      change == null ? '- Arah: tidak tersedia' : `- Arah: ${change > 0 ? 'NAIK' : change < 0 ? 'TURUN' : 'FLAT'}`,
      rsi == null ? '- RSI 14 IHSG: tidak tersedia' : `- RSI 14 IHSG: ${rsi.toFixed(2)}`,
      `- Timestamp bar terakhir: ${freshness.dataTimestamp ?? 'tidak tersedia'}`,
      `- Kesegaran data: ${freshness.freshness}${freshness.dataTimestamp ? ` (bar ${freshness.dataTimestamp})` : ''}`,
      '- Catatan: blok ini TIDAK berisi alasan/penyebab pergerakan. Kalau ditanya "kenapa",',
      '  jawab dari blok Berita & Sentimen kalau ada; kalau tidak ada, katakan penyebabnya belum terverifikasi.',
    ].join('\n');
  } catch (error) {
    console.warn('[LensAI:data-router] market data gagal', error instanceof Error ? error.message : String(error));
    return '- Data IHSG current gagal dibaca dari backend.';
  }
}

const NEWS_ITEM_LIMIT = 6;

function newsLines(items: NewsItem[]): string[] {
  return items.slice(0, NEWS_ITEM_LIMIT).map((item) => {
    const date = item.pubDate ? new Date(item.pubDate) : null;
    const stamp = date && Number.isFinite(date.getTime())
      ? date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
      : 'tanggal tidak tersedia';
    return `  - [${item.sentiment}] ${item.title} (${item.source}, ${stamp}, basis ${item.evidenceBasis ?? 'HEADLINE_ONLY'})`;
  });
}

function sentimentTally(items: NewsItem[]): string {
  const counted = items.slice(0, NEWS_ITEM_LIMIT);
  const positif = counted.filter((item) => item.sentiment === 'POSITIF').length;
  const negatif = counted.filter((item) => item.sentiment === 'NEGATIF').length;
  const netral = counted.length - positif - negatif;
  return `- Hitungan sentimen evidence berita: ${positif} positif, ${netral} netral, ${negatif} negatif (dari ${counted.length} berita)`;
}

async function marketNewsBlock(): Promise<string> {
  try {
    const news = await getOrCompute(COMPUTED_CACHE_KEY.MARKET_NEWS, getMarketAwareTtlSec(), getMarketNews);
    if (!news.items.length) {
      return '- Berita pasar: tidak ada judul relevan yang lolos filter saat ini. JANGAN mengarang penyebab pergerakan.';
    }
    return [
      '- Cakupan: berita PASAR umum (bukan per emiten)',
      sentimentTally(news.items),
      '- Judul terbaru:',
      ...newsLines(news.items),
      '- BATAS: setiap item menyebut basisnya. RSS_SUMMARY berarti ringkasan asli feed, bukan artikel penuh; HEADLINE_ONLY hanya judul. Ini BUKAN',
      '  bukti kausal bahwa berita inilah yang menggerakkan harga. Sampaikan sebagai "sentimen',
      '  yang sedang beredar", bukan "penyebab IHSG turun".',
    ].join('\n');
  } catch (error) {
    console.warn('[LensAI:data-router] market news gagal', error instanceof Error ? error.message : String(error));
    return '- Berita pasar: gagal dibaca dari backend.';
  }
}

async function stockNewsBlock(ticker: string): Promise<string> {
  try {
    const news = await getStockNews(ticker);
    if (!news.items.length) {
      return [
        `### ${ticker}`,
        `- Berita ${ticker}: tidak ada judul yang cocok dengan emiten ini saat ini.`,
        '- JANGAN memakai berita pasar umum atau ingatan model sebagai penggantinya.',
      ].join('\n');
    }
    return [
      `### ${ticker}`,
      `- symbol: ${ticker}`,
      sentimentTally(news.items),
      '- Judul terbaru:',
      ...newsLines(news.items),
      '- BATAS: RSS_SUMMARY adalah ringkasan asli feed, bukan artikel penuh; HEADLINE_ONLY hanya judul. Keduanya bukan bukti kausal.',
    ].join('\n');
  } catch (error) {
    console.warn('[LensAI:data-router] stock news gagal', ticker, error instanceof Error ? error.message : String(error));
    return [`### ${ticker}`, `- Berita ${ticker}: gagal dibaca dari backend.`].join('\n');
  }
}

function noTickerResponse(): string {
  return 'Saya memahami jenis pertanyaannya, tetapi belum ada ticker emiten yang bisa di-resolve dengan aman dari pertanyaan, riwayat, atau halaman aktif. Sebutkan kode sahamnya, misalnya BBCA atau ADRO.';
}

async function buildPrimaryVerifiedData(request: ChatDataRequest): Promise<ChatVerifiedDataResult> {
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

  if (request.intent === 'SCORING_METHOD') {
    const methodology = scoringMethodologyBlock();
    if (request.tickers.length === 0) {
      return { verifiedBlock: `${verifiedHeader('METODOLOGI LENSSCORE')}\n${methodology}`, directResponse: null, dataError: null };
    }
    const tickers = request.tickers.map(normalizeIdxTicker);
    const stocks = await Promise.all(tickers.map((ticker) => stockGeneralBlock(ticker, request.requestedMetrics)));
    return {
      verifiedBlock: `${verifiedHeader('METODOLOGI LENSSCORE')}\n${methodology}\n${verifiedHeader('DATA EMITEN TERKAIT')}\n${stocks.join('\n\n')}`,
      directResponse: null,
      dataError: null,
    };
  }

  if (request.intent === 'PORTFOLIO' || request.intent === 'WATCHLIST') {
    if (!request.user) {
      return { verifiedBlock: '', directResponse: LOGIN_REQUIRED_FOR_USER_DATA, dataError: 'LOGIN_REQUIRED' };
    }
    const block = request.intent === 'PORTFOLIO'
      ? await portfolioBlock(request.user)
      : await watchlistBlock(request.user);
    return {
      verifiedBlock: `${verifiedHeader(request.intent === 'PORTFOLIO' ? 'PORTOFOLIO PENGGUNA' : 'WATCHLIST PENGGUNA')}\n${block}`,
      directResponse: null,
      dataError: null,
    };
  }

  if (request.intent === 'LENSRADAR_PICKS') {
    const [picks, methodology] = await Promise.all([lensRadarPicksBlock(), Promise.resolve(scoringMethodologyBlock())]);
    const future = asksAboutFuture(normalizeChatText(request.prompt))
      ? `\n${verifiedHeader('BINGKAI WAJIB - PERTANYAAN BERBINGKAI MASA DEPAN')}\n${predictionGuardBlock()}`
      : '';
    return {
      verifiedBlock: `${verifiedHeader('PERINGKAT LENSRADAR')}\n${picks}\n${verifiedHeader('METODOLOGI SKOR DI BALIK PERINGKAT')}\n${methodology}${future}`,
      directResponse: null,
      dataError: null,
    };
  }

  if (request.intent === 'MARKET_MOVERS' || request.intent === 'SECTOR_ROTATION') {
    const wantsCause = CAUSAL_QUESTION.test(normalizeChatText(request.prompt));
    const [movers, sector, news] = await Promise.all([
      request.intent === 'MARKET_MOVERS' ? marketMoversBlock() : Promise.resolve(null),
      sectorAndBreadthBlock(),
      wantsCause ? marketNewsBlock() : Promise.resolve(null),
    ]);
    return {
      verifiedBlock: [
        verifiedHeader('KONDISI PASAR'),
        movers ?? '',
        movers ? '' : null,
        sector,
        news ? `\n### Berita & Sentimen Pasar:\n${news}` : '',
      ]
        .filter((part) => part !== null && part !== '')
        .join('\n'),
      directResponse: null,
      dataError: null,
    };
  }

  if (request.intent === 'MACRO') {
    return { verifiedBlock: `${verifiedHeader('INDIKATOR MAKRO')}\n${await macroBlock()}`, directResponse: null, dataError: null };
  }

  if (request.intent === 'SCREENER') {
    const profile = /agresif/.test(normalizeChatText(request.prompt))
      ? 'Agresif'
      : /konservatif/.test(normalizeChatText(request.prompt))
        ? 'Konservatif'
        : 'Moderat';
    return {
      verifiedBlock: `${verifiedHeader('HASIL SCREENER')}\n${await screenerBlock(profile as any)}`,
      directResponse: null,
      dataError: null,
    };
  }

  if (request.intent === 'BACKTEST_EVIDENCE') {
    const [evidence, methodology] = await Promise.all([backtestEvidenceBlock(), Promise.resolve(scoringMethodologyBlock())]);
    return {
      verifiedBlock: `${verifiedHeader('BUKTI BACKTEST LENSSCORE')}\n${evidence}\n${verifiedHeader('METODOLOGI SKOR YANG DIUJI')}\n${methodology}`,
      directResponse: null,
      dataError: null,
    };
  }

  if (request.intent === 'CALENDAR') {
    const block = await calendarBlock(request.tickers.map(normalizeIdxTicker));
    return { verifiedBlock: `${verifiedHeader('KALENDER KORPORASI')}\n${block}`, directResponse: null, dataError: null };
  }

  if (request.intent === 'NEWS_SENTIMENT') {
    if (request.date.mode === 'HISTORICAL') {
      return {
        verifiedBlock: '',
        directResponse: `Arsip berita/sentimen point-in-time untuk ${request.date.requestedAsOf ?? 'tanggal tersebut'} belum tersedia di backend SahamLens. Saya tidak akan menggantinya dengan berita terbaru seolah-olah itu berita tanggal tersebut.`,
        dataError: 'HISTORICAL_NEWS_UNAVAILABLE',
      };
    }

    if (request.tickers.length === 0) {
      const block = await marketNewsBlock();
      return {
        verifiedBlock: `\n## Data Terverifikasi Server (OTORITATIF - BERITA & SENTIMEN PASAR):\n${block}`,
        directResponse: null,
        dataError: null,
      };
    }

    const tickerNews = await Promise.all(request.tickers.map(normalizeIdxTicker).map(stockNewsBlock));
    return {
      verifiedBlock: `\n## Data Terverifikasi Server (OTORITATIF - BERITA & SENTIMEN EMITEN):\n${tickerNews.join('\n\n')}`,
      directResponse: null,
      dataError: null,
    };
  }

  if (request.intent === 'MARKET_GENERAL') {
    if (request.date.mode === 'HISTORICAL') {
      return {
        verifiedBlock: '',
        directResponse: `Data pasar/index point-in-time historical untuk ${request.date.requestedAsOf ?? 'tanggal tersebut'} belum tersedia melalui router LensAI. Saya tidak akan menggantinya dengan level IHSG atau indikator current.`,
        dataError: 'HISTORICAL_MARKET_UNAVAILABLE',
      };
    }
    const wantsCause = CAUSAL_QUESTION.test(normalizeChatText(request.prompt));
    const [block, news] = await Promise.all([
      marketBlock(),
      wantsCause ? marketNewsBlock() : Promise.resolve(null),
    ]);
    return {
      verifiedBlock: `\n## Data Terverifikasi Server (OTORITATIF):\n${block}${
        news ? `\n\n### Berita & Sentimen Pasar (untuk pertanyaan "kenapa"):\n${news}` : ''
      }`,
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

  if (request.intent === 'DIVIDEND') {
    const blocks = await Promise.all(tickers.map(dividendBlock));
    return { verifiedBlock: `${verifiedHeader('DIVIDEN')}\n${blocks.join('\n\n')}`, directResponse: null, dataError: null };
  }

  if (request.intent === 'EARNINGS') {
    const blocks = await Promise.all(tickers.map(earningsBlock));
    return { verifiedBlock: `${verifiedHeader('EARNINGS')}\n${blocks.join('\n\n')}`, directResponse: null, dataError: null };
  }

  if (request.intent === 'FLOW_BROKER') {
    const [flows, ownerships] = await Promise.all([
      Promise.all(tickers.map(flowBlock)),
      Promise.all(tickers.map(ownershipFlowBlock)),
    ]);
    const ownershipNote =
      'Catatan pemakaian: bukti komposisi kepemilikan di bawah ini adalah potret BULANAN (KSEI), ' +
      'bukan transaksi harian. Pakai sebagai pendukung jawaban akumulasi/distribusi, ' +
      'dan sebutkan periodenya. Bila baris "Broker summary" berbunyi tidak ada periode tersimpan, ' +
      'katakan data transaksi broker belum tersedia untuk emiten itu - jangan menggantinya dengan ' +
      'kesimpulan dari komposisi kepemilikan.';
    const combined = [
      verifiedHeader('ARUS DANA & BROKER'),
      flows.join('\n\n'),
      ownershipNote,
      verifiedHeader('KOMPOSISI KEPEMILIKAN (BUKTI PENDUKUNG - BUKAN TRANSAKSI BROKER)'),
      ownerships.join('\n\n'),
    ].join('\n');
    return { verifiedBlock: combined, directResponse: null, dataError: null };
  }

  if (request.intent === 'OWNERSHIP_FLOW') {
    const blocks = await Promise.all(tickers.map(ownershipFlowBlock));
    return { verifiedBlock: `${verifiedHeader('OWNERSHIP FLOW - KOMPOSISI KEPEMILIKAN (BUKAN TRANSAKSI BROKER)')}\n${blocks.join('\n\n')}`, directResponse: null, dataError: null };
  }

  if (request.intent === 'RISK_PROFILE') {
    const [riskBlocks, umaBlocks] = await Promise.all([
      Promise.all(tickers.map(riskBlock)),
      Promise.all(tickers.map(umaBlock)),
    ]);
    const combined = tickers.map((_, idx) => [riskBlocks[idx], umaBlocks[idx]].filter(Boolean).join('\n\n'));
    return { verifiedBlock: `${verifiedHeader('RISIKO, BETA & STATUS UMA BEI')}\n${combined.join('\n\n')}`, directResponse: null, dataError: null };
  }

  if (request.intent === 'MOAT') {
    const blocks = await Promise.all(
      tickers.map(async (ticker) => {
        const payload = await fetchCurrentFundamentalPayload(ticker);
        const analyzers = payload
          ? [
              analyzePe(payload),
              analyzePbv(payload),
              analyzeRoe(payload),
              analyzeDer(payload),
              analyzeCurrentRatio(payload),
              analyzeRevenueGrowth(payload),
            ]
          : [];
        return moatBlock(ticker, analyzers);
      }),
    );
    return { verifiedBlock: `${verifiedHeader('MOAT & KETAHANAN USAHA')}\n${blocks.join('\n\n')}`, directResponse: null, dataError: null };
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
  } else if (request.intent === 'BUY_SELL_RECOMMENDATION') {
    blocks = await Promise.all(
      tickers.map(async (ticker) => {
        const [general, decision, setup] = await Promise.all([
          stockGeneralBlock(ticker, request.requestedMetrics),
          decisionBlock(ticker),
          tradingSetupBlock(ticker),
        ]);
        return [general, decision.replace(`### ${ticker.replace(/\.JK$/i, '')}\n`, ''), setup.replace(`### ${ticker.replace(/\.JK$/i, '')}\n`, '')].join('\n');
      }),
    );
  } else if (request.intent === 'PRICE_PREDICTION') {
    const [stockBlocks, evidence] = await Promise.all([
      Promise.all(
        tickers.map(async (ticker) => {
          const [general, setup] = await Promise.all([
            stockGeneralBlock(ticker, request.requestedMetrics),
            tradingSetupBlock(ticker),
          ]);
          return `${general}\n${setup.replace(`### ${ticker.replace(/\.JK$/i, '')}\n`, '')}`;
        }),
      ),
      backtestEvidenceBlock(),
    ]);

    return {
      verifiedBlock: [
        verifiedHeader('BINGKAI WAJIB - PERTANYAAN HARGA MASA DEPAN'),
        predictionGuardBlock(),
        verifiedHeader('DATA EMITEN (CURRENT)'),
        stockBlocks.join('\n\n'),
        verifiedHeader('BASE RATE HISTORIS PER BUCKET SKOR'),
        evidence,
      ].join('\n'),
      directResponse: null,
      dataError: null,
    };
  } else if (request.intent === 'STOCK_GENERAL') {
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

export async function buildChatVerifiedData(request: ChatDataRequest): Promise<ChatVerifiedDataResult> {
  const primary = await buildPrimaryVerifiedData(request);
  const extras = (request.alsoIntents ?? []).filter((intent) => intent !== request.intent);

  if (primary.directResponse || extras.length === 0) return primary;

  const extraBlocks = await Promise.all(
    extras.map(async (intent) => {
      try {
        const result = await buildPrimaryVerifiedData({ ...request, intent, alsoIntents: [] });
        return result.verifiedBlock;
      } catch (error) {
        console.warn('[LensAI:data-router] blok tambahan gagal', intent, error instanceof Error ? error.message : String(error));
        return '';
      }
    }),
  );

  const merged = extraBlocks.filter(Boolean).join('\n');
  return merged
    ? { ...primary, verifiedBlock: `${primary.verifiedBlock}\n${merged}` }
    : primary;
}

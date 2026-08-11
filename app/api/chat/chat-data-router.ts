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
import { getMarketNews, getStockNews, type NewsItem } from '@/modules/news';
import { fetchCurrentFundamentalSource } from '@/modules/fundamental/service/current-fundamental-source.service';
import type { ChatIntent, CompareScope } from './chat-intent';
import type { ChatDateResolution } from './chat-date';
import { normalizeIdxTicker } from './extract-ticker';
import { normalizeChatText } from './chat-normalize';

/** Pertanyaan yang menanyakan SEBAB, bukan cuma angka. Dipakai memutuskan apakah blok
 * berita perlu ikut diambil untuk pertanyaan pasar. */
const CAUSAL_QUESTION = /\b(kenapa|knp|mengapa|kok|penyebab|sebab|pemicu|katalis|sentimen|sentiment|berita|news|gara-?gara)\b/;

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

// BUG FIX (2026-08-11, dari screenshot user): blok ini dulu hanya mengirim level & RSI,
// TANPA perubahan harga - padahal pertanyaan paling umum tentang IHSG justru "kenapa
// turun". Model tidak punya angka perubahan di Data Terverifikasi, jadi mengisi sendiri
// lubang itu: menjawab "turun sekitar 0,25%" sementara header aplikasi menampilkan
// -1,52% dari /api/live/^JKSE. Angka perubahan sekarang IKUT dikirim, dihitung dari
// `meta.previousClose` yang SAMA dengan sumber header, jadi dua angka di layar tidak
// bisa lagi saling bertentangan.
async function marketBlock(): Promise<string> {
  try {
    const chart = await fetchYahooHistory('^JKSE', '3mo');
    if (!chart) return '- Data IHSG current tidak tersedia dari backend saat ini.';
    const closes = chart.history.map((h) => h.AdjClose ?? h.Close);
    const rsi = calculateRsi(closes, 14);
    const freshness = classifyFreshness(chart.regularMarketTime);

    const prev = chart.previousClose;
    const canDiff = prev != null && prev > 0 && finite(chart.currentPrice);
    const change = canDiff ? chart.currentPrice - prev! : null;
    const changePct = canDiff ? ((chart.currentPrice - prev!) / prev!) * 100 : null;
    const signed = (value: number, digits = 2) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;

    return [
      '- Simbol pasar: ^JKSE (IHSG)',
      '- Mode: CURRENT MARKET',
      `- Level terakhir: ${safe(chart.currentPrice)}`,
      prev == null ? '- Penutupan sebelumnya: tidak tersedia' : `- Penutupan sebelumnya: ${safe(prev)}`,
      change == null || changePct == null
        ? '- Perubahan: tidak tersedia (JANGAN mengarang persentase naik/turun)'
        : `- Perubahan: ${signed(change)} poin (${signed(changePct)}%) - INI SATU-SATUNYA angka perubahan yang boleh dipakai`,
      change == null ? '- Arah: tidak tersedia' : `- Arah: ${change > 0 ? 'NAIK' : change < 0 ? 'TURUN' : 'FLAT'}`,
      rsi == null ? '- RSI 14 IHSG: tidak tersedia' : `- RSI 14 IHSG: ${rsi.toFixed(2)}`,
      `- Kesegaran data: ${freshness.freshness}${freshness.dataTimestamp ? ` (bar ${freshness.dataTimestamp})` : ''}`,
      '- Catatan: blok ini TIDAK berisi alasan/penyebab pergerakan. Kalau ditanya "kenapa",',
      '  jawab dari blok Berita & Sentimen kalau ada; kalau tidak ada, katakan penyebabnya belum terverifikasi.',
    ].join('\n');
  } catch (error) {
    console.warn('[LensAI:data-router] market data gagal', error instanceof Error ? error.message : String(error));
    return '- Data IHSG current gagal dibaca dari backend.';
  }
}

// BUG FIX (2026-08-11, dari screenshot user): "ada sentimen apa kok skrg turun" dijawab
// "Maaf, saya tidak bisa menjawab pertanyaan tersebut." Penyebabnya BUKAN model yang
// bandel - router ini memang tidak pernah punya jalur berita/sentimen sama sekali, jadi
// pertanyaan itu jatuh ke UNKNOWN tanpa satu pun data terverifikasi, dan aturan #16 di
// system prompt (dilarang mengisi dari pengetahuan model) benar-benar menutup jawaban.
// modules/news SUDAH menyediakan getMarketNews()/getStockNews() lengkap dengan klasifikasi
// sentimen - dipakai halaman /news dan Technical Analyzer - tapi tidak pernah tersambung
// ke LensAI. Ini penyambungannya.
const NEWS_ITEM_LIMIT = 6;

function newsLines(items: NewsItem[]): string[] {
  return items.slice(0, NEWS_ITEM_LIMIT).map((item) => {
    const date = item.pubDate ? new Date(item.pubDate) : null;
    const stamp = date && Number.isFinite(date.getTime())
      ? date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
      : 'tanggal tidak tersedia';
    return `  - [${item.sentiment}] ${item.title} (${item.source}, ${stamp})`;
  });
}

function sentimentTally(items: NewsItem[]): string {
  const counted = items.slice(0, NEWS_ITEM_LIMIT);
  const positif = counted.filter((item) => item.sentiment === 'POSITIF').length;
  const negatif = counted.filter((item) => item.sentiment === 'NEGATIF').length;
  const netral = counted.length - positif - negatif;
  return `- Hitungan sentimen judul: ${positif} positif, ${netral} netral, ${negatif} negatif (dari ${counted.length} berita)`;
}

async function marketNewsBlock(): Promise<string> {
  try {
    const news = await getMarketNews();
    if (!news.items.length) {
      return '- Berita pasar: tidak ada judul relevan yang lolos filter saat ini. JANGAN mengarang penyebab pergerakan.';
    }
    return [
      '- Cakupan: berita PASAR umum (bukan per emiten)',
      sentimentTally(news.items),
      '- Judul terbaru:',
      ...newsLines(news.items),
      // Sentimen dihitung dari JUDUL saja (intelligenceBasis: 'headline-only'). Batas ini
      // harus ikut dikirim, kalau tidak model akan menyimpulkan sebab-akibat yang tidak
      // pernah diverifikasi siapa pun.
      '- BATAS: sentimen di atas diklasifikasi dari JUDUL saja, bukan isi artikel, dan BUKAN',
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
      '- BATAS: sentimen diklasifikasi dari JUDUL saja, bukan isi artikel, dan bukan bukti kausal.',
    ].join('\n');
  } catch (error) {
    console.warn('[LensAI:data-router] stock news gagal', ticker, error instanceof Error ? error.message : String(error));
    return [`### ${ticker}`, `- Berita ${ticker}: gagal dibaca dari backend.`].join('\n');
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

  // NEWS_SENTIMENT sengaja diperiksa SEBELUM gerbang "wajib ada ticker" di bawah:
  // "sentimen pasar hari ini apa" adalah pertanyaan sah yang memang tidak punya emiten.
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
    // Pertanyaan "kenapa/kok turun" butuh berita, bukan cuma level & RSI - itu persis
    // pertanyaan yang bikin model mengarang sebelumnya. Berita hanya diambil kalau
    // pertanyaannya memang menanyakan SEBAB: getMarketNews() menarik ~10 feed RSS plus
    // satu klasifikasi AI, terlalu mahal untuk dijalankan di setiap pertanyaan pasar.
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

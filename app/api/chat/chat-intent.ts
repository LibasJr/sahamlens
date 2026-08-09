import { normalizeChatText } from './chat-normalize';
import type { ChatDateResolution, ChatHistoryMessage } from './chat-date';

export type ChatIntent =
  | 'SMALL_TALK'
  | 'STOCK_GENERAL'
  | 'FUNDAMENTAL_CURRENT'
  | 'FUNDAMENTAL_HISTORICAL'
  | 'TECHNICAL_CURRENT'
  | 'TECHNICAL_HISTORICAL'
  | 'VALUATION'
  | 'BUY_SELL_RECOMMENDATION'
  | 'COMPARE_STOCKS'
  | 'MARKET_GENERAL'
  | 'SAHAMLENS_PRODUCT_HELP'
  | 'FOLLOW_UP'
  | 'UNKNOWN';

export type CompareScope = 'GENERAL' | 'FUNDAMENTAL' | 'TECHNICAL' | 'VALUATION';

export interface IntentClassification {
  intent: ChatIntent;
  /** Intent data yang benar-benar dieksekusi. Untuk FOLLOW_UP, diwarisi dari turn sebelumnya. */
  dataIntent: ChatIntent;
  compareScope: CompareScope;
  requestedMetrics: string[];
}

const FUNDAMENTAL_TERMS = /\b(fundamental(?:nya)?|roe|roa|der|current ratio|quick ratio|revenue|pendapatan|laba|margin|neraca|cash ?flow|arus kas)\b/;
const TECHNICAL_TERMS = /\b(teknikal(?:nya)?|technical|rsi|macd|ema|sma|support|resistance|resisten|momentum|volume|trend|uptrend|downtrend|atr)\b/;
const VALUATION_TERMS = /\b(valuasi|valuation|per|p\/e|pbv|p\/b|murah|mahal|undervalued|overvalued|nilai wajar|fair value|dcf|mos|margin of safety)\b/;
const RECOMMENDATION_TERMS = /\b(bagus gak|bagus ga|layak|beli|buy|jual|sell|hold|tahan|entry|masuk|cut loss|stop loss|take profit|tp|cl|investasi\s+\d+\s*(bulan|tahun))\b/;
const COMPARE_TERMS = /\b(banding|bandingin|dibanding|dibandingkan|versus|vs|atau)\b/;
const MARKET_TERMS = /\b(ihsg|\^jkse|idx30|lq45|pasar|market|sektor|breadth|market pulse|kondisi bursa)\b/;
const PRODUCT_TERMS = /\b(lensscore|lensradar|lenstechnical|lensfundamental|lensmarket|sahamlens|screener|backtest|scoring|skor fundamental|skor teknikal)\b/;
const PRODUCT_CALC_TERMS = /\b(cara|bagaimana|gimana)\b.*\b(tp|cl|take profit|cut loss|stop loss)\b.*\b(hitung|dihitung|perhitungan)\b|\b(tp|cl|take profit|cut loss|stop loss)\b.*\b(cara|bagaimana|gimana)\b.*\b(hitung|dihitung|perhitungan)\b/;
const FOLLOW_UP_TERMS = /^(kenapa|kok|terus|lalu|gimana|bagaimana|kalau|kalo|jadi|yang tadi|tadi|data yang|periode kapan|yang kamu pakai|nya\b|itu\b|sehari sebelumnya)/;
const CONCEPT_QUERY = /\b(apa itu|apa artinya|artinya apa|maksudnya|definisi|fungsi|cara kerja)\b/;

function metricsFromText(text: string): string[] {
  const metrics = ['rsi', 'macd', 'ema', 'sma', 'support', 'resistance', 'roe', 'roa', 'der', 'per', 'pbv', 'current ratio'];
  return metrics.filter((metric) => text.includes(metric));
}

function compareScope(text: string): CompareScope {
  if (FUNDAMENTAL_TERMS.test(text)) return 'FUNDAMENTAL';
  if (TECHNICAL_TERMS.test(text)) return 'TECHNICAL';
  if (VALUATION_TERMS.test(text)) return 'VALUATION';
  return 'GENERAL';
}

function previousDataIntent(history: ChatHistoryMessage[]): ChatIntent | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== 'user') continue;
    const text = normalizeChatText(history[i].content);
    if (COMPARE_TERMS.test(text)) return 'COMPARE_STOCKS';
    if (FUNDAMENTAL_TERMS.test(text)) return 'FUNDAMENTAL_CURRENT';
    if (TECHNICAL_TERMS.test(text)) return 'TECHNICAL_CURRENT';
    if (VALUATION_TERMS.test(text)) return 'VALUATION';
    if (RECOMMENDATION_TERMS.test(text)) return 'BUY_SELL_RECOMMENDATION';
  }
  return null;
}

export function classifyChatIntent(args: {
  prompt: string;
  date: ChatDateResolution;
  tickerCount: number;
  hasHistory: boolean;
  history?: ChatHistoryMessage[];
}): IntentClassification {
  const text = normalizeChatText(args.prompt);
  const metrics = metricsFromText(text);
  const isCompare = args.tickerCount >= 2 || COMPARE_TERMS.test(text);

  if (PRODUCT_TERMS.test(text) || PRODUCT_CALC_TERMS.test(text) || (/fundamental/.test(text) && /teknikal/.test(text) && /beda/.test(text))) {
    return { intent: 'SAHAMLENS_PRODUCT_HELP', dataIntent: 'SAHAMLENS_PRODUCT_HELP', compareScope: 'GENERAL', requestedMetrics: metrics };
  }

  // Pengetahuan umum model boleh dipakai untuk MENJELASKAN konsep, bukan untuk angka
  // emiten. Karena tidak ada ticker, pertanyaan definisi tidak perlu fetch backend.
  if (args.tickerCount === 0 && CONCEPT_QUERY.test(text)) {
    return { intent: 'UNKNOWN', dataIntent: 'UNKNOWN', compareScope: 'GENERAL', requestedMetrics: metrics };
  }

  if (MARKET_TERMS.test(text) && args.tickerCount === 0) {
    return { intent: 'MARKET_GENERAL', dataIntent: 'MARKET_GENERAL', compareScope: 'GENERAL', requestedMetrics: metrics };
  }

  if (isCompare && args.tickerCount > 0) {
    return { intent: 'COMPARE_STOCKS', dataIntent: 'COMPARE_STOCKS', compareScope: compareScope(text), requestedMetrics: metrics };
  }

  if (args.date.mode === 'HISTORICAL') {
    if (TECHNICAL_TERMS.test(text) && !FUNDAMENTAL_TERMS.test(text)) {
      return { intent: 'TECHNICAL_HISTORICAL', dataIntent: 'TECHNICAL_HISTORICAL', compareScope: 'TECHNICAL', requestedMetrics: metrics };
    }
    return { intent: 'FUNDAMENTAL_HISTORICAL', dataIntent: 'FUNDAMENTAL_HISTORICAL', compareScope: 'FUNDAMENTAL', requestedMetrics: metrics };
  }

  if (VALUATION_TERMS.test(text)) {
    return { intent: 'VALUATION', dataIntent: 'VALUATION', compareScope: 'VALUATION', requestedMetrics: metrics };
  }

  if (FUNDAMENTAL_TERMS.test(text)) {
    return { intent: 'FUNDAMENTAL_CURRENT', dataIntent: 'FUNDAMENTAL_CURRENT', compareScope: 'FUNDAMENTAL', requestedMetrics: metrics };
  }

  if (TECHNICAL_TERMS.test(text)) {
    return { intent: 'TECHNICAL_CURRENT', dataIntent: 'TECHNICAL_CURRENT', compareScope: 'TECHNICAL', requestedMetrics: metrics };
  }

  if (RECOMMENDATION_TERMS.test(text)) {
    return { intent: 'BUY_SELL_RECOMMENDATION', dataIntent: 'BUY_SELL_RECOMMENDATION', compareScope: 'GENERAL', requestedMetrics: metrics };
  }

  if (args.hasHistory && FOLLOW_UP_TERMS.test(text)) {
    const previous = previousDataIntent(args.history ?? []);
    return {
      intent: 'FOLLOW_UP',
      dataIntent: previous ?? (args.tickerCount > 0 ? 'STOCK_GENERAL' : 'UNKNOWN'),
      compareScope: previous === 'COMPARE_STOCKS' ? 'GENERAL' : 'GENERAL',
      requestedMetrics: metrics,
    };
  }

  if (args.tickerCount > 0) {
    return { intent: 'STOCK_GENERAL', dataIntent: 'STOCK_GENERAL', compareScope: 'GENERAL', requestedMetrics: metrics };
  }

  if (/^(halo|hai|hi|selamat\s+(pagi|siang|sore|malam)|pagi|siang|sore|malam|makasih|terima kasih|thanks|siapa kamu|kamu siapa|bisa bantu apa|apa kabar)\b/.test(text)) {
    return { intent: 'SMALL_TALK', dataIntent: 'SMALL_TALK', compareScope: 'GENERAL', requestedMetrics: metrics };
  }

  return { intent: 'UNKNOWN', dataIntent: 'UNKNOWN', compareScope: 'GENERAL', requestedMetrics: metrics };
}

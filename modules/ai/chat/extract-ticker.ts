import { getEmitenSymbolSet } from '@/shared/market/emiten-list';
import { isCommonWordNotTicker } from './indonesian-stopwords';
import type { ChatHistoryMessage } from './chat-date';

export const INDEX_ALIASES: Record<string, string> = {
  IHSG: '^JKSE',
  '^JKSE': '^JKSE',
  IDX30: 'IDX30',
  LQ45: 'LQ45',
};

/**
 * Ekstrak SEMUA kode emiten yang benar-benar terdaftar, urut sesuai kemunculan.
 * Daftar emiten dipakai sebagai VALIDASI DATA COVERAGE, bukan pembatas rule chat per ticker.
 */
export function extractMentionedTickers(prompt: string): string[] {
  const symbols = getEmitenSymbolSet();
  // Dicocokkan pada teks ASLI, bukan hasil toUpperCase(). Huruf besar-kecil adalah
  // satu-satunya sinyal yang memisahkan kode emiten dari kata biasa yang kebetulan
  // sama - lihat indonesian-stopwords.ts untuk contoh kegagalannya di produksi.
  const candidates = prompt.match(/\b[A-Za-z]{4}\b/g) || [];
  const result: string[] = [];

  for (const candidate of candidates) {
    const symbol = candidate.toUpperCase();
    if (symbol in INDEX_ALIASES) continue;
    if (!symbols.has(symbol)) continue;
    if (isCommonWordNotTicker(candidate)) continue;
    if (!result.includes(symbol)) result.push(symbol);
  }

  return result;
}

export function extractMentionedTicker(prompt: string): string | null {
  return extractMentionedTickers(prompt)[0] ?? null;
}

export function extractMentionedIndices(prompt: string): string[] {
  const upper = prompt.toUpperCase();
  return Object.keys(INDEX_ALIASES).filter((alias) => upper.includes(alias));
}

export function normalizeIdxTicker(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  if (upper.startsWith('^') || upper === 'IDX30' || upper === 'LQ45') return upper;
  return upper.includes('.') ? upper : `${upper}.JK`;
}

/**
 * Pola meta-correction / negative feedback dari pengguna.
 * Prompt seperti "saya nanya apa jawaban mu apa", "jawabanmu tidak sesuai",
 * "bukan itu yang saya tanya" tidak boleh mewarisi ticker atau intent saham dari
 * history. Harus merespons konteks pertanyaan terakhir yang belum terjawab.
 */
const META_CORRECTION_PATTERN = /\b(saya nanya|saya tanya|jawabanmu|jawaban mu|jawaban kamu|tidak sesuai|gak sesuai|bukan itu|bukan ini|kok jawab|kenapa jawab|salah jawab|jawabannya salah|tidak tepat|gak tepat|bukan yang saya|bukan yang saya tanya|bukan yang saya mau|bukan yang saya cari|bukan yang saya tanyakan)\b/i;

/** Cek apakah prompt adalah meta-correction / negative feedback. */
export function isMetaCorrectionPrompt(prompt: string): boolean {
  return META_CORRECTION_PATTERN.test(prompt);
}

/**
 * Pola follow-up saham yang jelas — minimal satu istilah saham + kata tanya/pronoun.
 * Contoh: "kenapa ROE-nya kecil?", "kalau fundamentalnya saja?", "teknikalnya gimana?"
 */
const STOCK_FOLLOW_UP_KEYWORDS = /\b(fundamental|teknikal|teknik|valuation|valuasi|dividen|dividend|earnings|laporan keuangan|lapkeu|kalender|corporate action|stock split|broker|bandarmologi|akumulasi|distribusi|arus dana|money flow|ownership|kepemilikan|foreign|asing|moat|keunggulan|risiko|resiko|volatilitas|volatility|beta|drawdown|position size|stop loss|take profit|cut loss|entry|bagus|jelek|prospek|layak|beli|buy|jual|sell|hold|rekomendasi|lensradar|ai pick|daily picks|peluang hari ini|screener|scanner|filter saham|backtest|win rate|akurasi|ihsg|idx30|lq45|pasar|market|sektor|breadth|regime|makro|macro|inflasi|suku bunga|kurs|gdp|pdb)\b/i;

/**
 * Pronoun / konteks follow-up saham.
 * Contoh: "kenapa ROE-nya?", "kalau fundamentalnya saja?", "gimana teknikalnya?"
 */
const STOCK_FOLLOW_UP_PRONOUN = /\b(kenapa|kok|gimana|bagaimana|kalau|kalo|jadi|nya|itu|tadi|sehari sebelumnya|fundamentalnya|teknikalnya|roenya|roanya|pernya|pbvnya|dervaluation)\b/i;

function lastConversationTickers(history: ChatHistoryMessage[]): string[] {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== 'user') continue;
    const tickers = extractMentionedTickers(history[i].content);
    if (tickers.length) return tickers;
  }
  return [];
}

export function resolveConversationTickers(args: {
  prompt: string;
  history?: ChatHistoryMessage[];
  fallbackSymbol?: string | null;
}): string[] {
  const explicit = extractMentionedTickers(args.prompt);
  const historyTickers = lastConversationTickers(args.history ?? []);
  const normalized = args.prompt.toLowerCase();
  const asksMarketOrIndex = /\b(ihsg|idx30|lq45|pasar|market|sektor|breadth)|\^jkse/.test(normalized);

  // Pertanyaan pasar/index tidak boleh mewarisi ticker halaman atau turn saham sebelumnya.
  if (explicit.length === 0 && asksMarketOrIndex) return [];
  const compareLike = /\b(banding|bandingin|dibanding|dibandingkan|versus|vs|atau)\b/.test(normalized);

  // Meta-correction / negative feedback: JANGAN mewarisi ticker dari history.
  // Prompt seperti "saya nanya apa jawaban mu apa" atau "jawabanmu tidak sesuai"
  // harus merespons konteks pertanyaan terakhir, bukan menganalisis emiten.
  const isMetaCorrection = META_CORRECTION_PATTERN.test(args.prompt);

  let resolved = explicit;

  if (isMetaCorrection) {
    // Keluhan meta: tidak ada ticker yang diwarisi. Pertanyaan terakhir yang belum
    // terjawab akan ditangani oleh intent classifier (product help / workflow).
    resolved = [];
  } else if (compareLike && explicit.length === 1 && historyTickers.length > 0) {
    // "kalau dibanding PTBA?" setelah ADRO: pertahankan ticker lama lalu tambahkan baru.
    resolved = [...historyTickers, ...explicit].filter((ticker, index, all) => all.indexOf(ticker) === index);
  } else if (explicit.length === 0 && historyTickers.length > 0) {
    // Pronoun/follow-up seperti "kenapa ROE-nya kecil?" atau "kalau fundamental saja?".
    // Hanya mewarisi jika prompt mengandung istilah saham yang jelas.
    if (STOCK_FOLLOW_UP_KEYWORDS.test(args.prompt) || STOCK_FOLLOW_UP_PRONOUN.test(args.prompt)) {
      resolved = historyTickers;
    } else {
      resolved = [];
    }
  }

  if (resolved.length === 0 && args.fallbackSymbol) {
    const raw = args.fallbackSymbol.toUpperCase().replace(/\.JK$/, '');
    if (getEmitenSymbolSet().has(raw)) resolved = [raw];
  }

  return resolved.slice(0, 5);
}

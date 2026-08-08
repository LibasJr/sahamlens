import { getEmitenSymbolSet } from '@/shared/market/emiten-list';
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
  const candidates = prompt.toUpperCase().match(/\b[A-Z]{4}\b/g) || [];
  const result: string[] = [];

  for (const candidate of candidates) {
    if (symbols.has(candidate) && !result.includes(candidate)) result.push(candidate);
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
  const asksMarketOrIndex = /\b(ihsg|idx30|lq45|pasar|market|sektor|breadth)\b|\^jkse/.test(normalized);

  // Pertanyaan pasar/index tidak boleh mewarisi ticker halaman atau turn saham sebelumnya.
  if (explicit.length === 0 && asksMarketOrIndex) return [];
  const compareLike = /\b(banding|bandingin|dibanding|dibandingkan|versus|vs|atau)\b/.test(normalized);

  let resolved = explicit;

  // "kalau dibanding PTBA?" setelah ADRO: pertahankan ticker lama lalu tambahkan baru.
  if (compareLike && explicit.length === 1 && historyTickers.length > 0) {
    resolved = [...historyTickers, ...explicit].filter((ticker, index, all) => all.indexOf(ticker) === index);
  } else if (explicit.length === 0 && historyTickers.length > 0) {
    // Pronoun/follow-up seperti "kenapa ROE-nya kecil?" atau "kalau fundamental saja?".
    resolved = historyTickers;
  }

  if (resolved.length === 0 && args.fallbackSymbol) {
    const raw = args.fallbackSymbol.toUpperCase().replace(/\.JK$/, '');
    if (getEmitenSymbolSet().has(raw)) resolved = [raw];
  }

  return resolved.slice(0, 5);
}

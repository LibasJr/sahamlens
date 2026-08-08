import { normalizeChatText } from './chat-normalize';

const MONTHS_ID: Record<string, number> = {
  januari: 1,
  februari: 2,
  maret: 3,
  april: 4,
  mei: 5,
  juni: 6,
  juli: 7,
  agustus: 8,
  september: 9,
  oktober: 10,
  november: 11,
  desember: 12,
};

export type ChatDateResolution = {
  mode: 'CURRENT' | 'HISTORICAL';
  requestedAsOf: string | null;
  invalidDate: string | null;
  incompleteDate: string | null;
  source: 'none' | 'explicit' | 'relative' | 'context' | 'incomplete';
};

export type ChatHistoryMessage = { role: 'user' | 'assistant'; content: string };

export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseExplicitDate(prompt: string): ChatDateResolution | null {
  const iso = prompt.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) {
    return isValidDateKey(iso[1])
      ? { mode: 'HISTORICAL', requestedAsOf: iso[1], invalidDate: null, incompleteDate: null, source: 'explicit' }
      : { mode: 'HISTORICAL', requestedAsOf: null, invalidDate: iso[1], incompleteDate: null, source: 'explicit' };
  }

  const normalized = normalizeChatText(prompt);
  const exact = normalized.match(
    /\b(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(20\d{2})\b/,
  );

  if (exact) {
    const result = dateKey(Number(exact[3]), MONTHS_ID[exact[2]], Number(exact[1]));
    return isValidDateKey(result)
      ? { mode: 'HISTORICAL', requestedAsOf: result, invalidDate: null, incompleteDate: null, source: 'explicit' }
      : { mode: 'HISTORICAL', requestedAsOf: null, invalidDate: exact[0], incompleteDate: null, source: 'explicit' };
  }

  // Bulan+tahun tanpa tanggal belum cukup aman untuk as-of point-in-time. Jangan
  // menebak tanggal akhir bulan karena itu dapat menggeser availability laporan.
  const incomplete = normalized.match(
    /\b(?:per|tanggal|as\s*of)?\s*(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(20\d{2})\b/,
  );
  if (incomplete) {
    return {
      mode: 'HISTORICAL',
      requestedAsOf: null,
      invalidDate: null,
      incompleteDate: `${incomplete[1]} ${incomplete[2]}`,
      source: 'incomplete',
    };
  }

  return null;
}

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return dateKey(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
}

function lastExplicitHistoricalDate(history: ChatHistoryMessage[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== 'user') continue;
    const detected = parseExplicitDate(history[i].content);
    if (detected?.requestedAsOf) return detected.requestedAsOf;
  }
  return null;
}

export function resolveChatDate(prompt: string, history: ChatHistoryMessage[] = []): ChatDateResolution {
  const explicit = parseExplicitDate(prompt);
  if (explicit) return explicit;

  const normalized = normalizeChatText(prompt);
  const previousDate = lastExplicitHistoricalDate(history);

  // Permintaan relatif terhadap publikasi laporan tidak boleh diwarisi sebagai tanggal
  // historical lama atau dianggap current. Tanpa tanggal publikasi yang ter-resolve secara
  // deterministik di tahap ini, minta tanggal harian eksplisit agar tidak terjadi look-ahead.
  if (/\b(sebelum|sesudah|setelah)\s+(?:laporan|rilis|publikasi)\b/.test(normalized)) {
    return {
      mode: 'HISTORICAL',
      requestedAsOf: null,
      invalidDate: null,
      incompleteDate: 'tanggal relatif terhadap publikasi laporan',
      source: 'incomplete',
    };
  }

  if (previousDate && /\b(sehari|satu hari)\s+(sebelumnya|sebelum|mundur)\b/.test(normalized)) {
    return {
      mode: 'HISTORICAL',
      requestedAsOf: shiftDate(previousDate, -1),
      invalidDate: null,
      incompleteDate: null,
      source: 'relative',
    };
  }

  if (previousDate && /\b(sehari|satu hari)\s+(sesudahnya|setelahnya|maju)\b/.test(normalized)) {
    return {
      mode: 'HISTORICAL',
      requestedAsOf: shiftDate(previousDate, 1),
      invalidDate: null,
      incompleteDate: null,
      source: 'relative',
    };
  }

  // Follow-up yang jelas masih merujuk turn historical mewarisi as-of sebelumnya.
  // Marker "sekarang/hari ini/current" memutus inheritance agar user bisa kembali ke current.
  const explicitlyCurrent = /\b(sekarang|hari ini|terkini|current)\b/.test(normalized);
  const contextualFollowUp = /^(kenapa|kok|kalau|kalo|terus|lalu|jadi|yang tadi|tadi)|\b(nya|tersebut|itu)\b/.test(normalized);
  if (previousDate && contextualFollowUp && !explicitlyCurrent) {
    return {
      mode: 'HISTORICAL',
      requestedAsOf: previousDate,
      invalidDate: null,
      incompleteDate: null,
      source: 'context',
    };
  }

  return { mode: 'CURRENT', requestedAsOf: null, invalidDate: null, incompleteDate: null, source: 'none' };
}

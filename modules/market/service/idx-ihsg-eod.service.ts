import fs from 'node:fs';
import path from 'node:path';

export interface IdxIhsgClose {
  date: string;
  close: number;
}

export interface IdxIhsgSnapshot {
  price: number;
  changePct: number;
  tradeDate: string;
  sourceTimestamp: string;
  source: 'IDX_OFFICIAL_INDEX_SUMMARY';
}

function finitePositive(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/,/g, '')) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function parseIdxIhsgArtifact(payload: unknown): IdxIhsgClose[] {
  if (!payload || typeof payload !== 'object') return [];
  const history = (payload as { history?: unknown }).history;
  if (!Array.isArray(history)) return [];
  const byDate = new Map<string, IdxIhsgClose>();
  for (const row of history) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const date = typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : null;
    const close = finitePositive(item.close);
    if (date && close != null) byDate.set(date, { date, close });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function readIdxIhsgEod(dataDir = path.join(process.cwd(), 'data', 'idx-index')): IdxIhsgSnapshot | null {
  let payload: unknown;
  try {
    payload = JSON.parse(fs.readFileSync(path.join(dataDir, 'ihsg.json'), 'utf8'));
  } catch {
    return null;
  }
  const history = parseIdxIhsgArtifact(payload);
  if (history.length < 2) return null;
  const current = history.at(-1)!;
  const previous = history.at(-2)!;
  return {
    price: current.close,
    changePct: ((current.close - previous.close) / previous.close) * 100,
    tradeDate: current.date,
    sourceTimestamp: `${current.date}T09:00:00.000Z`, // 16:00 WIB, penutupan sesi BEI
    source: 'IDX_OFFICIAL_INDEX_SUMMARY',
  };
}

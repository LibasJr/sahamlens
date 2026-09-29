import fs from 'node:fs';
import path from 'node:path';

const OFFICIAL_SOURCE = 'IDX_OFFICIAL_API';
const DEFAULT_ARTIFACT = path.join(process.cwd(), 'data', 'idx-uma', 'uma-index.json');
const DEFAULT_ACTIVE_WINDOW_DAYS = 30;

export interface UmaAnnouncementItem {
  umaId: string;
  ticker: string;
  umaDate: string;
  companyName?: string | null;
  announcementNo?: string | null;
  attachment?: string | null;
  status?: string | null;
  title?: string | null;
}

export interface UmaArtifactData {
  updatedAt: string;
  source: string;
  coverageFrom: string;
  coverageTo: string;
  count: number;
  tickerCount: number;
  tickers: Record<string, string[]>;
  announcements: UmaAnnouncementItem[];
}

export interface TickerUmaStatus {
  isUma: boolean;
  ticker: string;
  lastUmaDate: string | null;
  announcementNo: string | null;
  title: string | null;
  attachment: string | null;
  daysAgo: number | null;
  historyCount: number;
  source: string | null;
  asOf: string | null;
}

function parseDaysBetween(fromIsoDate: string, toDate: Date): number | null {
  const fromMs = Date.parse(`${fromIsoDate}T00:00:00Z`);
  const toMs = Date.parse(`${toDate.toISOString().slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.max(0, Math.round((toMs - fromMs) / 86_400_000));
}

let cachedArtifact: { data: UmaArtifactData; mtimeMs: number } | null = null;

function loadUmaArtifact(artifactPath = DEFAULT_ARTIFACT): UmaArtifactData | null {
  try {
    const stat = fs.statSync(artifactPath);
    if (cachedArtifact && cachedArtifact.mtimeMs === stat.mtimeMs) {
      return cachedArtifact.data;
    }
    const raw = fs.readFileSync(artifactPath, 'utf8');
    const parsed = JSON.parse(raw) as UmaArtifactData;
    if (parsed && parsed.source === OFFICIAL_SOURCE && parsed.tickers) {
      cachedArtifact = { data: parsed, mtimeMs: stat.mtimeMs };
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Cek status UMA resmi BEI untuk satu kode emiten.
 * Saham dinyatakan UMA aktif jika terdapat pengumuman UMA dalam jendela `activeWindowDays` (default 30 hari).
 */
export function getTickerUmaStatus(
  rawTicker: string,
  options: {
    artifactPath?: string;
    now?: Date;
    activeWindowDays?: number;
  } = {}
): TickerUmaStatus {
  const code = rawTicker.replace(/\.JK$/i, '').trim().toUpperCase();
  const now = options.now ?? new Date();
  const windowDays = options.activeWindowDays ?? DEFAULT_ACTIVE_WINDOW_DAYS;

  const emptyStatus: TickerUmaStatus = {
    isUma: false,
    ticker: code,
    lastUmaDate: null,
    announcementNo: null,
    title: null,
    attachment: null,
    daysAgo: null,
    historyCount: 0,
    source: null,
    asOf: null,
  };

  const artifact = loadUmaArtifact(options.artifactPath ?? DEFAULT_ARTIFACT);
  if (!artifact) return emptyStatus;

  const dates = artifact.tickers[code];
  if (!Array.isArray(dates) || dates.length === 0) {
    return {
      ...emptyStatus,
      source: artifact.source,
      asOf: artifact.updatedAt,
    };
  }

  // Ticker dates disortir descending (terbaru dulu)
  const sortedDates = [...dates].sort((a, b) => b.localeCompare(a));
  const latestDate = sortedDates[0];
  const daysAgo = parseDaysBetween(latestDate, now);

  const announcements = Array.isArray(artifact.announcements) ? artifact.announcements : [];
  const latestAnnouncement = announcements.find(
    (item) => item.ticker === code && item.umaDate === latestDate
  );

  const isUma = daysAgo !== null && daysAgo <= windowDays;

  return {
    isUma,
    ticker: code,
    lastUmaDate: latestDate,
    announcementNo: latestAnnouncement?.announcementNo ?? null,
    title: latestAnnouncement?.title ?? null,
    attachment: latestAnnouncement?.attachment ?? null,
    daysAgo,
    historyCount: dates.length,
    source: artifact.source,
    asOf: artifact.updatedAt,
  };
}

import fs from 'node:fs';
import path from 'node:path';
import { recordDataSourceHealth } from '@/modules/observability/service/data-source-health.service';
import {
  CURRENT_LQ45_VERSION,
  isCurrentLq45Ticker,
  normalizeLq45Ticker,
} from '@/modules/market/constants/lq45-universe';

// Data EOD IDX dibaca dari artefak di disk, TIDAK di-fetch dari sini.
//
// idx.co.id ada di belakang Cloudflare yang menolak klien tanpa TLS/JA3 fingerprint
// browser dengan 403 - terukur dari VPS produksi 2026-08-18. Itu bukan soal header
// atau IP: `fetch()` Node tidak bisa meniru fingerprint TLS Chrome, jadi versi
// sebelumnya (fetch langsung ke GetTradingInfoSS) mustahil berhasil di server dan
// selalu jatuh diam-diam ke Yahoo.
//
// Jalur yang sudah terbukti jalan di repo ini adalah scripts/sync-idx-foreign-flow.py
// dengan curl_cffi impersonate="chrome124". Skrip itu memanggil endpoint yang SAMA,
// sudah mengambil OpenPrice/High/Low/Close/Volume, dan menulis
// data/foreign-flow/{KODE}.json. Alasannya didokumentasikan di docstring skrip itu.
const SOURCE_ID = 'IDX_TRADING_INFO_SS';

/** Kode emiten IDX selalu 4 huruf. Pola ketat sekaligus menutup path traversal. */
const CODE_PATTERN = /^[A-Z]{4}$/;

function artifactDir(): string {
  return path.join(process.cwd(), 'data', 'foreign-flow');
}

export interface IdxHistoryRow {
  Date: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
  AdjClose?: number;
  Value?: number;
  Frequency?: number;
  ForeignBuy?: number;
  ForeignSell?: number;
  Bid?: number;
  BidVolume?: number;
  Offer?: number;
  OfferVolume?: number;
  NonRegularVolume?: number;
  NonRegularValue?: number;
  NonRegularFrequency?: number;
}

export interface IdxHistoryFetchResult {
  history: IdxHistoryRow[];
  latestTradeDate: string;
  latestClose: number;
  source: typeof SOURCE_ID;
  universeVersion: string;
}

export interface AppliedIdxHistoryResult {
  history: IdxHistoryRow[];
  applied: boolean;
  source: 'IDX_TRADING_INFO_SS' | 'YAHOO_CHART';
  adjustedCloseSource: 'YAHOO_CHART' | null;
  universeVersion: string | null;
  latestTradeDate: string | null;
  latestClose: number | null;
  idxRows: number;
  yahooRows: number;
  overlapRows: number;
  /** YAHOO_ONLY = IDX tidak mengembalikan apa pun (flag mati, di luar LQ45, circuit
   *  terbuka, atau fetch gagal) sehingga seluruh baris berasal dari Yahoo. */
  latestCloseReconciliation: 'MATCH' | 'MISMATCH' | 'NO_OVERLAP' | 'IDX_ONLY' | 'YAHOO_ONLY';
}

function objectRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object');
  }
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as Record<string, unknown>;
  for (const key of ['data', 'Data', 'items', 'Items', 'results', 'Results']) {
    const value = root[key];
    if (Array.isArray(value)) {
      return value.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object');
    }
    if (value && typeof value === 'object') {
      const nested = value as Record<string, unknown>;
      for (const nestedKey of ['data', 'Data', 'items', 'Items', 'results', 'Results']) {
        const rows = nested[nestedKey];
        if (Array.isArray(rows)) {
          return rows.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object');
        }
      }
    }
  }
  return [];
}

function rawField(row: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  }
  return undefined;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/,/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function nonNegative(value: unknown): number | null {
  const n = finiteNumber(value);
  return n != null && n >= 0 ? n : null;
}

function positive(value: unknown): number | null {
  const n = finiteNumber(value);
  return n != null && n > 0 ? n : null;
}

function dateKey(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  const dotnet = text.match(/\/Date\((\d+)(?:[+-]\d+)?\)\//);
  if (dotnet) {
    const d = new Date(Number(dotnet[1]));
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
  }
  const isoPrefix = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) return isoPrefix[1];
  const d = new Date(text);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

function rangeDays(range: string): number | null {
  const normalized = range.trim().toLowerCase();
  const table: Record<string, number> = {
    '1mo': 45,
    '3mo': 120,
    '6mo': 240,
    '1y': 400,
    '2y': 800,
    '3y': 1200,
    '5y': 2000,
    '10y': 3800,
    '20y': 7600,
  };
  return table[normalized] ?? null;
}

function cutoffForRange(range: string): string | null {
  const days = rangeDays(range);
  if (days == null) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function parseIdxTradingInfo(payload: unknown, range: string): IdxHistoryRow[] {
  const rows = objectRows(payload);
  const parsed: IdxHistoryRow[] = [];
  const cutoff = cutoffForRange(range);

  for (const row of rows) {
    const day = dateKey(rawField(row, ['Date', 'date', 'TradingDate', 'tradingDate', 'TradeDate', 'tradeDate']));
    const open = positive(rawField(row, ['OpenPrice', 'Open', 'open_price', 'open']));
    const high = positive(rawField(row, ['High', 'high']));
    const low = positive(rawField(row, ['Low', 'low']));
    const close = positive(rawField(row, ['Close', 'close', 'ClosePrice', 'closePrice']));
    const volume = nonNegative(rawField(row, ['Volume', 'volume']));

    if (!day || open == null || high == null || low == null || close == null || volume == null) continue;
    if (high < low || close < low || close > high) continue;
    if (cutoff && day < cutoff) continue;

    const value = nonNegative(rawField(row, ['Value', 'value']));
    const frequency = nonNegative(rawField(row, ['Frequency', 'frequency', 'Freq', 'freq']));
    const foreignBuy = nonNegative(rawField(row, ['ForeignBuy', 'foreignBuy', 'foreign_buy']));
    const foreignSell = nonNegative(rawField(row, ['ForeignSell', 'foreignSell', 'foreign_sell']));
    const bid = positive(rawField(row, ['Bid', 'bid']));
    const bidVolume = nonNegative(rawField(row, ['BidVolume', 'bidVolume', 'bid_volume']));
    const offer = positive(rawField(row, ['Offer', 'offer']));
    const offerVolume = nonNegative(rawField(row, ['OfferVolume', 'offerVolume', 'offer_volume']));
    const nonRegularVolume = nonNegative(rawField(row, ['NonRegularVolume', 'nonRegularVolume', 'non_regular_volume']));
    const nonRegularValue = nonNegative(rawField(row, ['NonRegularValue', 'nonRegularValue', 'non_regular_value']));
    const nonRegularFrequency = nonNegative(rawField(row, ['NonRegularFrequency', 'nonRegularFrequency', 'non_regular_frequency']));

    parsed.push({
      Date: `${day}T09:00:00.000Z`,
      Open: open,
      High: high,
      Low: low,
      Close: close,
      Volume: volume,
      ...(value != null ? { Value: value } : {}),
      ...(frequency != null ? { Frequency: frequency } : {}),
      ...(foreignBuy != null ? { ForeignBuy: foreignBuy } : {}),
      ...(foreignSell != null ? { ForeignSell: foreignSell } : {}),
      ...(bid != null ? { Bid: bid } : {}),
      ...(bidVolume != null ? { BidVolume: bidVolume } : {}),
      ...(offer != null ? { Offer: offer } : {}),
      ...(offerVolume != null ? { OfferVolume: offerVolume } : {}),
      ...(nonRegularVolume != null ? { NonRegularVolume: nonRegularVolume } : {}),
      ...(nonRegularValue != null ? { NonRegularValue: nonRegularValue } : {}),
      ...(nonRegularFrequency != null ? { NonRegularFrequency: nonRegularFrequency } : {}),
    });
  }

  const dedup = new Map<string, IdxHistoryRow>();
  for (const row of parsed) dedup.set(row.Date.slice(0, 10), row);
  return [...dedup.values()].sort((a, b) => a.Date.localeCompare(b.Date));
}

interface ArtifactEntry {
  mtimeMs: number;
  rows: unknown[];
  updatedAt: string | null;
}

// Artefak hanya berubah saat sinkronisasi jalan (sekali sehari setelah pasar tutup),
// jadi cache-nya di-invalidasi oleh mtime berkas - pola yang sama dipakai
// modules/market/service/idx-foreign-flow.service.ts terhadap artefak yang sama.
const artifactCache = new Map<string, ArtifactEntry>();

/** Folder artefak. Default `<cwd>/data/foreign-flow`; diisi eksplisit oleh test. */
export interface IdxLq45ReadOptions {
  dataDir?: string;
}

function readArtifact(code: string, dataDir?: string): ArtifactEntry | null {
  const filePath = path.join(dataDir ?? artifactDir(), `${code}.json`);

  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }

  const cached = artifactCache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) return cached;

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }

  const document = (parsed ?? {}) as Record<string, unknown>;
  const entry: ArtifactEntry = {
    mtimeMs,
    rows: Array.isArray(document.history) ? document.history : [],
    updatedAt: typeof document.updatedAt === 'string' ? document.updatedAt : null,
  };
  artifactCache.set(filePath, entry);
  return entry;
}

export async function fetchIdxLq45History(
  ticker: string,
  range = '1y',
  options: IdxLq45ReadOptions = {},
): Promise<IdxHistoryFetchResult | null> {
  if (process.env.IDX_LQ45_EOD_PRIMARY_ENABLED !== 'true') return null;
  const normalized = normalizeLq45Ticker(ticker);
  if (!isCurrentLq45Ticker(normalized)) return null;

  const code = normalized.replace(/\.JK$/, '');
  if (!CODE_PATTERN.test(code)) return null;

  const artifact = readArtifact(code, options.dataDir);
  if (!artifact) {
    await recordDataSourceHealth({
      sourceId: SOURCE_ID,
      ok: false,
      force: true,
      detail: { reason: 'artifact_missing', code, hint: 'python scripts/sync-idx-foreign-flow.py --universe lq45' },
    });
    return null;
  }

  const history = parseIdxTradingInfo(artifact.rows, range);
  if (!history.length) {
    await recordDataSourceHealth({
      sourceId: SOURCE_ID,
      ok: false,
      force: true,
      detail: { reason: 'empty_history', code, range, artifactUpdatedAt: artifact.updatedAt },
    });
    return null;
  }

  const latest = history[history.length - 1];
  await recordDataSourceHealth({
    sourceId: SOURCE_ID,
    ok: true,
    force: true,
    dataObservedAt: `${latest.Date.slice(0, 10)}T16:00:00+07:00`,
    detail: {
      code,
      range,
      rows: history.length,
      universeVersion: CURRENT_LQ45_VERSION,
      artifactUpdatedAt: artifact.updatedAt,
    },
  });

  return {
    history,
    latestTradeDate: latest.Date.slice(0, 10),
    latestClose: latest.Close,
    source: SOURCE_ID,
    universeVersion: CURRENT_LQ45_VERSION,
  };
}

export async function applyIdxLq45EodPrimary(
  ticker: string,
  range: string,
  yahooHistory: IdxHistoryRow[],
  options: IdxLq45ReadOptions = {},
): Promise<AppliedIdxHistoryResult> {
  const idx = await fetchIdxLq45History(ticker, range, options);
  if (!idx) {
    return {
      history: yahooHistory,
      applied: false,
      source: 'YAHOO_CHART',
      adjustedCloseSource: yahooHistory.some((row) => typeof row.AdjClose === 'number') ? 'YAHOO_CHART' : null,
      universeVersion: null,
      latestTradeDate: yahooHistory.at(-1)?.Date.slice(0, 10) ?? null,
      latestClose: yahooHistory.at(-1)?.Close ?? null,
      idxRows: 0,
      yahooRows: yahooHistory.length,
      overlapRows: 0,
      latestCloseReconciliation: 'YAHOO_ONLY',
    };
  }

  // Yahoo jadi TULANG PUNGGUNG kalender, IDX menimpa OHLCV pada tanggal yang dimilikinya.
  //
  // Versi installer menyusun hasilnya dari `idx.history` saja dan cuma memungut AdjClose
  // dari Yahoo. Dua kerusakan lahir dari situ, keduanya diam:
  //
  //   1. Artefak sinkronisasi menyimpan N hari terakhir (default jauh di bawah setahun),
  //      jadi chart 1Y/10Y akan terpotong jadi sepanjang artefak.
  //   2. Artefak baru terisi setelah sinkronisasi jalan pasca-penutupan, jadi sepanjang
  //      sesi berjalan sesi TERBARU tidak ada di IDX dan akan hilang dari deret -
  //      persis bug "lilin tertinggal dari harga header" yang sudah diperbaiki di
  //      app/api/public-chart pada 2026-08-18.
  //
  // Menjadikan Yahoo tulang punggung menutup keduanya: rentang penuh dan sesi terbaru
  // selalu ada, sementara baris yang punya padanan di IDX tetap memakai angka resmi Bursa.
  const yahooByDate = new Map(yahooHistory.map((row) => [row.Date.slice(0, 10), row]));
  const idxByDate = new Map(idx.history.map((row) => [row.Date.slice(0, 10), row]));
  let overlapRows = 0;

  const overlaid = yahooHistory.map((row) => {
    const idxRow = idxByDate.get(row.Date.slice(0, 10));
    if (!idxRow) return row;
    overlapRows += 1;
    return {
      ...idxRow,
      ...(typeof row.AdjClose === 'number' && Number.isFinite(row.AdjClose) && row.AdjClose > 0
        ? { AdjClose: row.AdjClose }
        : {}),
    };
  });

  // Tanggal yang ada di IDX tetapi bolong di Yahoo tetap dibawa masuk, bukan dibuang.
  const idxOnlyRows = idx.history.filter((row) => !yahooByDate.has(row.Date.slice(0, 10)));
  const merged = [...overlaid, ...idxOnlyRows].sort((a, b) => a.Date.localeCompare(b.Date));

  const idxLatestDate = idx.latestTradeDate;
  const yahooSameDate = yahooByDate.get(idxLatestDate);
  let latestCloseReconciliation: AppliedIdxHistoryResult['latestCloseReconciliation'] = 'NO_OVERLAP';
  if (yahooSameDate) {
    latestCloseReconciliation = yahooSameDate.Close === idx.latestClose ? 'MATCH' : 'MISMATCH';
    await recordDataSourceHealth({
      sourceId: 'LQ45_EOD_RECONCILIATION',
      ok: latestCloseReconciliation === 'MATCH',
      force: true,
      dataObservedAt: `${idxLatestDate}T16:00:00+07:00`,
      detail: {
        ticker: normalizeLq45Ticker(ticker),
        tradeDate: idxLatestDate,
        idxClose: idx.latestClose,
        yahooClose: yahooSameDate.Close,
        status: latestCloseReconciliation,
      },
    });
  }

  // Tidak satu baris pun berasal dari IDX - laporkan apa adanya, jangan mengaku IDX.
  const applied = overlapRows > 0 || idxOnlyRows.length > 0;
  const lastRow = merged.at(-1) ?? null;

  return {
    history: merged,
    applied,
    source: applied ? SOURCE_ID : 'YAHOO_CHART',
    adjustedCloseSource: merged.some((row) => typeof row.AdjClose === 'number') ? 'YAHOO_CHART' : null,
    universeVersion: applied ? idx.universeVersion : null,
    // Baris TERAKHIR deret yang benar-benar dikirim, bukan baris terakhir IDX. Saat sesi
    // berjalan keduanya berbeda: artefak IDX baru terisi setelah penutupan, jadi baris
    // terakhir deret adalah sesi hari ini dari Yahoo. Melaporkan tanggal IDX di sini akan
    // membuat _meta mengklaim tanggal yang lebih tua daripada lilin yang tampil di layar.
    latestTradeDate: lastRow?.Date.slice(0, 10) ?? null,
    latestClose: lastRow?.Close ?? null,
    idxRows: idx.history.length,
    yahooRows: yahooHistory.length,
    overlapRows,
    latestCloseReconciliation,
  };
}

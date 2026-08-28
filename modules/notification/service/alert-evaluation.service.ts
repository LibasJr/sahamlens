import { listPendingAlerts, markTriggered, type Alert, type AlertConditionType } from '@/modules/watchlist';
import { internalServiceHeaders } from '@/shared/auth/internal-service';
import { getKategoriPresentationLabel } from '@/shared/presentation/signal-labels';
import { recordDataSourceHealth } from '@/modules/observability/service/data-source-health.service';
import { logger } from '@/shared/logger/logger';

// BUILD 002 (Refactor Domain) - dipindah dari app/api/alerts/check/route.ts, verbatim.
// modules/notification bergantung SATU ARAH ke modules/watchlist (baca daftar alert +
// tandai terpicu) - watchlist tidak pernah balik mengimpor notification, jadi tidak ada
// circular dependency (pola sama seperti modules/watchlist -> shared/auth/session).

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function nested(value: unknown, key: string): UnknownRecord {
  return record(record(value)[key]);
}

async function fetchJson(url: string, sourceId: string): Promise<unknown | null> {
  const startedAt = Date.now();
  try {
    // Header internal (lihat shared/auth/internal-service.ts) - tanpa ini panggilan
    // server-to-server ke /api/stock, /api/breakout-radar, /api/market-pulse selalu
    // 401/402 karena route-route itu di-gate session+Pro yang ditujukan buat request
    // browser user, bukan job evaluasi alert ini.
    const res = await fetch(url, { cache: 'no-store', headers: internalServiceHeaders() });
    if (!res.ok) {
      await recordDataSourceHealth({
        sourceId,
        ok: false,
        latencyMs: Date.now() - startedAt,
        detail: { url, status: res.status, surface: 'watchlist-alert' },
      });
      logger.warn('Alert data fetch failed', {
        module: 'watchlist-alert',
        sourceId,
        status: res.status,
      });
      return null;
    }
    await recordDataSourceHealth({
      sourceId,
      ok: true,
      latencyMs: Date.now() - startedAt,
      detail: { url, surface: 'watchlist-alert' },
    });
    return await res.json() as unknown;
  } catch (error) {
    await recordDataSourceHealth({
      sourceId,
      ok: false,
      latencyMs: Date.now() - startedAt,
      detail: {
        url,
        surface: 'watchlist-alert',
        error: error instanceof Error ? error.message : String(error),
      },
    });
    logger.warn('Alert data fetch threw', {
      module: 'watchlist-alert',
      sourceId,
      err: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// BUG FIX (audit logika & algoritma 2026-08-05, temuan M-9): `getPrice` dulu
// mengembalikan 0 kalau field harga tidak ada - dan alert PRICE_BELOW membandingkan
// `harga <= target`, sehingga 0 <= target SELALU true: alert terkirim ke pengguna
// ("harga sudah turun ke bawah X!") justru saat harga TIDAK diketahui. null sekarang, dan
// evaluasi dilewati.
function getPrice(data: unknown): number | null {
  const input = record(data);
  const stock = record(input.stock);
  const p = finiteNumber(stock.current_price) ?? finiteNumber(input.price);
  return p != null && p > 0 ? p : null;
}

// `raw.rsi` dulu, string hanya cadangan (anti-pola parsing tampilan, temuan M-03).
function getRsi(data: unknown): number | null {
  const analyzers = record(data).analyzers;
  if (!Array.isArray(analyzers)) return null;
  const rsiAnalyzer = analyzers
    .map(record)
    .find((analyzer) => text(analyzer.label)?.includes('RSI'));
  if (!rsiAnalyzer) return null;

  const rawRsi = finiteNumber(record(rsiAnalyzer.raw).rsi);
  if (rawRsi != null) return rawRsi;

  const value = text(rsiAnalyzer.value);
  const match = value?.match(/RSI:\s*([\d.]+)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getLensScore(data: unknown): number | null {
  const input = record(data);
  return finiteNumber(nested(data, 'scoring').total_score) ?? finiteNumber(input.totalScore);
}

function getScoreConfidence(data: unknown): number | null {
  return finiteNumber(nested(data, 'trust').score_confidence_pct)
    ?? finiteNumber(nested(nested(data, 'scoring'), 'explainability').confidence_score);
}

function getResearchLabel(data: unknown): string | null {
  return text(nested(data, 'trust').research_label)
    ?? text(nested(nested(data, 'scoring'), 'explainability').research_label);
}

/** Alert TIDAK boleh dipicu dari payload cache darurat - `_meta.source === 'stale-cache'`
 * bisa berumur sampai 24 jam (lihat TTL.STALE_FALLBACK). Notifikasi harga yang dikirim
 * dari harga kemarin lebih buruk daripada tidak ada notifikasi (temuan M-9). */
function isFreshEnoughForAlert(data: unknown): boolean {
  const input = record(data);
  if (!('_meta' in input)) return true; // payload lama tanpa _meta - jangan matikan alert yang sudah jalan
  const meta = record(input._meta);
  return meta.source !== 'stale-cache' && meta.freshness !== 'STALE';
}

export interface AlertEvaluationContext {
  stock?: unknown;
  breakoutEntry?: unknown;
  breadth?: unknown;
}

function alertTarget(alert: Alert): number | null {
  return finiteNumber(alert.condition_value);
}

export function isTriggered(alert: Alert, ctx: AlertEvaluationContext): boolean {
  const target = alertTarget(alert);
  switch (alert.condition_type) {
    case 'PRICE_BELOW': {
      const p = getPrice(ctx.stock);
      return target != null && p != null && p <= target;
    }
    case 'PRICE_ABOVE': {
      const p = getPrice(ctx.stock);
      return target != null && p != null && p >= target;
    }
    case 'CONSENSUS_STRONG_BUY': {
      // Alert ini adalah jalur actionable. Fail-closed: payload lama/tidak lengkap tanpa
      // `decision` TIDAK boleh menghidupkan ajakan beli. Selain advisory=true, arah aksi
      // resmi juga harus BUY/STRONG BUY; consensus teknikal saja tidak cukup.
      const stock = record(ctx.stock);
      const decision = record(stock.decision);
      if (decision.advisory !== true) return false;
      const action = text(decision.action);
      if (action !== 'BUY' && action !== 'STRONG BUY') return false;
      return text(record(stock.consensusData).kategori) === 'STRONG BUY';
    }
    case 'RSI_OVERSOLD': {
      const rsi = getRsi(ctx.stock);
      return rsi !== null && rsi < 30;
    }
    case 'LENS_SCORE_ABOVE': {
      const score = getLensScore(ctx.stock);
      return target != null && score != null && score >= target;
    }
    case 'LENS_CONFIDENCE_BELOW': {
      const confidence = getScoreConfidence(ctx.stock);
      return target != null && confidence != null && confidence < target;
    }
    case 'BREAKOUT_SCORE_ABOVE': {
      const score = finiteNumber(record(ctx.breakoutEntry).score);
      return target != null && score != null && score >= target;
    }
    case 'BREADTH_ADVANCING_BELOW': {
      const advancing = finiteNumber(record(ctx.breadth).advancing);
      return target != null && advancing != null && advancing < target;
    }
    default:
      return false;
  }
}

function displayValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value;
  return '-';
}

export function formatMessage(alert: Alert, ctx: AlertEvaluationContext): string {
  switch (alert.condition_type) {
    case 'PRICE_BELOW':
    case 'PRICE_ABOVE':
    case 'CONSENSUS_STRONG_BUY':
    case 'RSI_OVERSOLD':
    case 'LENS_SCORE_ABOVE':
    case 'LENS_CONFIDENCE_BELOW': {
      const price = getPrice(ctx.stock);
      const label = alert.condition_type === 'PRICE_BELOW' ? `Harga turun ke bawah ${alert.condition_value}`
        : alert.condition_type === 'PRICE_ABOVE' ? `Harga naik ke atas ${alert.condition_value}`
        : alert.condition_type === 'CONSENSUS_STRONG_BUY' ? 'Konsensus Sangat Positif'
        : alert.condition_type === 'RSI_OVERSOLD' ? 'RSI Oversold (< 30)'
        : alert.condition_type === 'LENS_SCORE_ABOVE' ? `LensScore mencapai minimal ${alert.condition_value}`
        : `Confidence skor turun di bawah ${alert.condition_value}%`;
      const scoring = nested(ctx.stock, 'scoring');
      const score = getLensScore(ctx.stock);
      const kategori = text(scoring.kategori);
      const kategoriLabel = kategori ? getKategoriPresentationLabel(kategori) : '';
      const confidence = getScoreConfidence(ctx.stock);
      const researchLabel = getResearchLabel(ctx.stock);
      return [
        '🚨 <b>SahamLens LensAlert</b>',
        `${alert.symbol} ${label}!`,
        `Price: ${price != null ? price.toLocaleString('id-ID') : 'N/A'}${score != null ? ` | Score: ${score} ${kategoriLabel}` : ''}${confidence != null ? ` | Confidence: ${confidence}%` : ''}`,
        researchLabel ? `Label riset: ${researchLabel}` : 'Label riset: belum tersedia',
        `Cek: /dashboard?symbol=${alert.symbol}`,
      ].join('\n');
    }
    case 'BREAKOUT_SCORE_ABOVE': {
      const entry = record(ctx.breakoutEntry);
      const score = finiteNumber(entry.score);
      const price = finiteNumber(entry.price);
      return [
        '🚨 <b>SahamLens LensAlert - LensRadar</b>',
        `${alert.symbol} Score ${score ?? 'N/A'}/8 (target >= ${alert.condition_value})!`,
        `Price: ${price != null ? price.toLocaleString('id-ID') : displayValue(entry.price)} | Change: ${displayValue(entry.change)} | RR: ${displayValue(entry.rr)}`,
        `Sinyal: ${text(entry.reason) || '-'}`,
        'Cek: /breakout-radar',
      ].join('\n');
    }
    case 'BREADTH_ADVANCING_BELOW': {
      const breadth = record(ctx.breadth);
      return [
        '🚨 <b>SahamLens LensAlert - LensMarket Breadth</b>',
        `Breadth IDX bearish: ${displayValue(breadth.advancing)} saham naik vs ${displayValue(breadth.declining)} turun (target advancing < ${alert.condition_value}).`,
        'Cek: /market-pulse',
      ].join('\n');
    }
    default:
      return `🚨 SahamLens LensAlert: ${alert.symbol} (${alert.condition_type})`;
  }
}

const STOCK_BASED_TYPES = new Set<AlertConditionType>([
  'PRICE_BELOW',
  'PRICE_ABOVE',
  'CONSENSUS_STRONG_BUY',
  'RSI_OVERSOLD',
  'LENS_SCORE_ABOVE',
  'LENS_CONFIDENCE_BELOW',
]);

function breakoutEntries(payload: unknown): Map<string, unknown> {
  const data = record(payload).data;
  if (!Array.isArray(data)) return new Map();
  const entries: Array<[string, unknown]> = [];
  for (const rawEntry of data) {
    const entry = record(rawEntry);
    const symbol = text(entry.symbol);
    if (!symbol) continue;
    entries.push([symbol.replace('.JK', ''), rawEntry]);
  }
  return new Map(entries);
}

export interface AlertCheckResult {
  checked: number;
  triggered: number;
  dataSources: {
    stockSymbols: number;
    stockPayloads: number;
    breakoutLoaded: boolean;
    breadthLoaded: boolean;
  };
  triggeredAlerts: { id: string; message: string }[];
}

export async function checkAndTriggerAlerts(origin: string): Promise<AlertCheckResult> {
  // Sumber data alert sekarang tabel Postgres modules/watchlist (sebelumnya shim
  // lib/supabase.ts) - WAJIB disamakan dengan sumber data /api/alert POST, kalau
  // tidak alert yang dibuat user tidak pernah ketemu di sini (data disconnected).
  const active = await listPendingAlerts();
  if (!active || active.length === 0) {
    return {
      checked: 0,
      triggered: 0,
      dataSources: { stockSymbols: 0, stockPayloads: 0, breakoutLoaded: false, breadthLoaded: false },
      triggeredAlerts: [],
    };
  }

  const stockSymbols = Array.from(new Set(
    active.filter((alert) => STOCK_BASED_TYPES.has(alert.condition_type)).map((alert) => alert.symbol),
  ));
  const stockBySymbol = new Map<string, unknown>();
  // Paralel, bukan for-await sekuensial (Performance Roadmap Fase 1 poin 4) -
  // sebelumnya total waktu = JUMLAH semua fetch simbol unik, bukan MAKSIMUM
  // salah satu (pola yang sama sudah benar di breakout-radar, disamakan di sini).
  const stockResults = await Promise.all(stockSymbols.map((symbol) => fetchJson(`${origin}/api/stock/${symbol}`, 'INTERNAL_STOCK_API')));
  stockSymbols.forEach((symbol, i) => {
    if (stockResults[i] != null) stockBySymbol.set(symbol, stockResults[i]);
  });

  const hasBreakoutAlert = active.some((alert) => alert.condition_type === 'BREAKOUT_SCORE_ABOVE');
  const breakoutData = hasBreakoutAlert ? await fetchJson(`${origin}/api/breakout-radar`, 'INTERNAL_BREAKOUT_RADAR_API') : null;
  const breakoutBySymbol = breakoutEntries(breakoutData);

  const hasBreadthAlert = active.some((alert) => alert.condition_type === 'BREADTH_ADVANCING_BELOW');
  const pulseData = hasBreadthAlert ? await fetchJson(`${origin}/api/market-pulse`, 'INTERNAL_MARKET_PULSE_API') : null;
  const pulse = record(pulseData);

  let triggeredCount = 0;
  const triggeredAlertsData: { id: string; message: string }[] = [];

  for (const alert of active) {
    const ctx: AlertEvaluationContext = {
      stock: stockBySymbol.get(alert.symbol),
      breakoutEntry: breakoutBySymbol.get(alert.symbol.replace('.JK', '')),
      breadth: pulse.breadth,
    };

    const hasData = STOCK_BASED_TYPES.has(alert.condition_type) ? ctx.stock != null
      : alert.condition_type === 'BREAKOUT_SCORE_ABOVE' ? ctx.breakoutEntry != null
      : alert.condition_type === 'BREADTH_ADVANCING_BELOW' ? ctx.breadth != null
      : false;

    if (!hasData) continue;
    // Jangan pernah mengirim notifikasi harga dari data cache darurat (temuan M-9).
    if (STOCK_BASED_TYPES.has(alert.condition_type) && !isFreshEnoughForAlert(ctx.stock)) continue;

    if (isTriggered(alert, ctx)) {
      const msg = formatMessage(alert, ctx);
      triggeredAlertsData.push({ id: alert.id, message: msg.replace(/<[^>]*>?/gm, '') });
      await markTriggered(alert.id);
      triggeredCount++;
    }
  }

  const result = {
    checked: active.length,
    triggered: triggeredCount,
    dataSources: {
      stockSymbols: stockSymbols.length,
      stockPayloads: stockBySymbol.size,
      breakoutLoaded: !hasBreakoutAlert || breakoutData != null,
      breadthLoaded: !hasBreadthAlert || pulseData != null,
    },
    triggeredAlerts: triggeredAlertsData,
  };
  logger.info('Watchlist alert evaluation completed', {
    module: 'watchlist-alert',
    checked: result.checked,
    triggered: result.triggered,
    ...result.dataSources,
  });
  return result;
}

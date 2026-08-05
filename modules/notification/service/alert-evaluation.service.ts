import { listPendingAlerts, markTriggered } from '@/modules/watchlist';
import { internalServiceHeaders } from '@/shared/auth/internal-service';

// BUILD 002 (Refactor Domain) - dipindah dari app/api/alerts/check/route.ts, verbatim.
// modules/notification bergantung SATU ARAH ke modules/watchlist (baca daftar alert +
// tandai terpicu) - watchlist tidak pernah balik mengimpor notification, jadi tidak ada
// circular dependency (pola sama seperti modules/watchlist -> shared/auth/session).

async function fetchJson(url: string) {
  try {
    // Header internal (lihat shared/auth/internal-service.ts) - tanpa ini panggilan
    // server-to-server ke /api/stock, /api/breakout-radar, /api/market-pulse selalu
    // 401/402 karena route-route itu di-gate session+Pro yang ditujukan buat request
    // browser user, bukan job evaluasi alert ini.
    const res = await fetch(url, { cache: 'no-store', headers: internalServiceHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// BUG FIX (audit logika & algoritma 2026-08-05, temuan M-9): `getPrice` dulu
// mengembalikan 0 kalau field harga tidak ada - dan alert PRICE_BELOW membandingkan
// `harga <= target`, sehingga 0 <= target SELALU true: alert terkirim ke pengguna
// ("harga sudah turun ke bawah X!") justru saat harga TIDAK diketahui. null sekarang, dan
// evaluasi dilewati.
function getPrice(data: any): number | null {
  const p = data?.stock?.current_price ?? data?.price;
  return typeof p === 'number' && p > 0 ? p : null;
}

// `raw.rsi` dulu, string hanya cadangan (anti-pola parsing tampilan, temuan M-03).
function getRsi(data: any): number | null {
  const rsiAnalyzer = data?.analyzers?.find((a: any) => a.label?.includes('RSI'));
  if (typeof rsiAnalyzer?.raw?.rsi === 'number') return rsiAnalyzer.raw.rsi;
  const match = rsiAnalyzer?.value?.match(/RSI:\s*([\d.]+)/);
  return match ? Number(match[1]) : null;
}

/** Alert TIDAK boleh dipicu dari payload cache darurat - `_meta.source === 'stale-cache'`
 * bisa berumur sampai 24 jam (lihat TTL.STALE_FALLBACK). Notifikasi harga yang dikirim
 * dari harga kemarin lebih buruk daripada tidak ada notifikasi (temuan M-9). */
function isFreshEnoughForAlert(data: any): boolean {
  const meta = data?._meta;
  if (!meta) return true; // payload lama tanpa _meta - jangan matikan alert yang sudah jalan
  return meta.source !== 'stale-cache' && meta.freshness !== 'STALE';
}

function isTriggered(alert: any, ctx: { stock?: any; breakoutEntry?: any; breadth?: any }): boolean {
  const target = Number(alert.condition_value);
  switch (alert.condition_type) {
    case 'PRICE_BELOW': {
      const p = getPrice(ctx.stock);
      return p != null && p <= target;
    }
    case 'PRICE_ABOVE': {
      const p = getPrice(ctx.stock);
      return p != null && p >= target;
    }
    case 'CONSENSUS_STRONG_BUY':
      // Phase 0 / P0-3: alert ini MENGIRIM ajakan beli ke perangkat pengguna, jadi ia
      // jalur rekomendasi actionable - bukan sekadar tampilan. Gerbang kelayakan dari
      // /api/stock/[ticker] (`decision.advisory`) wajib dihormati di sini juga, kalau
      // tidak seluruh gate bisa di-bypass lewat notifikasi. `advisory === false` saja
      // yang memblokir: payload lama/stale tanpa field `decision` tidak mengubah
      // perilaku alert yang sudah ada.
      if (ctx.stock?.decision?.advisory === false) return false;
      return ctx.stock?.consensusData?.kategori === 'STRONG BUY';
    case 'RSI_OVERSOLD': {
      const rsi = getRsi(ctx.stock);
      return rsi !== null && rsi < 30;
    }
    case 'BREAKOUT_SCORE_ABOVE':
      return typeof ctx.breakoutEntry?.score === 'number' && ctx.breakoutEntry.score >= target;
    case 'BREADTH_ADVANCING_BELOW':
      return typeof ctx.breadth?.advancing === 'number' && ctx.breadth.advancing < target;
    default:
      return false;
  }
}

function formatMessage(alert: any, ctx: { stock?: any; breakoutEntry?: any; breadth?: any }): string {
  switch (alert.condition_type) {
    case 'PRICE_BELOW':
    case 'PRICE_ABOVE':
    case 'CONSENSUS_STRONG_BUY':
    case 'RSI_OVERSOLD': {
      const price = getPrice(ctx.stock);
      const label = alert.condition_type === 'PRICE_BELOW' ? `Harga turun ke bawah ${alert.condition_value}`
        : alert.condition_type === 'PRICE_ABOVE' ? `Harga naik ke atas ${alert.condition_value}`
        : alert.condition_type === 'CONSENSUS_STRONG_BUY' ? 'Konsensus STRONG BUY'
        : 'RSI Oversold (< 30)';
      const score = ctx.stock?.scoring?.total_score;
      const kategori = ctx.stock?.scoring?.kategori;
      return [
        '🚨 <b>SahamLens LensAlert</b>',
        `${alert.symbol} ${label}!`,
        `Price: ${price != null ? price.toLocaleString('id-ID') : 'N/A'}${score != null ? ` | Score: ${score} ${kategori || ''}` : ''}`,
        `Cek: /dashboard?symbol=${alert.symbol}`,
      ].join('\n');
    }
    case 'BREAKOUT_SCORE_ABOVE': {
      const e = ctx.breakoutEntry;
      return [
        '🚨 <b>SahamLens LensAlert - LensRadar</b>',
        `${alert.symbol} Score ${e?.score}/8 (target >= ${alert.condition_value})!`,
        `Price: ${e?.price?.toLocaleString?.('id-ID') ?? e?.price} | Change: ${e?.change} | RR: ${e?.rr}`,
        `Sinyal: ${e?.reason || '-'}`,
        `Cek: /breakout-radar`,
      ].join('\n');
    }
    case 'BREADTH_ADVANCING_BELOW': {
      const b = ctx.breadth;
      return [
        '🚨 <b>SahamLens LensAlert - LensMarket Breadth</b>',
        `Breadth IDX bearish: ${b?.advancing} saham naik vs ${b?.declining} turun (target advancing < ${alert.condition_value}).`,
        `Cek: /market-pulse`,
      ].join('\n');
    }
    default:
      return `🚨 SahamLens LensAlert: ${alert.symbol} (${alert.condition_type})`;
  }
}

const STOCK_BASED_TYPES = ['PRICE_BELOW', 'PRICE_ABOVE', 'CONSENSUS_STRONG_BUY', 'RSI_OVERSOLD'];

export interface AlertCheckResult {
  checked: number;
  triggered: number;
  triggeredAlerts: { id: string; message: string }[];
}

export async function checkAndTriggerAlerts(origin: string): Promise<AlertCheckResult> {
  // Sumber data alert sekarang tabel Postgres modules/watchlist (sebelumnya shim
  // lib/supabase.ts) - WAJIB disamakan dengan sumber data /api/alert POST, kalau
  // tidak alert yang dibuat user tidak pernah ketemu di sini (data disconnected).
  const active = await listPendingAlerts();
  if (!active || active.length === 0) {
    return { checked: 0, triggered: 0, triggeredAlerts: [] };
  }

  const stockSymbols = Array.from(new Set<string>(active.filter((a: any) => STOCK_BASED_TYPES.includes(a.condition_type)).map((a: any) => a.symbol)));
  const stockBySymbol = new Map<string, any>();
  // Paralel, bukan for-await sekuensial (Performance Roadmap Fase 1 poin 4) -
  // sebelumnya total waktu = JUMLAH semua fetch simbol unik, bukan MAKSIMUM
  // salah satu (pola yang sama sudah benar di breakout-radar, disamakan di sini).
  const stockResults = await Promise.all(stockSymbols.map((symbol) => fetchJson(`${origin}/api/stock/${symbol}`)));
  stockSymbols.forEach((symbol, i) => {
    if (stockResults[i]) stockBySymbol.set(symbol, stockResults[i]);
  });

  const hasBreakoutAlert = active.some((a: any) => a.condition_type === 'BREAKOUT_SCORE_ABOVE');
  const breakoutData = hasBreakoutAlert ? await fetchJson(`${origin}/api/breakout-radar`) : null;
  const breakoutBySymbol = new Map<string, any>((breakoutData?.data || []).map((e: any) => [e.symbol.replace('.JK', ''), e]));

  const hasBreadthAlert = active.some((a: any) => a.condition_type === 'BREADTH_ADVANCING_BELOW');
  const pulseData = hasBreadthAlert ? await fetchJson(`${origin}/api/market-pulse`) : null;

  let triggeredCount = 0;
  const triggeredAlertsData: { id: string; message: string }[] = [];

  for (const alert of active) {
    const ctx = {
      stock: stockBySymbol.get(alert.symbol),
      breakoutEntry: breakoutBySymbol.get(alert.symbol.replace('.JK', '')),
      breadth: pulseData?.breadth,
    };

    const hasData = STOCK_BASED_TYPES.includes(alert.condition_type) ? !!ctx.stock
      : alert.condition_type === 'BREAKOUT_SCORE_ABOVE' ? !!ctx.breakoutEntry
      : alert.condition_type === 'BREADTH_ADVANCING_BELOW' ? !!ctx.breadth
      : false;

    if (!hasData) continue;
    // Jangan pernah mengirim notifikasi harga dari data cache darurat (temuan M-9).
    if (STOCK_BASED_TYPES.includes(alert.condition_type) && !isFreshEnoughForAlert(ctx.stock)) continue;

    if (isTriggered(alert, ctx)) {
      const msg = formatMessage(alert, ctx);
      triggeredAlertsData.push({ id: alert.id, message: msg.replace(/<[^>]*>?/gm, '') });
      await markTriggered(alert.id);
      triggeredCount++;
    }
  }

  return { checked: active.length, triggered: triggeredCount, triggeredAlerts: triggeredAlertsData };
}

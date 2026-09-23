import { getMarketAwareCacheHeaders, getMarketAwareTtlSec } from '@/shared/cache/ttl-policy';
import { classifyFreshness } from '@/shared/http/freshness';
import { isProviderCircuitOpen, recordProviderFailure, recordProviderSuccess } from '@/shared/http/provider-circuit-breaker';
import { resolvePreviousClose } from '@/shared/market/previous-close';
import { recordDataSourceHealth } from '@/modules/observability/service/data-source-health.service';
import { readIdxIhsgEod } from '@/modules/market/service/idx-ihsg-eod.service';
import { isMarketOpen } from '@/lib/utils/market';

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export interface LivePriceResult {
  available: boolean;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}

/**
 * Fetch one IDX/Yahoo chart snapshot and derive previous-close/freshness from the same
 * source payload. Provider failure remains fail-closed: no fabricated or silent provider
 * fallback is returned from this service.
 */
/**
 * Koreksi acuan close-to-close untuk ^JKSE (insiden 2026-09-23, laporan operator:
 * banner menampilkan -1% saat IHSG live +0,64%). Yahoo sering mengembalikan
 * meta.previousClose yang basi untuk indeks IDX (menunjuk sesi sebelum terakhir),
 * sementara artefak EOD resmi BEI (data/idx-index/ihsg.json) memuat close sesi
 * terakhir yang benar. Kalau tanggal artefak LEBIH BARU dari tanggal bar harian
 * Yahoo yang dijadikan acuan previousClose, pakai close artefak - fail-closed ke
 * data resmi, bukan angka karangan.
 */
function jakartaDateFromTimestamp(value: string | null): string | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(timestamp);
}

/**
 * Setelah sesi selesai, artefak Index Summary resmi BEI adalah sumber final IHSG.
 * Yahoo boleh terlambat/revisi, sehingga tidak boleh menimpa close resmi pada tanggal
 * yang sama. Saat sesi masih berjalan, Yahoo tetap dipakai agar harga intraday hidup.
 */
export function applyOfficialIhsgEodAfterClose(
  ticker: string,
  yahoo: { price: number; changePercent: number | null; previousClose: number | null; dataTimestamp: string | null },
  official: ReturnType<typeof readIdxIhsgEod>,
  marketOpen: boolean,
): { price: number; changePercent: number | null; previousClose: number | null; dataTimestamp: string | null; source: 'YAHOO' | 'IDX_OFFICIAL_INDEX_SUMMARY' } {
  if (ticker !== '^JKSE' || marketOpen || !official) return { ...yahoo, source: 'YAHOO' };
  const yahooDate = jakartaDateFromTimestamp(yahoo.dataTimestamp);
  if (yahooDate && official.tradeDate < yahooDate) return { ...yahoo, source: 'YAHOO' };
  return {
    price: official.price,
    changePercent: Number(official.changePct.toFixed(2)),
    previousClose: official.previousClose,
    dataTimestamp: official.sourceTimestamp,
    source: 'IDX_OFFICIAL_INDEX_SUMMARY',
  };
}

export function correctIhsgPreviousClose(
  ticker: string,
  timestamps: number[] | undefined,
  closes: (number | null)[] | undefined,
  yahooPreviousClose: number | null,
  dataDir?: string,
): { previousClose: number | null; source: 'YAHOO' | 'IDX_OFFICIAL_INDEX_SUMMARY' } {
  if (ticker !== '^JKSE' || yahooPreviousClose == null || !Array.isArray(timestamps) || timestamps.length < 1) {
    return { previousClose: yahooPreviousClose, source: 'YAHOO' };
  }
  const eod = readIdxIhsgEod(dataDir);
  if (!eod || !(eod.price > 0) || eod.price === yahooPreviousClose) {
    return { previousClose: yahooPreviousClose, source: 'YAHOO' };
  }
  const jakartaDate = (ts: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts * 1000);
  const todayJakarta = jakartaDate(Date.now() / 1000);
  // Tanggal bar TERAKHIR dengan close valid yang BUKAN bar sesi berjalan.
  // (a) Yahoo bisa punya bar dengan close null (nyata 22 Sep 2026);
  // (b) bar hari ini adalah bar LIVE - close-nya harga berjalan, bukan close
  //     sesi yang selesai, jadi tidak boleh jadi acuan close-to-close.
  let prevCloseBarDate: string | null = null;
  if (Array.isArray(closes)) {
    for (let i = Math.min(timestamps.length, closes.length) - 1; i >= 0; i--) {
      const c = closes[i];
      const barDate = jakartaDate(timestamps[i]);
      if (barDate >= todayJakarta) continue;
      if (typeof c === 'number' && Number.isFinite(c) && c > 0) {
        prevCloseBarDate = barDate;
        break;
      }
    }
  }
  if (prevCloseBarDate && eod.tradeDate > prevCloseBarDate) {
    return { previousClose: eod.price, source: 'IDX_OFFICIAL_INDEX_SUMMARY' };
  }
  return { previousClose: yahooPreviousClose, source: 'YAHOO' };
}

export async function fetchLivePriceSnapshot(ticker: string): Promise<LivePriceResult> {
  const startedAt = Date.now();
  const yahooCircuitOpen = await isProviderCircuitOpen('YAHOO_CHART');
  try {
    if (yahooCircuitOpen) throw new Error('YAHOO_CIRCUIT_OPEN');

    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1mo&interval=1d`;
    const yahooRes = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      next: { revalidate: getMarketAwareTtlSec() },
    });

    if (yahooRes.ok) {
      await recordProviderSuccess('YAHOO_CHART');
      const data = await yahooRes.json();
      const result = data?.chart?.result?.[0];
      const meta = result?.meta;
      const lastPrice = meta?.regularMarketPrice;

      if (isFinitePositive(lastPrice)) {
        const resolved = resolvePreviousClose({
          timestamps: result?.timestamp,
          closes: result?.indicators?.quote?.[0]?.close,
          metaPreviousClose: meta?.previousClose,
          metaChartPreviousClose: meta?.chartPreviousClose,
        });
        const corrected = correctIhsgPreviousClose(ticker, result?.timestamp, result?.indicators?.quote?.[0]?.close, resolved.previousClose);
        if (corrected.source === 'IDX_OFFICIAL_INDEX_SUMMARY' && process.env.NODE_ENV !== 'test') {
          console.warn(`[live:${ticker}] previousClose Yahoo basi (${resolved.previousClose}) dikoreksi ke close resmi BEI ${corrected.previousClose}`);
        }
        const previousClose = corrected.previousClose;
        const fresh = classifyFreshness(meta?.regularMarketTime);
        const marketOpen = isMarketOpen(new Date());
        const finalIhsg = applyOfficialIhsgEodAfterClose(
          ticker,
          {
            price: lastPrice,
            changePercent: previousClose != null ? ((lastPrice - previousClose) / previousClose) * 100 : null,
            previousClose,
            dataTimestamp: fresh.dataTimestamp,
          },
          readIdxIhsgEod(),
          marketOpen,
        );

        if (resolved.metaDisagrees) {
          console.warn(
            `[live:${ticker}] meta.previousClose=${resolved.metaValue} berbeda dari riwayat harian=${previousClose} - memakai riwayat`,
          );
        }

        const volume = isFiniteNonNegative(meta?.regularMarketVolume) ? meta.regularMarketVolume : null;
        if (process.env.NODE_ENV !== 'test') await recordDataSourceHealth({
          sourceId: finalIhsg.source === 'IDX_OFFICIAL_INDEX_SUMMARY' ? 'IDX_OFFICIAL_INDEX_SUMMARY' : 'YAHOO_CHART',
          ok: true, latencyMs: Date.now() - startedAt,
          dataObservedAt: finalIhsg.dataTimestamp,
          detail: { endpoint: 'live-price', freshness: fresh.freshness },
        });

        return {
          available: true,
          body: {
            price: finalIhsg.price,
            changePercent: finalIhsg.changePercent,
            previousClose: finalIhsg.previousClose,
            volume,
            lastUpdate: finalIhsg.dataTimestamp,
            // Setelah close, nilai resmi BEI menang atas Yahoo yang bisa terlambat.
            asOfLabel: finalIhsg.dataTimestamp == null
              ? null
              : marketOpen
                ? 'Live'
                : `per penutupan ${new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' }).format(new Date(finalIhsg.dataTimestamp))}`,
            dataTimestamp: finalIhsg.dataTimestamp,
            ageSeconds: finalIhsg.dataTimestamp == null ? null : Math.max(0, Math.floor((Date.now() - new Date(finalIhsg.dataTimestamp).getTime()) / 1000)),
            freshness: finalIhsg.source === 'IDX_OFFICIAL_INDEX_SUMMARY' ? 'EOD' : fresh.freshness,
            source: finalIhsg.source === 'IDX_OFFICIAL_INDEX_SUMMARY' ? 'IDX Official Index Summary' : 'Yahoo Finance',
            delay: null,
          },
          headers: getMarketAwareCacheHeaders(),
        };
      }
      console.warn(`Yahoo Finance returned no valid price for ${ticker}`);
    } else if (yahooRes.status === 429 || yahooRes.status === 403) {
      await recordProviderFailure('YAHOO_CHART', { immediateOpen: true });
      console.warn(`Yahoo Finance blocked (Status ${yahooRes.status}) for ${ticker}`);
    } else {
      await recordProviderFailure('YAHOO_CHART');
      console.warn(`Yahoo Finance error: ${yahooRes.statusText}`);
    }
  } catch (error) {
    if (!(error instanceof Error && error.message === 'YAHOO_CIRCUIT_OPEN')) {
      await recordProviderFailure('YAHOO_CHART');
    }
    console.error('Failed to fetch from Yahoo Finance:', error);
  }

  if (process.env.NODE_ENV !== 'test') await recordDataSourceHealth({
    sourceId: 'YAHOO_CHART', ok: false, latencyMs: Date.now() - startedAt,
    detail: { endpoint: 'live-price', ticker: ticker.replace(/\.JK$/i, '') },
  });

  return {
    available: false,
    body: {
      price: null,
      changePercent: null,
      volume: null,
      lastUpdate: null,
      dataTimestamp: null,
      ageSeconds: null,
      freshness: 'UNKNOWN',
      source: null,
      delay: null,
      error: 'Data harga tidak tersedia saat ini',
    },
  };
}

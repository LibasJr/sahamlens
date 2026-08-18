// BUILD 009 (Performance) - fetch+parse OHLC Yahoo Finance chart yang SAMA PERSIS
// sebelumnya diduplikasi di app/api/council/route.ts (getTechnicalData) dan
// modules/ai/service/orchestrator.service.ts (fetchHistory) - disatukan di sini,
// dipakai ulang oleh keduanya. app/api/stock/[ticker]/route.ts SENGAJA TIDAK
// diikutsertakan/disentuh - punya kebutuhan lebih kompleks (range dinamis, cache
// stale-fallback, Promise.race dengan quoteSummary) dan sudah stabil di production
// sebagai jalur trafik/revenue tertinggi aplikasi ini - risiko refactor lebih besar
// dari manfaat dedup di titik itu.

import { resolvePreviousClose } from '@/shared/market/previous-close';
import { recordDataSourceHealth } from '@/modules/observability/service/data-source-health.service';
import { isProviderCircuitOpen, recordProviderFailure, recordProviderSuccess } from '@/shared/http/provider-circuit-breaker';

import { applyIdxLq45EodPrimary } from './idx-lq45-history.service';
export interface OhlcRow {
  Date: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
  // BUG FIX (audit integritas data 2026-08-03, temuan M-01): `Close` adalah harga
  // penutupan APA ADANYA (sudah disesuaikan untuk stock split, TAPI BUKAN untuk
  // dividen - diverifikasi empiris: BBCA turun ~4.8% dari `Close` ke `AdjClose` di
  // awal rentang 1 tahun, sebanding dengan yield dividennya). Indikator berbasis TREN
  // (MA/EMA/RSI/MACD/momentum) yang memakai `Close` mentah bisa salah baca penurunan
  // harga di tanggal ex-dividend sebagai sinyal BEARISH murni dari pasar, padahal itu
  // peristiwa korporasi. `AdjClose` (disesuaikan split DAN dividen, langsung dari Yahoo
  // `indicators.adjclose`) disediakan di sini sebagai field TAMBAHAN - `Close` TETAP
  // dipakai apa adanya untuk apa pun yang butuh harga SUNGGUHAN (support/resistance
  // untuk order riil, chart yang ditampilkan ke pengguna, entry/exit trading raw).
  //
  // FASE 3 (2026-08-06): AdjClose TIDAK LAGI di-fallback ke Close. Fallback itu
  // menyembunyikan perpindahan basis di tengah seri dan bisa membuat MA/RSI/MACD
  // terlihat valid padahal adjusted price tidak tersedia. Analyzer return-based wajib
  // fail-closed kalau AdjClose hilang.
  AdjClose?: number;
}

export interface YahooHistoryResult {
  history: OhlcRow[];
  currentPrice: number;
  /** Unix seconds - `meta.regularMarketTime` dari Yahoo, waktu bar harga SESUNGGUHNYA
   * (bukan `Date.now()` server) - dipakai pemanggil yang butuh melaporkan seberapa
   * segar data ini (lihat shared/http/freshness.ts:classifyFreshness). */
  regularMarketTime: number | null;
  /** `meta.previousClose` dari Yahoo - penutupan sesi SEBELUMNYA, sumber yang SAMA
   * dengan yang dipakai /api/live/[ticker] untuk menghitung changePercent di header.
   * Ditambahkan supaya pemanggil bisa melaporkan perubahan harga tanpa menghitung
   * ulang dari bar terakhir (yang bisa berbeda tipis dan bikin dua angka di layar
   * saling bertentangan - lihat catatan di marketBlock, app/api/chat/chat-data-router.ts). */
  previousClose: number | null;
}

export async function fetchYahooHistory(ticker: string, range: string = '1y', options: { sourcePolicy?: 'AUTO' | 'YAHOO_ONLY' } = {}): Promise<YahooHistoryResult | null> {
  if (await isProviderCircuitOpen('YAHOO_CHART')) return null;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=1d`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) { await recordProviderFailure('YAHOO_CHART', { immediateOpen: res.status === 403 || res.status === 429 }); void recordDataSourceHealth({ sourceId: 'YAHOO_CHART', ok: false, latencyMs: Date.now() - startedAt, detail: { status: res.status } }); return null; }

    const data = await res.json();
    const result = data.chart.result?.[0];
    if (!result) { await recordProviderSuccess('YAHOO_CHART'); void recordDataSourceHealth({ sourceId: 'YAHOO_CHART', ok: false, latencyMs: Date.now() - startedAt, detail: { reason: 'empty_result' } }); return null; }

    const currentPrice = result.meta.regularMarketPrice;
    const timestamps = result.timestamp || [];
    const quote = result.indicators.quote[0];
    const adjcloseArr: (number | null)[] | undefined = result.indicators.adjclose?.[0]?.adjclose;

    const history: OhlcRow[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quote.close[i] !== null) {
        const adj = adjcloseArr?.[i];
        history.push({
          Date: new Date(timestamps[i] * 1000).toISOString(),
          Open: quote.open[i],
          High: quote.high[i],
          Low: quote.low[i],
          Close: quote.close[i],
          Volume: quote.volume[i],
          ...(typeof adj === 'number' && Number.isFinite(adj) && adj > 0 ? { AdjClose: adj } : {}),
        });
      }
    }
    if (history.length === 0) { await recordProviderSuccess('YAHOO_CHART'); void recordDataSourceHealth({ sourceId: 'YAHOO_CHART', ok: false, latencyMs: Date.now() - startedAt, detail: { reason: 'empty_history' } }); return null; }
    const regularMarketTime = typeof result.meta.regularMarketTime === 'number' ? result.meta.regularMarketTime : null;
    // Diambil dari riwayat harian, BUKAN `meta.previousClose` mentah seperti sebelumnya.
    // Terukur 2026-08-14: meta melaporkan penutupan 7 Agustus untuk TLKM/ASII/BMRI -
    // seminggu basi - sehingga TLKM tampil -4,43% padahal sesungguhnya 0,00% dan BBCA
    // tampil 0,00% padahal +0,39%. Tiga dari enam sampel berbalik ARAH, bukan sekadar
    // meleset angkanya.
    //
    // Bar mentah dipakai, bukan `history` di atas: history sengaja membuang baris
    // ber-close null, dan justru bar null itulah penanda sesi berjalan yang menentukan
    // mana "hari ini" (lihat shared/market/previous-close.ts).
    const { previousClose } = resolvePreviousClose({
      timestamps,
      closes: quote.close,
      metaPreviousClose: result.meta.previousClose,
      metaChartPreviousClose: result.meta.chartPreviousClose,
    });
    await recordProviderSuccess('YAHOO_CHART');
    void recordDataSourceHealth({ sourceId: 'YAHOO_CHART', ok: true, latencyMs: Date.now() - startedAt, dataObservedAt: regularMarketTime ? new Date(regularMarketTime * 1000).toISOString() : null, detail: { tickerSample: ticker, range } });
    const eod = options.sourcePolicy === 'YAHOO_ONLY'
      ? null
      : await applyIdxLq45EodPrimary(ticker, range, history);
    return {
      history: eod?.history ?? history,
      currentPrice,
      regularMarketTime,
      previousClose,
      historySource: eod?.source ?? 'YAHOO_CHART',
      liveQuoteSource: 'YAHOO_CHART',
      adjustedCloseSource: eod?.adjustedCloseSource ?? (history.some((row) => typeof row.AdjClose === 'number') ? 'YAHOO_CHART' : null),
      universeVersion: eod?.universeVersion ?? null,
      reconciliationStatus: eod?.latestCloseReconciliation ?? null,
    } as YahooHistoryResult & Record<string, unknown>;
  } catch (e) {
    clearTimeout(timeoutId);
    await recordProviderFailure('YAHOO_CHART');
    void recordDataSourceHealth({ sourceId: 'YAHOO_CHART', ok: false, latencyMs: Date.now() - startedAt, detail: { reason: e instanceof Error ? e.name : 'fetch_error' } });
    return null;
  }
}

/** Research/validation escape hatch: immutable Yahoo-only input for legacy datasets. */
export async function fetchYahooHistoryDirect(ticker: string, range: string = '1y'): Promise<YahooHistoryResult | null> {
  return fetchYahooHistory(ticker, range, { sourcePolicy: 'YAHOO_ONLY' });
}


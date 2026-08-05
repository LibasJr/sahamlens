// BUILD 009 (Performance) - fetch+parse OHLC Yahoo Finance chart yang SAMA PERSIS
// sebelumnya diduplikasi di app/api/council/route.ts (getTechnicalData) dan
// modules/ai/service/orchestrator.service.ts (fetchHistory) - disatukan di sini,
// dipakai ulang oleh keduanya. app/api/stock/[ticker]/route.ts SENGAJA TIDAK
// diikutsertakan/disentuh - punya kebutuhan lebih kompleks (range dinamis, cache
// stale-fallback, Promise.race dengan quoteSummary) dan sudah stabil di production
// sebagai jalur trafik/revenue tertinggi aplikasi ini - risiko refactor lebih besar
// dari manfaat dedup di titik itu.

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
}

export async function fetchYahooHistory(ticker: string, range: string = '1y'): Promise<YahooHistoryResult | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=1d`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;

    const data = await res.json();
    const result = data.chart.result?.[0];
    if (!result) return null;

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
    if (history.length === 0) return null;
    const regularMarketTime = typeof result.meta.regularMarketTime === 'number' ? result.meta.regularMarketTime : null;
    return { history, currentPrice, regularMarketTime };
  } catch (e) {
    clearTimeout(timeoutId);
    return null;
  }
}

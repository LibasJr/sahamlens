import { NextResponse } from 'next/server';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';


function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker: rawTicker } = await params;
  const normalizedTicker = normalizeIdxTickerParam(rawTicker, { allowMarketIndex: true });
  if (!normalizedTicker) return NextResponse.json({ error: 'Ticker tidak valid' }, { status: 400 });
  const { searchParams } = new URL(request.url);
  // Default '1Y' (bukan lagi '1M') - permintaan eksplisit supaya semua chart (Beranda,
  // Teknikal, Dashboard) default menampilkan histori 1 tahun.
  const tf = searchParams.get('tf') || '1Y';

  let range = '6mo';
  let interval = '1d';
  let sliceLastNDays: number | null = null;
  if (tf === '1D') { range = '1d'; interval = '5m'; }
  else if (tf === '3D') { range = '5d'; interval = '15m'; sliceLastNDays = 3; }
  else if (tf === '7D') { range = '5d'; interval = '15m'; }
  else if (tf === '1M') { range = '1mo'; interval = '1d'; }
  else if (tf === '3M') { range = '3mo'; interval = '1d'; }
  // 1Y, 10Y & ALL sengaja TETAP candle harian (bukan mingguan/bulanan) - permintaan
  // eksplisit supaya pergerakan harian tetap terlihat penuh di rentang panjang, bukan
  // diringkas.
  else if (tf === '1Y') { range = '1y'; interval = '1d'; }
  else if (tf === '10Y') { range = '10y'; interval = '1d'; }
  else if (tf === 'ALL') { range = '20y'; interval = '1d'; }

  const ticker = normalizedTicker;
  const isMarketIndex = ticker.startsWith('^');

  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`;
    const res = await fetch(yahooUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      // TTL market-aware SALAH untuk deret candle. Saat bursa tutup ia mengembalikan 6 jam
      // (MARKET_CLOSED_TTL_SEC), padahal justru di jendela itulah bar terakhir baru
      // terbentuk - payload Yahoo yang ditarik pra-bursa dibekukan sampai siang, isinya
      // belum punya bar hari ini. Diperparah `revalidate` Next yang stale-while-revalidate:
      // lewat TTL pun pembaca PERTAMA tetap disajikan payload basi. Terukur 2026-08-18 pada
      // ANTM: request #1 balas lilin terakhir 13 Agu (3030), request #2 balas 18 Agu (3100),
      // sementara header /api/stock/ANTM menampilkan 3100 sepanjang waktu.
      //
      // Fallback penyusun lilin sesi berjalan di bawah tidak bisa menambal ini karena
      // `meta` yang dibacanya berasal dari payload basi yang sama.
      next: { revalidate: 60 }
    });

    if (!res.ok) throw new Error('Failed to fetch from Yahoo');

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('No data');

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const isIntraday = interval.endsWith('m') || interval.endsWith('h');

    let history: {
      time: string;
      open: number;
      high: number;
      low: number;
      close: number;
      price: number;
      volume: number;
      sessionStatus?: 'COMPLETE' | 'PARTIAL';
      openEstimated?: boolean;
      openSource?: 'PROVIDER' | 'PREVIOUS_CLOSE_PROXY';
    }[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const timestamp = timestamps[i];
      const open = quote.open?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      const close = quote.close?.[i];
      const volume = quote.volume?.[i];
      // Yahoo dapat mengirim volume null untuk indeks (^JKSE). OHLC indeks tetap sah;
      // angka 0 di sini berarti volume agregat memang tidak disediakan, bukan volume
      // transaksi saham nol. Untuk emiten, validasi volume tetap fail-closed.
      const normalizedVolume = isFiniteNumber(volume) && volume >= 0
        ? volume
        : isMarketIndex
          ? 0
          : null;

      if (
        isFiniteNumber(timestamp) &&
        isFiniteNumber(open) &&
        isFiniteNumber(high) &&
        isFiniteNumber(low) &&
        isFiniteNumber(close) &&
        normalizedVolume != null &&
        close > 0 &&
        high >= low &&
        normalizedVolume >= 0
      ) {
        const iso = new Date(timestamp * 1000).toISOString();
        history.push({ time: isIntraday ? iso : iso.split('T')[0], open, high, low, close, price: close, volume: normalizedVolume });
      }
    }

    // Sesi berjalan sering BELUM punya bar harian utuh di Yahoo - `close`-nya masih null,
    // sehingga bar itu tersaring habis oleh validasi di atas dan chart berhenti satu sesi
    // lebih awal daripada harga yang ditampilkan di headernya. Terukur 2026-08-14 pada
    // DGWG: lilin terakhir 12 Agu (332) sementara header menampilkan 318 dari 13 Agu.
    // Dua angka tentang saham yang sama, di layar yang sama, berbeda satu hari.
    //
    // `meta` di respons YANG SAMA sudah memuat sesi itu, jadi lilinnya disusun dari sana
    // alih-alih dibiarkan hilang. Hanya untuk chart HARIAN - jalur intraday sudah memuat
    // sesi berjalan lewat barnya sendiri.
    if (!isIntraday && history.length > 0) {
      const meta = result.meta || {};
      const sesiTs = meta.regularMarketTime;
      const sesiClose = meta.regularMarketPrice;
      if (isFiniteNumber(sesiTs) && isFiniteNumber(sesiClose) && sesiClose > 0) {
        const sesiTanggal = new Date(sesiTs * 1000).toISOString().split('T')[0];
        const sudahAda = history.some((h) => h.time.slice(0, 10) === sesiTanggal);
        if (!sudahAda) {
          const high = isFiniteNumber(meta.regularMarketDayHigh) ? meta.regularMarketDayHigh : sesiClose;
          const low = isFiniteNumber(meta.regularMarketDayLow) ? meta.regularMarketDayLow : sesiClose;
          // Yahoo kadang belum mengirim `regularMarketOpen` untuk bar sesi berjalan.
          // Chart tetap menampilkan sesi berjalan agar pengguna tidak melihat grafik yang
          // tertinggal satu hari, tetapi proxy open WAJIB diberi provenance. Downstream
          // candlestick recognition/volume-ratio dilarang memperlakukannya sebagai candle
          // penutupan yang sudah lengkap.
          const penutupanSebelumnya = history[history.length - 1].close;
          const hasProviderOpen = isFiniteNumber(meta.regularMarketOpen) && meta.regularMarketOpen > 0;
          const open = hasProviderOpen
            ? meta.regularMarketOpen
            : Math.min(Math.max(penutupanSebelumnya, Math.min(low, sesiClose)), Math.max(high, sesiClose));
          const volume = isFiniteNumber(meta.regularMarketVolume) && meta.regularMarketVolume >= 0
            ? meta.regularMarketVolume
            : isMarketIndex ? 0 : null;
          if (volume != null && Math.max(high, sesiClose) >= Math.min(low, sesiClose)) {
            history.push({
              time: sesiTanggal,
              open,
              high: Math.max(high, sesiClose, open),
              low: Math.min(low, sesiClose, open),
              close: sesiClose,
              price: sesiClose,
              volume,
              // Metadata kualitas ini sengaja ikut dikirim ke client. Nilai open proxy
              // hanya untuk visualisasi candle sesi berjalan, bukan input pattern/score.
              sessionStatus: 'PARTIAL',
              openEstimated: !hasProviderOpen,
              openSource: hasProviderOpen ? 'PROVIDER' : 'PREVIOUS_CLOSE_PROXY',
            });
          }
        }
      }
    }

    if (sliceLastNDays != null) {
      const uniqueDays = Array.from(new Set(history.map((h) => h.time.slice(0, 10))));
      const keepDays = new Set(uniqueDays.slice(-sliceLastNDays));
      history = history.filter((h) => keepDays.has(h.time.slice(0, 10)));
    }

    return NextResponse.json({
      ticker,
      history
    });
  } catch (e: any) {
    console.error('Public chart API error:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

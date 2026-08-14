// Policy freshness data pasar IDX: 1 menit saat sesi reguler aktif, 30 menit saat
// bursa tutup. Dihitung dalam zona Asia/Jakarta agar tidak bergantung timezone server.
export const MARKET_OPEN_TTL_SEC = 60;
export const MARKET_CLOSED_TTL_SEC = 30 * 60;

export function isIdxMarketOpen(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const weekday = parts.find((part) => part.type === 'weekday')?.value;
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const isWeekday = weekday != null && !['Sat', 'Sun'].includes(weekday);

  return isWeekday && Number.isFinite(hour) && hour >= 9 && hour < 16;
}

export function getMarketAwareTtlSec(now: Date = new Date()): number {
  return isIdxMarketOpen(now) ? MARKET_OPEN_TTL_SEC : MARKET_CLOSED_TTL_SEC;
}

export function getMarketAwareTtlMs(now: Date = new Date()): number {
  return getMarketAwareTtlSec(now) * 1000;
}

export function getMarketAwareCacheHeaders(now: Date = new Date()): Record<string, string> {
  const ttl = getMarketAwareTtlSec(now);
  return {
    // `max-age=0` menahan cache BROWSER supaya harga tidak pernah basi di layar
    // pengguna; TTL di bawah ditujukan khusus ke CDN.
    'Cache-Control': 'public, max-age=0',
    // `CDN-Cache-Control` adalah header standar (RFC 9213) yang dibaca Cloudflare.
    //
    // Sebelumnya di sini `Vercel-CDN-Cache-Control` - header milik Vercel, dan sejak
    // production pindah ke VPS di belakang Cloudflare (2026-08-13) ia tidak dibaca
    // siapa pun. Yang tersisa cuma `max-age=0`, jadi niat caching CDN-nya mati diam-diam:
    // tidak ada error, tidak ada gejala, cuma setiap request menembus ke origin.
    'CDN-Cache-Control': `public, s-maxage=${ttl}`,
  };
}

// BUILD 007 (Cache Layer) - satu titik dokumentasi TTL per domain, sesuai daftar di
// roadmap ("Redis dengan TTL berbeda per Fundamental/Technical/Market/AI/News/Ticker").
// Nilai di sini SUDAH mencerminkan angka yang sebelumnya tersebar sebagai magic
// number di masing-masing route (tidak diubah nilainya, hanya disatukan + didokumentasikan)
// KECUALI ditandai "BARU" di komentarnya.

export const CACHE_TTL_SEC = {
  // Data teknikal (harga+indikator) - berubah tiap menit saat market buka, TTL
  // pendek. Dipakai app/api/stock/[ticker], app/api/agents/orchestrator.
  get TECHNICAL() { return getMarketAwareTtlSec(); },

  // Snapshot pasar (indeks/sektor/breadth) - diisi cron tiap 5 menit (app/api/cron/
  // market-pulse), TTL sedikit lebih panjang dari interval jadwal sebagai toleransi
  // keterlambatan run. AMAN pendek karena route-nya (app/api/market-pulse) punya
  // fallback live-scan saat cache miss - beda dari BREAKOUT_RADAR di bawah.
  get MARKET() { return getMarketAwareTtlSec(); },

  // BUG FIX (audit integritas data 2026-08-03, ditemukan setelah user lapor "Live AI
  // Pick" kosong): breakout-scan cron (app/api/cron/breakout-scan) SEBELUMNYA memakai
  // TTL yang SAMA dengan MARKET di atas (6 menit) - tapi route pembacanya (app/api/
  // ai-pick, app/api/daily-picks) SENGAJA TIDAK punya fallback live-scan (1 request
  // pengguna bisa menanggung ~109 fetch Yahoo kalau fallback). Cron cuma jalan jam
  // bursa (09:00-15:00 WIB) - begitu bursa tutup, TTL 6 menit itu expired dalam
  // hitungan menit dan kategori breakout/golden cross/dead cross tampil KOSONG total
  // sampai bursa buka lagi besok (atau Senin kalau Jumat sore). TTL diperpanjang ke 3
  // hari (cukup untuk gap akhir pekan Jumat sore -> Senin pagi + margin) - cron tetap
  // menyegarkan tiap 5 menit selama jam bursa seperti biasa, TTL panjang ini HANYA
  // jadi lantai "data sesi terakhir" di luar jam bursa, bukan mengubah kesegaran saat
  // bursa buka. Pemanggil menandai `stale`/`asOf` dari `computedAt` supaya UI jujur
  // bilang "data sesi terakhir", bukan diam-diam menampilkan seolah live.
  BREAKOUT_RADAR: 3 * 24 * 60 * 60,

  // Ringkasan pasar publik (app/api/market-summary) - halaman paling ramai
  // (landing page `/`, tanpa login). Diperpanjang dari 2 -> 6 menit (optimasi loading
  // 2026-08-05) setelah ditambahkan cron warmer (app/api/cron/market-summary, tiap 5
  // menit jam bursa - lihat DEPLOYMENT.md) yang menjaga cache ini tetap segar. Sebelum
  // ada cron, TTL 2 menit berarti pengunjung pertama tiap 2 menit menanggung scan LIVE
  // 250 saham (bisa berumur beberapa detik) - salah satu sumber utama keluhan "lambat"
  // karena inilah halaman yang paling sering dibuka. 6 menit = interval cron (5m) +
  // buffer 1 run, sama seperti pola MARKET (market-pulse) di bawah.
  get MARKET_SUMMARY() { return getMarketAwareTtlSec(); },

  // Skor rekomendasi (gabungan teknikal+fundamental+flow) - diisi cron tiap 15
  // menit (app/api/cron/recommendation-scan), lebih lambat berubah dari data
  // teknikal mentah.
  get RECOMMENDATION() { return getMarketAwareTtlSec(); },

  // Hasil AI Council (Gemini) - dikunci per simbol+tanggal+kuartal-terakhir-dilaporkan
  // (lihat app/api/council/route.ts), jadi laporan keuangan baru sudah otomatis
  // membuat key lama basi lebih cepat dari ini. TTL diperpendek dari 24 jam -> 6 jam
  // (2026-08-01, permintaan eksplisit "AI Council selalu update data terbaru") supaya
  // pergerakan teknikal intraday juga tidak tertahan cache semalaman, tanpa membuat
  // Gemini dipanggil berlebihan (panggilan AI paling mahal di aplikasi ini).
  // BUG FIX (audit logika & algoritma 2026-08-05, temuan M-14): 6 jam terlalu panjang
  // untuk analisa yang MENYEBUT LEVEL HARGA ("cicil di 274, target 306"). Cache key-nya
  // memang ikut kuartal laporan, tapi itu hanya menangkap rilis laporan keuangan - tidak
  // menangkap pergerakan harga intraday, padahal justru level harga itu isi utamanya.
  // 90 menit: cukup untuk menekan biaya panggilan AI (yang termahal di aplikasi ini),
  // cukup pendek supaya level yang disebut masih nyambung dengan harga berjalan. Hasilnya
  // juga dicap `computedAt` (lihat council-cache.service.ts) supaya UI bisa menampilkan
  // umur analisanya, bukan menyajikan yang lama seolah baru.
  AI_COUNCIL: 90 * 60,

  // Fallback basi kalau Yahoo Finance sedang down - lebih baik data lama daripada
  // error keras (app/api/stock/[ticker]).
  STALE_FALLBACK: 24 * 60 * 60,

  // Universe mentah screener (app/api/screener) - BARU: batch quoteSummary fundamental
  // utk ~50 saham sekaligus, jauh lebih mahal dari 1 request biasa. Fundamental (PER,
  // ROE, DER, dividend yield) juga tidak berubah dalam hitungan menit seperti harga,
  // jadi TTL lebih panjang dari MARKET_SUMMARY wajar. Skor per profil risiko dihitung
  // ulang dari universe yang sama (murah), jadi TTL ini cuma menutupi fetch mentahnya.
  SCREENER_UNIVERSE: 30 * 60,

  // Deret keputusan indikator harian utk 100 saham universe backtest (diisi cron
  // app/api/cron/backtest-precompute sekali sehari) - BARU. TTL lebih panjang dari
  // interval cron (24 jam) sebagai toleransi kalau satu run cron sempat gagal/telat.
  BACKTEST_INDICATORS: 36 * 60 * 60,

  // Kalender dividen+earnings (app/api/calendar) - BARU. Batch quoteSummary
  // calendarEvents utk ~50 saham, dan tanggal ex-dividend/earnings itu sendiri jarang
  // berubah dalam hitungan jam - 6 jam cukup segar tanpa membebani Yahoo Finance
  // di setiap buka halaman /calendar atau /breakout-radar.
  CORPORATE_CALENDAR: 6 * 60 * 60,

  // Snapshot earnings per emiten (jadwal, konsensus, revisi, dan riwayat kuartalan)
  // berubah lebih lambat daripada harga. Satu jam menjaga estimasi tetap cukup segar
  // tanpa memanggil seluruh modul Yahoo Finance setiap kali halaman dibuka.
  EARNINGS: 60 * 60,

  // Dashboard makro menggabungkan harga pasar harian dan rilis resmi tahunan.
  // BUG FIX (2026-08-14, audit jadwal cron): sebelumnya 30 menit, padahal
  // app/api/cron/macro (satu-satunya pe-warm cache ini) jalan SEJAM sekali
  // (`0 9-16 * * 1-5` di config/scheduled-jobs.json) - persis pola yang sama
  // dengan bug MARKET_SUMMARY yang sudah diperbaiki sebelumnya (lihat catatan di
  // situ): TTL lebih pendek dari interval cron berarti ADA jendela ~30 menit tiap
  // jam di mana cache pasti kosong sebelum cron berikutnya mengisi ulang. 70 menit
  // = interval cron (60) + buffer 1 run yang telat, sama seperti pola MARKET_SUMMARY
  // (cron 5 menit + TTL 6 menit) dan BREAKOUT_RADAR (cron 5 menit + TTL jauh lebih
  // panjang sebagai lantai). Data makro juga tidak berubah cepat, jadi 70 menit tetap
  // cukup segar untuk konteks pasar.
  MACRO_DASHBOARD: 70 * 60,

  // Universe saham dividen (yield/payout/consistency per saham, app/api/dividend-plan)
  // - BARU. Batch quoteSummary+chart(events:dividends) utk ~50 saham, sama mahalnya
  // dengan SCREENER_UNIVERSE - TTL sama (30 menit). Matematika compounding/income
  // dari input modal user DIHITUNG ULANG tiap request dari universe yang di-cache ini,
  // tidak ikut di-cache (beda per user/input).
  DIVIDEND_UNIVERSE: 30 * 60,

  // Halaman publik transparansi LensRadar (app/api/transparency) - membaca Postgres
  // + menghitung equity curve Top 5 vs IHSG dari histori point-in-time. Cukup di-cache
  // 30 menit karena angka validasi berubah harian/cron, bukan per tick intraday.
  LENS_TRANSPARENCY: 30 * 60,

  // Bucket backtest LensScore (app/api/lens-score-bucket-backtest, dipakai tab
  // Recommendations di LensRadar) - BARU (2026-08-14, laporan pengguna "LensRadar
  // lambat"). SEBELUMNYA endpoint ini query SELURUH tabel lens_radar_history (semua
  // ticker x semua tanggal, tanpa filter) dan hitung ulang t-test/kalibrasi LIVE di
  // setiap buka halaman - tanpa cache sama sekali, beda dari /api/transparency yang
  // menghitung hal serupa dari tabel yang sama tapi SUDAH di-cache. 30 menit disamakan
  // dengan LENS_TRANSPARENCY karena sumber datanya sama persis (lens_radar_history,
  // diisi cron harian) - angkanya tidak berubah dalam hitungan menit.
  LENS_BUCKET_BACKTEST: 30 * 60,
} as const;

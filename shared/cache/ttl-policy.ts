// BUILD 007 (Cache Layer) - satu titik dokumentasi TTL per domain, sesuai daftar di
// roadmap ("Redis dengan TTL berbeda per Fundamental/Technical/Market/AI/News/Ticker").
// Nilai di sini SUDAH mencerminkan angka yang sebelumnya tersebar sebagai magic
// number di masing-masing route (tidak diubah nilainya, hanya disatukan + didokumentasikan)
// KECUALI ditandai "BARU" di komentarnya.

export const CACHE_TTL_SEC = {
  // Data teknikal (harga+indikator) - berubah tiap menit saat market buka, TTL
  // pendek. Dipakai app/api/stock/[ticker], app/api/agents/orchestrator.
  TECHNICAL: 3 * 60,

  // Snapshot pasar (indeks/sektor/breadth) - diisi cron tiap 5 menit (app/api/cron/
  // market-pulse), TTL sedikit lebih panjang dari interval jadwal sebagai toleransi
  // keterlambatan run. AMAN pendek karena route-nya (app/api/market-pulse) punya
  // fallback live-scan saat cache miss - beda dari BREAKOUT_RADAR di bawah.
  MARKET: 6 * 60,

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
  MARKET_SUMMARY: 6 * 60,

  // Skor rekomendasi (gabungan teknikal+fundamental+flow) - diisi cron tiap 15
  // menit (app/api/cron/recommendation-scan), lebih lambat berubah dari data
  // teknikal mentah.
  RECOMMENDATION: 15 * 60,

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

  // Universe saham dividen (yield/payout/consistency per saham, app/api/dividend-plan)
  // - BARU. Batch quoteSummary+chart(events:dividends) utk ~50 saham, sama mahalnya
  // dengan SCREENER_UNIVERSE - TTL sama (30 menit). Matematika compounding/income
  // dari input modal user DIHITUNG ULANG tiap request dari universe yang di-cache ini,
  // tidak ikut di-cache (beda per user/input).
  DIVIDEND_UNIVERSE: 30 * 60,
} as const;

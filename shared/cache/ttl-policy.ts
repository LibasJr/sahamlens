// BUILD 007 (Cache Layer) - satu titik dokumentasi TTL per domain, sesuai daftar di
// roadmap ("Redis dengan TTL berbeda per Fundamental/Technical/Market/AI/News/Ticker").
// Nilai di sini SUDAH mencerminkan angka yang sebelumnya tersebar sebagai magic
// number di masing-masing route (tidak diubah nilainya, hanya disatukan + didokumentasikan)
// KECUALI ditandai "BARU" di komentarnya.

export const CACHE_TTL_SEC = {
  // Data teknikal (harga+indikator) - berubah tiap menit saat market buka, TTL
  // pendek. Dipakai app/api/stock/[ticker], app/api/agents/orchestrator.
  TECHNICAL: 3 * 60,

  // Snapshot pasar (indeks/sektor/breadth) & breakout scan - diisi cron tiap 5
  // menit (lihat app/api/cron/market-pulse, app/api/cron/breakout-scan), TTL
  // sedikit lebih panjang dari interval jadwal sebagai toleransi keterlambatan run.
  MARKET: 6 * 60,

  // Ringkasan pasar publik (app/api/market-summary) - BARU: sebelumnya TIDAK ADA
  // cache sama sekali meski endpoint ini public/no-auth (paling rawan traffic
  // tinggi tanpa gesekan login). 2 menit - cukup segar untuk landing page, cukup
  // panjang untuk meredam lonjakan trafik.
  MARKET_SUMMARY: 2 * 60,

  // Skor rekomendasi (gabungan teknikal+fundamental+flow) - diisi cron tiap 15
  // menit (app/api/cron/recommendation-scan), lebih lambat berubah dari data
  // teknikal mentah.
  RECOMMENDATION: 15 * 60,

  // Hasil AI Council (Gemini) - dikunci per simbol+tanggal, jadi TTL cuma perlu
  // menutupi hari berjalan. Panggilan Gemini paling mahal di aplikasi ini.
  AI_COUNCIL: 24 * 60 * 60,

  // Fallback basi kalau Yahoo Finance sedang down - lebih baik data lama daripada
  // error keras (app/api/stock/[ticker]).
  STALE_FALLBACK: 24 * 60 * 60,

  // Universe mentah screener (app/api/screener) - BARU: batch quoteSummary fundamental
  // utk ~50 saham sekaligus, jauh lebih mahal dari 1 request biasa. Fundamental (PER,
  // ROE, DER, dividend yield) juga tidak berubah dalam hitungan menit seperti harga,
  // jadi TTL lebih panjang dari MARKET_SUMMARY wajar. Skor per profil risiko dihitung
  // ulang dari universe yang sama (murah), jadi TTL ini cuma menutupi fetch mentahnya.
  SCREENER_UNIVERSE: 30 * 60,
} as const;

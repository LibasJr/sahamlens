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

  // Freshness utk PEMBACA langsung (app/api/market-pulse, live-fallback saat cache
  // miss) - SENGAJA pendek (1 menit saat bursa buka) supaya kalau cron sungguh belum
  // sempat jalan, fallback live-nya tetap secepat mungkin. JANGAN dipakai penulis cron
  // (lihat MARKET_PULSE_CRON di bawah) - komentar lama di sini mengklaim nilai ini
  // "sedikit lebih panjang dari interval jadwal 5 menit", padahal getMarketAwareTtlSec()
  // MEMBALIKKAN 60 DETIK saat bursa buka - 5x LEBIH PENDEK dari interval cron, bukan
  // lebih panjang. Klaim komentar lama itu salah/tidak sinkron dengan kode sungguhan.
  get MARKET() { return getMarketAwareTtlSec(); },

  // BUG FIX (2026-08-14, laporan pengguna via LensAI: "data market-pulse blm tersedia
  // karena pemindai sesi ini masih kosong" - padahal cron market-pulse sudah terjadwal
  // & terverifikasi jalan tiap 5 menit). Akar masalahnya: app/api/cron/market-pulse
  // SEBELUMNYA menulis cache pakai TTL.MARKET di atas (60 detik saat bursa buka) -
  // bukan TTL yang dimaksudkan komentar lama di MARKET ("sedikit lebih panjang dari
  // interval 5 menit"). Akibatnya cache KOSONG selama ~4 dari tiap 5 menit (cron isi ->
  // basi 60 detik kemudian -> nunggu ~4 menit sampai cron berikutnya). /api/market-pulse
  // sendiri tidak terlihat rusak (ada fallback live-scan), tapi
  // app/api/chat/blocks/market-blocks.ts (sectorAndBreadthBlock, dipakai LensAI) SENGAJA
  // TIDAK punya fallback live (supaya chat tidak memicu scan 50 saham tiap pertanyaan) -
  // jadi LensAI yang paling sering kena jendela kosong itu dan bilang "cache kosong"
  // ke pengguna, walau sebenarnya cron-nya jalan normal.
  //
  // REVISI SUSULAN (2026-08-14, hari yang sama, laporan kedua): 6 menit tadinya dipilih
  // sebagai "interval cron (5) + buffer 1 run" - tapi itu HANYA benar SELAMA jam bursa
  // (cron `*/5 9-15 * * 1-5`, cuma jalan Senin-Jumat 09:00-15:59 WIB). Begitu bursa
  // tutup, cron BERHENTI JALAN sampai besok - dan pengguna bertanya ke LensAI jam 19:00
  // WIB (lihat screenshot: "Fitur top gainer... sambungan data live... sedang kosong di
  // server"), TTL 6 menit itu sudah lama basi sejak ~jam 16:xx. Sama persis pola yang
  // sudah diperbaiki utk BREAKOUT_RADAR (lihat di bawah) - TTL SEKARANG 3 hari (lantai
  // "data sesi terakhir" di luar jam bursa, cukup utk gap akhir pekan Jumat sore ->
  // Senin pagi), cron tetap menyegarkan tiap 5 menit SELAMA jam bursa seperti biasa.
  // app/api/chat/blocks/market-blocks.ts sekarang menyertakan umur cache di jawabannya
  // (lewat getCacheTtlRemaining) supaya LensAI tetap jujur bilang "data sesi terakhir",
  // bukan diam-diam menyajikan data lama seolah live.
  MARKET_PULSE_CRON: 3 * 24 * 60 * 60,

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

  // Freshness utk PEMBACA langsung (app/api/market-summary, live-fallback lewat
  // getOrCompute) - SENGAJA pendek (1 menit saat bursa buka), sama alasannya dengan
  // MARKET di atas. JANGAN dipakai penulis cron - lihat MARKET_SUMMARY_CRON di bawah.
  // Komentar lama di sini mengklaim "diperpanjang ke 6 menit" tapi getter-nya balik
  // dipakai getMarketAwareTtlSec() (60 detik) - klaim itu tidak lagi sinkron dengan kode
  // sungguhan (regresi yang sama seperti MARKET, ditemukan & diperbaiki bersamaan).
  get MARKET_SUMMARY() { return getMarketAwareTtlSec(); },

  // BUG FIX (2026-08-14) - sama persis dengan MARKET_PULSE_CRON di atas: cron
  // app/api/cron/market-summary SEBELUMNYA menulis dengan MARKET_SUMMARY di atas (60
  // detik saat bursa buka), bukan 6 menit seperti diniatkan komentar lama di situ.
  // /api/market-summary (dibaca landing page `/`+`/home`, TANPA login, halaman paling
  // ramai) punya live-fallback jadi tidak terlihat "kosong", tapi cache pre-warm-nya
  // basi ~4 dari tiap 5 menit - pengunjung di jendela itu tetap menanggung scan LIVE 250
  // saham, PERSIS masalah yang cron ini seharusnya sudah menghilangkan sejak 2026-08-05.
  //
  // REVISI SUSULAN (2026-08-14, hari yang sama) - 6 menit SAMA-SAMA cuma benar selama
  // jam bursa; cron `*/5 9-15 * * 1-5` berhenti di luar itu, dan app/api/chat/blocks/
  // market-blocks.ts (marketMoversBlock - sumber "top gainer" LensAI, lihat laporan
  // pengguna) TIDAK punya fallback live. Diperpanjang ke 3 hari, pola sama dengan
  // MARKET_PULSE_CRON/BREAKOUT_RADAR di atas.
  MARKET_SUMMARY_CRON: 3 * 24 * 60 * 60,

  // Freshness utk PEMBACA langsung (app/api/recommendations, live-fallback per
  // simbol lewat analyzeStock()) - SENGAJA pendek, sama alasannya dengan MARKET di
  // atas. JANGAN dipakai penulis cron - lihat RECOMMENDATION_CRON di bawah.
  get RECOMMENDATION() { return getMarketAwareTtlSec(); },

  // BUG FIX (2026-08-14) - sama persis dengan MARKET_PULSE_CRON/MARKET_SUMMARY_CRON:
  // cron app/api/cron/recommendation-scan (interval 15 menit) SEBELUMNYA menulis
  // dengan RECOMMENDATION di atas (60 detik saat bursa buka) - komentar lama di
  // app/api/recommendations/route.ts bahkan mengklaim "cache cron bisa berumur sampai
  // 15 menit (TTL.RECOMMENDATION)", padahal cache-nya basi dalam 60 DETIK, bukan 15
  // menit - gap KOSONG-nya 14 dari tiap 15 menit, rasio terburuk dari tiga cron yang
  // kena bug ini. Ada live-fallback per simbol jadi tidak terlihat "kosong" total, tapi
  // hampir setiap request di luar 60 detik pertama menanggung analyzeStock() LIVE per
  // simbol, defeat tujuan cron sepenuhnya.
  //
  // REVISI SUSULAN (2026-08-14, hari yang sama) - 18 menit (interval 15 + buffer) SAMA
  // saja cuma benar selama jam bursa (`*/15 9-15 * * 1-5`); di luar itu cache tetap
  // kosong sampai besok, defeat tujuan cron di luar jam bursa sepenuhnya (bukan cuma
  // "wasteful", tapi walau ADA fallback live per simbol di sini, pola yang sama TANPA
  // fallback baru saja terbukti gagal total di market-pulse/market-summary). Diperpanjang
  // ke 3 hari, pola sama dengan MARKET_PULSE_CRON/MARKET_SUMMARY_CRON/BREAKOUT_RADAR.
  RECOMMENDATION_CRON: 3 * 24 * 60 * 60,

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
  // jam di mana cache pasti kosong sebelum cron berikutnya mengisi ulang. Sempat
  // dinaikkan ke 70 menit (interval 60 + buffer), TAPI itu ternyata cuma benar SELAMA
  // jam bursa - cron berhenti jalan di luar 09:00-16:00 WIB, dan run terakhir jam 16:00
  // basi ~17:10, jauh sebelum cron jalan lagi besok jam 09:00 (gap ~16 jam KOSONG tiap
  // malam). REVISI SUSULAN (2026-08-14, hari yang sama, ditemukan bareng
  // MARKET_PULSE_CRON/MARKET_SUMMARY_CRON - macroBlock di app/api/chat/blocks/
  // market-blocks.ts SAMA-SAMA tidak punya fallback live): diperpanjang ke 3 hari,
  // pola sama dengan BREAKOUT_RADAR. Data makro juga tidak berubah cepat, jadi
  // menyimpannya sampai 3 hari tidak mengorbankan relevansi.
  MACRO_DASHBOARD: 3 * 24 * 60 * 60,

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

  // Berita pasar (app/api/news, dibaca ~10 feed RSS + 1 klasifikasi AI) - BARU
  // (2026-08-14, pertanyaan pengguna "apa ada cron untuk update news?" - jawabannya
  // sebelumnya TIDAK ADA). Route ini sebelumnya cuma getOrCompute() on-demand dengan
  // getMarketAwareTtlSec() (60 detik saat bursa buka) TANPA cron warmer - persis pola
  // MARKET_SUMMARY sebelum diperbaiki: tiap 60 detik pas bursa buka, pengunjung pertama
  // menanggung ~10 fetch RSS + 1 panggilan AI klasifikasi. 6 menit = interval cron
  // pre-warm baru (app/api/cron/news, 5 menit) + buffer 1 run telat, pola sama persis
  // dengan MARKET_SUMMARY. Dipakai KHUSUS oleh cron untuk menulis cache - route
  // /api/news sendiri TETAP pakai getMarketAwareTtlSec() untuk fallback live-nya
  // (jarang kepakai selama cron jalan normal), supaya di luar jam bursa (cron
  // berhenti) cache tetap bisa refresh cepat kalau memang ada perubahan berita.
  MARKET_NEWS: 6 * 60,
} as const;

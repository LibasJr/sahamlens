import { normalizeChatText } from './chat-normalize';

interface ProductFeature {
  pattern: RegExp;
  name: string;
  function: string;
  usage: string;
  result: string;
  limitation: string;
}

const PRODUCT_FEATURES: ProductFeature[] = [
  { pattern: /\b(beranda|home|dashboard)\b/, name: 'Beranda', function: 'snapshot awal kondisi pasar dan akses cepat ke riset emiten', usage: 'cari kode atau nama emiten, lalu buka ringkasan pasar, peluang, kalender, atau watchlist', result: 'konteks pasar dan pintasan ke modul analisis', limitation: 'ringkasan bukan rekomendasi transaksi' },
  { pattern: /\b(lensmarket|market pulse|ihsg|breadth|sektor|regime|heatmap)\b/, name: 'LensMarket', function: 'membaca IHSG, breadth universe terpantau, regime pasar, dan kekuatan sektor', usage: 'buka LensMarket lalu periksa status sesi, breadth, regime, heatmap sektor, dan umur data', result: 'gambaran apakah gerak pasar luas atau hanya terkonsentrasi', limitation: 'breadth memakai universe terpantau SahamLens, bukan indeks resmi Kompas100/IDX80, dan bukan prediksi indeks' },
  { pattern: /\b(lensradar|breakout radar|ai pick|daily picks|peluang hari ini|scanner peluang|bucket backtest)\b/, name: 'LensRadar', function: 'memindai kandidat momentum, breakout, dan peluang harian dari universe likuid', usage: 'buka LensRadar atau Peluang Hari Ini, baca LensScore, alasan kandidat, freshness, coverage, dan bukti backtest/bucket jika tersedia, lalu lanjutkan ke halaman emiten', result: 'daftar kandidat beserta sinyal model, alasan, status riset, dan kesegaran data', limitation: 'statusnya research-only sampai decision advisory tervalidasi; bukan instruksi beli' },
  { pattern: /\b(tp\s*\/?\s*cl|take profit|cut loss|stop loss)\b/, name: 'Penentuan TP/CL', function: 'menyusun skenario Take Profit dan Cut Loss dari struktur harga, support/resistance, volatilitas Wilder ATR, serta pembulatan tick IDX', usage: 'untuk memahami metodenya tidak perlu ticker; untuk level aktual, buka LensTechnical atau sebutkan kode emiten agar data harga terbarunya dapat dihitung', result: 'Entry, TP1, TP2, dan CL beserta jarak risiko yang tersedia', limitation: 'level ini adalah skenario berbasis data, bukan jaminan harga akan tercapai atau rekomendasi transaksi' },
  { pattern: /\b(lenstechnical|teknikal|technical|lensconsensus|tp\/?cl)\b/, name: 'LensTechnical', function: 'menganalisis tren, momentum, volume, volatilitas, support/resistance, dan voting LensConsensus', usage: 'pilih emiten lalu baca indikator, breakdown voting, serta level Entry/TP/CL yang tersedia', result: 'evidence teknikal dan skenario risiko', limitation: 'indikator dan level model tidak menjamin hasil' },
  { pattern: /\b(lensscanner|screener|scanner|profil risiko)\b/, name: 'LensScanner', function: 'menyaring saham dengan profil risiko dan filter multi-faktor', usage: 'pilih Konservatif, Moderat, atau Agresif; atur sektor, harga, market cap, dan likuiditas', result: 'daftar saham yang lolos kriteria dan dapat diekspor ke CSV', limitation: 'hasil penyaringan bukan rekomendasi beli' },
  { pattern: /\b(compare|bandingkan|perbandingan)\b/, name: 'Compare', function: 'membandingkan emiten pada metrik sejenis', usage: 'masukkan sedikitnya dua ticker lalu pilih fokus fundamental, teknikal, atau valuasi', result: 'perbandingan berdampingan untuk melihat trade-off', limitation: 'jangan menentukan pemenang dari satu rasio saja' },
  { pattern: /\b(backtest|uji historis|replay candle)\b/, name: 'Backtest', function: 'menguji filter multi-saham atau memutar ulang candle saham tunggal', usage: 'pilih filter dan periode lalu tekan Backtest; untuk replay pilih ticker lalu Start/Stop', result: 'return, win rate, drawdown, benchmark IHSG, atau replay visual', limitation: 'hasil historis tidak menjamin performa masa depan' },
  { pattern: /\b(lensfundamental|fundamental|laporan keuangan|rasio)\b/, name: 'LensFundamental', function: 'membedah kualitas laba, pertumbuhan, neraca, arus kas, dan valuasi relatif', usage: 'pilih emiten lalu buka mode ringkas atau lengkap dan telusuri rasio yang tersedia', result: 'konteks kesehatan bisnis dan metrik fundamental', limitation: 'kelengkapan dan periode data bergantung laporan yang tersedia' },
  { pattern: /\b(valuation|valuasi|dcf|nilai wajar|nilai intrinsik|fair value|margin of safety|mos)\b/, name: 'Valuation / DCF', function: 'mengestimasi nilai wajar dan margin of safety dari model yang tersedia', usage: 'pilih emiten lalu baca hasil per metode, asumsi, basis harga, dan margin of safety', result: 'estimasi model, metode, asumsi, dan margin of safety', limitation: 'nilai wajar bukan target harga pasti atau konsensus analis' },
  { pattern: /\b(moat|keunggulan kompetitif)\b/, name: 'Moat', function: 'menilai proksi ketahanan bisnis dari data fundamental', usage: 'pilih emiten lalu baca faktor dan evidence yang tersedia', result: 'indikasi kualitas dan ketahanan bisnis', limitation: 'proksi rasio tidak membuktikan moat kualitatif secara mutlak' },
  { pattern: /\b(earnings|dividen|dividend|corporate calendar|kalender)\b/, name: 'Earnings, Dividend & Corporate Calendar', function: 'memantau laporan keuangan, dividen, dan agenda aksi korporasi', usage: 'pilih menu terkait, emiten, atau periode lalu baca jadwal dan data yang tersedia', result: 'agenda, histori/yield, dan konteks rilis', limitation: 'tanggal atau field yang tidak tersedia tidak boleh diasumsikan' },
  { pattern: /\b(ownership flow|arus kepemilikan|foreign ownership|kepemilikan|foreign flow|domestic driven|big caps|lapis kedua|lapis ketiga)\b/, name: 'Arus Kepemilikan', function: 'melacak perubahan komposisi kepemilikan asing dan lokal antar-snapshot serta memberi konteks foreign-flow active atau domestic-driven', usage: 'pilih emiten lalu baca perubahan, periode snapshot, status sumber, dan badge interpretasi bila tersedia', result: 'perubahan struktural komposisi kepemilikan dan konteks apakah flow asing relevan untuk emiten tersebut', limitation: 'bukan broker flow; interpretasi domestic-driven tidak berarti saham buruk atau bebas risiko' },
  { pattern: /\b(broker summary|broker flow|bandarmologi)\b/, name: 'Broker Summary', function: 'membaca distribusi transaksi berdasarkan kode broker dari data impor yang tersedia', usage: 'pilih emiten dan periode data yang tersedia lalu periksa buy/sell value, volume, atau frekuensi', result: 'ringkasan aktivitas broker pada periode tersebut', limitation: 'ingestion otomatis nonaktif dan datanya belum memengaruhi LensScore' },
  { pattern: /\b(lenswatch|watchlist|alert|akun demo|paper trading|portofolio)\b/, name: 'LensWatch & Akun Demo', function: 'menyimpan pantauan/alert dan melakukan simulasi transaksi dengan saldo virtual', usage: 'login, tambahkan ticker ke watchlist atau catat transaksi virtual pada Akun Demo', result: 'daftar pantau, alert, posisi, serta P&L simulasi', limitation: 'tidak mengeksekusi order atau memindahkan uang nyata' },
  { pattern: /\b(risk matrix|risk calculator|position size|risk reward)\b/, name: 'Risk Matrix & Risk Calculator', function: 'menguji risiko portofolio dan menghitung ukuran posisi/risk-reward', usage: 'masukkan modal, batas risiko, entry, stop, dan target', result: 'ukuran posisi dan skenario risiko', limitation: 'hasil adalah alat perencanaan, bukan sinyal transaksi' },
  { pattern: /\b(news|berita|sentimen|macro|makro|bi rate|inflasi|kurs|usd\/?idr)\b/, name: 'News, Sentiment & Macro', function: 'memberi konteks berita dan transmisi faktor makro ke pasar/sektor', usage: 'buka menu terkait lalu pilih emiten, pasar, atau variabel makro yang ingin ditinjau', result: 'judul/sentimen, data makro yang tersedia, dan peta konteks sektor', limitation: 'sentimen judul bukan bukti sebab-akibat dan mapping sektor bukan forecast' },
  { pattern: /\b(transparansi|transparency|metodologi|status model|model status|basis return|basis harga|provenance|sumber data|coverage|confidence|explainability)\b/, name: 'Transparansi', function: 'menjelaskan metodologi, status validasi, sumber data, basis return, coverage, dan batasan model SahamLens yang aman dibuka publik', usage: 'buka menu Transparansi untuk membaca status model, as-of data, basis harga, metodologi, dan limitasi; detail raw sample tetap ada di admin', result: 'pemahaman apakah output model masih research-only, data mana yang tersedia, dan apa batas interpretasinya', limitation: 'transparansi menjelaskan bukti dan batasan; tidak mengubah sinyal menjadi rekomendasi transaksi' },
  { pattern: /\b(tentang|about|pattern|pola)\b/, name: 'Tentang & Pattern', function: 'menjelaskan prinsip SahamLens dan pola teknikal', usage: 'buka menu terkait untuk meninjau filosofi produk atau konfirmasi pola', result: 'konteks prinsip dan batas penggunaan', limitation: 'pola harus dibaca bersama tren, volume, dan risiko false breakout' },
  { pattern: /\b(bukti validasi lensradar|admin transparency|raw sample|rekonsiliasi harga|pemeriksaan harga penutupan|data integrity|market data reconciliation)\b/, name: 'Bukti Validasi & Integritas Harga', function: 'meninjau bukti forward per kelompok LensScore, uji signifikansi, dan rekonsiliasi harga lintas sumber', usage: 'admin membuka Bukti Validasi LensRadar atau Pemeriksaan Harga Penutupan untuk membaca sample, anomali, dan status point-in-time', result: 'bukti validasi model, basis harga, dan status rekonsiliasi data', limitation: 'panel detail bersifat admin; bukti historis tidak menjamin performa ke depan' },
  { pattern: /\b(simulasi keputusan ai|decision lab|paper order|advisory|decision advisory)\b/, name: 'Simulasi Keputusan AI', function: 'menguji bagaimana sinyal riset akan berubah menjadi skenario keputusan paper-only bila advisory sudah memenuhi gerbang validasi', usage: 'admin membuka Simulasi Keputusan AI lalu membaca evidence sinyal, status advisory, dan paper order yang tidak menyentuh uang nyata', result: 'jejak keputusan simulasi dan alasan model', limitation: 'tidak mengeksekusi order nyata dan tidak boleh disebut rekomendasi aktif bila advisory belum tervalidasi' },
  { pattern: /\b(calibration lab|kalibrasi lensscore|uji akurasi)\b/, name: 'Uji Akurasi LensRadar', function: 'menguji reliabilitas LensScore terhadap hasil T+20', usage: 'buka Admin → Uji Akurasi LensRadar lalu baca sample, confidence interval, Brier/ECE, dan hasil OOS', result: 'bukti kalibrasi per kelompok skor', limitation: 'hasil tidak otomatis mengubah bobot atau ambang produksi' },
  { pattern: /\b(tp\/?cl validation|tpcl validation|uji target|cut loss)\b/, name: 'Uji Target & Cut Loss', function: 'menguji engine TP1/TP2/CL produksi pada histori', usage: 'pilih cohort yang tersedia lalu baca outcome, expectancy, sample, dan kasus TP-vs-CL ambigu', result: 'bukti performa level TP/CL', limitation: 'backtest terpisah dari Uji Akurasi LensRadar' },
  { pattern: /\b(intraday validation|intraday lab|uji intraday|lensintraday)\b/, name: 'Uji Intraday', function: 'menguji strategi buka-tutup hari yang sama pada horizon intraday', usage: 'pilih cohort dan horizon yang tersedia lalu baca sample, keunggulan, net return, serta status OOS', result: 'bukti 15/30/60 menit atau EOD setelah biaya', limitation: 'terpisah dari hasil LensScore T+20' },
  { pattern: /\b(fundamental backfill|impor histori fundamental|pit fundamental|financial integrity|pemeriksaan data keuangan|adoption gate|macro pit|bukti data makro|bank fundamentals evidence|bukti fundamental bank)\b/, name: 'Pemeriksaan Data & PIT', function: 'menjaga provenance point-in-time dan gerbang adopsi data/model', usage: 'gunakan cek awal/backfill atau panel bukti yang sesuai lalu perbaiki isu provenance sebelum adopsi', result: 'coverage, bukti, dan status data-only/research', limitation: 'bukti baru tidak otomatis masuk valuasi, LensScore, atau produksi' },
  { pattern: /\b(kesehatan operasional|operational health|scheduled jobs|cron jobs)\b/, name: 'Kesehatan Operasional', function: 'memantau cron, cache, database, dan error job/provider', usage: 'buka menu admin lalu periksa status dan error terakhir', result: 'diagnostik operasional aktual', limitation: 'penyebab tidak boleh ditebak tanpa status/log yang tersedia' },
  { pattern: /\b(infographic studio|studio infografis|infografis|export card|kartu riset)\b/, name: 'Infographic Studio', function: 'membuat atau meninjau kartu visual riset SahamLens dari data yang tersedia', usage: 'admin membuka Infographic Studio atau memakai tombol ekspor kartu pada modul teknikal/fundamental bila tersedia', result: 'materi visual berbasis data aplikasi untuk dokumentasi atau publikasi', limitation: 'visual tidak boleh menambah klaim data yang tidak ada di sumber SahamLens' },
  { pattern: /\b(feedback lensai|lensai feedback|masukan lensai)\b/, name: 'Masukan LensAI', function: 'meninjau jawaban yang diberi rating pengguna', usage: 'buka menu admin lalu prioritaskan masukan negatif berdasarkan intent, prompt, dan jawabannya', result: 'daftar masalah untuk perbaikan routing, knowledge, dan tes regresi', limitation: 'masukan tidak melatih atau mengubah model secara otomatis' },
];

const ADMIN_FEATURE_START_NAME = 'Bukti Validasi & Integritas Harga';
const ALL_FEATURES_QUERY = /\b(semua|seluruh|lengkap|apa saja|bisa apa|fitur(?:nya)? apa|menu(?:nya)? apa|tour|jelaskan fitur)\b/;

function featureAnswer(feature: ProductFeature): string {
  return `**${feature.name}** berfungsi untuk ${feature.function}.\n\n- **Cara pakai:** ${feature.usage}.\n- **Hasil yang dibaca:** ${feature.result}.\n- **Batasan:** ${feature.limitation}.`;
}

function allFeaturesAnswer(): string {
  const adminStart = PRODUCT_FEATURES.findIndex((feature) => feature.name === ADMIN_FEATURE_START_NAME);
  const userFeatures = PRODUCT_FEATURES.slice(0, adminStart).map((feature) => `- **${feature.name}:** ${feature.function}.`);
  const adminFeatures = PRODUCT_FEATURES.slice(adminStart).map((feature) => `- **${feature.name}:** ${feature.function}.`);
  return [
    'SahamLens mencakup alur riset dari membaca pasar, menyaring kandidat, menganalisis emiten, menguji strategi, sampai mengelola risiko secara simulasi.',
    '',
    '**Fitur pengguna**',
    ...userFeatures,
    '',
    '**Lab riset dan admin**',
    ...adminFeatures,
    '',
    'LensAI dapat menjelaskan fungsi, cara pakai, hasil yang perlu dibaca, dan batasan setiap fitur di atas. Untuk data emiten atau status aktual, jawabannya tetap mengikuti data terverifikasi SahamLens; aplikasi tidak mengeksekusi transaksi nyata.',
  ].join('\n');
}

/** Jawaban product-help deterministik agar bantuan fitur tetap tersedia ketika provider AI
 * sedang timeout/rate-limit. Data emiten dan pasar tetap melewati jalur terverifikasi. */
export function getDeterministicProductHelpResponse(prompt: string): string {
  const text = normalizeChatText(prompt);
  if (ALL_FEATURES_QUERY.test(text)) return allFeaturesAnswer();
  const adminStart = PRODUCT_FEATURES.findIndex((item) => item.name === ADMIN_FEATURE_START_NAME);
  const feature = /\b(validation|lab|backfill|integrity|adoption|operational|kesehatan operasional|uji akurasi|uji target|uji intraday|uji arus|pemeriksaan data|bukti data|bukti fundamental|masukan lensai|feedback lensai)\b/.test(text)
    ? PRODUCT_FEATURES.slice(adminStart).find((item) => item.pattern.test(text)) ?? PRODUCT_FEATURES.find((item) => item.pattern.test(text))
    : PRODUCT_FEATURES.find((item) => item.pattern.test(text));
  return feature ? featureAnswer(feature) : allFeaturesAnswer();
}

export function isAllFeaturesProductQuery(prompt: string): boolean {
  return ALL_FEATURES_QUERY.test(normalizeChatText(prompt));
}

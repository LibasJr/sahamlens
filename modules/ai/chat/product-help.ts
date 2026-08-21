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
  { pattern: /\b(lensmarket|market pulse|ihsg|breadth|sektor)\b/, name: 'LensMarket', function: 'membaca IHSG, breadth, regime pasar, dan kekuatan sektor', usage: 'buka LensMarket lalu periksa status sesi, breadth, regime, dan heatmap sektor', result: 'gambaran apakah gerak pasar luas atau hanya terkonsentrasi', limitation: 'data penyedia dapat tertunda dan bukan prediksi indeks' },
  { pattern: /\b(lensradar|breakout radar|ai pick|scanner peluang)\b/, name: 'LensRadar', function: 'memindai kandidat momentum dan breakout dari universe likuid', usage: 'buka LensRadar, baca LensScore dan alasan kandidat, lalu lanjutkan ke halaman emiten', result: 'daftar kandidat beserta sinyal model dan kesegaran data', limitation: 'statusnya research-only, bukan instruksi beli' },
  { pattern: /\b(tp\s*\/?\s*cl|take profit|cut loss|stop loss)\b/, name: 'Penentuan TP/CL', function: 'menyusun skenario Take Profit dan Cut Loss dari struktur harga, support/resistance, volatilitas Wilder ATR, serta pembulatan tick IDX', usage: 'untuk memahami metodenya tidak perlu ticker; untuk level aktual, buka LensTechnical atau sebutkan kode emiten agar data harga terbarunya dapat dihitung', result: 'Entry, TP1, TP2, dan CL beserta jarak risiko yang tersedia', limitation: 'level ini adalah skenario berbasis data, bukan jaminan harga akan tercapai atau rekomendasi transaksi' },
  { pattern: /\b(lenstechnical|teknikal|technical|lensconsensus|tp\/?cl)\b/, name: 'LensTechnical', function: 'menganalisis tren, momentum, volume, volatilitas, support/resistance, dan voting LensConsensus', usage: 'pilih emiten lalu baca indikator, breakdown voting, serta level Entry/TP/CL yang tersedia', result: 'evidence teknikal dan skenario risiko', limitation: 'indikator dan level model tidak menjamin hasil' },
  { pattern: /\b(lensscanner|screener|scanner|profil risiko)\b/, name: 'LensScanner', function: 'menyaring saham dengan profil risiko dan filter multi-faktor', usage: 'pilih Konservatif, Moderat, atau Agresif; atur sektor, harga, market cap, dan likuiditas', result: 'daftar saham yang lolos kriteria dan dapat diekspor ke CSV', limitation: 'hasil penyaringan bukan rekomendasi beli' },
  { pattern: /\b(compare|bandingkan|perbandingan)\b/, name: 'Compare', function: 'membandingkan emiten pada metrik sejenis', usage: 'masukkan sedikitnya dua ticker lalu pilih fokus fundamental, teknikal, atau valuasi', result: 'perbandingan berdampingan untuk melihat trade-off', limitation: 'jangan menentukan pemenang dari satu rasio saja' },
  { pattern: /\b(backtest|uji historis|replay candle)\b/, name: 'Backtest', function: 'menguji filter multi-saham atau memutar ulang candle saham tunggal', usage: 'pilih filter dan periode lalu tekan Backtest; untuk replay pilih ticker lalu Start/Stop', result: 'return, win rate, drawdown, benchmark IHSG, atau replay visual', limitation: 'hasil historis tidak menjamin performa masa depan' },
  { pattern: /\b(lensfundamental|fundamental|laporan keuangan|rasio)\b/, name: 'LensFundamental', function: 'membedah kualitas laba, pertumbuhan, neraca, arus kas, dan valuasi relatif', usage: 'pilih emiten lalu buka mode ringkas atau lengkap dan telusuri rasio yang tersedia', result: 'konteks kesehatan bisnis dan metrik fundamental', limitation: 'kelengkapan dan periode data bergantung laporan yang tersedia' },
  { pattern: /\b(valuation|valuasi|dcf|nilai wajar|nilai intrinsik|fair value)\b/, name: 'Valuation / DCF', function: 'mengestimasi nilai wajar dan margin of safety dari model yang tersedia', usage: 'pilih emiten lalu baca hasil per metode beserta asumsi yang dipakai', result: 'estimasi model, metode, dan margin of safety', limitation: 'nilai wajar bukan target harga pasti atau konsensus analis' },
  { pattern: /\b(moat|keunggulan kompetitif)\b/, name: 'Moat', function: 'menilai proksi ketahanan bisnis dari data fundamental', usage: 'pilih emiten lalu baca faktor dan evidence yang tersedia', result: 'indikasi kualitas dan ketahanan bisnis', limitation: 'proksi rasio tidak membuktikan moat kualitatif secara mutlak' },
  { pattern: /\b(earnings|dividen|dividend|corporate calendar|kalender)\b/, name: 'Earnings, Dividend & Corporate Calendar', function: 'memantau laporan keuangan, dividen, dan agenda aksi korporasi', usage: 'pilih menu terkait, emiten, atau periode lalu baca jadwal dan data yang tersedia', result: 'agenda, histori/yield, dan konteks rilis', limitation: 'tanggal atau field yang tidak tersedia tidak boleh diasumsikan' },
  { pattern: /\b(ownership flow|foreign ownership|kepemilikan)\b/, name: 'Ownership Flow', function: 'melacak perubahan komposisi kepemilikan foreign dan lokal antar-snapshot', usage: 'pilih emiten lalu baca delta, periode snapshot, dan status sumber', result: 'perubahan struktural komposisi kepemilikan', limitation: 'bukan broker flow dan saat ini tidak masuk LensScore' },
  { pattern: /\b(broker summary|broker flow|bandarmologi)\b/, name: 'Broker Summary', function: 'membaca distribusi transaksi berdasarkan kode broker dari data impor yang tersedia', usage: 'pilih emiten dan periode data yang tersedia lalu periksa buy/sell value, volume, atau frekuensi', result: 'ringkasan aktivitas broker pada periode tersebut', limitation: 'ingestion otomatis nonaktif dan datanya belum memengaruhi LensScore' },
  { pattern: /\b(lenswatch|watchlist|alert|akun demo|paper trading|portofolio)\b/, name: 'LensWatch & Akun Demo', function: 'menyimpan pantauan/alert dan melakukan simulasi transaksi dengan saldo virtual', usage: 'login, tambahkan ticker ke watchlist atau catat transaksi virtual pada Akun Demo', result: 'daftar pantau, alert, posisi, serta P&L simulasi', limitation: 'tidak mengeksekusi order atau memindahkan uang nyata' },
  { pattern: /\b(risk matrix|risk calculator|position size|risk reward)\b/, name: 'Risk Matrix & Risk Calculator', function: 'menguji risiko portofolio dan menghitung ukuran posisi/risk-reward', usage: 'masukkan modal, batas risiko, entry, stop, dan target', result: 'ukuran posisi dan skenario risiko', limitation: 'hasil adalah alat perencanaan, bukan sinyal transaksi' },
  { pattern: /\b(news|berita|sentimen|macro|makro)\b/, name: 'News, Sentiment & Macro', function: 'memberi konteks berita dan transmisi faktor makro ke pasar/sektor', usage: 'buka menu terkait lalu pilih emiten atau konteks pasar yang ingin ditinjau', result: 'judul/sentimen dan peta konteks makro', limitation: 'sentimen judul bukan bukti sebab-akibat dan mapping sektor bukan forecast' },
  { pattern: /\b(transparansi|tentang|about|pattern|pola)\b/, name: 'Transparansi, Tentang & Pattern', function: 'menjelaskan metodologi produk, prinsip SahamLens, dan pola teknikal', usage: 'buka menu terkait untuk meninjau evidence, filosofi, atau konfirmasi pola', result: 'konteks metode dan batas penggunaan', limitation: 'pola harus dibaca bersama tren, volume, dan risiko false breakout' },
  { pattern: /\b(calibration lab|kalibrasi lensscore)\b/, name: 'LensRadar Calibration Lab', function: 'menguji reliabilitas LensScore terhadap outcome T+20', usage: 'buka Admin → Calibration Lab lalu baca sample, confidence interval, Brier/ECE, dan hasil OOS', result: 'evidence kalibrasi per bucket skor', limitation: 'hasil tidak otomatis mengubah bobot atau threshold produksi' },
  { pattern: /\b(tp\/?cl validation|tpcl validation)\b/, name: 'TP/CL Validation Lab', function: 'menguji engine TP1/TP2/CL produksi pada histori', usage: 'pilih cohort yang tersedia lalu baca outcome, expectancy, sample, dan kasus TP-vs-CL ambigu', result: 'evidence performa level TP/CL', limitation: 'backtest terpisah dari Calibration Lab LensScore' },
  { pattern: /\b(intraday validation|intraday lab|lensintraday)\b/, name: 'Intraday Validation Lab', function: 'menguji strategi buka-tutup hari yang sama pada horizon intraday', usage: 'pilih cohort dan horizon yang tersedia lalu baca sample, edge, net return, serta status OOS', result: 'evidence 15/30/60 menit atau EOD setelah biaya', limitation: 'terpisah dari outcome LensScore T+20' },
  { pattern: /\b(fundamental backfill|pit fundamental|financial integrity|adoption gate|macro pit|bank fundamentals evidence)\b/, name: 'Data Integrity & PIT Labs', function: 'menjaga provenance point-in-time dan gerbang adopsi data/model', usage: 'gunakan dry run/backfill atau panel evidence yang sesuai lalu perbaiki isu provenance sebelum adopsi', result: 'coverage, evidence, dan status data-only/research', limitation: 'bukti baru tidak otomatis masuk valuasi, LensScore, atau produksi' },
  { pattern: /\b(kesehatan operasional|operational health|scheduled jobs|cron jobs)\b/, name: 'Kesehatan Operasional', function: 'memantau cron, cache, database, dan error job/provider', usage: 'buka menu admin lalu periksa status dan error terakhir', result: 'diagnostik operasional aktual', limitation: 'penyebab tidak boleh ditebak tanpa status/log yang tersedia' },
  { pattern: /\b(feedback lensai|lensai feedback)\b/, name: 'Feedback LensAI', function: 'meninjau jawaban yang diberi rating pengguna', usage: 'buka menu admin lalu prioritaskan feedback negatif berdasarkan intent, prompt, dan jawabannya', result: 'daftar masalah untuk perbaikan routing, knowledge, dan tes regresi', limitation: 'feedback tidak melatih atau mengubah model secara otomatis' },
];

const ALL_FEATURES_QUERY = /\b(semua|seluruh|lengkap|apa saja|bisa apa|fitur(?:nya)? apa|menu(?:nya)? apa|tour|jelaskan fitur)\b/;

function featureAnswer(feature: ProductFeature): string {
  return `**${feature.name}** berfungsi untuk ${feature.function}.\n\n- **Cara pakai:** ${feature.usage}.\n- **Hasil yang dibaca:** ${feature.result}.\n- **Batasan:** ${feature.limitation}.`;
}

function allFeaturesAnswer(): string {
  const adminStart = PRODUCT_FEATURES.findIndex((feature) => feature.name === 'LensRadar Calibration Lab');
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
  const adminStart = PRODUCT_FEATURES.findIndex((item) => item.name === 'LensRadar Calibration Lab');
  const feature = /\b(validation|lab|backfill|integrity|adoption|operational|kesehatan operasional|feedback lensai)\b/.test(text)
    ? PRODUCT_FEATURES.slice(adminStart).find((item) => item.pattern.test(text)) ?? PRODUCT_FEATURES.find((item) => item.pattern.test(text))
    : PRODUCT_FEATURES.find((item) => item.pattern.test(text));
  return feature ? featureAnswer(feature) : allFeaturesAnswer();
}

export function isAllFeaturesProductQuery(prompt: string): boolean {
  return ALL_FEATURES_QUERY.test(normalizeChatText(prompt));
}

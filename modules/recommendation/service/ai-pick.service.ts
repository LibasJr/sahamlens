// Logika peringkat AI Pick - SENGAJA tanpa I/O apa pun (tidak menyentuh Redis maupun
// jaringan) supaya bisa diuji langsung tanpa mock. Pemanggilnya yang menyediakan data:
// app/api/ai-pick/route.ts membacanya dari cache.
//
// ============================================================================
// REWRITE (audit skor 2026-08-05, dipicu kasus nyata BJBR menampilkan skor 97)
// ============================================================================
// Lapisan "bonus" lama MENAMBAHKAN poin mentah di atas `totalScore` yang SUDAH
// dinormalisasi 0-100 oleh calculateScore(). Lima cacat yang saling menguatkan:
//
// 1. SKALA BOHONG. finalScore = 0-100 + bonus maks 40 = rentang asli 0-140.
//    app/breakout-radar/page.tsx jujur melabelinya "Skor (0-140)", TAPI /home menulis
//    "LensScore 97" polos dan briefing AI menyebut "LensScore yang tinggi, yaitu 97" -
//    pembaca wajar mengira 97/100 (nyaris sempurna) padahal 97/140 (69%).
//
// 2. AKUMULASI DIHITUNG DUA KALI. `accumulationConfirmed` dan `flow.accumulationStatus`
//    berasal dari SATU pemanggilan analyzeAccumulationSignal() yang sama (lihat
//    ai-pick-scan.service.ts). scoreFlowPersistensi() sudah memberi 7-10 poin untuk
//    status AKUMULASI, lalu BONUS_ACCUMULATION menambah 10 poin lagi untuk fakta yang
//    persis sama. Ini kelas bug H-1 yang sudah diperbaiki DI DALAM scoring.service.ts,
//    tapi lapisan bonus di atasnya memasukkannya kembali.
//
// 3. OVERSOLD DIHUKUM LALU DIHADIAHI. scoreRsi() memberi RSI<40 hanya 2 dari 8 poin
//    dengan alasan "OVERSOLD zona SELL/hati-hati", sementara BONUS_OVERSOLD memberi +5
//    untuk RSI<30. Sistem yang sama menilai angka yang sama ke dua arah berlawanan.
//
// 4. BREAKOUT & GOLDEN CROSS TUMPANG TINDIH. Skor breakout (breakout.service.ts) disusun
//    dari GOLDEN CROSS + VOL SPIKE + RSI MOMENTUM + BANDAR AKUM - keempatnya SUDAH
//    dinilai penuh oleh scoreMATrend/scoreVolume/scoreRsi/scoreFlowPersistensi. Lalu
//    golden cross masih dapat bonus terpisah lagi, padahal ia komponen terbesar di dalam
//    skor breakout itu sendiri.
//
// 5. AMBANG DILANGGAR OLEH BONUS. MIN_SCORE dibandingkan ke finalScore (sudah berbonus),
//    sehingga saham berskor dasar 45 (kategori HOLD/SELL menurut getKategori) bisa
//    terangkat ke 60 dan masuk daftar "hari ini beli apa" - persis yang dilarang komentar
//    MIN_SCORE di bawah.
//
// PERBAIKAN: skor komposit menjawab "saham ini bagus atau tidak" (kualitas); breakout
// menjawab "sekarang momennya atau tidak" (timing). Keduanya pertanyaan berbeda dan tidak
// boleh dilebur jadi satu angka - apalagi ketika bahan bakunya sebagian besar sama, karena
// sinyal yang saling berkorelasi justru melonjakkan skor paling tinggi tepat saat semuanya
// mengulang informasi yang sama, bukan saat buktinya independen. Sinyal sekarang jadi TAG:
// ditampilkan apa adanya, dipakai sebagai tie-break saat skor seri, TIDAK menambah poin.

import { MIN_COVERAGE_PCT, type ScoringKategori } from '../../technical/service/scoring.service';
import type { EligibilityStatus } from '../../eligibility/types/eligibility.types';

/** Ambang kategori BUY di getKategori() (modules/technical/service/scoring.service.ts).
 * Dipakai ulang, bukan angka baru: daftar "hari ini beli apa" tidak boleh memuat saham
 * yang sistem sendiri tidak kategorikan layak beli. Sekarang dibandingkan ke skor dasar
 * yang murni (bukan skor berbonus), sehingga aturan ini benar-benar ditegakkan. */
const MIN_SCORE = 60;
const MAX_ITEMS = 10;

// `MIN_COVERAGE_PCT` diimpor dari scoring.service.ts (SATU sumber dengan getKategori()),
// bukan ditulis ulang di sini - dipakai HANYA untuk menurunkan ulang status entri cache
// lama yang belum menyimpan `kategori` (lihat rankAiPicks). Impor ini tidak membawa I/O:
// scoring.service.ts murni perhitungan, sesuai catatan "tanpa I/O" di atas file.

// Audit BUILD 003 (Explainable AI): calculateScore() SUDAH menghitung breakdown
// (technical/fundamental/flow) dan 3 alasan teratas (alasan_3_poin) - sebelumnya
// dibuang begitu saja sebelum sampai ke UI (cuma totalScore yang diteruskan), jadi
// user cuma lihat "84" tanpa tahu kenapa. Field di bawah SEMUA berasal dari data
// nyata yang sudah dihitung scoring.service.ts, bukan teks baru yang dikarang AI.
export type ScoreBreakdown = {
  technical: number;
  fundamental: number;
  flow: number;
};

export type ScoredStock = {
  symbol: string;
  price: number;
  changePct: number;
  totalScore: number;
  /** null kalau RSI tidak bisa dihitung (histori kurang) - BUKAN dianggap 50
   * (audit 2026-08-05, temuan C-7). */
  rsi: number | null;
  accumulationConfirmed: boolean;
  breakdown: ScoreBreakdown;
  /** 3 alasan berbobot tertinggi dari calculateScore() (mis. "MACD bullish (Hist:12.30)",
   * "RSI 61.2 zona BUY ideal") - urut dari kontribusi skor terbesar, bukan diacak. */
  topReasons: string[];
  /** ATR-14 (rupiah) - dasar TP1/TP2/CL1/CL2. Opsional: cache 3 hari (lihat
   * shared/cache/ai-pick-cache.ts) bisa masih berisi entri lama dari sebelum field ini
   * ada, sampai cron berikutnya menimpanya. */
  atr?: number | null;
  /** `coverage_pct` dari calculateScore(): persentase bobot yang BENAR-BENAR punya data.
   * Wajib sampai ke UI - skor 82 dari data 90% dan skor 82 dari data 100% bukan klaim
   * yang setara, dan sebelumnya perbedaan itu dihitung tapi tidak pernah ditampilkan.
   * Opsional karena alasan cache lama yang sama seperti `atr`. */
  coverage?: number | null;
  /** P0-1: kategori dari calculateScore(). Sebelumnya DIBUANG di scoreOne() - akibatnya
   * saham berstatus 'DATA TIDAK CUKUP' (coverage < 55%) yang teknikalnya kuat bisa
   * mendapat total_score mendekati 100 karena renormalisasi, lalu menempati peringkat
   * teratas daftar "hari ini beli apa" - persis saham yang sistem sendiri menyatakan
   * belum bisa dinilai. Opsional karena entri cache lama (TTL 3 hari) belum punya field
   * ini; penanganannya di rankAiPicks(). */
  kategori?: ScoringKategori | null;
  /** P0-3: hasil gerbang kelayakan minimal. Saham tidak likuid / kemungkinan tidak
   * diperdagangkan / data basi / histori kurang TIDAK boleh masuk daftar advisory,
   * berapa pun skornya. Opsional karena alasan cache lama yang sama. */
  eligibilityStatus?: EligibilityStatus | null;
  /** Alasan gerbang kelayakan aktif - diteruskan apa adanya untuk penelusuran. */
  eligibilityReasons?: string[] | null;
  /** Setup trading long berbasis ATR + struktur harga. Null kalau RR < 1.5 atau data
   * struktur tidak cukup. Ranking tidak boleh menciptakan TP/CL sendiri dari ATR saja. */
  tradeSetup?: {
    tp1: number;
    tp2: number;
    cl1: number;
    cl2: number;
    rr: number;
  } | null;
};

export type BreakoutInfo = {
  breakoutSymbols: string[];
  goldenCrossSymbols: string[];
  deadCrossSymbols: string[];
};

export type AiPickItem = {
  symbol: string;
  price: number;
  changePct: number;
  /** Skor komposit murni dari calculateScore(), 0-100. Sama nilainya dengan `finalScore` -
   * keduanya dipertahankan supaya konsumen lama tidak patah, dan supaya jelas bahwa tidak
   * ada lagi selisih antara "dasar" dan "akhir". */
  baseScore: number;
  /** Sinyal/event hari ini sebagai LABEL, bukan poin: 'breakout', 'golden cross',
   * 'akumulasi'. Dipakai untuk ditampilkan dan sebagai tie-break saat skor seri. */
  signals: string[];
  /** 0-100. Dijamin tidak pernah melebihi 100. */
  finalScore: number;
  /** Kelengkapan data di balik skor (persen), null kalau entri cache lama. */
  coverage: number | null;
  /** Kategori LensScore v1 di balik skor ini. Dijamin BUKAN 'DATA TIDAK CUKUP' -
   * item seperti itu tidak pernah sampai ke daftar (P0-1). */
  kategori: ScoringKategori | null;
  flagged: boolean;
  flagReason: string | null;
  breakdown: ScoreBreakdown;
  topReasons: string[];
  /** Setup trading long berbasis struktur + ATR. Null kalau belum ada setup RR >= 1.5. */
  tp1: number | null;
  tp2: number | null;
  cl1: number | null;
  cl2: number | null;
  rr: number | null;
};

/**
 * P0-1 - status kelayakan satu entri, tahan terhadap entri cache lama.
 *
 * `kategori` & `eligibilityStatus` baru ditambahkan ke `ScoredStock`, sementara cache
 * ai-pick-scores ber-TTL 3 hari masih bisa berisi entri yang ditulis SEBELUM field ini
 * ada. Redis tidak menegakkan tipe TypeScript, jadi bentuk lama itu nyata, bukan
 * hipotetis.
 *
 * Aturannya FAIL-CLOSED: kalau kita tidak bisa membuktikan sebuah entri layak masuk
 * daftar "hari ini beli apa", entri itu DIKELUARKAN. Daftar yang mengecil (bahkan
 * kosong) adalah jawaban yang benar; menampilkan saham yang statusnya tidak diketahui
 * sebagai rekomendasi tidak.
 */
function isEligibleForAdvisory(s: ScoredStock): boolean {
  // 1. Kelayakan (P0-3). ELIGIBLE saja yang lolos; status apa pun selain itu keluar.
  //    Entri lama tanpa field ini (null/undefined) TIDAK dianggap lolos - "belum
  //    diperiksa" bukan "sudah lolos".
  if (s.eligibilityStatus !== 'ELIGIBLE') return false;

  // 2. Kategori v1. 'DATA TIDAK CUKUP' dikeluarkan, bukan diberi peringkat rendah.
  if (s.kategori != null) {
    if (s.kategori === 'DATA TIDAK CUKUP') return false;
    return true;
  }

  // 3. Entri lama tanpa `kategori`: turunkan ulang dari `coverage`, satu-satunya bahan
  //    yang tersedia. coverage juga null (entri sangat lama) => keluarkan.
  if (typeof s.coverage === 'number' && Number.isFinite(s.coverage)) {
    return s.coverage >= MIN_COVERAGE_PCT;
  }
  return false;
}

export function rankAiPicks(
  scored: ScoredStock[],
  breakout: BreakoutInfo,
  bearishSymbols: string[]
): AiPickItem[] {
  // Penyaringan kelayakan dilakukan SEBELUM pembentukan item & pemeringkatan (bukan
  // sesudah, dan bukan lewat pengurangan skor): saham yang tidak layak tidak pernah
  // menjadi kandidat sama sekali.
  const eligible = (Array.isArray(scored) ? scored : []).filter(isEligibleForAdvisory);

  const items: AiPickItem[] = eligible.map((s) => {
    // Tag sinyal - TIDAK menambah poin (lihat catatan panjang di atas file). Urutannya
    // tetap (breakout, golden cross, akumulasi) supaya tampilan tidak berubah-ubah.
    const signals: string[] = [];
    if (breakout.breakoutSymbols.includes(s.symbol)) signals.push('breakout');
    if (breakout.goldenCrossSymbols.includes(s.symbol)) signals.push('golden cross');
    if (s.accumulationConfirmed) signals.push('akumulasi');

    // Penanda merah TIDAK mengurangi skor - tujuannya membuat kontradiksi terlihat
    // (saham bisa oversold sekaligus bearish, seperti 6 saham yang dulu muncul di tab
    // Undervalue DAN Berisiko sekaligus), bukan menghukumnya dua kali.
    const deadCross = breakout.deadCrossSymbols.includes(s.symbol);
    const bearish = bearishSymbols.includes(s.symbol);
    const flagReason = deadCross ? 'dead cross' : bearish ? 'teknikal bearish' : null;

    return {
      symbol: s.symbol,
      price: s.price,
      changePct: s.changePct,
      baseScore: s.totalScore,
      signals,
      finalScore: s.totalScore,
      coverage: typeof s.coverage === 'number' ? s.coverage : null,
      kategori: s.kategori ?? null,
      flagged: flagReason !== null,
      flagReason,
      // `?? fallback` (BUKAN required tanpa guard) - cache ai-pick-scores punya TTL 3
      // hari (lihat shared/cache/ai-pick-cache.ts) dan cron cuma jalan jam bursa, jadi
      // entri lama tanpa field ini (dari sebelum fitur ini ada) bisa masih terbaca
      // sampai cron berikutnya menimpanya. Redis tidak menegakkan tipe TypeScript -
      // tanpa guard ini, UI yang mengakses item.breakdown.technical akan crash.
      breakdown: s.breakdown ?? { technical: 0, fundamental: 0, flow: 0 },
      topReasons: s.topReasons ?? [],
      tp1: s.tradeSetup?.tp1 ?? null,
      tp2: s.tradeSetup?.tp2 ?? null,
      cl1: s.tradeSetup?.cl1 ?? null,
      cl2: s.tradeSetup?.cl2 ?? null,
      rr: s.tradeSetup?.rr ?? null,
    };
  });

  return items
    .filter((i) => i.finalScore >= MIN_SCORE)
    .sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      // Tie-break 1: saham dengan sinyal/event hari ini didahulukan saat kualitasnya
      // setara - di sinilah breakout tetap berguna tanpa memalsukan skor.
      if (b.signals.length !== a.signals.length) return b.signals.length - a.signals.length;
      // Tie-break 2: simbol, BUKAN urutan array masukan - pelajaran dari bug seleksi
      // alfabetis di simulate.service.ts: hasil tidak boleh bergantung urutan konstanta.
      return a.symbol.localeCompare(b.symbol);
    })
    .slice(0, MAX_ITEMS);
}

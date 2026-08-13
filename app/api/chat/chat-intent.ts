import { normalizeChatText } from './chat-normalize';
import type { ChatDateResolution, ChatHistoryMessage } from './chat-date';

export type ChatIntent =
  | 'SMALL_TALK'
  | 'STOCK_GENERAL'
  | 'FUNDAMENTAL_CURRENT'
  | 'FUNDAMENTAL_HISTORICAL'
  | 'TECHNICAL_CURRENT'
  | 'TECHNICAL_HISTORICAL'
  | 'VALUATION'
  | 'BUY_SELL_RECOMMENDATION'
  | 'COMPARE_STOCKS'
  | 'MARKET_GENERAL'
  | 'NEWS_SENTIMENT'
  | 'SAHAMLENS_PRODUCT_HELP'
  | 'FOLLOW_UP'
  // Ditambahkan 2026-08-13. Sebelumnya seluruh kelompok di bawah ini jatuh ke UNKNOWN,
  // yang berarti nol data terverifikasi - dan karena system prompt melarang menjawab
  // dari ingatan model, LensAI WAJIB menolak. Jadi fitur yang datanya sudah dihitung
  // tiap 5 menit oleh cron (peringkat pasar, sektor, LensRadar) tetap tidak bisa
  // ditanyakan. Intent-intent ini yang menyambungkannya.
  | 'LENSRADAR_PICKS'
  | 'MARKET_MOVERS'
  | 'SECTOR_ROTATION'
  | 'MACRO'
  | 'SCORING_METHOD'
  | 'SCREENER'
  | 'BACKTEST_EVIDENCE'
  | 'DIVIDEND'
  | 'EARNINGS'
  | 'CALENDAR'
  | 'FLOW_BROKER'
  | 'MOAT'
  | 'RISK_PROFILE'
  | 'PORTFOLIO'
  | 'WATCHLIST'
  /** Pertanyaan yang jelas di luar ranah pasar modal (resep, cuaca, jodoh, PR sekolah). */
  | 'OUT_OF_SCOPE'
  | 'UNKNOWN';

export type CompareScope = 'GENERAL' | 'FUNDAMENTAL' | 'TECHNICAL' | 'VALUATION';

export interface IntentClassification {
  intent: ChatIntent;
  /** Intent data yang benar-benar dieksekusi. Untuk FOLLOW_UP, diwarisi dari turn sebelumnya. */
  dataIntent: ChatIntent;
  compareScope: CompareScope;
  requestedMetrics: string[];
  /** Terisi hanya untuk OUT_OF_SCOPE - menentukan kalimat jujur mana yang dipakai. */
  outOfScopeReason?: 'NON_MARKET' | 'OUT_OF_COVERAGE';
  /**
   * Topik LAIN yang ikut disebut dalam satu pertanyaan, mis. "fundamental BBCA gimana,
   * ada berita apa?" - fundamental jadi intent utama, berita masuk ke sini. Sebelumnya
   * pertanyaan seperti ini hanya dijawab separuh: blok kedua tidak pernah dibangun,
   * dan LensAI terpaksa bilang tidak punya datanya untuk bagian yang tidak diminta router.
   */
  alsoIntents: ChatIntent[];
  /**
   * Pertanyaannya terlalu pendek/kabur untuk ditebak dengan aman. Router menjawab dengan
   * pertanyaan balik yang konkret, bukan menebak satu intent lalu menyajikan data yang
   * tidak diminta.
   */
  needsClarification?: boolean;
}

/** Batas jumlah topik tambahan - menjaga ukuran prompt & waktu tunggu tetap wajar. */
const MAX_SECONDARY_INTENTS = 2;

const FUNDAMENTAL_TERMS = /\b(fundamental(?:nya)?|roe|roa|der|current ratio|quick ratio|revenue|pendapatan|laba|margin|neraca|cash ?flow|arus kas)\b/;
const TECHNICAL_TERMS = /\b(teknikal(?:nya)?|technical|rsi|macd|ema|sma|support|resistance|resisten|momentum|volume|trend|uptrend|downtrend|atr)\b/;
const VALUATION_TERMS = /\b(valuasi|valuation|per|p\/e|pbv|p\/b|murah|mahal|undervalued|overvalued|nilai wajar|fair value|dcf|mos|margin of safety)\b/;
const RECOMMENDATION_TERMS = /\b(bagus gak|bagus ga|layak|beli|buy|jual|sell|hold|tahan|entry|masuk|cut loss|stop loss|take profit|tp|cl|investasi\s+\d+\s*(bulan|tahun))\b/;
const COMPARE_TERMS = /\b(banding|bandingin|dibanding|dibandingkan|versus|vs|atau)\b/;
const MARKET_TERMS = /\b(ihsg|\^jkse|idx30|lq45|pasar|market|sektor|breadth|market pulse|kondisi bursa)\b/;
/** Penyebutan INDEKS secara eksplisit - lebih sempit dari MARKET_TERMS. */
const INDEX_TERMS = /\b(ihsg|\^jkse|idx30|lq45|indeks|bursa)\b/;
// Pertanyaan berita/sentimen tidak punya intent sendiri sebelum 2026-08-11, jadi selalu
// jatuh ke UNKNOWN dan berakhir sebagai refusal generik walaupun modules/news punya
// datanya. Lihat catatan lengkap di chat-data-router.ts (marketNewsBlock).
const NEWS_TERMS = /\b(sentimen|sentiment|berita|news|kabar|isu|rumor|katalis|penggerak|pemicu|gara-?gara)\b/;
const PRODUCT_TERMS = /\b(lensscore|lensradar|lenstechnical|lensfundamental|lensmarket|sahamlens|screener|backtest|scoring|skor fundamental|skor teknikal)\b/;
const PRODUCT_CALC_TERMS = /\b(cara|bagaimana|gimana)\b.*\b(tp|cl|take profit|cut loss|stop loss)\b.*\b(hitung|dihitung|perhitungan)\b|\b(tp|cl|take profit|cut loss|stop loss)\b.*\b(cara|bagaimana|gimana)\b.*\b(hitung|dihitung|perhitungan)\b/;
const FOLLOW_UP_TERMS = /^(kenapa|kok|terus|lalu|gimana|bagaimana|kalau|kalo|jadi|yang tadi|tadi|data yang|periode kapan|yang kamu pakai|nya\b|itu\b|sehari sebelumnya)/;
const CONCEPT_QUERY = /\b(apa itu|apa artinya|artinya apa|maksudnya|definisi|fungsi|cara kerja)\b/;
/**
 * Framing yang menandakan pengguna menanyakan FITUR-nya, bukan ISI datanya.
 *
 * Dipakai memisahkan "screener itu apa" (penjelasan fitur) dari "screener profil agresif
 * hasilnya apa" (minta datanya). Tanpa pemisah ini, nama fitur di PRODUCT_TERMS selalu
 * menang dan permintaan data berubah jadi ceramah fitur - persis keluhan "ditanya apa,
 * jawabnya penjelasan umum".
 */
const PRODUCT_DEFINITION_QUERY = /\b(apa itu|itu apa|apa artinya|artinya apa|maksudnya|definisi|fungsi|cara kerja|buat apa|gunanya|bedanya|beda)\b/;

// ---------------------------------------------------------------------------
// Istilah untuk intent yang ditambahkan 2026-08-13 (cakupan seluruh fitur aplikasi).
// ---------------------------------------------------------------------------

// CATATAN SUFIKS (ditemukan oleh test, 2026-08-13): pengguna Indonesia menulis
// "dividennya", "skornya", "betanya", "volatilitasnya" - dan `\bdividen\b` TIDAK cocok
// dengan "dividennya" karena batas kata gagal sebelum "nya". Semua kata benda kunci di
// bawah karena itu diberi `(?:nya|ku|mu)?`. Pola yang sama sudah dipakai daftar lama
// (`fundamental(?:nya)?`), jadi ini konsisten dengan repo, bukan gaya baru.
const S = '(?:nya|ku|mu)?';

/** "Cara nentuin skornya gimana" - metodologi, BUKAN nilai skor sebuah emiten. */
const SCORING_METHOD_TERMS = new RegExp(
  `\\b(cara|gimana|bagaimana|kenapa|mengapa|kok|rumus|formula|metodologi|dihitung|hitungan|nentuin|menentukan|dasar)\\b[\\s\\S]*\\b(skor|score|lensscore|scoring|peringkat|ranking)${S}\\b` +
    `|\\b(skor|score|lensscore|scoring)${S}\\b[\\s\\S]*\\b(cara|gimana|bagaimana|rumus|formula|metodologi|dihitung|nentuin|menentukan|dari mana|darimana)\\b`,
);
/** "Saham apa yang bagus", "rekomendasi hari ini", "top pick". */
const PICKS_TERMS = /\b(lensradar|ai pick|aipick|top pick|rekomendasi hari ini|saham apa|saham yg bagus|saham yang bagus|lagi bagus|paling bagus|skor tertinggi|top skor)\b/;
const MOVERS_TERMS = /\b(top gainer|top loser|gainer|loser|penguat|pelemah|paling naik|paling turun|paling aktif|volume terbesar|transaksi terbesar|teraktif|oversold|overbought|relative strength|kekuatan relatif)\b/;
const SECTOR_TERMS = /\b(sektor|sektoral|rotasi|breadth|advance decline|regime|rezim|fear|greed|risk on|risk off)\b/;
const MACRO_TERMS = /\b(makro|macro|inflasi|bi rate|suku bunga|kurs|rupiah|usd\/?idr|the fed|obligasi|yield|cadangan devisa|gdp|pdb)\b/;
const SCREENER_TERMS = /\b(screener|scanner|saring|penyaringan|filter saham|profil risiko|konservatif|moderat|agresif)\b/;
const BACKTEST_TERMS = /\b(backtest|back test|uji historis|win rate|winrate|bucket|transparansi|transparency|akurasi|hit rate|terbukti|performa model)\b/;
const DIVIDEND_TERMS = new RegExp(`\\b(dividen|dividend|dps|payout|bagi hasil|cum date|ex date|ex-date)${S}\\b`);
const EARNINGS_TERMS = new RegExp(`\\b(earnings|laporan keuangan|lapkeu|kuartal|kuartalan|q1|q2|q3|q4|rilis laba|beat|miss|konsensus analis)${S}\\b`);
const CALENDAR_TERMS = new RegExp(`\\b(kalender|jadwal|agenda|rups|corporate action|aksi korporasi|stock split|right issue)${S}\\b`);
const FLOW_TERMS = new RegExp(`\\b(bandar|bandarmologi|akumulasi|distribusi|net buy|net sell|broker|asing|foreign|arus dana|money flow|cmf)${S}\\b`);
const MOAT_TERMS = new RegExp(`\\b(moat|keunggulan|competitive advantage|durabilitas|ketahanan bisnis|kualitas bisnis)${S}\\b`);
const RISK_TERMS = new RegExp(`\\b(beta|risiko|resiko|volatilitas|volatility|drawdown|position size|money management|manajemen risiko|stop loss maksimal)${S}\\b`);
// Keduanya sengaja MENUNTUT kata milik ("saya/ku/aku"). Tanpa itu, "watchlist" saja
// bisa berarti pertanyaan fitur ("watchlist itu apa"), dan menjawabnya dengan isi
// watchlist pribadi adalah kebocoran topik - bukan cuma salah sasaran.
const PORTFOLIO_TERMS = /\b(portofolio|portfolio|posisi|holding|modal|cuan|rugi|saham)\s*(saya|ku|aku|gue|gw)\b|\b(portofolio|portfolio)(ku|nya saya)\b/;
const WATCHLIST_TERMS = /\b(watchlist|pantauan|daftar pantau|alert)\s*(saya|ku|aku|gue|gw)\b|\bwatchlistku\b/;

/**
 * Pertanyaan yang jelas bukan ranah pasar modal.
 *
 * Dipisahkan dari UNKNOWN dengan sengaja. UNKNOWN artinya "belum ketahuan maksudnya" dan
 * masih dilempar ke model; OUT_OF_SCOPE artinya "sudah pasti di luar ranah", dan jawabannya
 * dibuat DETERMINISTIK di server tanpa memanggil AI sama sekali. Alasannya: untuk pertanyaan
 * seperti "resep rendang" atau "berapa harga emas hari ini", model punya jawaban dari
 * ingatannya - dan ingatan itu tidak diverifikasi siapa pun. Menolak lewat kode jauh lebih
 * bisa diandalkan daripada menambah satu aturan lagi di system prompt.
 */
const OUT_OF_SCOPE_TERMS = /\b(resep|masak|memasak|jodoh|zodiak|ramalan|primbon|cuaca|hujan|sepak ?bola|bola|film|drakor|lagu|lirik|game|gim|pr sekolah|tugas kuliah|skripsi|puisi|pantun|obat|penyakit|diagnosa|dokter|judi|slot|togel|bandar togel|nomor keluar|hack|bobol|password|kripto gratis|uang gratis)\b/;

/** Ranah keuangan tapi memang di luar cakupan data SahamLens (saham IDX). */
const OUT_OF_COVERAGE_TERMS = /\b(bitcoin|btc|ethereum|kripto|crypto|koin|nft|forex|valas|emas antam|harga emas|reksa ?dana|obligasi ritel|sbn|nasdaq|s&p ?500|dow jones|saham amerika|saham as|tesla|apple|nvidia)\b/;

function metricsFromText(text: string): string[] {
  const metrics = ['rsi', 'macd', 'ema', 'sma', 'support', 'resistance', 'roe', 'roa', 'der', 'per', 'pbv', 'current ratio'];
  return metrics.filter((metric) => text.includes(metric));
}

function compareScope(text: string): CompareScope {
  if (FUNDAMENTAL_TERMS.test(text)) return 'FUNDAMENTAL';
  if (TECHNICAL_TERMS.test(text)) return 'TECHNICAL';
  if (VALUATION_TERMS.test(text)) return 'VALUATION';
  return 'GENERAL';
}

// BUG FIX (2026-08-11): MARKET_TERMS & NEWS_TERMS tidak pernah diperiksa di sini, jadi
// percakapan yang dibuka dengan "Gimana IHSG hari ini" TIDAK PERNAH bisa mewariskan
// MARKET_GENERAL ke pertanyaan lanjutannya. Follow-up-nya jatuh ke UNKNOWN (tanpa data)
// atau, kalau kebetulan ada tanggal di kalimatnya, ke jalur historical yang lalu menuntut
// kode emiten - padahal topiknya indeks, yang memang tidak punya kode emiten.
function previousDataIntent(history: ChatHistoryMessage[]): ChatIntent | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== 'user') continue;
    const text = normalizeChatText(history[i].content);
    // Urutan mengikuti classifyChatIntent(): intent yang lebih spesifik diperiksa
    // duluan, kalau tidak follow-up mewarisi intent yang lebih longgar dan datanya
    // jadi tidak nyambung dengan yang sedang dibahas.
    if (PORTFOLIO_TERMS.test(text)) return 'PORTFOLIO';
    if (WATCHLIST_TERMS.test(text)) return 'WATCHLIST';
    if (SCORING_METHOD_TERMS.test(text)) return 'SCORING_METHOD';
    if (BACKTEST_TERMS.test(text)) return 'BACKTEST_EVIDENCE';
    if (DIVIDEND_TERMS.test(text)) return 'DIVIDEND';
    if (EARNINGS_TERMS.test(text)) return 'EARNINGS';
    if (CALENDAR_TERMS.test(text)) return 'CALENDAR';
    if (FLOW_TERMS.test(text)) return 'FLOW_BROKER';
    if (MOAT_TERMS.test(text)) return 'MOAT';
    if (RISK_TERMS.test(text)) return 'RISK_PROFILE';
    if (SCREENER_TERMS.test(text)) return 'SCREENER';
    if (MOVERS_TERMS.test(text)) return 'MARKET_MOVERS';
    if (SECTOR_TERMS.test(text)) return 'SECTOR_ROTATION';
    if (MACRO_TERMS.test(text)) return 'MACRO';
    if (PICKS_TERMS.test(text)) return 'LENSRADAR_PICKS';
    if (COMPARE_TERMS.test(text)) return 'COMPARE_STOCKS';
    if (FUNDAMENTAL_TERMS.test(text)) return 'FUNDAMENTAL_CURRENT';
    if (TECHNICAL_TERMS.test(text)) return 'TECHNICAL_CURRENT';
    if (VALUATION_TERMS.test(text)) return 'VALUATION';
    if (RECOMMENDATION_TERMS.test(text)) return 'BUY_SELL_RECOMMENDATION';
    if (NEWS_TERMS.test(text)) return 'NEWS_SENTIMENT';
    if (MARKET_TERMS.test(text)) return 'MARKET_GENERAL';
  }
  return null;
}

/**
 * Topik tambahan yang ikut disebut dalam satu pertanyaan.
 *
 * Sengaja memakai daftar terpisah dari rantai if di classifyChatIntent(): rantai itu
 * memilih SATU pemenang dan urutannya sudah dijaga banyak test. Daftar ini hanya
 * menambah, tidak pernah mengubah pemenangnya.
 */
function secondaryIntents(text: string, primary: ChatIntent, tickerCount: number): ChatIntent[] {
  const candidates: Array<[ChatIntent, boolean]> = [
    ['NEWS_SENTIMENT', NEWS_TERMS.test(text)],
    ['FUNDAMENTAL_CURRENT', FUNDAMENTAL_TERMS.test(text) && tickerCount > 0],
    ['TECHNICAL_CURRENT', TECHNICAL_TERMS.test(text) && tickerCount > 0],
    ['VALUATION', VALUATION_TERMS.test(text) && tickerCount > 0],
    ['DIVIDEND', DIVIDEND_TERMS.test(text) && tickerCount > 0],
    ['FLOW_BROKER', FLOW_TERMS.test(text) && tickerCount > 0],
    ['EARNINGS', EARNINGS_TERMS.test(text) && tickerCount > 0],
    ['RISK_PROFILE', RISK_TERMS.test(text) && tickerCount > 0],
    ['SECTOR_ROTATION', SECTOR_TERMS.test(text) && tickerCount === 0],
    ['MACRO', MACRO_TERMS.test(text) && tickerCount === 0],
    // Sengaja memakai INDEX_TERMS, bukan MARKET_TERMS: MARKET_TERMS ikut memuat "sektor"
    // dan "pasar", jadi setiap pertanyaan sektor akan menyeret satu fetch IHSG tambahan
    // yang tidak diminta siapa pun. Yang benar-benar menandakan "saya juga menanyakan
    // indeksnya" adalah penyebutan indeksnya secara eksplisit.
    ['MARKET_GENERAL', INDEX_TERMS.test(text) && tickerCount === 0],
  ];

  return candidates
    .filter(([intent, matched]) => matched && intent !== primary)
    .map(([intent]) => intent)
    .slice(0, MAX_SECONDARY_INTENTS);
}

/** Pertanyaan sangat pendek tanpa emiten, tanpa riwayat, dan tanpa kata kerja topik. */
function isTooVague(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 4;
}

export interface ClassifyArgs {
  prompt: string;
  date: ChatDateResolution;
  tickerCount: number;
  hasHistory: boolean;
  history?: ChatHistoryMessage[];
}

/** Intent pemenang tunggal. Rantai if di bawah urutannya dijaga banyak test - jangan
 * menyisipkan pemeriksaan baru tanpa menambah test yang menyatakan urutannya. */
function classifyPrimaryIntent(args: ClassifyArgs): Omit<IntentClassification, 'alsoIntents'> {
  const text = normalizeChatText(args.prompt);
  const metrics = metricsFromText(text);
  const isCompare = args.tickerCount >= 2 || COMPARE_TERMS.test(text);
  const marketLevel = args.tickerCount === 0;
  const of = (intent: ChatIntent): Omit<IntentClassification, 'alsoIntents'> => ({
    intent,
    dataIntent: intent,
    compareScope: 'GENERAL',
    requestedMetrics: metrics,
  });

  // --- Data milik pengguna. Diperiksa paling awal: "portofolio saya gimana" tidak boleh
  // tersapu FUNDAMENTAL_TERMS ("modal") atau RECOMMENDATION_TERMS ("cuan/rugi").
  if (PORTFOLIO_TERMS.test(text)) return of('PORTFOLIO');
  if (WATCHLIST_TERMS.test(text)) return of('WATCHLIST');

  // --- Di luar ranah. Sengaja di depan: kalau pertanyaan resep/judi/ramalan sempat lolos
  // ke bawah, ia berakhir sebagai UNKNOWN yang tetap dikirim ke model, dan model punya
  // jawaban dari ingatannya. Ditolak di sini, jawabannya deterministik dan jujur.
  if (OUT_OF_SCOPE_TERMS.test(text)) {
    return { ...of('OUT_OF_SCOPE'), outOfScopeReason: 'NON_MARKET' };
  }
  // Kripto/emas/saham luar negeri: pertanyaan keuangan yang wajar, tapi SahamLens memang
  // tidak punya datanya. Dibedakan supaya kalimat penolakannya tidak terdengar seperti
  // menuduh pertanyaannya aneh.
  if (marketLevel && OUT_OF_COVERAGE_TERMS.test(text)) {
    return { ...of('OUT_OF_SCOPE'), outOfScopeReason: 'OUT_OF_COVERAGE' };
  }

  // --- Metodologi scoring. WAJIB sebelum PRODUCT_TERMS: "lensscore" ada di kedua daftar,
  // dan pertanyaan "cara nentuin skornya gimana" butuh angka bobot/ambang yang nyata,
  // bukan penjelasan fitur secara umum.
  if (SCORING_METHOD_TERMS.test(text)) {
    return { intent: 'SCORING_METHOD', dataIntent: 'SCORING_METHOD', compareScope: 'GENERAL', requestedMetrics: metrics };
  }

  // Pertanyaan DEFINISI fitur dijawab sebagai product help. Yang bukan definisi jatuh ke
  // intent datanya di bawah - "backtest itu apa" beda kebutuhan dengan "win rate backtest
  // berapa".
  const productHelp: Omit<IntentClassification, 'alsoIntents'> = {
    intent: 'SAHAMLENS_PRODUCT_HELP',
    dataIntent: 'SAHAMLENS_PRODUCT_HELP',
    compareScope: 'GENERAL',
    requestedMetrics: metrics,
  };
  if (PRODUCT_TERMS.test(text) && PRODUCT_DEFINITION_QUERY.test(text)) return productHelp;
  if (PRODUCT_CALC_TERMS.test(text) || (/fundamental/.test(text) && /teknikal/.test(text) && /beda/.test(text))) {
    return productHelp;
  }

  if (BACKTEST_TERMS.test(text)) return of('BACKTEST_EVIDENCE');

  // Pengetahuan umum model boleh dipakai untuk MENJELASKAN konsep, bukan untuk angka
  // emiten. Karena tidak ada ticker, pertanyaan definisi tidak perlu fetch backend.
  if (args.tickerCount === 0 && CONCEPT_QUERY.test(text)) {
    return { intent: 'UNKNOWN', dataIntent: 'UNKNOWN', compareScope: 'GENERAL', requestedMetrics: metrics };
  }

  // Diperiksa SEBELUM MARKET_GENERAL: "sentimen pasar gimana" menyebut kedua kelompok
  // istilah, dan yang diminta pengguna adalah beritanya, bukan level indeks.
  if (NEWS_TERMS.test(text)) {
    return { intent: 'NEWS_SENTIMENT', dataIntent: 'NEWS_SENTIMENT', compareScope: 'GENERAL', requestedMetrics: metrics };
  }

  // --- Pertanyaan per emiten untuk fitur yang datanya spesifik. Diperiksa sebelum
  // kelompok pasar: "dividen BBCA" menyebut emiten, jadi bukan pertanyaan pasar.
  if (DIVIDEND_TERMS.test(text)) return of('DIVIDEND');
  if (EARNINGS_TERMS.test(text)) return of('EARNINGS');
  if (CALENDAR_TERMS.test(text)) return of('CALENDAR');
  if (FLOW_TERMS.test(text)) return of('FLOW_BROKER');
  if (MOAT_TERMS.test(text)) return of('MOAT');
  if (RISK_TERMS.test(text)) return of('RISK_PROFILE');

  // --- Kelompok pasar. Semua menuntut TIDAK ada emiten yang disebut: begitu pengguna
  // menyebut kode saham, yang diminta hampir selalu analisis emiten itu, bukan peringkat
  // pasar. (Jebakan lama yang sama sudah pernah terjadi dengan framing halaman IHSG -
  // lihat overrideNote di build-system-prompt.ts.)
  if (marketLevel && SCREENER_TERMS.test(text)) return of('SCREENER');
  if (marketLevel && MOVERS_TERMS.test(text)) return of('MARKET_MOVERS');
  if (marketLevel && SECTOR_TERMS.test(text)) return of('SECTOR_ROTATION');
  if (marketLevel && MACRO_TERMS.test(text)) return of('MACRO');
  if (marketLevel && PICKS_TERMS.test(text)) return of('LENSRADAR_PICKS');

  // Nama fitur yang tersisa (tanpa framing definisi dan tanpa intent data yang cocok) -
  // mis. "LensTechnical gimana sih". Diperlakukan sebagai pertanyaan produk.
  if (PRODUCT_TERMS.test(text)) return productHelp;

  if (MARKET_TERMS.test(text) && args.tickerCount === 0) {
    return { intent: 'MARKET_GENERAL', dataIntent: 'MARKET_GENERAL', compareScope: 'GENERAL', requestedMetrics: metrics };
  }

  if (isCompare && args.tickerCount > 0) {
    return { intent: 'COMPARE_STOCKS', dataIntent: 'COMPARE_STOCKS', compareScope: compareScope(text), requestedMetrics: metrics };
  }

  if (args.date.mode === 'HISTORICAL') {
    if (TECHNICAL_TERMS.test(text) && !FUNDAMENTAL_TERMS.test(text)) {
      return { intent: 'TECHNICAL_HISTORICAL', dataIntent: 'TECHNICAL_HISTORICAL', compareScope: 'TECHNICAL', requestedMetrics: metrics };
    }
    return { intent: 'FUNDAMENTAL_HISTORICAL', dataIntent: 'FUNDAMENTAL_HISTORICAL', compareScope: 'FUNDAMENTAL', requestedMetrics: metrics };
  }

  if (VALUATION_TERMS.test(text)) {
    return { intent: 'VALUATION', dataIntent: 'VALUATION', compareScope: 'VALUATION', requestedMetrics: metrics };
  }

  if (FUNDAMENTAL_TERMS.test(text)) {
    return { intent: 'FUNDAMENTAL_CURRENT', dataIntent: 'FUNDAMENTAL_CURRENT', compareScope: 'FUNDAMENTAL', requestedMetrics: metrics };
  }

  if (TECHNICAL_TERMS.test(text)) {
    return { intent: 'TECHNICAL_CURRENT', dataIntent: 'TECHNICAL_CURRENT', compareScope: 'TECHNICAL', requestedMetrics: metrics };
  }

  if (RECOMMENDATION_TERMS.test(text)) {
    return { intent: 'BUY_SELL_RECOMMENDATION', dataIntent: 'BUY_SELL_RECOMMENDATION', compareScope: 'GENERAL', requestedMetrics: metrics };
  }

  if (args.hasHistory && FOLLOW_UP_TERMS.test(text)) {
    const previous = previousDataIntent(args.history ?? []);
    return {
      intent: 'FOLLOW_UP',
      dataIntent: previous ?? (args.tickerCount > 0 ? 'STOCK_GENERAL' : 'UNKNOWN'),
      compareScope: previous === 'COMPARE_STOCKS' ? 'GENERAL' : 'GENERAL',
      requestedMetrics: metrics,
    };
  }

  if (args.tickerCount > 0) {
    return { intent: 'STOCK_GENERAL', dataIntent: 'STOCK_GENERAL', compareScope: 'GENERAL', requestedMetrics: metrics };
  }

  if (/^(halo|hai|hi|selamat\s+(pagi|siang|sore|malam)|pagi|siang|sore|malam|makasih|terima kasih|thanks|siapa kamu|kamu siapa|bisa bantu apa|apa kabar)\b/.test(text)) {
    return { intent: 'SMALL_TALK', dataIntent: 'SMALL_TALK', compareScope: 'GENERAL', requestedMetrics: metrics };
  }

  return { intent: 'UNKNOWN', dataIntent: 'UNKNOWN', compareScope: 'GENERAL', requestedMetrics: metrics };
}

/**
 * Klasifikasi lengkap: satu intent utama, ditambah topik lain yang ikut disebut dan
 * penanda kalau pertanyaannya terlalu kabur untuk ditebak.
 */
export function classifyChatIntent(args: ClassifyArgs): IntentClassification {
  const primary = classifyPrimaryIntent(args);
  const text = normalizeChatText(args.prompt);

  // Topik tambahan hanya relevan untuk pertanyaan yang memang mengambil data. Untuk
  // small talk, di-luar-ranah, dan pertanyaan produk, menambah blok data cuma
  // memperbesar prompt tanpa menjawab apa pun.
  const carriesData = !['SMALL_TALK', 'OUT_OF_SCOPE', 'SAHAMLENS_PRODUCT_HELP', 'FOLLOW_UP'].includes(primary.intent);
  const alsoIntents = carriesData ? secondaryIntents(text, primary.dataIntent, args.tickerCount) : [];

  const needsClarification =
    primary.intent === 'UNKNOWN' &&
    args.tickerCount === 0 &&
    !args.hasHistory &&
    !CONCEPT_QUERY.test(text) &&
    isTooVague(text);

  return { ...primary, alsoIntents, ...(needsClarification ? { needsClarification } : {}) };
}

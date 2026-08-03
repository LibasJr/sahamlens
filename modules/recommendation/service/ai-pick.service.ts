// Logika peringkat AI Pick - SENGAJA tanpa I/O apa pun (tidak menyentuh Redis maupun
// jaringan) supaya bisa diuji langsung tanpa mock. Pemanggilnya yang menyediakan data:
// app/api/ai-pick/route.ts membacanya dari cache.

/** Ambang kategori BUY di getKategori() (modules/technical/service/scoring.service.ts).
 * Dipakai ulang, bukan angka baru: daftar "hari ini beli apa" tidak boleh memuat saham
 * yang sistem sendiri tidak kategorikan layak beli. */
const MIN_SCORE = 60;
const MAX_ITEMS = 10;

/** Bobot mencerminkan kelangkaan sinyal: makin jarang muncul, makin besar artinya
 * ketika muncul. Breakout ~6-7 saham/hari dari ratusan; RSI < 30 kondisi umum yang
 * bisa bertahan berminggu-minggu. */
const BONUS_BREAKOUT = 15;
const BONUS_ACCUMULATION = 10;
const BONUS_GOLDEN_CROSS = 10;
const BONUS_OVERSOLD = 5;
const RSI_OVERSOLD = 30;

export type ScoredStock = {
  symbol: string;
  price: number;
  changePct: number;
  totalScore: number;
  rsi: number;
  accumulationConfirmed: boolean;
};

export type BreakoutInfo = {
  breakoutSymbols: string[];
  goldenCrossSymbols: string[];
  deadCrossSymbols: string[];
};

export type PickBonus = { label: string; points: number };

export type AiPickItem = {
  symbol: string;
  price: number;
  changePct: number;
  baseScore: number;
  bonuses: PickBonus[];
  finalScore: number;
  flagged: boolean;
  flagReason: string | null;
};

export function rankAiPicks(
  scored: ScoredStock[],
  breakout: BreakoutInfo,
  bearishSymbols: string[]
): AiPickItem[] {
  const items: AiPickItem[] = scored.map((s) => {
    const bonuses: PickBonus[] = [];
    if (breakout.breakoutSymbols.includes(s.symbol)) bonuses.push({ label: 'breakout', points: BONUS_BREAKOUT });
    if (s.accumulationConfirmed) bonuses.push({ label: 'akumulasi', points: BONUS_ACCUMULATION });
    if (breakout.goldenCrossSymbols.includes(s.symbol)) bonuses.push({ label: 'golden cross', points: BONUS_GOLDEN_CROSS });
    if (s.rsi < RSI_OVERSOLD) bonuses.push({ label: 'oversold', points: BONUS_OVERSOLD });

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
      bonuses,
      finalScore: s.totalScore + bonuses.reduce((sum, b) => sum + b.points, 0),
      flagged: flagReason !== null,
      flagReason,
    };
  });

  return items
    .filter((i) => i.finalScore >= MIN_SCORE)
    // Tie-break simbol, BUKAN urutan array masukan - pelajaran dari bug seleksi
    // alfabetis di simulate.service.ts: hasil tidak boleh bergantung urutan konstanta.
    .sort((a, b) => (b.finalScore !== a.finalScore ? b.finalScore - a.finalScore : a.symbol.localeCompare(b.symbol)))
    .slice(0, MAX_ITEMS);
}

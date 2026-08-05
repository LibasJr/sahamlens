import { findSwingPoints, clusterLevels, swingStructure, type SwingBar } from './swing-levels';

// REWRITE (review kuantitatif 2026-08-05, temuan P2-16).
//
// SEBELUMNYA: `resistance = max(High, 20 bar)`, `support = min(Low, 20 bar)` - yaitu
// RANGE 20 hari, bukan support/resistance. Lalu hasilnya dipakai sebagai sinyal arah
// ("dekat support -> BULLISH") tanpa syarat apa pun, yaitu asumsi mean reversion yang
// diterapkan juga pada saham yang sedang downtrend - definisi menangkap pisau jatuh.
//
// SEKARANG: level berasal dari swing point fractal yang dikelompokkan menurut jumlah
// sentuhan (lihat swing-levels.ts), dan pembacaannya BERSYARAT pada struktur tren:
//
//   - Struktur HH/HL (higher high, higher low): dekat support = pullback di dalam tren
//     naik -> BULLISH, keyakinan naik bersama jumlah sentuhan level itu.
//   - Struktur LH/LL: dekat support BUKAN sinyal beli. Level yang berulang kali diuji
//     dari atas di dalam tren turun justru lebih mungkin ditembus daripada bertahan.
//   - Struktur campuran / belum terbentuk: dilaporkan NEUTRAL, bukan dipaksa memihak.
//
// Keyakinan juga tidak lagi memakai rumus `95 - jarak*10` yang konstantanya tidak berasal
// dari mana pun. Sekarang: dasar 55, ditambah bukti yang bisa dihitung (jumlah sentuhan
// level dan seberapa dekat harga ke level itu), dibatasi 85.

const MAX_CONFIDENCE = 85;

/** Seberapa dekat harga harus ke level untuk disebut "di level itu", dalam persen. */
const NEAR_PCT = 2.5;

export function analyze(history: SwingBar[], currentPrice: number) {
  const NA = {
    label: 'Support & Resistance',
    value: 'N/A',
    decision: 'NEUTRAL',
    confidence: 0,
    raw: { support: null as number | null, resistance: null as number | null, supportTouches: 0, resistanceTouches: 0, structure: null as string | null },
  };

  // Butuh cukup bar untuk membentuk beberapa swing terkonfirmasi - 40 bar memberi
  // ruang untuk ~3-5 swing, batas minimum agar "jumlah sentuhan" punya arti.
  if (!Array.isArray(history) || history.length < 40 || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return NA;
  }

  const points = findSwingPoints(history);
  const levels = clusterLevels(points);
  if (levels.length === 0) return NA;

  let support: { price: number; touches: number } | null = null;
  let resistance: { price: number; touches: number } | null = null;
  for (const lv of levels) {
    if (lv.price < currentPrice) {
      if (!support || lv.price > support.price) support = lv;
    } else if (lv.price > currentPrice) {
      if (!resistance || lv.price < resistance.price) resistance = lv;
    }
  }

  const structure = swingStructure(points);
  const distToSupport = support ? ((currentPrice - support.price) / currentPrice) * 100 : null;
  const distToResistance = resistance ? ((resistance.price - currentPrice) / currentPrice) * 100 : null;

  let decision = 'NEUTRAL';
  let confidence = 50;
  let note = '';

  const nearSupport = distToSupport != null && distToSupport <= NEAR_PCT;
  const nearResistance = distToResistance != null && distToResistance <= NEAR_PCT;

  if (nearSupport && !nearResistance) {
    if (structure === 'LH_LL') {
      // Inti perbaikan P2-16: di struktur menurun, dekat support bukan peluang beli.
      decision = 'BEARISH';
      confidence = Math.min(MAX_CONFIDENCE, 55 + (support!.touches - 1) * 5);
      note = `di support ${support!.price.toFixed(0)} (${support!.touches}x sentuh) TAPI struktur menurun (LH/LL) - level lebih mungkin ditembus daripada bertahan`;
    } else if (structure === 'HH_HL') {
      decision = 'BULLISH';
      confidence = Math.min(MAX_CONFIDENCE, 60 + (support!.touches - 1) * 6);
      note = `pullback ke support ${support!.price.toFixed(0)} (${support!.touches}x sentuh) di dalam struktur naik (HH/HL)`;
    } else {
      decision = 'NEUTRAL';
      confidence = 50;
      note = `di support ${support!.price.toFixed(0)} tapi struktur tren belum jelas - arah tidak disimpulkan`;
    }
  } else if (nearResistance && !nearSupport) {
    if (structure === 'HH_HL') {
      // Di struktur naik, resistance lebih mungkin ditembus - tapi belum tentu, jadi
      // netral, bukan bullish. Menyatakan "pasti breakout" akan mengulang kesalahan
      // yang sama dari sisi sebaliknya.
      decision = 'NEUTRAL';
      confidence = 50;
      note = `menguji resistance ${resistance!.price.toFixed(0)} (${resistance!.touches}x sentuh) di dalam struktur naik - breakout belum terkonfirmasi`;
    } else {
      decision = 'BEARISH';
      confidence = Math.min(MAX_CONFIDENCE, 60 + (resistance!.touches - 1) * 6);
      note = `tertahan di resistance ${resistance!.price.toFixed(0)} (${resistance!.touches}x sentuh)`;
    }
  } else if (!resistance && support) {
    // Tidak ada swing high di atas harga: harga berada di atas seluruh level historis
    // yang terbentuk. Ini fakta yang berarti, bukan data hilang.
    decision = structure === 'LH_LL' ? 'NEUTRAL' : 'BULLISH';
    confidence = structure === 'LH_LL' ? 50 : 65;
    note = 'di atas seluruh resistance struktural yang terbentuk - tidak ada level penahan di atas';
  } else {
    decision = 'NEUTRAL';
    confidence = 50;
    note = 'harga di antara level, tidak menempel di support maupun resistance';
  }

  const supText = support ? support.price.toFixed(0) : 'N/A';
  const resText = resistance ? resistance.price.toFixed(0) : 'tidak ada';

  return {
    label: 'Support & Resistance (swing)',
    value: `Sup: ${supText} (${support?.touches ?? 0}x), Res: ${resText} (${resistance?.touches ?? 0}x) - ${note}`,
    decision,
    confidence: Math.round(confidence),
    // `raw` dipakai penyusun setup transaksi (stop loss struktural) - lihat P2-17.
    raw: {
      support: support?.price ?? null,
      resistance: resistance?.price ?? null,
      supportTouches: support?.touches ?? 0,
      resistanceTouches: resistance?.touches ?? 0,
      structure,
    },
  };
}

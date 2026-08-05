// STRUKTUR PASAR: swing high/low fractal + level support/resistance dari sentuhan nyata.
//
// Dibuat untuk menutup temuan P2-16 (review kuantitatif 2026-08-05). Sebelumnya
// "Support & Resistance" adalah:
//
//     resistance = max(High, 20 bar)
//     support    = min(Low, 20 bar)
//
// Itu RANGE 20 hari, bukan support/resistance. Tidak ada swing high/low, tidak ada pivot,
// tidak ada jumlah sentuhan - padahal yang membuat sebuah level berarti justru berapa
// kali harga berbalik di situ. Level yang cuma disentuh sekali (kebetulan titik ekstrem
// 20 hari terakhir) diperlakukan sama dengan level yang sudah menahan harga lima kali.
//
// Konsekuensi lanjutannya lebih serius: hasil itu dipakai sebagai SINYAL ARAH ("dekat
// support -> BULLISH") dengan bobot penuh, yaitu asumsi mean reversion tanpa syarat -
// termasuk pada saham yang sedang downtrend, yang persis definisi menangkap pisau jatuh.
//
// Semua fungsi di sini MURNI dan tidak melempar: histori pendek/rusak menghasilkan
// daftar kosong atau `null`, bukan exception dan bukan angka tebakan.

export interface SwingBar {
  High: number;
  Low: number;
  Close: number;
  AdjClose?: number | null;
}

export interface SwingPoint {
  /** Indeks bar di dalam array histori yang diberikan. */
  index: number;
  price: number;
  kind: 'HIGH' | 'LOW';
}

export interface StructuralLevel {
  price: number;
  /** Berapa kali harga berbalik di sekitar level ini (dalam toleransi). Minimal 1.
   * Inilah yang membedakan level bermakna dari titik ekstrem kebetulan. */
  touches: number;
}

/** Lebar fractal: sebuah bar disebut swing high kalau High-nya lebih tinggi daripada
 * `WING` bar di kiri DAN `WING` bar di kanan. 2 (jadi pola 5 bar) adalah definisi
 * Bill Williams yang baku - dipakai apa adanya, bukan angka baru yang dikarang. */
const WING = 2;

/**
 * Titik balik harga (fractal 5 bar).
 *
 * Catatan look-ahead: sebuah swing baru bisa DIKONFIRMASI setelah `WING` bar berikutnya
 * terbentuk. Karena itu `WING` bar terakhir tidak pernah menghasilkan swing - bukan
 * kelalaian, melainkan syarat supaya level yang dilaporkan benar-benar sudah teruji
 * pada saat dilaporkan.
 */
export function findSwingPoints(history: SwingBar[]): SwingPoint[] {
  const out: SwingPoint[] = [];
  if (!Array.isArray(history) || history.length < WING * 2 + 1) return out;

  for (let i = WING; i < history.length - WING; i++) {
    const bar = history[i];
    if (!bar || !Number.isFinite(bar.High) || !Number.isFinite(bar.Low)) continue;

    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= WING; k++) {
      const left = history[i - k];
      const right = history[i + k];
      if (!left || !right) { isHigh = false; isLow = false; break; }
      if (!(bar.High > left.High && bar.High > right.High)) isHigh = false;
      if (!(bar.Low < left.Low && bar.Low < right.Low)) isLow = false;
    }
    if (isHigh) out.push({ index: i, price: bar.High, kind: 'HIGH' });
    if (isLow) out.push({ index: i, price: bar.Low, kind: 'LOW' });
  }
  return out;
}

/**
 * Gabungkan swing point yang berdekatan menjadi satu level, dan hitung sentuhannya.
 *
 * `tolerancePct` menentukan seberapa dekat dua titik dianggap level yang sama. Default 1,5%
 * dipilih karena fraksi harga IDX & spread wajar membuat perbedaan di bawah itu tidak
 * bermakna sebagai level yang berbeda.
 *
 * [HIPOTESIS] Toleransi 1,5% belum dikalibrasi per pita harga. Untuk saham di bawah
 * Rp 200 (fraksi harga Rp 1) toleransi ini mungkin terlalu longgar.
 */
export function clusterLevels(points: SwingPoint[], tolerancePct = 1.5): StructuralLevel[] {
  const sorted = points.map((p) => p.price).filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  const levels: StructuralLevel[] = [];

  for (const price of sorted) {
    const last = levels[levels.length - 1];
    if (last && Math.abs(price - last.price) / last.price * 100 <= tolerancePct) {
      // Level yang sudah ada digeser ke rata-rata berbobot sentuhannya - level yang
      // sering disentuh tidak boleh tergeser jauh oleh satu sentuhan baru di pinggir.
      last.price = (last.price * last.touches + price) / (last.touches + 1);
      last.touches += 1;
    } else {
      levels.push({ price, touches: 1 });
    }
  }
  return levels;
}

export interface StructuralZones {
  /** Level terdekat DI BAWAH harga sekarang. `null` kalau tidak ada swing low di bawah. */
  support: StructuralLevel | null;
  /** Level terdekat DI ATAS harga sekarang. `null` kalau harga sedang di puncak semua
   * swing high (breakout ke wilayah tanpa resistance historis - itu fakta yang berarti,
   * bukan data hilang). */
  resistance: StructuralLevel | null;
  /** Seluruh level, untuk ditampilkan/dipakai penentuan target. */
  levels: StructuralLevel[];
  swingCount: number;
}

export function findStructuralZones(history: SwingBar[], currentPrice: number): StructuralZones {
  const points = findSwingPoints(history);
  const levels = clusterLevels(points);

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return { support: null, resistance: null, levels, swingCount: points.length };
  }

  let support: StructuralLevel | null = null;
  let resistance: StructuralLevel | null = null;
  for (const lv of levels) {
    if (lv.price < currentPrice) {
      if (!support || lv.price > support.price) support = lv;
    } else if (lv.price > currentPrice) {
      if (!resistance || lv.price < resistance.price) resistance = lv;
    }
  }
  return { support, resistance, levels, swingCount: points.length };
}

export type StructureTrend = 'HH_HL' | 'LH_LL' | 'MIXED' | null;

/**
 * Struktur tren dari urutan swing: higher-high & higher-low (naik) vs lower-high &
 * lower-low (turun).
 *
 * Ini yang membuat pembacaan support/resistance BERSYARAT: dekat support di struktur
 * HH/HL adalah pullback; dekat support di struktur LH/LL adalah level yang sedang
 * dalam proses ditembus. Dua situasi itu dulu diperlakukan identik.
 */
export function swingStructure(points: SwingPoint[]): StructureTrend {
  const highs = points.filter((p) => p.kind === 'HIGH').slice(-3);
  const lows = points.filter((p) => p.kind === 'LOW').slice(-3);
  if (highs.length < 2 || lows.length < 2) return null;

  const risingHighs = highs[highs.length - 1].price > highs[highs.length - 2].price;
  const risingLows = lows[lows.length - 1].price > lows[lows.length - 2].price;

  if (risingHighs && risingLows) return 'HH_HL';
  if (!risingHighs && !risingLows) return 'LH_LL';
  return 'MIXED';
}

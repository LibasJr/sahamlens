// NORMALISASI ANGKA DARI SUMBER RESMI.
//
// Sumber Indonesia mencampur dua konvensi dalam satu dokumen: "42,31%" (koma
// desimal, gaya id-ID) dan "1,234,567" (koma ribuan, gaya en-US). `parseFloat`
// polos SALAH untuk keduanya:
//   parseFloat("42,31")     -> 42     (desimal hilang, diam-diam)
//   parseFloat("1,234,567") -> 1      (angka runtuh jadi 1)
// Kedua kesalahan itu TIDAK melempar error - ia menghasilkan angka yang terlihat
// wajar. Karena itu normalisasi di sini eksplisit dan diuji per bentuk.

/** Penanda "tidak ada nilai" yang lazim di tabel resmi. Bukan nol. */
const BLANK_TOKENS = new Set(['', '-', '--', 'n/a', 'na', 'null', 'nil', 'tidak ada', '#n/a']);

/**
 * Ubah teks angka menjadi number, atau null kalau memang tidak ada nilainya.
 *
 * null di sini berarti "sumber tidak menyediakan angka ini", dan itu fakta yang
 * harus dipertahankan. JANGAN pernah mengubahnya jadi 0 - nol adalah klaim
 * kuantitatif ("kepemilikan asing nihil") yang tidak pernah diukur sumbernya.
 *
 * Bentuk yang ditangani:
 *   "42.31"      -> 42.31
 *   "42,31"      -> 42.31   (koma desimal)
 *   "42.31%"     -> 42.31
 *   "1,234,567"  -> 1234567 (koma ribuan)
 *   "1.234.567"  -> 1234567 (titik ribuan)
 *   "1.234.567,89" -> 1234567.89
 *   "1,234,567.89" -> 1234567.89
 *   "(1.234)"    -> -1234   (kurung = negatif, konvensi akuntansi)
 *   "-" / "N/A"  -> null
 */
export function parseNumericToken(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;

  let text = raw.trim();
  if (BLANK_TOKENS.has(text.toLowerCase())) return null;

  // Kurung akuntansi: (1.234) berarti negatif.
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }

  // Buang simbol persen, spasi (termasuk NBSP dari HTML), dan pemisah tak terlihat.
  text = text.replace(/[%\s  ]/g, '');
  if (text.startsWith('+')) text = text.slice(1);
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  }
  if (BLANK_TOKENS.has(text.toLowerCase())) return null;

  // Hanya digit, titik, dan koma yang boleh tersisa. Apa pun selain itu (huruf,
  // mata uang, tanda lain) berarti token ini bukan angka - kembalikan null alih-
  // alih menebak, supaya baris cacat tertangkap validator, bukan lolos separuh.
  if (!/^[\d.,]+$/.test(text)) return null;

  const normalized = normalizeSeparators(text);
  if (normalized === null) return null;

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/**
 * Tentukan mana pemisah desimal dan mana pemisah ribuan, lalu kembalikan string
 * bergaya mesin ("1234567.89").
 *
 * Aturannya berbasis BUKTI dalam token itu sendiri, bukan asumsi locale global:
 * satu dokumen KSEI/IDX bisa memuat kedua gaya sekaligus.
 */
function normalizeSeparators(text: string): string | null {
  const hasDot = text.includes('.');
  const hasComma = text.includes(',');

  if (hasDot && hasComma) {
    // Yang muncul TERAKHIR adalah pemisah desimal ("1.234,89" vs "1,234.89").
    const decimalSep = text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    const parts = text.split(decimalSep);
    if (parts.length !== 2) return null; // dua pemisah desimal = token cacat
    const intPart = parts[0].split(thousandSep).join('');
    if (!/^\d*$/.test(intPart) || !/^\d+$/.test(parts[1])) return null;
    return `${intPart || '0'}.${parts[1]}`;
  }

  if (hasComma) return disambiguateSingleSeparator(text, ',');
  if (hasDot) return disambiguateSingleSeparator(text, '.');
  return /^\d+$/.test(text) ? text : null;
}

/**
 * Satu jenis pemisah saja - ambigu, jadi diputuskan dari BENTUK grupnya.
 *
 * "1,234"    -> ribuan (grup tepat 3 digit setelah pemisah)
 * "42,31"    -> desimal (2 digit)
 * "1,234,567"-> ribuan (semua grup 3 digit)
 * "1,2345"   -> desimal (4 digit, mustahil sebagai grup ribuan)
 *
 * Kasus benar-benar ambigu "1,234" diputus sebagai RIBUAN karena itu bentuk yang
 * dipakai kolom jumlah efek; kolom persentase pada sumber ini tidak pernah punya
 * 3 angka di belakang koma. Keputusan ini didokumentasikan supaya kalau suatu
 * saat ada sumber dengan presisi 3 desimal, ia ditangani lewat kolom bertipe
 * eksplisit (parsePercentageToken), bukan dengan menebak ulang di sini.
 */
function disambiguateSingleSeparator(text: string, sep: string): string | null {
  const parts = text.split(sep);
  if (parts.some((part) => !/^\d*$/.test(part))) return null;

  if (parts.length > 2) {
    // Banyak pemisah = pasti ribuan. Setiap grup setelah yang pertama harus 3 digit.
    const groupsValid = parts.slice(1).every((part) => part.length === 3);
    if (!groupsValid || parts[0].length === 0 || parts[0].length > 3) return null;
    return parts.join('');
  }

  const [head, tail] = parts;
  if (head.length === 0 || tail.length === 0) return null;
  if (tail.length === 3 && head.length <= 3) return `${head}${tail}`; // ribuan
  return `${head}.${tail}`; // desimal
}

/**
 * Persentase dari sumber. Sama dengan parseNumericToken, tetapi menolak nilai di
 * luar 0..100 dengan mengembalikan null - persentase kepemilikan di luar rentang
 * itu bukan angka yang boleh dipakai, dan meng-clamp-nya ke 100 akan
 * menyembunyikan sumber yang rusak.
 */
export function parsePercentageToken(raw: unknown): number | null {
  const value = parseNumericToken(raw);
  if (value === null) return null;
  if (value < 0 || value > 100) return null;
  return value;
}

/**
 * Bulatkan ke `digits` desimal tanpa galat biner yang khas (0.1 + 0.2).
 * Dipakai untuk delta percentage point yang ditampilkan ke pengguna.
 */
export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

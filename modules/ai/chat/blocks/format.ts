/**
 * Helper pemformat untuk blok "Data Terverifikasi Server" LensAI.
 *
 * Dipindahkan dari chat-data-router.ts saat blok data diperluas ke seluruh fitur
 * aplikasi (2026-08-13) - sebelumnya private di satu file, dan begitu ada empat file
 * blok, menyalinnya berarti empat definisi "tidak tersedia" yang bisa berbeda kata.
 * Kata-katanya sendiri penting: model diinstruksikan memperlakukan frasa itu sebagai
 * larangan mengisi angka, jadi ia harus persis sama di semua blok.
 */

export function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function safe(value: unknown, suffix = ''): string {
  return finite(value) ? `${Number(value).toFixed(2)}${suffix}` : 'tidak tersedia';
}

/** Angka bertanda eksplisit - "+1,20%" vs "1,20%" mengubah arti kalimatnya. */
export function signed(value: number, digits = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

export function safeSigned(value: unknown, suffix = ''): string {
  return finite(value) ? `${signed(Number(value))}${suffix}` : 'tidak tersedia';
}

export function analyzerLine(result: { label: string; value: string; decision: string }): string {
  return `- ${result.label}: ${result.value} (${result.decision})`;
}

/**
 * Satu kalimat yang dipakai SEMUA blok ketika sumbernya kosong.
 *
 * Cache-miss bukan alasan untuk diam: kalau blok hanya dihilangkan, model tidak punya
 * cara membedakan "fitur ini tidak ditanyakan" dari "datanya sedang tidak ada", dan
 * lubang itulah yang dulu diisi dengan angka karangan.
 */
export function unavailableLine(what: string, reason = 'belum tersedia di server saat ini'): string {
  return `- ${what}: ${reason}. JANGAN mengarang angka atau daftar penggantinya - katakan datanya belum tersedia.`;
}

/** Header blok terverifikasi, seragam untuk semua domain. */
export function verifiedHeader(label: string): string {
  return `\n## Data Terverifikasi Server (OTORITATIF - ${label}):`;
}

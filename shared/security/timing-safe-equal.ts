import crypto from 'crypto';

// Perbandingan timing-safe untuk secret/kode (OTP, admin key, dst) - `!==` biasa
// membocorkan info lewat waktu eksekusi (berhenti di karakter pertama yang beda),
// memungkinkan secret ditebak byte-per-byte lewat pengukuran waktu berulang.
export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

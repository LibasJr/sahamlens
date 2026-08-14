import type { ChatIntent } from './chat-intent';

/**
 * Penutup DYOR (do your own research) untuk jawaban yang memuat data/keputusan pasar.
 *
 * DITEMPELKAN DI SERVER, bukan diminta lewat aturan prompt. Alasannya sama dengan
 * verify-numbers.ts: aturan prompt bersifat imbauan - model bisa memakainya, memendekkan,
 * atau melewatinya kalau jawabannya sudah terasa panjang. Sebuah penafian yang muncul
 * "biasanya" bukan penafian. Ditempel di kode, ia ada di setiap jawaban yang memang
 * membutuhkannya, dengan kalimat yang sama persis, dan bisa ditinjau di satu tempat.
 *
 * TIDAK ditempel ke SEMUA jawaban. Sapaan, penolakan di luar ranah, pertanyaan balik, dan
 * penjelasan fitur tidak memuat klaim pasar apa pun - menempelkan penafian di sana hanya
 * melatih pengguna untuk berhenti membacanya, dan itu justru melemahkan penafian di
 * tempat yang benar-benar penting.
 */

const NO_DYOR: ChatIntent[] = ['SMALL_TALK', 'OUT_OF_SCOPE', 'SAHAMLENS_PRODUCT_HELP', 'UNKNOWN'];

export const DYOR_NOTICE =
  '\n\n---\n_Semua angka di atas berasal dari data SahamLens, bukan ajakan beli/jual. ' +
  'Keputusan transaksi tetap ada di tangan kamu - **DYOR (do your own research)** dan sesuaikan dengan profil risikomu._';

export function shouldAppendDyor(intent: ChatIntent): boolean {
  return !NO_DYOR.includes(intent);
}

/** Idempoten: jangan menempel dua kali kalau model kebetulan sudah menulis DYOR sendiri. */
export function withDyor(answer: string, intent: ChatIntent): string {
  if (!shouldAppendDyor(intent)) return answer;
  if (/\bdyor\b/i.test(answer)) return answer;
  return answer + DYOR_NOTICE;
}

import type { ChatIntent } from './chat-intent';

/**
 * Penutup DYOR (do your own research) untuk jawaban yang berpotensi memengaruhi
 * keputusan investasi.
 *
 * DITEMPELKAN DI SERVER, bukan diminta lewat aturan prompt. Alasannya sama dengan
 * verify-numbers.ts: aturan prompt bersifat imbauan - model bisa memakainya, memendekkan,
 * atau melewatinya kalau jawabannya sudah terasa panjang. Sebuah penafian yang muncul
 * "biasanya" bukan penafian. Ditempel di kode, ia ada di setiap jawaban yang memang
 * membutuhkannya, dengan kalimat yang sama persis, dan bisa ditinjau di satu tempat.
 *
 * TIDAK ditempel ke SEMUA jawaban berbasis data. Pertanyaan harga, fundamental,
 * teknikal, IHSG, teori, atau penjelasan fitur adalah informasi yang diminta pengguna;
 * itu bukan dengan sendirinya ajakan mengambil transaksi. Penafian hanya relevan saat
 * pengguna meminta nilai/valuasi, prediksi, atau keputusan beli/jual. Menempelkannya di
 * mana-mana justru melatih pengguna untuk berhenti membacanya.
 */

const INVESTMENT_DECISION_INTENTS: ChatIntent[] = [
  'VALUATION',
  'BUY_SELL_RECOMMENDATION',
  'PRICE_PREDICTION',
];

export const DYOR_NOTICE =
  '\n\n---\n_Semua angka di atas berasal dari data SahamLens, bukan ajakan beli/jual. ' +
  'Keputusan transaksi tetap ada di tangan kamu - **DYOR (do your own research)** dan sesuaikan dengan profil risikomu._';

export function shouldAppendDyor(intent: ChatIntent): boolean {
  return INVESTMENT_DECISION_INTENTS.includes(intent);
}

/** Idempoten: jangan menempel dua kali kalau model kebetulan sudah menulis DYOR sendiri. */
export function withDyor(answer: string, intent: ChatIntent): string {
  if (!shouldAppendDyor(intent)) return answer;
  if (/\bdyor\b/i.test(answer)) return answer;
  return answer + DYOR_NOTICE;
}

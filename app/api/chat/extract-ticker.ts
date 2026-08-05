import { getEmitenSymbolSet } from '@/shared/market/emiten-list';

// BUG FIX (2026-08-05, laporan user): sebelumnya chat cuma tahu simbol dari KONTEKS
// HALAMAN yang sedang dibuka (dispatch 'update-ai-context' / segmen URL, lihat
// components/AIChat.tsx) - tanya "BJBR score berapa?" waktu lagi buka /market-pulse (bukan
// /technical/BJBR) bikin server tidak tahu BJBR itu apa, dan LensAI (benar, sesuai
// desainnya) menolak mengarang jawaban tanpa data alih-alih mencari tahu. Dari sudut
// pandang pengguna itu terlihat "ngawur" padahal datanya beneran ada di aplikasi - cuma
// tidak pernah dicari.
//
// Fungsi ini mengekstrak kode saham dari TEKS PERTANYAAN bebas, divalidasi ke daftar
// emiten ASLI (shared/market/emiten-list.ts, 900+ kode) - bukan tebakan pola huruf. Kode
// IDX selalu tepat 4 huruf, jadi kandidat kata 4-huruf apa pun dicoba, tapi HANYA yang
// benar-benar terdaftar yang dipakai (mis. "gila" tidak akan pernah dianggap kode saham).
export function extractMentionedTicker(prompt: string): string | null {
  const symbols = getEmitenSymbolSet();
  const candidates = prompt.toUpperCase().match(/\b[A-Z]{4}\b/g) || [];
  for (const candidate of candidates) {
    if (symbols.has(candidate)) return candidate;
  }
  return null;
}

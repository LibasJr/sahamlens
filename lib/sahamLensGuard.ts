// Pemeriksaan awal saat route dimuat. Ringan & tidak boleh punya efek samping terhadap
// data - hanya melaporkan konfigurasi yang kurang.
//
// BUG FIX (audit logika & algoritma 2026-08-05, temuan L-6): guard ini SEBELUMNYA menulis
// file `data/portfolios.json` berisi portofolio contoh (telegram_id hardcoded, kas Rp100
// juta) kalau folder `data/` belum ada. Portofolio sudah lama pindah ke Postgres
// (modules/portfolio/repository/*), jadi file itu tidak pernah dibaca kode mana pun lagi -
// yang tersisa hanyalah efek samping menulis data keuangan karangan ke disk setiap kali
// aplikasi dijalankan di lingkungan baru. Blok itu dihapus (dan file sisanya ikut dibuang).
//
// Peringatan provider AI juga diperbaiki: aplikasi ini mendukung Gemini, Groq, dan
// OpenRouter (lihat lib/aiProviders.ts). Memperingatkan HANYA soal GEMINI_API_KEY
// menyesatkan - deployment yang cuma memasang GROQ_API_KEY sebenarnya baik-baik saja.
export function guard() {
  const hasAnyProvider = !!(
    process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY
  );
  if (!hasAnyProvider) {
    console.warn(
      '[Guard] Tidak ada AI provider terkonfigurasi (GEMINI_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY). ' +
      'Fitur AI akan memakai fallback rule-based, dan Council AI mengembalikan analisa lokal.'
    );
  }
}

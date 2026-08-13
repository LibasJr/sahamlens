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
//
// 2026-08-13: daftar provider TIDAK lagi disalin ulang di sini. Versi lama mengecek
// tiga env var hardcoded, jadi setiap provider baru (Kimi, NVIDIA, dan sekarang
// 9Router) memunculkan peringatan "tidak ada provider" yang salah di deployment yang
// sebenarnya sudah terkonfigurasi. Sekarang memakai hasAnyAIProvider() - satu sumber
// kebenaran yang sama dengan yang dipakai cascade-nya sendiri.
import { hasAnyAIProvider } from './aiProviders';

export function guard() {
  if (!hasAnyAIProvider()) {
    console.warn(
      '[Guard] Tidak ada AI provider terkonfigurasi (GEMINI_API_KEY / GROQ_API_KEY / ' +
      'OPENROUTER_API_KEY / KIMI_API_KEY / NVIDIA_API_KEY, atau NINEROUTER_BASE_URL + ' +
      'NINEROUTER_API_KEY). Fitur AI akan memakai fallback rule-based, dan Council AI ' +
      'mengembalikan analisa lokal.'
    );
  }
}

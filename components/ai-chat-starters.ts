/**
 * Contoh pertanyaan pembuka LensAI.
 *
 * MASALAH YANG DIPECAHKAN (2026-08-13): cakupan LensAI melonjak - pasar, sektor,
 * peringkat LensRadar, dividen, earnings, arus dana, metodologi skor, portofolio - tapi
 * layar pembukanya masih menawarkan SATU contoh saja: analisis teknikal emiten yang
 * sedang dibuka. Pengguna tidak punya cara tahu sisanya ada. Kemampuan yang tidak
 * diketahui siapa pun sama saja dengan tidak ada.
 *
 * Aturan isi daftar ini: setiap contoh HARUS pertanyaan yang benar-benar punya jalur
 * data di chat-data-router.ts. Menawarkan contoh yang berujung "datanya belum tersedia"
 * lebih buruk daripada tidak menawarkan apa pun - pengguna mencobanya sekali, gagal, dan
 * berhenti mencoba yang lain.
 *
 * Semua contoh di bawah punya padanannya di
 * `app/api/chat/__tests__/fixtures/lensai-questions.json`, jadi kalau routing-nya rusak,
 * `npm run eval:lensai` yang memberi tahu - bukan pengguna.
 */

export interface ChatStarter {
  /** Teks yang tampil di chip - dipendekkan supaya muat di panel sempit. */
  label: string;
  /** Pertanyaan yang benar-benar dikirim. */
  prompt: string;
}

/** Emiten sedang dibuka: contoh diarahkan ke emiten itu. */
export function tickerStarters(symbol: string): ChatStarter[] {
  return [
    { label: `Fundamental ${symbol}`, prompt: `${symbol} fundamentalnya gimana?` },
    { label: `Teknikal ${symbol}`, prompt: `Teknikal ${symbol} gimana sekarang?` },
    { label: `Dividen ${symbol}`, prompt: `Dividen ${symbol} gimana?` },
    { label: `Arus dana ${symbol}`, prompt: `${symbol} lagi diakumulasi atau didistribusi?` },
  ];
}

/** Halaman non-emiten: contoh diarahkan ke pasar & fitur yang paling sering ditanya. */
export const MARKET_STARTERS: ChatStarter[] = [
  { label: 'Kondisi pasar hari ini', prompt: 'IHSG hari ini gimana, sektor apa yang lagi kuat?' },
  { label: 'Skor tertinggi hari ini', prompt: 'Saham apa yang skornya tertinggi hari ini?' },
  { label: 'Top gainer & loser', prompt: 'Top gainer hari ini apa aja?' },
  { label: 'Cara skor ditentukan', prompt: 'Cara nentuin LensScore gimana?' },
];

/**
 * Simbol emiten dari URL, atau null kalau halaman ini bukan halaman emiten.
 *
 * Dipisah dari komponen supaya bisa diuji: sebelumnya logika ini ditulis inline DUA kali
 * di AIChat.tsx (di handler dan di label tombol) dengan asumsi "segmen terakhir = simbol"
 * yang keliru untuk halaman biasa - `/screener` menghasilkan "screener" sebagai simbol.
 */
export function symbolFromPathname(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  // Rute emiten di aplikasi ini berpola /<fitur>/<SIMBOL>.
  const TICKER_ROUTES = ['technical', 'fundamental', 'dcf', 'moat', 'pattern', 'earnings', 'dividend', 'risk'];
  if (!TICKER_ROUTES.includes(segments[0])) return null;

  const raw = decodeURIComponent(segments[segments.length - 1]).replace(/\.JK$/i, '').toUpperCase();
  return /^[A-Z]{4}$/.test(raw) ? raw : null;
}

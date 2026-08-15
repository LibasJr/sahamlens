import { normalizeChatText } from './chat-normalize';

type MenuFocus = { pattern: RegExp; title: string; guidance: string };

// Ringkasan yang dipilih per menu. Knowledge base lengkap tetap tersedia untuk teori
// pasar, tetapi blok ini memberi prioritas sempit agar jawaban fitur tidak melebar ke
// menu lain yang tidak ditanyakan pengguna.
const MENU_FOCUS: MenuFocus[] = [
  { pattern: /\b(backtest)\b/, title: 'Backtest', guidance: 'Jelaskan fungsi → langkah pakai → metrik hasil → batasan. Builder filter: pilih preset/filter, modal, periode, tekan Backtest, lalu baca return/win rate/drawdown vs IHSG. Live Filter Check membaca kandidat saat ini. Backtest saham tunggal hanya replay candle: pilih ticker/periode, Backtest memuat, Start memutar, Stop menghentikan.' },
  { pattern: /\b(lensmarket|market pulse|ihsg|breadth|sektor)\b/, title: 'LensMarket', guidance: 'Fokus pada arah indeks, breadth, regime, dan sektor. Jelaskan data sesi terakhir jika pasar tidak reguler; jangan mengubahnya menjadi prediksi atau rekomendasi indeks.' },
  { pattern: /\b(lensradar|lensscore|ai pick|scanner peluang)\b/, title: 'LensRadar', guidance: 'Jelaskan bahwa ini scanner universe likuid. Pengguna membaca skor/alasan lalu melanjutkan riset per emiten. Kategori dan signal model bukan rekomendasi transaksi otomatis.' },
  { pattern: /\b(lenstechnical|teknikal|rsi|macd|ema|sma|support|resistance)\b/, title: 'LensTechnical', guidance: 'Jelaskan cara pilih ticker dan membaca tren, momentum, volume, RSI/MACD/MA, support-resistance, serta TP/CL bila tersedia. Tegaskan indikator tidak otomatis menjadi keputusan beli/jual.' },
  { pattern: /\b(lensscanner|screener)\b/, title: 'LensScanner', guidance: 'Jelaskan pilihan profil risiko dan filter sektor/harga/market cap/likuiditas, lalu cara membaca daftar kandidat. Hasilnya adalah penyaringan, bukan rekomendasi beli.' },
  { pattern: /\b(compare|bandingkan)\b/, title: 'Compare', guidance: 'Jelaskan masukkan minimal dua ticker, pilih fokus fundamental/teknikal/valuasi, lalu bandingkan metrik sejenis. Jangan menentukan pemenang dari satu rasio saja.' },
  { pattern: /\b(lensfundamental|fundamental|roe|npm|per|pbv)\b/, title: 'LensFundamental', guidance: 'Fokus pada kualitas laba, pertumbuhan, leverage, arus kas, dan rasio sesuai sektor. Jelaskan istilah yang ditanya dalam bahasa praktis; angka emiten hanya dari data server.' },
  { pattern: /\b(valuation|valuasi|dcf|nilai wajar|nilai intrinsik|fair value)\b/, title: 'Valuation / DCF', guidance: 'Jelaskan fair value sebagai estimasi model dari asumsi/metode yang tersedia, bukan target harga pasti. Jika meminta nilai emiten, bacakan hasil dan asumsi aktual; jika meminta cara pakai, arahkan pilih ticker lalu baca nilai wajar dan margin of safety.' },
  { pattern: /\b(moat)\b/, title: 'Moat', guidance: 'Jelaskan Moat sebagai proksi ketahanan bisnis dari data fundamental, bukan rating kualitatif mutlak. Sebutkan faktor yang tersedia serta batas proksinya.' },
  { pattern: /\b(earnings|laporan keuangan|kuartal)\b/, title: 'Earnings', guidance: 'Jelaskan monitoring laporan/agenda earnings dan cara membaca periode, angka rilis, serta perubahan relevan. Jangan menyatakan beat/miss tanpa basis pembanding yang tersedia.' },
  { pattern: /\b(dividen|dividend|yield)\b/, title: 'Dividend', guidance: 'Jelaskan data dividen/yield/jadwal dan simulator arus kas. Dalam simulator, pengguna mengisi modal/target lalu membaca asumsi; yield tinggi tidak otomatis aman.' },
  { pattern: /\b(lenswatch|watchlist|akun demo|paper trading|portofolio|portfolio)\b/, title: 'Portfolio & Watchlist', guidance: 'Jelaskan LensWatch untuk ticker dan alert, serta Akun Demo untuk transaksi simulasi/P&L. Keduanya data pribadi sehingga perlu login; aplikasi tidak mengeksekusi order nyata.' },
  { pattern: /\b(risk matrix|risk calculator|position size|risk reward|risk\/reward)\b/, title: 'Risk', guidance: 'Risk Matrix untuk stress test portofolio; Risk Calculator untuk position sizing dan risk/reward. Jelaskan input modal, risiko, entry, stop, target, lalu hasilnya sebagai panduan risiko, bukan sinyal transaksi.' },
  { pattern: /\b(news|berita|sentimen|corporate calendar|kalender|macro|makro)\b/, title: 'Research', guidance: 'News & Sentiment adalah konteks berita/judul; Corporate Calendar adalah agenda event yang tersedia; Macro menghubungkan BI rate, inflasi, kurs, dan sektor. Jangan mengubah sentimen menjadi sebab-akibat atau kepastian harga.' },
  { pattern: /\b(transparansi|tentang|about|beranda|home|pattern|pola)\b/, title: 'Navigasi & Transparansi', guidance: 'Beranda adalah snapshot awal; Transparansi menjelaskan metodologi/validasi; Tentang menjelaskan prinsip produk; Pattern dibaca bersama tren, volume, dan risiko false breakout. Jawab fungsi menu yang ditanya saja.' },
];

export function getFocusedMenuKnowledge(prompt: string): string {
  const text = normalizeChatText(prompt);
  const focus = MENU_FOCUS.find((item) => item.pattern.test(text));
  return focus
    ? `## Fokus Menu Saat Ini — ${focus.title}\n${focus.guidance}\n- Jawab hanya bagian yang relevan dengan menu ini; jangan membuat tour seluruh aplikasi kecuali pengguna memintanya.`
    : '';
}

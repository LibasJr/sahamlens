import { getPortfolioSummary } from '@/modules/portfolio/service/portfolio.service';
import { listWatchlist } from '@/modules/watchlist/repository/watchlist.repository';
import { finite, safe } from './format';

/**
 * Data milik PENGGUNA SENDIRI: portofolio dan watchlist.
 *
 * ATURAN AKSES (keputusan pemilik produk, 2026-08-13): blok ini hanya boleh dibangun
 * untuk sesi yang BENAR-BENAR login. Pemanggil wajib melewatkan userId dari
 * getSession(), bukan dari body request - kalau tidak, siapa pun bisa meminta isi
 * portofolio orang lain hanya dengan menebak id di payload chat.
 *
 * Kenapa dibatasi begitu ketat: isi blok ini ikut terkirim ke penyedia AI pihak ketiga
 * (Gemini/Groq/9Router, lihat lib/aiProviders.ts). Itu diterima untuk data milik
 * pengguna yang bertanya sendiri, tetapi TIDAK untuk pengunjung anonim, dan tidak
 * untuk data pengguna lain.
 *
 * Yang sengaja TIDAK dikirim: riwayat transaksi lengkap. Pertanyaan "portofolio saya
 * gimana" dijawab dari posisi terkini; mengirim seluruh jejak transaksi hanya menambah
 * data pribadi yang keluar tanpa menambah kualitas jawaban.
 */

export interface ChatUserContext {
  userId: string;
}

export async function portfolioBlock(user: ChatUserContext): Promise<string> {
  try {
    const summary = await getPortfolioSummary(user.userId);
    const holdings = Array.isArray(summary?.holdings) ? summary.holdings : [];

    if (holdings.length === 0) {
      return [
        '- Portofolio pengguna: KOSONG (belum ada posisi tercatat).',
        '- Jangan mengarang isi portofolio. Boleh menjelaskan cara menambah posisi lewat halaman Portfolio.',
      ].join('\n');
    }

    const totalCost = holdings.reduce((sum: number, h: any) => sum + (finite(h.totalCost) ? h.totalCost : 0), 0);

    return [
      `- Portofolio pengguna: ${holdings.length} posisi tercatat`,
      `- Total modal tercatat: ${totalCost.toLocaleString('id-ID')}`,
      '- Posisi:',
      ...holdings.map(
        (h: any) =>
          `  - ${h.symbol}: ${h.lots} lot, harga rata-rata ${safe(h.avgPrice)}, modal ${finite(h.totalCost) ? h.totalCost.toLocaleString('id-ID') : 'tidak tersedia'}`,
      ),
      '- BATAS PENTING: baris di atas adalah POSISI dan MODAL, bukan nilai pasar terkini.',
      '  Untung/rugi TIDAK ada di blok ini - jangan menghitungnya dari harga yang kamu ingat.',
      '  Kalau pengguna menanyakan untung/rugi, katakan angka harga terkini per emiten perlu dicek',
      '  di halaman Portfolio, atau tanyakan emiten mana yang ingin dianalisis supaya harganya diambil resmi.',
    ].join('\n');
  } catch (error) {
    console.warn('[LensAI:user-blocks] portfolio gagal', error instanceof Error ? error.message : String(error));
    return '- Portofolio pengguna: gagal dibaca dari database. Jangan mengarang isinya.';
  }
}

export async function watchlistBlock(user: ChatUserContext): Promise<string> {
  try {
    const items = await listWatchlist(user.userId);

    if (!items.length) {
      return [
        '- Watchlist pengguna: KOSONG.',
        '- Jangan mengarang isinya. Boleh menjelaskan cara menambah emiten lewat halaman Watchlist.',
      ].join('\n');
    }

    return [
      `- Watchlist pengguna: ${items.length} emiten`,
      ...items.map((item) => {
        const parts = [
          `  - ${item.symbol}`,
          finite(item.buy_price) ? `harga beli tercatat ${safe(item.buy_price)}` : null,
          finite(item.alert_price) ? `alert di ${safe(item.alert_price)}` : null,
          finite(item.lot) ? `${item.lot} lot` : null,
        ].filter(Boolean);
        return parts.join(' | ');
      }),
      '- Harga/analisis terkini TIDAK ada di blok ini. Kalau pengguna minta kondisi emiten di',
      '  watchlist-nya, sebutkan emitennya lalu ambil datanya lewat pertanyaan per emiten.',
    ].join('\n');
  } catch (error) {
    console.warn('[LensAI:user-blocks] watchlist gagal', error instanceof Error ? error.message : String(error));
    return '- Watchlist pengguna: gagal dibaca dari database. Jangan mengarang isinya.';
  }
}

/** Jawaban deterministik untuk pengunjung anonim yang menanyakan data pribadinya. */
export const LOGIN_REQUIRED_FOR_USER_DATA =
  'Portofolio dan watchlist tersimpan per akun, jadi saya baru bisa membacanya kalau kamu login dulu. ' +
  'Setelah login, saya bisa menyebut posisi dan emiten yang kamu pantau. Sementara itu, saya tetap bisa ' +
  'menganalisis emiten apa pun kalau kamu sebutkan kodenya.';

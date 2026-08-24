import { LOT_SIZE } from '../constants/portfolio.constants';
import { tickerLabel } from '@/lib/utils/ticker-label';

/** Cerminan MAX_DEVIATION di service/price-guard.service.ts. Tiket order memakai
 * angka yang SAMA supaya order yang pasti ditolak server ketahuan sebelum dikirim -
 * bukan setelah gagal tanpa penjelasan angka mana yang bermasalah. Kalau penjaga di
 * server diubah, nilai di sini harus ikut (dijaga oleh __tests__/order-ticket.test.ts). */
export const MAX_PRICE_DEVIATION = 0.35;

/** Fraksi harga IDX. Tombol +/- pada tiket order melangkah sebesar tick resmi, bukan
 * 1 rupiah - melangkah 1 rupiah di saham Rp 6.000 menghasilkan harga yang tidak
 * pernah ada di papan (6.001) dan membuat simulasi menjauh dari pasar nyata. */
export function tickSize(price: number): number {
  if (price < 200) return 1;
  if (price < 500) return 2;
  if (price < 2000) return 5;
  if (price < 5000) return 10;
  return 25;
}

export function roundToTick(price: number): number {
  const tick = tickSize(price);
  return Math.max(tick, Math.round(price / tick) * tick);
}

export function stepPrice(price: number, direction: 1 | -1): number {
  return Math.max(tickSize(1), roundToTick(price + direction * tickSize(price)));
}

export function orderValue(price: number, lots: number): number {
  return price * lots * LOT_SIZE;
}

/** Lot terbesar yang benar-benar bisa dieksekusi: dibatasi kas (BUY) atau lot yang
 * dipegang (SELL). Dipakai tombol persentase, jadi "100%" selalu berarti sesuatu
 * yang lolos validasi, bukan angka yang langsung ditolak. */
export function maxExecutableLots(input: { type: 'BUY' | 'SELL'; cash: number; price: number; ownedLots: number }): number {
  if (input.type === 'SELL') return Math.max(0, input.ownedLots);
  if (input.price <= 0) return 0;
  return Math.max(0, Math.floor(input.cash / (input.price * LOT_SIZE)));
}

export interface OrderDraft {
  type: 'BUY' | 'SELL';
  symbol: string;
  price: number;
  lots: number;
  cash: number;
  ownedLots: number;
  marketPrice: number | null;
  priceUnavailable: boolean;
}

const formatIDR = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

/**
 * Alasan order BELUM bisa dikirim, dalam bahasa yang bisa ditindaklanjuti. String
 * kosong berarti valid.
 *
 * Setiap aturan di sini menutup satu penolakan yang dulu hanya bisa ditemukan
 * dengan mengirim order dan menunggu gagal: kas kurang (InsufficientCashError),
 * lot melebihi kepemilikan (InsufficientLotsError), harga di luar koridor pasar
 * (UnrealisticTradePriceError), dan harga pasar yang tidak tersedia.
 */
export function validateOrderDraft(draft: OrderDraft): string {
  if (!draft.symbol.trim()) return 'Pilih emiten dulu.';
  if (draft.priceUnavailable) {
    return `Harga pasar ${tickerLabel(draft.symbol.toUpperCase())} belum tersedia, jadi order belum bisa dicatat. Coba lagi sebentar lagi.`;
  }
  if (!(draft.price > 0)) return 'Harga belum diisi.';
  if (draft.marketPrice != null && draft.marketPrice > 0) {
    const deviation = Math.abs(draft.price - draft.marketPrice) / draft.marketPrice;
    if (deviation > MAX_PRICE_DEVIATION) {
      return `Harga ${draft.price.toLocaleString('id-ID')} menyimpang ${(deviation * 100).toFixed(0)}% dari harga pasar ${draft.marketPrice.toLocaleString('id-ID')}. Maksimal ${MAX_PRICE_DEVIATION * 100}% supaya P/L simulasi tetap berarti.`;
    }
  }
  if (!(draft.lots > 0)) return 'Jumlah lot belum diisi.';
  if (!Number.isInteger(draft.lots)) return 'Lot harus bilangan bulat.';
  const value = orderValue(draft.price, draft.lots);
  if (draft.type === 'BUY' && value > draft.cash) {
    return `Kas tidak cukup. Order ${formatIDR(value)}, kas tersedia ${formatIDR(draft.cash)}.`;
  }
  if (draft.type === 'SELL' && draft.lots > draft.ownedLots) {
    return `Lot melebihi kepemilikan. Kamu punya ${draft.ownedLots.toLocaleString('id-ID')} lot ${tickerLabel(draft.symbol.toUpperCase())}.`;
  }
  return '';
}

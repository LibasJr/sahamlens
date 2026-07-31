import { getPortfolioByUserId, createPortfolio } from '../repository/portfolio.repository';
import { getHoldings } from '../repository/holdings.repository';
import { listTransactions, type PaginatedTransactions } from '../repository/transaction.repository';
import { INITIAL_CASH, LOT_SIZE, TRANSACTIONS_MAX_PAGE_SIZE } from '../constants/portfolio.constants';
import type { PortfolioSummary, HoldingDto } from '../types/portfolio.types';

// Dipanggil dari modules/user/service/auth.service.ts saat verifikasi akun -
// menggantikan reach-through langsung ke lib/dbLocal yang sebelumnya ada di sana
// (temuan M4 code review, sekarang tertutup karena modules/portfolio sudah ada).
export async function provisionPortfolio(userId: string): Promise<void> {
  const existing = await getPortfolioByUserId(userId);
  if (existing) return;
  await createPortfolio({
    id: `pf_${userId}`,
    user_id: userId,
    name: 'Portfolio Virtual',
    cash: INITIAL_CASH,
    initial_cash: INITIAL_CASH,
    created_at: new Date().toISOString(),
  });
}

export async function getPortfolioSummary(userId: string): Promise<PortfolioSummary> {
  // Fallback cold-start: kalau provisioning saat verifikasi gagal/terlewat, buat
  // portfolio on-demand di sini juga - lebih baik daripada 404 yang bikin UI blank
  // (perilaku ini dipertahankan dari app/api/portfolio/route.ts sebelumnya, tapi
  // sekarang benar-benar menulis ke Postgres, bukan cuma objek fallback sekali pakai).
  let portfolio = await getPortfolioByUserId(userId);
  if (!portfolio) {
    await provisionPortfolio(userId);
    portfolio = await getPortfolioByUserId(userId);
  }
  if (!portfolio) {
    // Tidak akan terjadi kecuali insert di atas gagal - jaring pengaman terakhir.
    throw new Error('Gagal membuat portfolio');
  }
  const holdings = await getHoldings(portfolio.id);
  const holdingDtos: HoldingDto[] = holdings.map((h) => ({
    symbol: h.symbol,
    lots: h.lots,
    avgPrice: Number(h.avg_price),
    totalCost: Number(h.avg_price) * h.lots * LOT_SIZE,
  }));
  // Disertakan langsung (bukan cuma via endpoint transaksi terpaginasi) supaya
  // halaman /portfolio yang ada tetap jalan tanpa perubahan - dibatasi ke halaman
  // pertama (100 baris) alih-alih dulu unbounded (ambil SEMUA transaksi tanpa
  // batas). Trader dengan riwayat >100 transaksi butuh endpoint /transactions
  // yang genuinely dipaginasi (LIST 1.5) begitu UI-nya dibangun.
  const recentTransactions = await listTransactions(portfolio.id, { limit: TRANSACTIONS_MAX_PAGE_SIZE });
  // cash/initial_cash kolom BIGINT - pg driver mengembalikannya sebagai string,
  // cast eksplisit di sini supaya frontend (portfolio.cash + holdingsValue) tidak
  // diam-diam jadi concatenation string alih-alih penjumlahan.
  const portfolioDto = { ...portfolio, cash: Number(portfolio.cash), initial_cash: Number(portfolio.initial_cash) };
  return { portfolio: portfolioDto, holdings: holdingDtos, transactions: recentTransactions.items };
}

export async function getTransactionHistory(
  userId: string,
  opts: { cursor?: string; limit?: number }
): Promise<PaginatedTransactions> {
  const portfolio = await getPortfolioByUserId(userId);
  if (!portfolio) return { items: [], nextCursor: null, hasMore: false };
  return listTransactions(portfolio.id, opts);
}

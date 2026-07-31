import YahooFinanceClass from 'yahoo-finance2';
import { insertIndicator } from '../repository/macro.repository';

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

// POC Fase 1 Scheduler Architecture - job global paling sederhana (tanpa fan-out,
// tanpa gerbang jam trading). SENGAJA cuma kurs USD/IDR (tersedia lewat Yahoo
// Finance yang sudah dipakai di seluruh app, tanpa vendor baru). BI rate/inflasi
// butuh sumber data resmi terpisah yang belum diputuskan - TIDAK dibuat angka
// palsu untuk itu (pelajaran dari temuan "Foreign Flow" di audit pertama).
export async function refreshUsdIdr(): Promise<{ indicator: string; value: number }> {
  const quote = await yahooFinance.quote('USDIDR=X');
  const price = quote?.regularMarketPrice;
  if (typeof price !== 'number') {
    throw new Error('Yahoo Finance tidak mengembalikan harga USDIDR=X yang valid');
  }
  await insertIndicator('USD_IDR', price, 'yahoo-finance');
  return { indicator: 'USD_IDR', value: price };
}

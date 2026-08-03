import type { IndicatorName } from '../types/backtest.types';

// Satu sumber preset filter - dipakai BERSAMA oleh app/backtest/page.tsx (pemilih
// preset Backtest/Live Filter Check) dan modules/market/service/screener.service.ts
// (tag pola per saham di Stock Screener), supaya nama & komposisi preset TIDAK
// bercabang jadi dua definisi berbeda di dua tempat (pelajaran dari temuan M-04 di
// audit integritas data 2026-08-03 - beberapa ambang batas sebelumnya tersebar tanpa
// disatukan, saham yang sama bisa dapat label berbeda di halaman berbeda).
export interface BacktestPreset {
  label: string;
  filters: IndicatorName[];
}

// Dulu ada 10 preset, tapi 5 di antaranya duplikat: 'Bandar Accumulation',
// 'Trend Following' dan 'Oversold Bounce' masing-masing adalah SUBSET persis dari
// preset 4-filter di bawah (kombinasi sama, cuma kurang satu filter - hasilnya selalu
// superset sinyal, bukan strategi beda). 'Konfirmasi Ketat' beririsan 3 dari 4 filter
// dengan Trend Following Kuat. 'Breakout Hari Ini' dihapus karena kontradiktif: filter
// Support & Resistance BULLISH artinya harga DEKAT SUPPORT dan Volatility BULLISH
// artinya ATR RENDAH - dua-duanya kebalikan dari kondisi breakout.
// 5 preset pertama di bawah: tidak ada yang jadi subset preset lain, irisan maksimal
// 2 filter. Preset ke-6 "Buy on Weakness" ditambah kemudian, lihat komentarnya sendiri.
export const BACKTEST_PRESETS: BacktestPreset[] = [
  { label: 'Momentum Breakout', filters: ['EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14'] },
  { label: 'Breakout Volume', filters: ['Volume vs Avg 20D', 'MACD', 'SMA Score (5,10,20)'] },
  // Nama sebelumnya "Akumulasi Real (CMF)" - indikatornya bukan Chaikin Money Flow,
  // melainkan rasio volume hari naik vs hari turun 14D (lihat market-flow.ts).
  { label: 'Akumulasi (A/D Volume)', filters: ['Market Flow Index', 'Volume vs Avg 20D', 'Support & Resistance', 'MACD'] },
  // Nama sebelumnya "Golden Cross Fresh" - analyzer EMA cuma bandingkan EMA20 vs EMA50
  // hari ini (kondisi tren), tidak mendeteksi cross yang BARU terjadi.
  { label: 'Trend Following Kuat', filters: ['MA Trend IDX (20,50,200)', 'EMA 20/50 Cross', 'SMA Score (5,10,20)', 'Volume vs Avg 20D'] },
  // Nama sebelumnya "Rebound Oversold" - RSI analyzer menyalakan BULLISH di dua rentang
  // (rsi < 40 DAN 50-70), jadi saham non-oversold ikut lolos. Klaim oversold dibuang.
  { label: 'Rebound Support', filters: ['RSI 14', 'Support & Resistance', 'Market Flow Index', 'Volatility (ATR 14)'] },
  // "Buy on Weakness" sungguhan: beli LEMAH di DALAM tren yang masih naik, beda dari
  // "Rebound Support" di atas yang cuma "oversold bounce" tanpa syarat tren besar (bisa
  // kena falling knife, saham yang beneran downtrend). MA Trend memastikan tren besar
  // masih naik, RSI menandai momentum lagi lemah/istirahat (bukan breakout), Support &
  // Resistance memastikan harga masih di dekat support (bukan sudah jebol).
  { label: 'Buy on Weakness', filters: ['MA Trend IDX (20,50,200)', 'RSI 14', 'Support & Resistance'] },
];

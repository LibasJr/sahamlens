export type IdxTradingBoard = 'MAIN' | 'DEVELOPMENT' | 'ACCELERATION' | 'WATCHLIST_FCA';

export interface TradingBoardInfo {
  board: IdxTradingBoard;
  label: string;
  shortLabel: string;
  badgeVariant: 'info' | 'neutral' | 'gold' | 'warning';
  description: string;
  isFca: boolean;
  tradingMechanism: string;
}

/**
 * Daftar saham yang masuk Papan Akselerasi (Acceleration Board).
 */
const ACCELERATION_BOARD_TICKERS = new Set([
  'PURA', 'RUNS', 'LUCK', 'PLAN', 'SOFA', 'IPPE', 'UVCR', 'KLIN', 'NANO', 'TOOL', 'WINE', 'LAJU', 'MENN', 'AWAN', 'INET', 'GRPH', 'MUTU', 'MSJA', 'ALII', 'SMLE',
]);

/**
 * Daftar saham yang masuk Papan Pemantauan Khusus (Full Call Auction / Periodic Call Auction).
 * Berdasarkan pengumuman berkala Bursa Efek Indonesia (IDX).
 */
const WATCHLIST_FCA_TICKERS = new Set([
  'GOTO', 'BUMI', 'POLA', 'KREN', 'ENRG', 'DEWA', 'BRMS', 'TRAM', 'MYRX', 'RIMO', 'IIKP', 'ARMY', 'ZINC', 'KBAG', 'SBAT', 'ENVY', 'BAPI', 'COWL', 'MTRA', 'MAGP',
]);

/**
 * Daftar saham Papan Utama (Main Board) terkurasi IDX.
 */
const MAIN_BOARD_TICKERS = new Set([
  'BBCA', 'BBRI', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'ICBP', 'INDF', 'UNVR', 'ADRO', 'PTBA', 'MEDC', 'ITMG', 'ANTM', 'INCO', 'TPIA', 'BRIS', 'KLBF', 'CPIN', 'AMRT', 'MYOR', 'SMGR', 'INTP', 'UNTR', 'PGAS', 'TBIG', 'TOWR', 'MAPI', 'ACES', 'BSDE', 'CTRA', 'SMRA', 'PWON', 'AKRA', 'JSMR', 'MIKA', 'HEAL', 'SIDO', 'AUTO', 'SMSM', 'ISAT', 'EXCL',
]);

export function classifyTradingBoard(symbol: string | null | undefined): TradingBoardInfo {
  if (!symbol) {
    return {
      board: 'DEVELOPMENT',
      label: 'Papan Pengembangan',
      shortLabel: 'Pengembangan',
      badgeVariant: 'neutral',
      description: 'Papan pencatatan untuk perusahaan yang sedang berkembang.',
      isFca: false,
      tradingMechanism: 'Continuous Auction (Perdagangan Kontinu)',
    };
  }

  const clean = symbol.replace('.JK', '').toUpperCase().trim();

  if (WATCHLIST_FCA_TICKERS.has(clean)) {
    return {
      board: 'WATCHLIST_FCA',
      label: 'Papan Pemantauan Khusus (FCA)',
      shortLabel: 'Pemantauan Khusus (FCA)',
      badgeVariant: 'warning',
      description: 'Saham dalam pemantauan khusus BEI, diperdagangkan dengan mekanisme Periodic Call Auction (5 sesi lelang per hari) dan fraksi harga Rp 1.',
      isFca: true,
      tradingMechanism: 'Periodic Call Auction (5 sesi lelang / hari)',
    };
  }

  if (ACCELERATION_BOARD_TICKERS.has(clean)) {
    return {
      board: 'ACCELERATION',
      label: 'Papan Akselerasi',
      shortLabel: 'Akselerasi',
      badgeVariant: 'gold',
      description: 'Papan pencatatan khusus emiten skala kecil & menengah (UKM / Rintisan) dengan batasan Auto Rejection khusus.',
      isFca: false,
      tradingMechanism: 'Continuous Auction (Perdagangan Kontinu)',
    };
  }

  if (MAIN_BOARD_TICKERS.has(clean)) {
    return {
      board: 'MAIN',
      label: 'Papan Utama',
      shortLabel: 'Papan Utama',
      badgeVariant: 'info',
      description: 'Papan pencatatan emiten berkapitalisasi besar, rekam jejak profitabilitas mapan, dan jumlah pemegang saham luas.',
      isFca: false,
      tradingMechanism: 'Continuous Auction (Perdagangan Kontinu)',
    };
  }

  return {
    board: 'DEVELOPMENT',
    label: 'Papan Pengembangan',
    shortLabel: 'Papan Pengembangan',
    badgeVariant: 'neutral',
    description: 'Papan pencatatan untuk perusahaan yang prospektif dan sedang berkembang.',
    isFca: false,
    tradingMechanism: 'Continuous Auction (Perdagangan Kontinu)',
  };
}

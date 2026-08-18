export type IdxTradingBoard =
  | 'MAIN'
  | 'DEVELOPMENT'
  | 'ACCELERATION'
  | 'NEW_ECONOMY'
  | 'WATCHLIST_FCA';

export interface TradingBoardInfo {
  board: IdxTradingBoard;
  label: string;
  shortLabel: string;
  badgeVariant: 'info' | 'neutral' | 'gold' | 'warning';
  description: string;
  isFca: boolean;
  tradingMechanism: string;
}

// PAPAN PENCATATAN IDX - DITURUNKAN DARI DATA, BUKAN DARI DAFTAR KETIKAN TANGAN.
//
// BUG FIX (audit kuantitatif 2026-08-19, temuan C-01). Sampai perbaikan ini, berkas ini
// mengklasifikasikan papan lewat tiga himpunan ticker yang ditulis manual:
//
//   ACCELERATION_BOARD_TICKERS  20 kode
//   WATCHLIST_FCA_TICKERS       20 kode
//   MAIN_BOARD_TICKERS          42 kode
//   selebihnya                  -> default 'DEVELOPMENT', DIASERSIKAN SEBAGAI FAKTA
//
// Sementara itu `all.csv` di repositori yang sama sudah memuat kolom `listing_board`
// resmi untuk 962 emiten, dan `loadEmitenList()` sudah membacanya lalu membuangnya.
// Diukur dengan mencocokkan keduanya, 419 dari 962 emiten (43,6%) salah papan:
//
//   benar Utama            -> ditampilkan "Papan Pengembangan"   224
//   benar Pemantauan Khusus-> ditampilkan "Papan Pengembangan"   137
//   benar Akselerasi       -> ditampilkan "Papan Pengembangan"    36
//   benar Pengembangan     -> ditampilkan "Papan Akselerasi"      11
//   benar Utama            -> ditampilkan "Pemantauan Khusus"      4
//   ...                                                          dst.
//
// Yang paling merusak: BUMI, DEWA, ENRG, dan BRMS adalah emiten PAPAN UTAMA, tetapi
// himpunan FCA lama memasukkan keempatnya sehingga UI menampilkan peringatan
// "Periodic Call Auction (5 sesi lelang/hari)" - klaim mekanisme perdagangan yang tidak
// berlaku untuk mereka. Sebaliknya, 137 emiten yang BENAR-BENAR di Papan Pemantauan
// Khusus tidak pernah mendapat peringatan itu. GOTO bahkan bisa menampilkan lencana
// "Indeks LQ45" dan "Papan Pemantauan Khusus (FCA)" berdampingan - kombinasi yang
// mustahil menurut aturan IDX.
//
// Sekarang papan berasal dari `listing_board` dan tidak ada lagi default yang menebak.
// Kode yang tidak dikenal (indeks, emiten delisting seperti MYRX yang masih ada di
// himpunan lama) mengembalikan `null`, dan pemanggil tidak menampilkan lencana apa pun.

const BOARD_BY_LISTING_BOARD: Record<string, TradingBoardInfo> = {
  utama: {
    board: 'MAIN',
    label: 'Papan Utama',
    shortLabel: 'Papan Utama',
    badgeVariant: 'info',
    description:
      'Papan pencatatan emiten berkapitalisasi besar, rekam jejak profitabilitas mapan, dan jumlah pemegang saham luas.',
    isFca: false,
    tradingMechanism: 'Continuous Auction (Perdagangan Kontinu)',
  },
  pengembangan: {
    board: 'DEVELOPMENT',
    label: 'Papan Pengembangan',
    shortLabel: 'Papan Pengembangan',
    badgeVariant: 'neutral',
    description: 'Papan pencatatan untuk perusahaan yang prospektif dan sedang berkembang.',
    isFca: false,
    tradingMechanism: 'Continuous Auction (Perdagangan Kontinu)',
  },
  akselerasi: {
    board: 'ACCELERATION',
    label: 'Papan Akselerasi',
    shortLabel: 'Akselerasi',
    badgeVariant: 'gold',
    description:
      'Papan pencatatan khusus emiten skala kecil & menengah (UKM / Rintisan) dengan batasan Auto Rejection khusus.',
    isFca: false,
    tradingMechanism: 'Continuous Auction (Perdagangan Kontinu)',
  },
  'ekonomi baru': {
    board: 'NEW_ECONOMY',
    label: 'Papan Ekonomi Baru',
    shortLabel: 'Ekonomi Baru',
    badgeVariant: 'info',
    description:
      'Papan pencatatan emiten berbasis teknologi/inovasi dengan pertumbuhan tinggi dan hak suara multipel.',
    isFca: false,
    tradingMechanism: 'Continuous Auction (Perdagangan Kontinu)',
  },
  'pemantauan khusus': {
    board: 'WATCHLIST_FCA',
    label: 'Papan Pemantauan Khusus (FCA)',
    shortLabel: 'Pemantauan Khusus (FCA)',
    badgeVariant: 'warning',
    description:
      'Saham dalam pemantauan khusus BEI, diperdagangkan dengan mekanisme Periodic Call Auction (5 sesi lelang per hari) dan fraksi harga Rp 1.',
    isFca: true,
    tradingMechanism: 'Periodic Call Auction (5 sesi lelang / hari)',
  },
};

/**
 * Petakan nilai `listing_board` IDX ke metadata papan yang ditampilkan UI.
 *
 * `null` untuk masukan kosong ATAU nama papan yang tidak dikenal. Papan baru yang
 * belum ada di peta di atas TIDAK boleh jatuh ke papan mana pun - lebih baik tidak ada
 * lencana daripada lencana yang salah.
 *
 * Nilai papan diperoleh server-side lewat `getEmitenBoard()` di
 * `shared/market/emiten-list.ts` dan dikirim ke klien sebagai `stock.listing_board`.
 */
export function classifyTradingBoard(
  listingBoard: string | null | undefined,
): TradingBoardInfo | null {
  if (!listingBoard) return null;
  return BOARD_BY_LISTING_BOARD[listingBoard.trim().toLowerCase()] ?? null;
}

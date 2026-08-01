// 94 ticker IDX likuid khusus universe backtest - TERPISAH dari SCREENER_UNIVERSE
// (modules/market/service/screener.service.ts, 51 ticker) yang sengaja dibatasi kecil
// karena dipakai fetch LIVE per-request (Screener, Compare). Daftar ini aman lebih
// besar karena hanya dipakai cron harian (async, lihat app/api/cron/backtest-precompute).
// 51 ticker pertama = SCREENER_UNIVERSE apa adanya. Sisanya dipilih dari
// idx_emiten_900.csv (papan Utama) berdasarkan rata-rata nilai transaksi harian 3 bulan
// terakhir DENGAN price floor rata-rata harga close 3 bulan >= Rp 200 (lihat
// scripts/backtest-universe-refresh.mjs, dijalankan ulang 2026-08-01 untuk menambahkan
// price floor ini setelah review whole-branch menemukan beberapa saham gorengan/
// micro-cap sub-Rp200 lolos filter nilai transaksi murni). Hanya 43 kandidat yang
// lolos KEDUA syarat (ranking nilai transaksi + price floor) dari 288 kandidat dicek,
// sehingga total universe saat ini 51 + 43 = 94 ticker (bukan 100) - lihat
// .superpowers/sdd/final-fix-universe-report.md untuk detail.
export const BACKTEST_UNIVERSE: string[] = [
  // --- 51 seed (SCREENER_UNIVERSE) ---
  'BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'BBNI.JK', 'TLKM.JK', 'ASII.JK', 'GOTO.JK', 'ADRO.JK', 'UNTR.JK',
  'ICBP.JK', 'KLBF.JK', 'PGAS.JK', 'PTBA.JK', 'ANTM.JK', 'BRPT.JK', 'INKP.JK', 'INDF.JK', 'ITMG.JK',
  'CPIN.JK', 'UNVR.JK', 'AKRA.JK', 'BRIS.JK', 'SMGR.JK', 'INTP.JK', 'CTRA.JK', 'BSDE.JK', 'SMRA.JK',
  'ISAT.JK', 'EXCL.JK', 'BUKA.JK', 'TOWR.JK', 'TBIG.JK', 'SIDO.JK', 'AMRT.JK', 'MYOR.JK', 'HMSP.JK',
  'GGRM.JK', 'JPFA.JK', 'ARTO.JK', 'BDMN.JK', 'BNGA.JK', 'BBTN.JK', 'MEGA.JK', 'INDY.JK', 'BYAN.JK',
  'HRUM.JK', 'INCO.JK', 'TINS.JK', 'MAPI.JK', 'SILO.JK', 'EMTK.JK',
  // --- 43 tambahan dari scripts/.backtest-universe-candidates.json (price floor >= Rp200) ---
  'CUAN.JK', 'BULL.JK', 'ESSA.JK', 'NCKL.JK', 'ADMR.JK', 'COCO.JK', 'ELSA.JK', 'JSMR.JK', 'DSNG.JK',
  'SSMS.JK', 'FUTR.JK', 'BJTM.JK', 'STAA.JK', 'ASSA.JK', 'AVIA.JK', 'BSSR.JK', 'LPPF.JK', 'CLEO.JK',
  'PTPP.JK', 'CITA.JK', 'DOID.JK', 'CASS.JK', 'ALKA.JK', 'OBAT.JK', 'BISI.JK', 'BBHI.JK', 'LIVE.JK',
  'APLI.JK', 'BTPN.JK', 'CEKA.JK', 'AGAR.JK', 'ARTA.JK', 'BUDI.JK', 'ABDA.JK', 'AMIN.JK', 'DVLA.JK',
  'BOLT.JK', 'BPII.JK', 'BALI.JK', 'BBMD.JK', 'BMAS.JK', 'ASBI.JK', 'FASW.JK',
];

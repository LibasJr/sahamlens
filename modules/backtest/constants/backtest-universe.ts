// 100 ticker IDX likuid khusus universe backtest - TERPISAH dari SCREENER_UNIVERSE
// (modules/market/service/screener.service.ts, 51 ticker) yang sengaja dibatasi kecil
// karena dipakai fetch LIVE per-request (Screener, Compare). Daftar ini aman lebih
// besar karena hanya dipakai cron harian (async, lihat app/api/cron/backtest-precompute).
// 51 ticker pertama = SCREENER_UNIVERSE apa adanya. 49 ticker berikutnya dipilih dari
// idx_emiten_900.csv (papan Utama) berdasarkan rata-rata nilai transaksi harian 3 bulan
// terakhir (lihat scripts/backtest-universe-refresh.mjs, dijalankan 2026-08-01).
export const BACKTEST_UNIVERSE: string[] = [
  // --- 51 seed (SCREENER_UNIVERSE) ---
  'BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'BBNI.JK', 'TLKM.JK', 'ASII.JK', 'GOTO.JK', 'ADRO.JK', 'UNTR.JK',
  'ICBP.JK', 'KLBF.JK', 'PGAS.JK', 'PTBA.JK', 'ANTM.JK', 'BRPT.JK', 'INKP.JK', 'INDF.JK', 'ITMG.JK',
  'CPIN.JK', 'UNVR.JK', 'AKRA.JK', 'BRIS.JK', 'SMGR.JK', 'INTP.JK', 'CTRA.JK', 'BSDE.JK', 'SMRA.JK',
  'ISAT.JK', 'EXCL.JK', 'BUKA.JK', 'TOWR.JK', 'TBIG.JK', 'SIDO.JK', 'AMRT.JK', 'MYOR.JK', 'HMSP.JK',
  'GGRM.JK', 'JPFA.JK', 'ARTO.JK', 'BDMN.JK', 'BNGA.JK', 'BBTN.JK', 'MEGA.JK', 'INDY.JK', 'BYAN.JK',
  'HRUM.JK', 'INCO.JK', 'TINS.JK', 'MAPI.JK', 'SILO.JK', 'EMTK.JK',
  // --- 49 tambahan dari scripts/.backtest-universe-candidates.json ---
  'CUAN.JK', 'BIPI.JK', 'BULL.JK', 'ESSA.JK', 'NCKL.JK', 'ADMR.JK', 'COCO.JK', 'ELSA.JK', 'DMAS.JK',
  'BKSL.JK', 'JSMR.JK', 'DSNG.JK', 'SSMS.JK', 'FUTR.JK', 'BJTM.JK', 'STAA.JK', 'BELL.JK', 'ASSA.JK',
  'BMTR.JK', 'AVIA.JK', 'BSSR.JK', 'LPPF.JK', 'APEX.JK', 'LABA.JK', 'ADHI.JK', 'CLEO.JK', 'PTPP.JK',
  'AISA.JK', 'BBRM.JK', 'CITA.JK', 'AGRO.JK', 'BTEK.JK', 'DOID.JK', 'GOLF.JK', 'CASS.JK', 'BCAP.JK',
  'ALKA.JK', 'SICO.JK', 'CNKO.JK', 'OBAT.JK', 'BISI.JK', 'BABP.JK', 'BBHI.JK', 'BLTA.JK', 'SPRE.JK',
  'BHIT.JK', 'LIVE.JK', 'APLI.JK', 'BTPN.JK',
];

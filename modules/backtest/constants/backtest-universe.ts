// 109 emiten IDX untuk universe backtest - TERPISAH dari SCREENER_UNIVERSE
// (modules/market/service/screener.service.ts, 51 ticker) yang sengaja dibatasi kecil
// karena dipakai fetch LIVE per-request (Screener, Compare). Daftar ini aman lebih
// besar karena hanya dipakai cron harian (async, lihat app/api/cron/backtest-precompute).
//
// Dihasilkan scripts/backtest-universe-refresh.mjs (dijalankan ulang 2026-08-03), diurutkan
// dari nilai transaksi harian tertinggi. Setiap emiten - TERMASUK 51 seed lama - harus lolos
// TIGA syarat:
//   1. rata-rata harga close 3 bulan >= Rp 200        (buang saham gorengan/gocap)
//   2. rata-rata nilai transaksi 3 bulan >= Rp 1 M/hari (buang yang tak bisa dieksekusi:
//      satu posisi Rp 20 juta tetap di bawah ~2% nilai transaksi harian)
//   3. volatilitas 12 bulan <= 120%/tahun             (buang yang bikin hasil tak bisa dipercaya)
//
// Riwayat perubahan 2026-08-03 (dari 94 ticker):
// - Filter "Papan === 'Utama'" DIBUANG. Kolom Papan di idx_emiten_900.csv bukan papan
//   pencatatan IDX: nilainya berulang siklis Pengembangan -> Akselerasi -> Utama menurut
//   abjad, cocok 928/928 baris (100%). BBCA & BBRI terlabel 'Akselerasi', BMRI/UNVR/AALI
//   'Pengembangan'. Filter itu efektif cuma mengambil setiap baris ke-3 menurut abjad,
//   sehingga MDKA/AMMN/BREN/MEDC/PGEO/MTEL/ACES/TAPG tidak pernah ikut ter-scan.
// - Floor likuiditas ditambahkan. Tanpa itu, ekor daftar terisi saham yang praktis tidak
//   diperdagangkan - FASW & WIKA rata-rata Rp 0/hari, BSWD Rp 124 ribu/hari - padahal
//   engine tetap 'membeli' saham itu di backtest.
// - Cap volatilitas ditambahkan. Tanpa itu satu saham yang kebetulan naik 10x mendominasi
//   seluruh hasil: preset Trend Following tercatat +214% padahal hampir semuanya dari SATU
//   posisi BUVA (+910%); dengan cap, angka jujurnya +27%. Yang terbuang cuma BUVA (125%/thn)
//   & FUTR (126%/thn) - median universe 45%/thn, jadi cap ini tidak memangkas saham momentum
//   wajar. Efek sampingnya diketahui dan diterima: return backtest jadi LEBIH RENDAH tapi
//   tidak lagi ditentukan satu keberuntungan.
// - 5 seed lama gugur: GOTO (harga rata-rata Rp 50) & BUKA (Rp 116) kena price floor;
//   MEGA (Rp 219 juta/hari), BYAN (Rp 933 juta/hari) & SILO (Rp 708 juta/hari) kena
//   floor likuiditas.
//
// Cap di skrip 200 emiten, tapi hanya 109 yang lolos ketiga syarat dari 932 kode yang
// dicek (267 punya data transaksi >= 30 hari dalam 3 bulan; sisanya nyaris tanpa transaksi).
// Bursa memang tidak menyediakan lebih banyak yang memenuhi syarat - jangan dikejar ke 200
// dengan melonggarkan floor, itu cuma menambah emiten yang sinyalnya tidak bisa dieksekusi.
export const BACKTEST_UNIVERSE: string[] = [
  'BBCA.JK', 'TPIA.JK', 'BMRI.JK', 'BBRI.JK', 'BRPT.JK', 'DSSA.JK', 'AMMN.JK', 'ANTM.JK', 'TLKM.JK',
  'ASII.JK', 'CUAN.JK', 'DEWA.JK', 'BRMS.JK', 'BREN.JK', 'BBNI.JK', 'MDKA.JK', 'TINS.JK', 'RAJA.JK',
  'AMRT.JK', 'UNTR.JK', 'ADRO.JK', 'BULL.JK', 'ENRG.JK', 'INCO.JK', 'MAPI.JK', 'MBMA.JK', 'MEDC.JK',
  'KLBF.JK', 'ESSA.JK', 'INDY.JK', 'INDF.JK', 'NCKL.JK', 'INKP.JK', 'PGAS.JK', 'ADMR.JK', 'WIFI.JK',
  'ITMG.JK', 'PTBA.JK', 'CPIN.JK', 'JPFA.JK', 'ISAT.JK', 'TAPG.JK', 'BRIS.JK', 'ICBP.JK', 'UNVR.JK',
  'AKRA.JK', 'SMGR.JK', 'TOWR.JK', 'BDMN.JK', 'BBTN.JK', 'EMTK.JK', 'GGRM.JK', 'EXCL.JK', 'PGEO.JK',
  'ELSA.JK', 'JSMR.JK', 'PWON.JK', 'BFIN.JK', 'MTEL.JK', 'ERAA.JK', 'AALI.JK', 'LSIP.JK', 'MYOR.JK',
  'HMSP.JK', 'APIC.JK', 'DSNG.JK', 'SSMS.JK', 'SIDO.JK', 'INTP.JK', 'CTRA.JK', 'BSDE.JK', 'CMRY.JK',
  'SCMA.JK', 'ARTO.JK', 'ACES.JK', 'HEAL.JK', 'HRUM.JK', 'FILM.JK', 'BEEF.JK', 'GJTL.JK', 'COIN.JK',
  'BJTM.JK', 'SMRA.JK', 'BNGA.JK', 'BAPA.JK', 'BBYB.JK', 'STAA.JK', 'MNCN.JK', 'AUTO.JK', 'ASSA.JK',
  'AVIA.JK', 'BTPS.JK', 'BSSR.JK', 'BJBR.JK', 'KAEF.JK', 'LPPF.JK', 'BIRD.JK', 'ASGR.JK', 'ADES.JK',
  'TBIG.JK', 'ABMM.JK', 'ARNA.JK', 'CLEO.JK', 'BINA.JK', 'BLUE.JK', 'CFIN.JK', 'CASA.JK', 'PTPP.JK',
  'AGII.JK',
];

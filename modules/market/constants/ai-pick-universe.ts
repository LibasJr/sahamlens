// Universe bersama AI Pick - dipakai breakout-scan DAN ai-pick-scan supaya setiap saham
// dinilai dengan jaring yang sama. Sebelumnya breakout memindai 15 ticker hardcoded
// sementara kategori lain memindai 250, sehingga angka antar tab tidak sebanding dan
// hanya 15 saham itu yang pernah bisa mendapat bonus breakout.
//
// Isi sama dengan BACKTEST_UNIVERSE (dihasilkan scripts/backtest-universe-refresh.mjs):
// harga rata-rata 3 bulan >= Rp 200, nilai transaksi >= Rp 1 M/hari, volatilitas 12 bulan
// <= 120%/tahun. Sengaja DISALIN, bukan di-import dari modules/backtest, supaya perubahan
// universe backtest tidak diam-diam mengubah perilaku AI Pick.
export const AI_PICK_UNIVERSE: string[] = [
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

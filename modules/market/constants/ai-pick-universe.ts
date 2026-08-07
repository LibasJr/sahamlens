// Universe AI Pick / LensRadar: 150 kandidat saham IDX.
//
// 109 ticker pertama adalah universe tervalidasi lama yang dihasilkan oleh
// scripts/backtest-universe-refresh.mjs dengan filter harga, likuiditas, dan volatilitas.
// Atas permintaan perluasan cakupan, 41 ticker tambahan diambil berurutan dari
// MARKET_STOCKS (universe pasar 250 saham yang diranking berdasarkan likuiditas +
// profitabilitas). Tambahan ini BUKAN otomatis layak direkomendasikan: scan tetap
// menjalankan evaluateMinimalEligibility() sebelum saham boleh menjadi advisory.
//
// BACKTEST_UNIVERSE sengaja TIDAK ikut dipaksa menjadi 150. Backtest harus mempertahankan
// universe historis yang sudah tervalidasi agar hasil lama tidak berubah hanya karena
// permintaan coverage live.
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
  'AGII.JK', 'BUMI.JK', 'BUVA.JK', 'KOTA.JK', 'AADI.JK', 'VKTR.JK', 'RANS.JK', 'RATU.JK', 'CDIA.JK',
  'RMKE.JK', 'INET.JK', 'DOOH.JK', 'ARCI.JK', 'JELI.JK', 'PANI.JK', 'PACK.JK', 'IRSX.JK', 'TCPI.JK',
  'SMIL.JK', 'CMNT.JK', 'AYAM.JK', 'BUKA.JK', 'BAIK.JK', 'MMIX.JK', 'NSSS.JK', 'HATM.JK', 'MSIN.JK',
  'CYBR.JK', 'MAPA.JK', 'KETR.JK', 'NICL.JK', 'BELL.JK', 'SGER.JK', 'KEEN.JK', 'DATA.JK', 'DMAS.JK',
  'BSML.JK', 'JECX.JK', 'HUMI.JK', 'OMED.JK', 'INDO.JK', 'APLN.JK',
];

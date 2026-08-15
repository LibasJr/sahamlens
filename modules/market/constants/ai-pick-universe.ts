// Universe aktif AI Pick / LensRadar.
//
// Versi baru 2026-08-15: idx-liquid-v2-200. 109 ticker pertama tetap universe
// tervalidasi lama dari scripts/backtest-universe-refresh.mjs / BACKTEST_UNIVERSE,
// supaya histori validasi lama tidak hilang. Tambahan sampai 200 diambil berurutan dari
// MARKET_STOCKS (modules/market/service/market-summary.service.ts), yaitu universe pasar
// yang sudah diranking dari data Yahoo Finance riil: harga, market cap, nilai transaksi
// rata-rata, dan profitabilitas. Tidak ada ticker dummy atau sisipan acak.
//
// Tambahan ini BUKAN otomatis layak direkomendasikan. Scanner live tetap menjalankan:
// - fetch histori harga riil,
// - ATR-14 dari data OHLC,
// - evaluateMinimalEligibility() untuk harga, likuiditas, histori, dan coverage,
// - buildLongTradingSetup() yang fail-closed kalau ATR/data/RR tidak valid.
export const ACTIVE_LIQUID_UNIVERSE_VERSION = 'idx-liquid-v2-200';
export const ACTIVE_LIQUID_UNIVERSE_TARGET_SIZE = 200;
export const LEGACY_VALIDATED_UNIVERSE_VERSION = 'idx-liquid-v1-109';
export const LEGACY_VALIDATED_UNIVERSE_SIZE = 109;

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
  'BSML.JK', 'JECX.JK', 'HUMI.JK', 'OMED.JK', 'INDO.JK', 'APLN.JK', 'MSJA.JK', 'BMTR.JK', 'EURO.JK',
  'JARR.JK', 'NEST.JK', 'BLES.JK', 'DGWG.JK', 'RISE.JK', 'TRIN.JK', 'APEX.JK', 'TEBE.JK', 'BDKR.JK',
  'DMMX.JK', 'MSTI.JK', 'ERAL.JK', 'ELPI.JK', 'BACA.JK', 'ALKA.JK', 'DILD.JK', 'GRIA.JK', 'VERN.JK',
  'BANK.JK', 'ASRI.JK', 'SWID.JK', 'IPCC.JK', 'MOLI.JK', 'BABY.JK', 'SUNI.JK', 'TUGU.JK', 'MAHA.JK',
  'BBRM.JK', 'ALII.JK', 'MHKI.JK', 'CASS.JK', 'TLDN.JK', 'ZONE.JK', 'AREA.JK', 'BGTG.JK', 'UANG.JK',
  'BYAN.JK', 'DRMA.JK', 'MDIY.JK', 'SPTO.JK', 'ALDO.JK', 'VICI.JK', 'GOLF.JK', 'PGUN.JK', 'GEMS.JK',
  'DEPO.JK', 'CITY.JK',
];

export const AI_PICK_UNIVERSE_ADDITIONS: string[] = AI_PICK_UNIVERSE.slice(LEGACY_VALIDATED_UNIVERSE_SIZE);

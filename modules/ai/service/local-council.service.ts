// BUG FIX (audit integritas data 2026-08-03, temuan H-10): 7 dari 10 "agen" di sini
// SEBELUMNYA mengembalikan signal/confidence/reason TETAP tanpa menyentuh `data` sama
// sekali ("Momentum netral" confidence 60, "Volatilitas normal" confidence 60, "Menunggu
// di support" confidence 55, dst.) - padahal data yang dibutuhkan (volRatio, atr,
// support, resistance) SUDAH tersedia di parameter yang sama dan dipakai prompt AI-nya
// (lihat app/api/council/route.ts:getTechnicalData). Fallback ini aktif setiap kali AI
// provider gagal/kena limit, dan hasilnya tidak bisa dibedakan pengguna dari analisis
// sungguhan. Sekarang ketujuh agen dihitung dari data yang tersedia; Chart Pattern
// Reader (satu-satunya yang benar-benar tidak punya data deteksi pola) mengatakan
// terus terang belum tersedia, bukan "tidak ada pola yang jelas" yang terdengar seperti
// kesimpulan dari analisis pola yang sebenarnya tidak pernah dilakukan.
//
// BUG FIX (audit BUILD 003 2026-08-03, item Confidence): field `confidence` per-agent
// dan `final_confidence` DIHAPUS total dari return value (sebelumnya campuran - sebagian
// agent scale dari data real seperti volRatio/jarak ke MA, TAPI final_confidence selalu
// angka tetap 65 tanpa hubungan apa pun dengan hasil voting agent-agent di atasnya, dan
// beberapa agent pakai angka tetap per cabang tanpa didokumentasikan formulanya). Sama
// seperti council.service.ts (jalur LLM) - signal + reason cukup, tanpa angka presisi
// yang terlihat terukur padahal sebagian cuma konstanta.
//
// BUG FIX (audit logika & algoritma 2026-08-05, temuan C-5): `price`, `ma20`, `ma200`
// dulu di-default ke 0 dan `rsi` ke 50. Efeknya bukan sekadar kosmetik: dengan ma200 = 0,
// perbandingan `price > ma200` SELALU false saat price juga 0, sehingga Trend Follower
// mengeluarkan sinyal "SELL - Harga < MA200" dari data yang tidak ada; dan RSI default 50
// dilaporkan ke pengguna sebagai "RSI 50.00" seolah hasil pengukuran. Sekarang semuanya
// nullable dan tiap agen menyatakan terus terang kalau datanya tidak ada.
export function runLocalCouncil(symbol: string, data: any) {
  const price: number | null = typeof data?.currentPrice === 'number' ? data.currentPrice
    : typeof data?.price === 'number' && data.price > 0 ? data.price : null;
  const ma20: number | null = typeof data?.ma20 === 'number' ? data.ma20 : null;
  const ma200: number | null = typeof data?.ma200 === 'number' ? data.ma200 : null;
  const rsi: number | null = typeof data?.rsi === 'number' ? data.rsi : null;
  const atr: number | null = typeof data?.atr === 'number' ? data.atr : null;
  const support: number | null = typeof data?.support === 'number' && data.support > 0 ? data.support : null;
  const resistance: number | null = typeof data?.resistance === 'number' && data.resistance > 0 ? data.resistance : null;
  const volRatio: number | null = typeof data?.volRatio === 'number' ? data.volRatio : null;
  const eps = data?.fundamentalSnapshot?.trailingEps;
  const lastQuarter = data?.fundamentalSnapshot?.mostRecentQuarter;

  const trendAvailable = price != null && ma200 != null;
  const trendSignal: 'BUY' | 'SELL' | 'WAIT' = !trendAvailable ? 'WAIT' : (price as number) > (ma200 as number) ? 'BUY' : 'SELL';
  const rsiSignal: 'BUY' | 'SELL' | 'HOLD' | 'WAIT' = rsi == null ? 'WAIT' : rsi < 35 ? 'BUY' : rsi > 70 ? 'SELL' : 'HOLD';

  // Volume Analyst - dari volRatio riil (volume hari ini vs rata-rata 20D), bukan
  // "Data volume tidak cukup" tetap padahal datanya ada.
  const volumeAgent = volRatio != null
    ? { name: 'Volume Analyst', signal: volRatio >= 1.5 ? 'BUY' : volRatio < 0.7 ? 'WAIT' : 'HOLD' as const, reason: `Volume ${volRatio.toFixed(1)}x rata-rata 20D` }
    : { name: 'Volume Analyst', signal: 'WAIT' as const, reason: 'Data volume tidak tersedia' };

  // Momentum - dari posisi harga vs MA20 (proxy momentum jangka pendek yang sudah
  // tersedia, tanpa perlu data tambahan).
  let momentumAgent: { name: string; signal: 'BUY' | 'SELL' | 'WAIT'; reason: string };
  if (ma20 != null && price != null) {
    momentumAgent = { name: 'Momentum', signal: price > ma20 ? 'BUY' : 'SELL', reason: `Harga ${price > ma20 ? 'di atas' : 'di bawah'} MA20 (${Math.round(ma20)})` };
  } else {
    momentumAgent = { name: 'Momentum', signal: 'WAIT', reason: 'Data MA20 tidak tersedia' };
  }

  // S/R Hunter - posisi harga relatif terhadap support/resistance 20 hari (data yang
  // sama dipakai Risk Manager di bawah).
  let srAgent: { name: string; signal: 'BUY' | 'SELL' | 'WAIT' | 'HOLD'; reason: string };
  if (support != null && resistance != null && price != null && price > 0) {
    const range = resistance - support;
    const distToSupportPct = range > 0 ? ((price - support) / range) * 100 : 50;
    if (distToSupportPct < 20) {
      srAgent = { name: 'S/R Hunter', signal: 'BUY', reason: `Dekat support ${Math.round(support)}` };
    } else if (distToSupportPct > 80) {
      srAgent = { name: 'S/R Hunter', signal: 'SELL', reason: `Dekat resistance ${Math.round(resistance)}` };
    } else {
      srAgent = { name: 'S/R Hunter', signal: 'WAIT', reason: `Di tengah range ${Math.round(support)}-${Math.round(resistance)}` };
    }
  } else {
    srAgent = { name: 'S/R Hunter', signal: 'WAIT', reason: 'Data support/resistance tidak tersedia' };
  }

  // Risk Manager - risk/reward riil dari jarak ke support (risk) vs resistance (reward).
  let riskAgent: { name: string; signal: 'BUY' | 'HOLD' | 'WAIT'; reason: string };
  if (support != null && resistance != null && price != null && price > support) {
    const risk = price - support;
    const reward = resistance - price;
    const rr = risk > 0 ? reward / risk : 0;
    riskAgent = rr >= 2
      ? { name: 'Risk Manager', signal: 'BUY', reason: `Risk/Reward 1:${rr.toFixed(1)} - menarik` }
      : { name: 'Risk Manager', signal: 'HOLD', reason: `Risk/Reward 1:${rr.toFixed(1)} - standar` };
  } else {
    riskAgent = { name: 'Risk Manager', signal: 'HOLD', reason: 'Data risk/reward tidak cukup' };
  }

  // Breakout Hunter - volume tinggi + harga mendekati resistance (proxy breakout dari
  // data yang sama dipakai indikator Breakout di halaman AI Pick).
  let breakoutAgent: { name: string; signal: 'BUY' | 'WAIT'; reason: string };
  if (resistance != null && price != null && price > 0 && volRatio != null) {
    const distToResPct = ((resistance - price) / price) * 100;
    const nearRes = distToResPct >= 0 && distToResPct < 3;
    const volSpike = volRatio > 1.5;
    breakoutAgent = nearRes && volSpike
      ? { name: 'Breakout Hunter', signal: 'BUY', reason: `Dekat resistance + volume ${volRatio.toFixed(1)}x` }
      : { name: 'Breakout Hunter', signal: 'WAIT', reason: 'Belum ada konfirmasi breakout' };
  } else {
    breakoutAgent = { name: 'Breakout Hunter', signal: 'WAIT', reason: 'Data tidak cukup untuk deteksi breakout' };
  }

  // Volatility - dari ATR sebagai persen harga (sama seperti volatility-analyzer.ts).
  const volatilityAgent = atr != null && price != null && price > 0
    ? { name: 'Volatility', signal: 'HOLD' as const, reason: `ATR ${atr.toFixed(0)} (${((atr / price) * 100).toFixed(1)}% dari harga)` }
    : { name: 'Volatility', signal: 'HOLD' as const, reason: 'Data ATR tidak tersedia' };

  // Chart Pattern Reader - TIDAK ADA deteksi pola chart di backend ini (butuh computer
  // vision/algoritma pattern-matching candlestick yang belum diimplementasikan).
  // Sebelumnya kolom ini bilang "Tidak ada pola yang jelas" - terdengar seperti hasil
  // pemeriksaan pola yang sudah dilakukan, padahal tidak pernah ada pemeriksaan apa pun.
  const patternAgent = { name: 'Chart Pattern Reader', signal: 'WAIT' as const, reason: 'Deteksi pola chart belum tersedia di sistem ini' };

  const fundamentalAgent = eps != null
    ? { name: 'Fundamental Quick Check', signal: eps > 0 ? 'HOLD' as const : 'SELL' as const, reason: `EPS ${eps} (laporan kuartal terakhir: ${lastQuarter || 'N/A'})` }
    : { name: 'Fundamental Quick Check', signal: 'HOLD' as const, reason: 'Data laporan keuangan belum tersedia' };

  return {
    agents: [
      {
        name: 'Trend Follower',
        signal: trendSignal,
        reason: trendAvailable ? `Harga ${(price as number) > (ma200 as number) ? '>' : '<'} MA200 (${Math.round(ma200 as number)})` : 'Data harga/MA200 tidak tersedia',
      },
      { name: 'Mean Reversion', signal: rsiSignal, reason: rsi != null ? `RSI ${rsi.toFixed(2)}` : 'Data RSI tidak tersedia' },
      volumeAgent,
      momentumAgent,
      srAgent,
      riskAgent,
      breakoutAgent,
      volatilityAgent,
      patternAgent,
      fundamentalAgent,
    ],
    // Kalau tren maupun RSI sama-sama tidak punya data, jangan mengeluarkan "saran akhir"
    // yang terdengar seperti kesimpulan (temuan C-5).
    final_suggestion: !trendAvailable && rsi == null
      ? 'Data belum cukup untuk menyimpulkan - tidak ada saran yang bisa dipertanggungjawabkan'
      : `${trendSignal} dari sisi tren, RSI menunjukkan ${rsiSignal}`,
    summary_id: 'Fallback lokal berjalan karena LensAI tidak tersedia atau kena limit.'
  };
}

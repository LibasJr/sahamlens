import { analyzeStock } from '@/modules/recommendation';
import { readAiPickScores } from '@/shared/cache/ai-pick-cache';
import { getDecisionPresentation, getSimpleDecisionLabel } from '@/modules/eligibility/service/decision-presentation.service';
import { getLensScoreValidationStatus } from '@/modules/validation';
import { finite, safe, signed, unavailableLine } from './format';

/**
 * Keputusan model & setup trading - dari MESIN YANG SAMA dengan halaman aplikasi.
 *
 * Kenapa ini penting dan bukan sekadar "satu blok data lagi": sebelum ini, LensAI
 * menyusun kesimpulannya sendiri dari blok fundamental + teknikal yang dihitung
 * terpisah, sementara halaman /recommendations memakai analyzeStock(). Dua jalur
 * berbeda untuk pertanyaan yang sama berarti chat bisa bilang satu hal dan halaman
 * bilang hal lain untuk emiten yang sama, di menit yang sama - dan pengguna tidak
 * punya cara tahu mana yang benar. Sekarang keduanya membaca satu sumber.
 */

function plain(ticker: string): string {
  return ticker.replace(/\.JK$/i, '').toUpperCase();
}

/** Keputusan model + gerbang kelayakan, persis seperti yang dilihat halaman Recommendations. */
export async function decisionBlock(ticker: string): Promise<string> {
  const code = plain(ticker);
  let analysis: any = null;

  try {
    analysis = await analyzeStock(ticker);
  } catch (error) {
    console.warn('[LensAI:decision-blocks] analyzeStock gagal', code, error instanceof Error ? error.message : String(error));
  }

  if (!analysis) {
    return [`### ${code}`, unavailableLine('Keputusan model', 'analisis emiten gagal dibaca dari backend')].join('\n');
  }

  const presentation = getDecisionPresentation(analysis.scoringKategori, analysis.decision);
  const label = getSimpleDecisionLabel(presentation);
  const validation = getLensScoreValidationStatus();

  const lines = [
    `### ${code}`,
    `- Sumber: mesin analisis yang SAMA dengan halaman Recommendations (analyzeStock)`,
    `- Harga: ${safe(analysis.price)}${finite(analysis.changePct) ? ` (${signed(analysis.changePct)}%)` : ''}`,
    `- LensScore: ${analysis.totalScore ?? 'tidak tersedia'}, kategori model: ${analysis.scoringKategori ?? 'tidak tersedia'}`,
    `- Label riset: ${analysis.explainability?.research_label ?? 'tidak tersedia'}`,
    `- Coverage/confidence skor: ${analysis.coverage ?? 'tidak tersedia'}% / ${analysis.explainability?.confidence_level ?? 'tidak tersedia'}`,
    `- Label ringkas aplikasi: ${label}`,
    `- Boleh dibaca sebagai rekomendasi transaksi? ${analysis.decision?.advisory ? 'YA' : 'TIDAK'}`,
  ];

  if (!analysis.decision?.advisory) {
    lines.push(
      `- Alasan: ${analysis.decision?.explanation ?? presentation.explanation ?? 'keputusan advisory dinonaktifkan'}`,
      '- WAJIB: sampaikan kategori di atas sebagai SINYAL MODEL, bukan ajakan beli/jual.',
      '  Jangan menerjemahkannya jadi NETRAL/HOLD, dan jangan bilang sahamnya "tidak direkomendasikan"',
      '  seolah emitennya yang gagal - yang belum lolos adalah gerbang kelayakan/validasi model.',
    );
  } else {
    lines.push(`- Aksi model: ${analysis.decision.action ?? 'tidak tersedia'}`);
  }

  lines.push(
    `- Status kelayakan: ${analysis.eligibilityStatus ?? 'tidak tersedia'}`,
    Array.isArray(analysis.eligibilityReasons) && analysis.eligibilityReasons.length
      ? `- Kode alasan kelayakan: ${analysis.eligibilityReasons.join(', ')}`
      : '',
    Array.isArray(analysis.topReasons) && analysis.topReasons.length
      ? `- Alasan utama skor: ${analysis.topReasons.slice(0, 3).join('; ')}`
      : '',
    Array.isArray(analysis.riskFlags) && analysis.riskFlags.length
      ? `- Risk flags: ${analysis.riskFlags.slice(0, 4).join('; ')}`
      : '',
    `- Konsensus analyzer: ${analysis.consensus ?? 'tidak tersedia'} (${analysis.bullishVotes ?? 0} bullish / ${analysis.bearishVotes ?? 0} bearish)`,
    // Wajib ikut - field `confidence` bernama menyesatkan sejak lama.
    `- Angka "confidence" ${safe(analysis.confidence)}% adalah PERSENTASE VOTE analyzer, BUKAN probabilitas`,
    '  keberhasilan dan bukan tingkat keyakinan terkalibrasi. Jangan menyebutnya "peluang berhasil".',
    `- Status validasi model LensScore: ${validation.validated ? 'TERVALIDASI' : `BELUM TERVALIDASI (${validation.reasonCode})`}`,
  );

  return lines.filter(Boolean).join('\n');
}

/**
 * Bingkai wajib untuk pertanyaan "besok harganya berapa / bakal naik gak".
 *
 * Ini pertanyaan paling sering ditanyakan pengguna saham, dan paling berbahaya kalau
 * dijawab asal. Model punya dorongan kuat untuk membantu: diberi harga, tren, dan RSI,
 * ia akan dengan senang hati merangkainya jadi angka besok - dan angka itu terbaca
 * sebagai ramalan aplikasi, bukan tebakan model.
 *
 * Yang dilakukan blok ini BUKAN menolak. Pertanyaannya sah, dan ada banyak yang bisa
 * dikatakan dengan data: arah tren, posisi terhadap level, volatilitas, setup RR, dan -
 * ini yang paling jujur - base rate historis dari backtest bucket. Yang dilarang hanya
 * satu: menyebut angka harga besok seolah itu diketahui.
 */
export function predictionGuardBlock(): string {
  return [
    '- PERTANYAAN INI MENANYAKAN HARGA MASA DEPAN. Tidak ada satu pun data di SahamLens',
    '  yang memuat harga besok, dan tidak ada model yang bisa mengetahuinya. Katakan itu',
    '  di kalimat pertama, dengan tenang - tanpa berpanjang-panjang minta maaf.',
    '- DILARANG: menyebut satu angka harga besok, rentang target jangka pendek yang tidak',
    '  berasal dari setup TP/CL di data, atau kalimat berbentuk "kemungkinan besar naik ke',
    '  sekian". Itu terbaca sebagai ramalan aplikasi, bukan tebakan model.',
    '- YANG HARUS DILAKUKAN sebagai gantinya - jawab dengan data yang memang ada:',
    '  1. Arah dan kekuatan tren saat ini, serta posisi harga terhadap support/resistance.',
    '  2. Momentum (RSI/MACD) dan arti praktisnya untuk beberapa hari ke depan.',
    '  3. Setup TP/CL beserta risk-reward-nya KALAU ada di data - itulah level yang memang',
    '     dihitung aplikasi ini, dan itu berbeda dari ramalan harga.',
    '  4. Base rate historis dari blok backtest kalau tersedia: bucket skor seperti ini',
    '     RATA-RATA menghasilkan berapa dalam 20 hari bursa, dengan win rate berapa.',
    '     Sampaikan sebagai statistik masa lalu atas banyak sampel, BUKAN janji untuk',
    '     emiten ini.',
    '  5. Ukuran risikonya (drawdown historis, volatilitas), supaya pengguna tahu seberapa',
    '     lebar kemungkinan pergerakannya - bukan ke mana arahnya.',
    '- Tutup dengan mengingatkan bahwa yang bisa dikendalikan adalah level masuk/keluar dan',
    '  ukuran posisi, bukan arah harga. Satu kalimat, jangan berceramah.',
  ].join('\n');
}

/**
 * Level TP1/TP2/CL1/CL2 + risk-reward, dari cache pemindaian LensRadar.
 *
 * TIDAK dihitung ulang di sini. Setup hanya sah kalau lahir dari engine yang sama
 * dengan yang dipakai LensRadar (struktur harga + ATR + pembulatan tick IDX, RR >= 1.5);
 * menghitung "kira-kira" dari ATR saja akan menghasilkan angka yang berbeda dari yang
 * dilihat pengguna di halaman - dan angka level harga adalah hal terakhir yang boleh
 * berbeda antara dua layar.
 */
export async function tradingSetupBlock(ticker: string): Promise<string> {
  const code = plain(ticker);
  const scoreData = await readAiPickScores();

  if (!scoreData || !Array.isArray(scoreData.scores)) {
    return [
      `### ${code}`,
      unavailableLine('Setup TP/CL', 'cache pemindaian LensRadar sedang kosong'),
    ].join('\n');
  }

  const scored: any = scoreData.scores.find((item: any) => plain(String(item.symbol ?? '')) === code);

  if (!scored) {
    return [
      `### ${code}`,
      `- Setup TP/CL: ${code} tidak ada di universe yang dipindai LensRadar, jadi tidak ada setup tersimpan.`,
      '- JANGAN menghitung TP/CL sendiri dari ATR atau level teknikal - angkanya akan berbeda dari aplikasi.',
    ].join('\n');
  }

  // TradePlan v1.0 (formula terbaru) diutamakan; tradeSetup lama cuma fallback untuk
  // entri cache lama - lihat catatan di ai-pick.service.ts. Nilai tp1/tp2/cl1/rr pada
  // dasarnya sama (TradePlan v1.0 membungkus buildLongTradingSetup yang sama), tapi
  // sumbernya perlu disamakan supaya jawaban chat konsisten dengan yang ditampilkan UI.
  const plan = scored.tradePlan;
  const setup = plan
    ? { tp1: plan.takeProfit1, tp2: plan.takeProfit2, cl1: plan.cutLoss, cl2: scored.tradeSetup?.cl2 ?? null, rr: plan.riskReward }
    : scored.tradeSetup;
  if (!setup) {
    return [
      `### ${code}`,
      '- Setup TP/CL: BELUM ADA setup yang sah untuk emiten ini sesi ini.',
      '- Ini hasil yang disengaja, bukan data hilang: setup hanya dibuat kalau struktur harga + ATR',
      '  menghasilkan risk-reward minimal 1,5. Sampaikan apa adanya - jangan mengarang level.',
    ].join('\n');
  }

  return [
    `### ${code}`,
    `- Harga acuan saat pemindaian: ${safe(scored.price)}`,
    `- TP1: ${safe(setup.tp1)} | TP2: ${safe(setup.tp2)}`,
    `- CL1: ${safe(setup.cl1)} | CL2: ${safe(setup.cl2)}`,
    `- Risk/reward: ${safe(setup.rr)}`,
    plan ? `- Entry reference: ${plan.entryReference} | Confidence: ${plan.confidenceLevel} (${safe(plan.confidenceScore)}%) | Risk level: ${plan.riskLevel}` : null,
    '- Level sudah dibulatkan ke fraksi harga IDX oleh engine, jangan dibulatkan ulang.',
    '- BATAS: ini setup long berbasis struktur + ATR dari sesi pemindaian terakhir, bukan',
    '  jaminan harga akan mencapainya, dan bukan perintah transaksi.',
  ].filter(Boolean).join('\n');
}
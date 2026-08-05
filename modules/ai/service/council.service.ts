import { generateAI, hasAnyAIProvider } from "@/lib/aiProviders";
import { runLocalCouncil } from "./local-council.service";
import { getCouncilCache, setCouncilCache } from "./council-cache.service";

// AUDIT 2026-08-01: sebelumnya "Score" di DATA REAL adalah mock hardcode (selalu 30
// utk semua saham, lihat riwayat commit) tapi diklaim "REAL" ke AI, dan Volume/Bandar
// di contoh output mengarang narasi spesifik padahal tidak ada angka volume/flow yang
// dikasih sama sekali. Sekarang Score = skor komposit REAL dari calculateScore()
// (modules/technical/service/scoring.service.ts - Technical+Fundamental+Flow), dan
// ATR/Volume ratio/Foreign Flow proxy REAL ditambahkan ke DATA REAL supaya agent
// Volatility/Volume/Bandar juga py angka asli untuk dirujuk (bukan dihapus - lebih
// baik dikasih data asli daripada agent-nya ditiadakan begitu saja).
// BUG FIX (audit BUILD 003 2026-08-03, item Confidence): field "confidence" per-agent
// dan "final_confidence" SEBELUMNYA ada di sini, dan ATURAN di bawah literal menyuruh
// LLM MENGARANG angka ("Confidence jangan semua 80, variasi 50-92") - persis pola yang
// dilarang audit ("AI Confidence 92%" tanpa formula yang bisa dijelaskan). Dihapus total
// (bukan diganti formula) - signal (BUY/SELL/WAIT/HOLD) + reason berbasis DATA REAL
// sudah cukup menjelaskan pendapat tiap agent, tanpa angka presisi palsu yang terlihat
// terukur padahal dikarang bebas oleh model.
const TUNED_PROMPT = `
Kamu adalah Dewan 10 Ahli Saham Indonesia. Analisa \${symbol}.

DATA REAL (JANGAN sebut angka lain di luar daftar ini - kalau suatu dimensi tidak ada datanya, bilang "data belum cukup" alih-alih mengarang):
Symbol: \${symbol} - Price \${price}, MA50 \${ma50}, MA200 \${ma200}, EMA \${ema}, RSI \${rsi}, Support \${support}, Res \${resistance}, ATR \${atr}, Volume vs Avg20D \${volRatio}x, Foreign Flow (proxy dari harga+volume, bukan data broker resmi) \${foreignFlow}, Skor Komposit \${score}/100
Fundamental: EPS \${eps}, Laporan Kuartal Terakhir \${lastQuarter}

CONTOH OUTPUT YANG GUE MAU (JANGAN GENERIC, TAPI SEMUA ANGKA HARUS DARI DATA REAL DI ATAS):

Untuk DGWG.JK (Price 280, MA50 300, MA200 369, RSI 31.25, Support 274, Res 306, ATR 8.2, Volume 1.8x, Foreign Flow NET SELL, Score 42):
{
  "agents": [
    {"name": "Trend Follower", "signal": "SELL", "reason": "Death cross MA50 300 < MA200 369, harga 280 masih dibawah, jangan lawan trend"},
    {"name": "Mean Reversion", "signal": "BUY", "reason": "RSI 31.25 oversold + nempel support 274, pantulan ke 286-306 mungkin"},
    {"name": "Volume", "signal": "WAIT", "reason": "Volume 1.8x avg, mulai ramai tapi arahnya belum jelas ikut trend"},
    {"name": "Momentum", "signal": "SELL", "reason": "EMA 286 masih SELL, momentum belum balik"},
    {"name": "S/R Hunter", "signal": "WAIT", "reason": "Tunggu 274 jebol atau hold, RR 1:4.33 baru enak di 274 bukan 280"},
    {"name": "Risk Manager", "signal": "BUY", "reason": "Risk 2.14% kecil kalau cut bawah 274, reward 9.29% ke 306, cicil boleh"},
    {"name": "Breakout", "signal": "SELL", "reason": "Skor komposit 42/100 SELL, belum ada tenaga breakout"},
    {"name": "Volatility", "signal": "HOLD", "reason": "ATR 8.2 (~2.9% dari harga), volatilitas sedang, siap-siap gerak di 274"},
    {"name": "Pattern", "signal": "SELL", "reason": "Lower low, belum bikin higher low"},
    {"name": "Bandar", "signal": "WAIT", "reason": "Foreign Flow NET SELL, tunggu tanda akumulasi dulu di 274"}
  ],
  "final_suggestion": "WAIT & SPECULATIVE BUY di 274",
  "summary_id": "4 SELL 3 WAIT 3 BUY. Trend masih SELL gara2 MA200 369, tapi RSI 31.25 & RR 1:4.33 bikin 3 agent BUY. Saran: jangan beli di 280, tunggu 274 hold baru cicil, target 306 cut bawah 268."
}

ATURAN:
- Reason max 20 kata, bahasa Indonesia gaul trader (jangan formal), langsung to the point, tanpa basa-basi
- HANYA sebut angka yang ada di DATA REAL di atas - dilarang keras mengarang angka (ATR, volume, foreign flow, dst) yang tidak diberikan
- JANGAN sertakan field confidence/skor kepercayaan apa pun - signal + reason saja
- Final suggestion harus actionable: BUY di harga berapa, WAIT dimana

Output JSON valid saja.
`;

/** Angka yang boleh muncul di jawaban AI: yang kita kirim sendiri di DATA REAL, plus
 * turunan aritmatik wajar darinya (rasio risk/reward, persentase jarak ke support, dst).
 * Toleransi 1.5% menampung pembulatan model. */
function isKnownNumber(n: number, known: number[]): boolean {
  if (!Number.isFinite(n)) return true;
  // Angka kecil (<= 100) terlalu sering muncul sebagai persentase/rasio/urutan hasil
  // hitungan sah ("RR 1:4.33", "risk 2.14%", "3 dari 10 agent") - memeriksanya justru
  // menghasilkan false positive massal. Yang benar-benar berbahaya adalah angka yang
  // MENYERUPAI harga/level/nilai finansial IDX (ratusan ke atas).
  if (Math.abs(n) <= 100) return true;
  return known.some((k) => Number.isFinite(k) && Math.abs(k) > 0 && Math.abs(n - k) / Math.abs(k) <= 0.015);
}

/** Periode indikator teknikal yang menempel di NAMANYA ("MA200", "MA 50", "RSI14",
 * "CMF20", "ATR-14"). Angka ini BUKAN harga/level - ia bagian dari nama indikator.
 *
 * BUG FIX (2026-08-05): tanpa ini, `findFabricatedNumbers()` mencomot "200" dari kata
 * "MA200" lalu menolak seluruh jawaban AI karena 200 memang tidak ada di daftar harga.
 * Periode di bawah 100 (MA20, MA50, RSI14) kebetulan lolos karena `isKnownNumber()`
 * meloloskan angka <= 100 - jadi HANYA MA200 yang terkena, dan MA200 adalah indikator
 * tren paling dasar yang disebut hampir semua jawaban analisis teknikal. Akibatnya
 * praktis SETIAP panggilan Council ditolak dan pengguna selalu dapat fallback lokal
 * ("LensAI tidak tersedia atau kena limit") - pesan yang menyesatkan, karena AI-nya
 * jalan normal dan jawabannya benar. Diverifikasi dari log produksi:
 *   [COUNCIL] Output AI ditolak untuk UNTR.JK - "MA50 23743 < MA200 26832" (angka 200)
 * Di situ 23743 dan 26832 dua-duanya data asli; yang dianggap karangan justru "200".
 * Prompt di file ini pun mencontohkan "MA200 369", jadi model memang diajari menulis
 * bentuk yang kemudian ditolak penjaganya sendiri. */
const INDICATOR_PERIOD_RE = /\b(MA|EMA|SMA|WMA|RSI|CMF|ATR|MFI|ADX|CCI|BB|MACD)\s*[-_]?\s*\d+\b/gi;

/** Kembalikan potongan teks pertama yang memuat angka berskala harga yang TIDAK ada di
 * DATA REAL, atau null kalau seluruh angka bisa dipertanggungjawabkan.
 *
 * Di-export untuk pengujian: fungsi ini murni (tanpa I/O) dan perilakunya menentukan
 * apakah pengguna melihat analisis AI atau fallback lokal, jadi wajib bisa diuji
 * langsung tanpa memanggil model. */
export function findFabricatedNumbers(json: any, promptData: Record<string, unknown>): string | null {
  const known: number[] = [];
  for (const v of Object.values(promptData)) {
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (Number.isFinite(n)) known.push(n);
  }
  // Level turunan yang WAJAR disebut agen S/R & Risk Manager: titik tengah support-
  // resistance dan jarak ATR dari harga. Ini hitungan sah dari data yang sudah diberikan,
  // bukan karangan - dimasukkan supaya tidak jadi false positive.
  const price = Number(promptData.price);
  const support = Number(promptData.support);
  const resistance = Number(promptData.resistance);
  const atr = Number(promptData.atr);
  if (Number.isFinite(support) && Number.isFinite(resistance)) known.push((support + resistance) / 2);
  if (Number.isFinite(price) && Number.isFinite(atr)) known.push(price + atr, price - atr, price + 2 * atr, price - 2 * atr);

  const texts: string[] = [];
  const collect = (node: any) => {
    if (typeof node === 'string') texts.push(node);
    else if (Array.isArray(node)) node.forEach(collect);
    else if (node && typeof node === 'object') Object.values(node).forEach(collect);
  };
  collect(json);

  for (const text of texts) {
    const normalized = text
      // Buang periode yang menempel di nama indikator ("MA200" -> "MA") SEBELUM angka
      // diekstrak - lihat catatan panjang di INDICATOR_PERIOD_RE. Label indikatornya
      // dipertahankan supaya potongan teks di pesan pelanggaran tetap terbaca.
      .replace(INDICATOR_PERIOD_RE, (m) => m.replace(/\d+/g, ''))
      // Buang pemisah ribuan gaya Indonesia (1.234) supaya "Rp 6.500" terbaca 6500.
      .replace(/(\d)\.(?=\d{3}\b)/g, '$1');
    const matches = normalized.match(/-?\d+(?:[.,]\d+)?/g) || [];
    for (const m of matches) {
      const n = parseFloat(m.replace(',', '.'));
      if (!isKnownNumber(n, known)) return `"${text.slice(0, 120)}" (angka ${m})`;
    }
  }
  return null;
}

// cacheKey opsional (dari app/api/council/route.ts, biasanya "tanggal:kuartal-terakhir-
// dilaporkan") - kalau tidak diberi, fallback ke tanggal kalender hari ini seperti semula
// (dipertahankan supaya pemanggil lama tanpa cacheKey tetap jalan).
export async function getCouncil(symbol: string, data: any, cacheKey?: string) {
  const today = new Date().toISOString().split('T')[0];
  const key = cacheKey || today;

  // 1. Cek cache Redis (Cache Layer Tier 2 AI Result)
  const cached = await getCouncilCache(symbol, key);
  if (cached) return cached;

  try {
    // BUG FIX (audit integritas data 2026-08-03, temuan H-11): enam field di bawah
    // SEBELUMNYA pakai `data?.x || 0` - kalau field-nya hilang/undefined, prompt
    // menerima angka 0 dan AI memperlakukannya sebagai "DATA REAL" (mis. "MA200 0" ->
    // AI menyimpulkan harga jauh di atas MA200 = uptrend ekstrem; "RSI 0" -> disimpulkan
    // oversold ekstrem). Judul blok data di TUNED_PROMPT eksplisit menyuruh AI bilang
    // "data belum cukup" kalau suatu dimensi tidak ada datanya - tapi aturan itu tidak
    // pernah terpicu karena dari sudut pandang AI datanya ADA (nilainya kebetulan nol).
    // atr/volRatio/foreignFlow/eps di baris bawah SUDAH benar pakai 'N/A' - disamakan.
    const promptData = {
      price: data?.currentPrice ?? data?.price ?? 'N/A',
      ma50: data?.ma50 ?? 'N/A',
      ma200: data?.ma200 ?? 'N/A',
      ema: data?.ema ?? 'N/A',
      rsi: typeof data?.rsi === 'number' ? data.rsi : 'N/A',
      support: data?.support ?? 'N/A',
      resistance: data?.resistance ?? 'N/A',
      atr: data?.atr ?? 'N/A',
      volRatio: data?.volRatio != null ? data.volRatio.toFixed(2) : 'N/A',
      foreignFlow: data?.foreignFlow ?? 'N/A',
      score: data?.score ?? 'N/A',
      eps: data?.fundamentalSnapshot?.trailingEps ?? 'N/A',
      lastQuarter: data?.fundamentalSnapshot?.mostRecentQuarter ?? 'N/A',
    };

    let prompt = TUNED_PROMPT.replace(/\$\{symbol\}/g, symbol)
      .replace(/\$\{price\}/g, String(promptData.price))
      .replace(/\$\{ma50\}/g, String(promptData.ma50))
      .replace(/\$\{ma200\}/g, String(promptData.ma200))
      .replace(/\$\{ema\}/g, String(promptData.ema))
      .replace(/\$\{rsi\}/g, typeof promptData.rsi === 'number' ? promptData.rsi.toFixed(2) : 'N/A')
      .replace(/\$\{support\}/g, String(promptData.support))
      .replace(/\$\{resistance\}/g, String(promptData.resistance))
      .replace(/\$\{atr\}/g, String(promptData.atr))
      .replace(/\$\{volRatio\}/g, String(promptData.volRatio))
      .replace(/\$\{foreignFlow\}/g, String(promptData.foreignFlow))
      .replace(/\$\{score\}/g, String(promptData.score))
      .replace(/\$\{eps\}/g, String(promptData.eps))
      .replace(/\$\{lastQuarter\}/g, String(promptData.lastQuarter));

    // 2. Coba Council AI - cascade lintas provider (Gemini/Groq/OpenRouter, lihat
    // lib/aiProviders.ts), bukan cuma satu model - kalau satu provider kena limit,
    // otomatis lanjut ke provider lain sebelum jatuh ke fallback lokal.
    if (!hasAnyAIProvider()) {
      console.warn("[COUNCIL] Tidak ada AI provider terkonfigurasi, pakai local fallback", symbol);
      return runLocalCouncil(symbol, data);
    }
    const jsonStr = await generateAI({ prompt, json: true, timeoutMs: 8000 });
    if (!jsonStr) {
      console.log("Semua AI provider gagal/limit, pakai local fallback", symbol);
      return runLocalCouncil(symbol, data);
    }
    const json = JSON.parse(jsonStr);

    // BUG FIX (audit logika & algoritma 2026-08-05, temuan C-6): output model SEBELUMNYA
    // langsung di-cache 6 jam dan dikirim ke pengguna tanpa satu pun pemeriksaan bahwa
    // angka yang disebutnya memang berasal dari blok DATA REAL. Prompt memang melarang
    // mengarang, tapi larangan di prompt BUKAN penegakan - apalagi cascade provider di
    // sini menyertakan model gratis (llama/deepseek `:free`) yang paling rawan. Sekarang
    // respons diperiksa dulu; kalau memuat angka finansial yang tidak ada di data yang
    // kita kirim, respons itu DIBUANG dan jatuh ke fallback lokal yang deterministik.
    const violation = findFabricatedNumbers(json, promptData);
    if (violation) {
      console.warn(`[COUNCIL] Output AI ditolak untuk ${symbol} - angka tidak ada di DATA REAL: ${violation}`);
      return runLocalCouncil(symbol, data);
    }

    // Save cache
    await setCouncilCache(symbol, key, json);
    return json;
  } catch (e) {
    console.log("AI provider error, pakai local fallback", e);
    // 3. Fallback ke prompt lama (rule-based 10 file)
    return runLocalCouncil(symbol, data);
  }
}

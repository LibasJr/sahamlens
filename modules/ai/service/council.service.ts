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
const TUNED_PROMPT = `
Kamu adalah Dewan 10 Ahli Saham Indonesia. Analisa \${symbol}.

DATA REAL (JANGAN sebut angka lain di luar daftar ini - kalau suatu dimensi tidak ada datanya, bilang "data belum cukup" alih-alih mengarang):
Symbol: \${symbol} - Price \${price}, MA50 \${ma50}, MA200 \${ma200}, EMA \${ema}, RSI \${rsi}, Support \${support}, Res \${resistance}, ATR \${atr}, Volume vs Avg20D \${volRatio}x, Foreign Flow (proxy dari harga+volume, bukan data broker resmi) \${foreignFlow}, Skor Komposit \${score}/100
Fundamental: EPS \${eps}, Laporan Kuartal Terakhir \${lastQuarter}

CONTOH OUTPUT YANG GUE MAU (JANGAN GENERIC, TAPI SEMUA ANGKA HARUS DARI DATA REAL DI ATAS):

Untuk DGWG.JK (Price 280, MA50 300, MA200 369, RSI 31.25, Support 274, Res 306, ATR 8.2, Volume 1.8x, Foreign Flow NET SELL, Score 42):
{
  "agents": [
    {"name": "Trend Follower", "signal": "SELL", "confidence": 92, "reason": "Death cross MA50 300 < MA200 369, harga 280 masih dibawah, jangan lawan trend"},
    {"name": "Mean Reversion", "signal": "BUY", "confidence": 78, "reason": "RSI 31.25 oversold + nempel support 274, pantulan ke 286-306 mungkin"},
    {"name": "Volume", "signal": "WAIT", "confidence": 60, "reason": "Volume 1.8x avg, mulai ramai tapi arahnya belum jelas ikut trend"},
    {"name": "Momentum", "signal": "SELL", "confidence": 68, "reason": "EMA 286 masih SELL, momentum belum balik"},
    {"name": "S/R Hunter", "signal": "WAIT", "confidence": 85, "reason": "Tunggu 274 jebol atau hold, RR 1:4.33 baru enak di 274 bukan 280"},
    {"name": "Risk Manager", "signal": "BUY", "confidence": 70, "reason": "Risk 2.14% kecil kalau cut bawah 274, reward 9.29% ke 306, cicil boleh"},
    {"name": "Breakout", "signal": "SELL", "confidence": 90, "reason": "Skor komposit 42/100 SELL, belum ada tenaga breakout"},
    {"name": "Volatility", "signal": "HOLD", "confidence": 55, "reason": "ATR 8.2 (~2.9% dari harga), volatilitas sedang, siap-siap gerak di 274"},
    {"name": "Pattern", "signal": "SELL", "confidence": 65, "reason": "Lower low, belum bikin higher low"},
    {"name": "Bandar", "signal": "WAIT", "confidence": 50, "reason": "Foreign Flow NET SELL, tunggu tanda akumulasi dulu di 274"}
  ],
  "final_suggestion": "WAIT & SPECULATIVE BUY di 274",
  "final_confidence": 73,
  "summary_id": "4 SELL 3 WAIT 3 BUY. Trend masih SELL gara2 MA200 369, tapi RSI 31.25 & RR 1:4.33 bikin 3 agent BUY. Saran: jangan beli di 280, tunggu 274 hold baru cicil, target 306 cut bawah 268."
}

ATURAN:
- Reason max 20 kata, bahasa Indonesia gaul trader (jangan formal), langsung to the point, tanpa basa-basi
- HANYA sebut angka yang ada di DATA REAL di atas - dilarang keras mengarang angka (ATR, volume, foreign flow, dst) yang tidak diberikan
- Confidence jangan semua 80, variasi 50-92
- Final suggestion harus actionable: BUY di harga berapa, WAIT dimana

Output JSON valid saja.
`;

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

    // Save cache
    await setCouncilCache(symbol, key, json);
    return json;
  } catch (e) {
    console.log("AI provider error, pakai local fallback", e);
    // 3. Fallback ke prompt lama (rule-based 10 file)
    return runLocalCouncil(symbol, data);
  }
}

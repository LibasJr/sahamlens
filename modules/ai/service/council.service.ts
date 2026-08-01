import { generateAI, hasAnyAIProvider } from "@/lib/aiProviders";
import { runLocalCouncil } from "./local-council.service";
import { getCouncilCache, setCouncilCache } from "./council-cache.service";

const TUNED_PROMPT = `
Kamu adalah Dewan 10 Ahli Saham Indonesia. Analisa \${symbol}.

DATA REAL:
Symbol: \${symbol} - Price \${price}, MA50 \${ma50}, MA200 \${ma200}, EMA \${ema}, RSI \${rsi}, Support \${support}, Res \${resistance}, Score \${score}
Fundamental: EPS \${eps}, Laporan Kuartal Terakhir \${lastQuarter}

CONTOH OUTPUT YANG GUE MAU (JANGAN GENERIC):

Untuk DGWG.JK:
{
  "agents": [
    {"name": "Trend Follower", "signal": "SELL", "confidence": 92, "reason": "Death cross MA50 300 < MA200 369, harga 280 masih dibawah, jangan lawan trend"},
    {"name": "Mean Reversion", "signal": "BUY", "confidence": 78, "reason": "RSI 31.25 oversold + nempel support 274, pantulan ke 286-306 mungkin"},
    {"name": "Volume", "signal": "WAIT", "confidence": 60, "reason": "Volume turun pas turun, seller mulai capek"},
    {"name": "Momentum", "signal": "SELL", "confidence": 68, "reason": "EMA 286 masih SELL, momentum belum balik"},
    {"name": "S/R Hunter", "signal": "WAIT", "confidence": 85, "reason": "Tunggu 274 jebol atau hold, RR 1:4.33 baru enak di 274 bukan 280"},
    {"name": "Risk Manager", "signal": "BUY", "confidence": 70, "reason": "Risk 2.14% kecil kalau cut bawah 274, reward 9.29% ke 306, cicil boleh"},
    {"name": "Breakout", "signal": "SELL", "confidence": 90, "reason": "Score 31 SELL, belum ada tenaga breakout"},
    {"name": "Volatility", "signal": "HOLD", "confidence": 55, "reason": "ATR mengecil, siap-siap volatile di 274"},
    {"name": "Pattern", "signal": "SELL", "confidence": 65, "reason": "Lower low, belum bikin higher low"},
    {"name": "Bandar", "signal": "WAIT", "confidence": 50, "reason": "Distribusi masih ada, tunggu akumulasi di 274"}
  ],
  "final_suggestion": "WAIT & SPECULATIVE BUY di 274",
  "final_confidence": 73,
  "summary_id": "4 SELL 3 WAIT 3 BUY. Trend masih SELL gara2 MA200 369, tapi RSI 31.25 & RR 1:4.33 bikin 3 agent BUY. Saran: jangan beli di 280, tunggu 274 hold baru cicil, target 306 cut bawah 268."
}

ATURAN:
- Reason max 20 kata, bahasa Indonesia gaul trader (jangan formal)
- Sebut angka real (seperti \${price}, \${ma200}, \${rsi}, \${support})
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
    const promptData = {
      price: data?.currentPrice || data?.price || 0,
      ma50: data?.ma50 || 0,
      ma200: data?.ma200 || 0,
      ema: data?.ema || 0,
      rsi: data?.rsi || 0,
      support: data?.support || 0,
      resistance: data?.resistance || 0,
      score: data?.score || 0,
      eps: data?.fundamentalSnapshot?.trailingEps ?? 'N/A',
      lastQuarter: data?.fundamentalSnapshot?.mostRecentQuarter ?? 'N/A',
    };

    let prompt = TUNED_PROMPT.replace(/\$\{symbol\}/g, symbol)
      .replace(/\$\{price\}/g, promptData.price.toString())
      .replace(/\$\{ma50\}/g, promptData.ma50.toString())
      .replace(/\$\{ma200\}/g, promptData.ma200.toString())
      .replace(/\$\{ema\}/g, promptData.ema.toString())
      .replace(/\$\{rsi\}/g, typeof promptData.rsi === 'number' ? promptData.rsi.toFixed(2) : '0')
      .replace(/\$\{support\}/g, promptData.support.toString())
      .replace(/\$\{resistance\}/g, promptData.resistance.toString())
      .replace(/\$\{score\}/g, promptData.score.toString())
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

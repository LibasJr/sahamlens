import { jsonModel } from "../gemini";
import { runLocalCouncil } from "./localCouncil";
import { getCouncilCache, setCouncilCache } from "../cache";

const TUNED_PROMPT = `
Kamu adalah Dewan 10 Ahli Saham Indonesia. Analisa \${symbol}.

DATA REAL:
Symbol: \${symbol} - Price \${price}, MA50 \${ma50}, MA200 \${ma200}, EMA \${ema}, RSI \${rsi}, Support \${support}, Res \${resistance}, Score \${score}

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

export async function getCouncil(symbol: string, data: any) {
  const today = new Date().toISOString().split('T')[0];
  
  // 1. Cek cache local data/council_cache.json
  const cached = getCouncilCache(symbol, today);
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
      score: data?.score || 0
    };

    let prompt = TUNED_PROMPT.replace(/\$\{symbol\}/g, symbol)
      .replace(/\$\{price\}/g, promptData.price.toString())
      .replace(/\$\{ma50\}/g, promptData.ma50.toString())
      .replace(/\$\{ma200\}/g, promptData.ma200.toString())
      .replace(/\$\{ema\}/g, promptData.ema.toString())
      .replace(/\$\{rsi\}/g, typeof promptData.rsi === 'number' ? promptData.rsi.toFixed(2) : '0')
      .replace(/\$\{support\}/g, promptData.support.toString())
      .replace(/\$\{resistance\}/g, promptData.resistance.toString())
      .replace(/\$\{score\}/g, promptData.score.toString());

    // 2. Coba Gemini Pro
    if (!jsonModel) {
      console.warn("[COUNCIL] GEMINI_API_KEY missing, using local fallback", symbol);
      return runLocalCouncil(symbol, data);
    }
    const result = await jsonModel.generateContent(prompt);
    const jsonStr = result.response.text();
    const json = JSON.parse(jsonStr);
    
    // Save cache
    setCouncilCache(symbol, today, json);
    return json;
  } catch (e) {
    console.log("Gemini limit atau error, pakai local fallback", e);
    // 3. Fallback ke prompt lama (rule-based 10 file)
    return runLocalCouncil(symbol, data);
  }
}

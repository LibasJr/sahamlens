import { jsonModel } from '../gemini';
import fs from 'fs';
import path from 'path';

export async function runGeminiCouncil(symbol: string, data: any) {
  if (!jsonModel) {
    throw new Error('Gemini model not initialized');
  }

  const prompt = `
  Data saham ${symbol}:
  Price: ${data?.currentPrice || data?.price || 0}
  MA50: ${data?.ma50 || 0} MA200: ${data?.ma200 || 0}
  EMA: ${data?.ema || 0}
  RSI: ${data?.rsi || 0}
  Support: ${data?.support || 0} Resistance: ${data?.resistance || 0}
  Breakout Score: ${data?.score || 0}
  
  Tugas: Jadi 10 agent, kasih output JSON:
  {
    "agents": [
      {"name": "Trend Follower", "signal": "SELL", "confidence": 92, "reason": "Harga < MA200 369 bearish kuat"},
      {"name": "Mean Reversion", "signal": "BUY", "confidence": 75, "reason": "RSI oversold di dekat support"}
    ],
    "final_suggestion": "SPECULATIVE BUY di 274",
    "final_confidence": 72,
    "summary_id": "4 Agent SELL karena trend, 3 BUY karena RSI oversold & RR bagus. Saran tunggu 274"
  }
  Signal hanya: BUY, SELL, HOLD, WAIT
  Reason max 20 kata, bahasa Indonesia campur trading slang.
  Berikan TEPAT 10 agent di dalam array agents.
  Agent names: Trend Follower, Mean Reversion, Volume Analyst, Momentum, S/R Hunter, Risk Manager, Breakout Hunter, Volatility, Chart Pattern Reader, Fundamental Quick Check.
  `;

  const result = await jsonModel.generateContent(prompt);
  const text = result.response.text();
  
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse Gemini response:", text);
    throw new Error("Invalid JSON from Gemini");
  }
}

export function runLocalCouncil(symbol: string, data: any) {
  // Simple fallback logic
  const price = data?.currentPrice || data?.price || 0;
  const ma200 = data?.ma200 || 0;
  const rsi = data?.rsi || 50;

  const trendSignal = price > ma200 ? "BUY" : "SELL";
  const rsiSignal = rsi < 35 ? "BUY" : rsi > 70 ? "SELL" : "HOLD";

  return {
    agents: [
      { name: "Trend Follower", signal: trendSignal, confidence: 80, reason: `Harga ${price > ma200 ? '>' : '<'} MA200` },
      { name: "Mean Reversion", signal: rsiSignal, confidence: 70, reason: `RSI ${rsi}` },
      { name: "Volume Analyst", signal: "WAIT", confidence: 50, reason: "Data volume tidak cukup" },
      { name: "Momentum", signal: "HOLD", confidence: 60, reason: "Momentum netral" },
      { name: "S/R Hunter", signal: "WAIT", confidence: 55, reason: "Menunggu di support" },
      { name: "Risk Manager", signal: "HOLD", confidence: 70, reason: "Risk/Reward standar" },
      { name: "Breakout Hunter", signal: "WAIT", confidence: 65, reason: "Belum ada konfirmasi breakout" },
      { name: "Volatility", signal: "HOLD", confidence: 60, reason: "Volatilitas normal" },
      { name: "Chart Pattern Reader", signal: "WAIT", confidence: 50, reason: "Tidak ada pola yang jelas" },
      { name: "Fundamental Quick Check", signal: "HOLD", confidence: 50, reason: "Menunggu laporan keuangan" }
    ],
    final_suggestion: `${trendSignal} based on Trend, but RSI says ${rsiSignal}`,
    final_confidence: 65,
    summary_id: "Fallback lokal berjalan karena Gemini API tidak tersedia atau error."
  };
}

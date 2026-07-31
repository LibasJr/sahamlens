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
      { name: "Mean Reversion", signal: rsiSignal, confidence: 70, reason: `RSI ${Number(rsi).toFixed(2)}` },
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
    summary_id: "Fallback lokal berjalan karena Council AI tidak tersedia atau kena limit."
  };
}

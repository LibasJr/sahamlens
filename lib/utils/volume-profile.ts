export interface VolumeProfileBin {
  priceLevel: number;
  priceLow: number;
  priceHigh: number;
  totalVolume: number;
  buyVolume: number;
  sellVolume: number;
  volumePct: number; // 0 - 100 relative to max bin volume
}

export interface VolumeProfileResult {
  bins: VolumeProfileBin[];
  pocPrice: number;       // Point of Control (Highest Volume Node)
  pocVolume: number;
  vahPrice: number;       // Value Area High (70% Volume Top)
  valPrice: number;       // Value Area Low (70% Volume Bottom)
  totalVolume: number;
}

export interface VolumeProfileCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time?: string | number;
}

export function computeVolumeProfile(
  candles: VolumeProfileCandle[],
  binsCount: number = 24
): VolumeProfileResult | null {
  if (!candles || candles.length === 0) return null;

  const validCandles = candles.filter(
    (c) =>
      typeof c.high === 'number' &&
      typeof c.low === 'number' &&
      typeof c.volume === 'number' &&
      c.high >= c.low &&
      c.volume >= 0 &&
      !isNaN(c.high) &&
      !isNaN(c.low)
  );

  if (validCandles.length === 0) return null;

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let totalVolume = 0;

  for (const c of validCandles) {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
    totalVolume += c.volume;
  }

  if (minPrice >= maxPrice || totalVolume <= 0) return null;

  const binStep = (maxPrice - minPrice) / binsCount;
  const bins: VolumeProfileBin[] = [];

  for (let i = 0; i < binsCount; i++) {
    const pLow = minPrice + i * binStep;
    const pHigh = minPrice + (i + 1) * binStep;
    const pMid = Math.round((pLow + pHigh) / 2);
    bins.push({
      priceLevel: pMid,
      priceLow: pLow,
      priceHigh: pHigh,
      totalVolume: 0,
      buyVolume: 0,
      sellVolume: 0,
      volumePct: 0,
    });
  }

  // Distribute volume into bins
  for (const c of validCandles) {
    if (c.volume <= 0) continue;
    const isBullish = c.close >= c.open;
    const candleSpan = Math.max(1, c.high - c.low);

    for (let i = 0; i < binsCount; i++) {
      const b = bins[i];
      // Check overlap between candle [low, high] and bin [priceLow, priceHigh]
      const overlapLow = Math.max(c.low, b.priceLow);
      const overlapHigh = Math.min(c.high, b.priceHigh);

      if (overlapHigh >= overlapLow) {
        const overlapRatio = (overlapHigh - overlapLow) / candleSpan;
        const binVol = c.volume * overlapRatio;
        b.totalVolume += binVol;
        if (isBullish) {
          b.buyVolume += binVol;
        } else {
          b.sellVolume += binVol;
        }
      }
    }
  }

  // Find POC (Point of Control)
  let maxBinVol = 0;
  let pocIdx = 0;

  for (let i = 0; i < bins.length; i++) {
    if (bins[i].totalVolume > maxBinVol) {
      maxBinVol = bins[i].totalVolume;
      pocIdx = i;
    }
  }

  const pocPrice = bins[pocIdx].priceLevel;
  const pocVolume = bins[pocIdx].totalVolume;

  // Calculate volume percentage relative to max bin volume
  for (const b of bins) {
    b.volumePct = maxBinVol > 0 ? parseFloat(((b.totalVolume / maxBinVol) * 100).toFixed(1)) : 0;
  }

  // Calculate Value Area (70% of total volume around POC)
  const targetAreaVolume = totalVolume * 0.7;
  let accumulatedAreaVol = bins[pocIdx].totalVolume;
  let upIdx = pocIdx;
  let downIdx = pocIdx;

  while (accumulatedAreaVol < targetAreaVolume && (upIdx < bins.length - 1 || downIdx > 0)) {
    const nextUpVol = upIdx + 1 < bins.length ? bins[upIdx + 1].totalVolume : 0;
    const nextDownVol = downIdx - 1 >= 0 ? bins[downIdx - 1].totalVolume : 0;

    if (nextUpVol >= nextDownVol && upIdx + 1 < bins.length) {
      upIdx++;
      accumulatedAreaVol += bins[upIdx].totalVolume;
    } else if (downIdx - 1 >= 0) {
      downIdx--;
      accumulatedAreaVol += bins[downIdx].totalVolume;
    } else if (upIdx + 1 < bins.length) {
      upIdx++;
      accumulatedAreaVol += bins[upIdx].totalVolume;
    } else {
      break;
    }
  }

  const vahPrice = bins[upIdx].priceHigh;
  const valPrice = bins[downIdx].priceLow;

  return {
    bins,
    pocPrice,
    pocVolume,
    vahPrice: Math.round(vahPrice),
    valPrice: Math.round(valPrice),
    totalVolume,
  };
}

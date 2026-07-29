import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';

// Pseudo-random generator based on string
const seedRandom = (str: string) => {
  let h = 0xdeadbeef;
  for (let i = 0; i < str.length; i++)
    h = Math.imul(h ^ str.charCodeAt(i), 2654435761);
  return (h ^ h >>> 16) / 2 ** 32 + 0.5;
};

const BROKERS = [
  'CC', 'ZP', 'AK', 'BK', 'RX', 'CS', 'YU', 'NI', 'BB',
  'YP', 'PD', 'NI', 'SQ', 'DR', 'EP', 'XC', 'DX', 'KK'
];

export async function GET(
  request: Request,
  { params }: { params: { ticker: string } }
) {
  const ticker = params.ticker.toUpperCase().replace('.JK', '');
  
  // Create deterministic but pseudo-random data based on ticker
  const rand1 = seedRandom(ticker + '1');
  const rand2 = seedRandom(ticker + '2');
  
  // 1. Mock 20 Days Foreign Net Buy (in Billions IDR)
  const foreignFlow20D = Array.from({ length: 20 }).map((_, i) => {
    const val = (seedRandom(ticker + 'flow' + i) - 0.5) * 100; // -50B to +50B
    return {
      date: new Date(Date.now() - (19 - i) * 86400000).toISOString().split('T')[0],
      netValue: parseFloat(val.toFixed(2))
    };
  });

  // Calculate 3 day and 5 day totals
  const last3Days = foreignFlow20D.slice(-3);
  const isAccumulation3D = last3Days.every(d => d.netValue > 0);
  const isDistribution3D = last3Days.every(d => d.netValue < 0);
  const net5D = foreignFlow20D.slice(-5).reduce((sum, d) => sum + d.netValue, 0);

  // 2. Mock Top Brokers
  const isOverallPositive = rand1 > 0.4; // 60% chance of positive
  
  // Top Buyers
  const topBuyers = [
    { broker: BROKERS[Math.floor(seedRandom(ticker + 'b1') * BROKERS.length)], volume: Math.floor(rand1 * 500000) + 100000, avgPrice: 1500 },
    { broker: BROKERS[Math.floor(seedRandom(ticker + 'b2') * BROKERS.length)], volume: Math.floor(rand2 * 300000) + 50000, avgPrice: 1510 },
    { broker: BROKERS[Math.floor(seedRandom(ticker + 'b3') * BROKERS.length)], volume: Math.floor(rand1 * 200000) + 20000, avgPrice: 1495 }
  ];

  // Top Sellers
  const topSellers = [
    { broker: BROKERS[Math.floor(seedRandom(ticker + 's1') * BROKERS.length)], volume: Math.floor(rand2 * 450000) + 80000, avgPrice: 1490 },
    { broker: BROKERS[Math.floor(seedRandom(ticker + 's2') * BROKERS.length)], volume: Math.floor(rand1 * 250000) + 40000, avgPrice: 1520 },
    { broker: BROKERS[Math.floor(seedRandom(ticker + 's3') * BROKERS.length)], volume: Math.floor(rand2 * 150000) + 10000, avgPrice: 1505 }
  ];

  // Adjust volumes based on overall positive/negative bias
  if (isOverallPositive) {
    topSellers[0].volume = Math.floor(topBuyers[0].volume * 0.7);
  } else {
    topBuyers[0].volume = Math.floor(topSellers[0].volume * 0.7);
  }

  const totalBuyVol = topBuyers.reduce((sum, b) => sum + b.volume, 0);
  const totalSellVol = topSellers.reduce((sum, s) => sum + s.volume, 0);
  const isBrokerAccum = totalBuyVol > totalSellVol * 1.1;

  // 3. Status logic
  let status = 'NETRAL';
  if (isAccumulation3D) status = 'AKUMULASI';
  if (isDistribution3D) status = 'DISTRIBUSI';
  
  let sentiment = 'Netral';
  if (net5D > 0 && isBrokerAccum) {
    sentiment = 'Sangat Positif';
  } else if (net5D < 0 && totalSellVol > totalBuyVol * 1.1) {
    sentiment = 'Sangat Negatif';
  }

  return NextResponse.json({
    ticker: ticker + '.JK',
    foreignFlow20D,
    topBuyers,
    topSellers,
    summary: {
      status, // AKUMULASI, DISTRIBUSI, NETRAL
      sentiment, // Sangat Positif, dll
      net5D: parseFloat(net5D.toFixed(2)),
      isAccumulation3D,
      isDistribution3D,
      isBrokerAccum
    }
  });
}

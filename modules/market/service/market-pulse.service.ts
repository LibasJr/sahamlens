// BUILD 002 (Refactor Domain) - dipindah dari app/api/market-pulse/route.ts, verbatim.
// IDX Indices
const IDX_INDICES = [
  { symbol: '^JKSE', name: 'IHSG', fullName: 'Jakarta Composite Index' },
  { symbol: '^JKLQ45', name: 'LQ45', fullName: 'LQ45 Index' },
  { symbol: '^JKIDX30', name: 'IDX30', fullName: 'IDX30 Index' },
  { symbol: '^JKSE', name: 'Kompas100', fullName: 'Kompas 100 (proxy IHSG)' },
];

// IDX Sector representatives (top stocks per sector for heatmap)
const IDX_SECTORS = [
  { sector: 'Financial', color: '#3b82f6', stocks: ['BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'BBNI.JK'] },
  { sector: 'Energy', color: '#f97316', stocks: ['ADRO.JK', 'PTBA.JK', 'MEDC.JK', 'ITMG.JK'] },
  { sector: 'Consumer Defensive', color: '#22c55e', stocks: ['ICBP.JK', 'INDF.JK', 'UNVR.JK', 'MYOR.JK'] },
  { sector: 'Technology', color: '#8b5cf6', stocks: ['GOTO.JK', 'BUKA.JK', 'EMTK.JK'] },
  { sector: 'Telecom', color: '#06b6d4', stocks: ['TLKM.JK', 'ISAT.JK', 'EXCL.JK', 'TOWR.JK'] },
  { sector: 'Basic Materials', color: '#eab308', stocks: ['ANTM.JK', 'INCO.JK', 'TINS.JK', 'INKP.JK'] },
  { sector: 'Industrials', color: '#64748b', stocks: ['ASII.JK', 'UNTR.JK', 'AUTO.JK', 'SMSM.JK'] },
  { sector: 'Healthcare', color: '#ec4899', stocks: ['KLBF.JK', 'SIDO.JK', 'SILO.JK', 'MIKA.JK'] },
  { sector: 'Property', color: '#14b8a6', stocks: ['BSDE.JK', 'CTRA.JK', 'SMRA.JK', 'PWON.JK'] },
  { sector: 'Infra & Transport', color: '#f43f5e', stocks: ['TBIG.JK', 'MTEL.JK', 'PGAS.JK', 'AKRA.JK'] },
  { sector: 'Consumer Cyclical', color: '#a855f7', stocks: ['MAPI.JK', 'ACES.JK', 'AMRT.JK', 'LPPF.JK'] },
];

// Breadth sample stocks (broad IDX)
const BREADTH_STOCKS = [
  'BBCA.JK','BBRI.JK','BMRI.JK','BBNI.JK','TLKM.JK','ASII.JK','GOTO.JK','ADRO.JK','UNTR.JK',
  'ICBP.JK','KLBF.JK','PGAS.JK','PTBA.JK','ANTM.JK','BRPT.JK','INKP.JK','INDF.JK','ITMG.JK',
  'CPIN.JK','UNVR.JK','AKRA.JK','BRIS.JK','SMGR.JK','INTP.JK','CTRA.JK','BSDE.JK','SMRA.JK',
  'ISAT.JK','EXCL.JK','BUKA.JK','TOWR.JK','TBIG.JK','SIDO.JK','AMRT.JK','MYOR.JK','HMSP.JK',
  'GGRM.JK','JPFA.JK','ARTO.JK','BDMN.JK','BNGA.JK','BBTN.JK','MEGA.JK','INDY.JK','BYAN.JK',
  'HRUM.JK','INCO.JK','TINS.JK','MAPI.JK','SILO.JK','EMTK.JK','WIKA.JK','ADHI.JK','PWON.JK',
];

async function fetchYahooQuote(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=5m`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      next: { revalidate: 60 },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const closes = result.indicators?.quote?.[0]?.close || [];
    const validCloses = closes.filter((c: any) => c !== null);
    const prevClose = meta.chartPreviousClose || meta.previousClose || validCloses[0] || 0;
    const currentPrice = meta.regularMarketPrice || validCloses[validCloses.length - 1] || 0;
    const changePct = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

    return {
      symbol,
      price: currentPrice,
      prevClose,
      changePct: parseFloat(changePct.toFixed(2)),
      sparkline: validCloses.slice(-50).map((c: number) => parseFloat(c?.toFixed(2) || '0')),
      volume: meta.regularMarketVolume || 0,
      marketCap: meta.marketCap || 0
    };
  } catch {
    return null;
  }
}

async function fetchQuoteSimple(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1d`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      next: { revalidate: 120 },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
    const currentPrice = meta.regularMarketPrice || 0;
    const changePct = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

    return {
      symbol,
      price: currentPrice,
      changePct: parseFloat(changePct.toFixed(2)),
      marketCap: meta.marketCap || 0,
      volume: meta.regularMarketVolume || 0
    };
  } catch {
    return null;
  }
}

export async function getMarketPulse() {
  // 1. Fetch indices with sparkline
  const indicesData = await Promise.all(
    IDX_INDICES.map(async (idx) => {
      let quote = null;

      if (idx.name === 'IDX30') {
        quote = await fetchYahooQuote('IDX30.JK') || await fetchYahooQuote('^IDX30.JK');
        if (!quote || quote.price === 0) {
          console.error('Failed to fetch IDX30, using dummy data');
          quote = { price: 462.5, changePct: 0.12, sparkline: [], volume: 0 } as any;
        }
      } else if (idx.name === 'LQ45') {
        quote = await fetchYahooQuote('LQ45.JK') || await fetchYahooQuote('^JKLQ45');
        if (!quote || quote.price === 0) {
          console.error('Failed to fetch LQ45, using dummy data');
          quote = { price: 608, changePct: -1.1, sparkline: [], volume: 0 } as any;
        }
      } else if (idx.name === 'Kompas100') {
        quote = await fetchYahooQuote('Kompas100.JK');
        if (!quote || quote.price === 0) {
          let ihsg = await fetchYahooQuote('^JKSE');
          if (ihsg && ihsg.price > 0) {
            quote = { ...ihsg, price: parseFloat((ihsg.price / 5.42).toFixed(2)) };
          } else {
            console.error('Failed to fetch Kompas100, using dummy data');
            quote = { price: 1132.4, changePct: -0.89, sparkline: [], volume: 0 } as any;
          }
        }
      } else {
        quote = await fetchYahooQuote(idx.symbol);
      }

      return {
        ...idx,
        price: quote?.price || 0,
        changePct: quote?.changePct || 0,
        sparkline: quote?.sparkline || [],
        volume: quote?.volume || 0
      };
    })
  );

  // 2. Fetch sector stocks in batches
  const allSectorStocks = IDX_SECTORS.flatMap(s => s.stocks);
  const uniqueStocks = Array.from(new Set(allSectorStocks));

  // Fetch in chunks of 8
  const stockQuotes: Record<string, any> = {};
  for (let i = 0; i < uniqueStocks.length; i += 8) {
    const chunk = uniqueStocks.slice(i, i + 8);
    const results = await Promise.all(chunk.map(s => fetchQuoteSimple(s)));
    results.forEach((r, idx) => {
      if (r) stockQuotes[chunk[idx]] = r;
    });
  }

  // Build sector heatmap
  const sectorHeatmap = IDX_SECTORS.map(sector => {
    const stocksData = sector.stocks
      .map(s => stockQuotes[s])
      .filter(Boolean);

    const totalMcap = stocksData.reduce((sum, s) => sum + (s.marketCap || 0), 0);
    const avgChange = stocksData.length > 0
      ? stocksData.reduce((sum, s) => sum + s.changePct, 0) / stocksData.length
      : 0;

    return {
      sector: sector.sector,
      color: sector.color,
      changePct: parseFloat(avgChange.toFixed(2)),
      marketCap: totalMcap,
      stocks: stocksData.map(s => ({
        symbol: s.symbol.replace('.JK', ''),
        changePct: s.changePct,
        marketCap: s.marketCap
      }))
    };
  });

  // 3. Fetch breadth data in batches
  const breadthQuotes: any[] = [];
  for (let i = 0; i < BREADTH_STOCKS.length; i += 10) {
    const chunk = BREADTH_STOCKS.slice(i, i + 10);
    const results = await Promise.all(chunk.map(s => fetchQuoteSimple(s)));
    results.forEach(r => { if (r) breadthQuotes.push(r); });
  }

  const advancing = breadthQuotes.filter(s => s.changePct > 0.1).length;
  const declining = breadthQuotes.filter(s => s.changePct < -0.1).length;
  const unchanged = breadthQuotes.length - advancing - declining;

  return {
    timestamp: new Date().toISOString(),
    indices: indicesData,
    sectorHeatmap: sectorHeatmap.sort((a, b) => b.marketCap - a.marketCap),
    breadth: {
      total: breadthQuotes.length,
      advancing,
      declining,
      unchanged,
      advanceDeclineRatio: declining > 0 ? parseFloat((advancing / declining).toFixed(2)) : advancing,
      topGainers: [...breadthQuotes].sort((a, b) => b.changePct - a.changePct).slice(0, 10).map(s => ({
        symbol: s.symbol.replace('.JK', ''),
        changePct: s.changePct,
        price: s.price
      })),
      topLosers: [...breadthQuotes].sort((a, b) => a.changePct - b.changePct).slice(0, 10).map(s => ({
        symbol: s.symbol.replace('.JK', ''),
        changePct: s.changePct,
        price: s.price
      })),
      topVolume: [...breadthQuotes].sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 10).map(s => ({
        symbol: s.symbol.replace('.JK', ''),
        volume: s.volume || 0
      })),
      topValue: [...breadthQuotes].sort((a, b) => ((b.volume || 0) * (b.price || 0)) - ((a.volume || 0) * (a.price || 0))).slice(0, 10).map(s => ({
        symbol: s.symbol.replace('.JK', ''),
        value: (s.volume || 0) * (s.price || 0)
      })),
      // topFreq & netForeign SEBELUMNYA ada di sini berisi Math.random() murni (komentar
      // asli "Mock frequency") dan tidak pernah ditampilkan di UI manapun - dihapus,
      // bukan disimpan sebagai data palsu yang berisiko suatu saat dipakai tanpa sadar.
      // Data frekuensi transaksi & net foreign flow riil butuh feed data broker IDX
      // yang tidak tersedia gratis lewat Yahoo Finance.
    }
  };
}

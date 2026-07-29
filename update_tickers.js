const fs = require('fs');

const body = {
  filter: [
    { left: "market_cap_basic", operation: "egreater", right: 500000000000 }
  ],
  options: { lang: "en" },
  markets: ["indonesia"],
  symbols: { query: { types: [] }, tickers: [] },
  columns: ["name"],
  sort: { sortBy: "market_cap_basic", sortOrder: "desc" },
  range: [0, 1000]
};

fetch('https://scanner.tradingview.com/indonesia/scan', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
})
.then(r => r.json())
.then(data => {
  const tickers = data.data.map(d => d.d[0]).sort();
  console.log(`Successfully fetched ${tickers.length} tickers from TradingView.`);
  
  const content = `export const TICKERS = [\n  ${tickers.map(t => `'${t}.JK'`).join(', ')}\n];\n`;
  fs.writeFileSync('lib/tickers.ts', content);
  console.log('Successfully updated lib/tickers.ts');
})
.catch(console.error);

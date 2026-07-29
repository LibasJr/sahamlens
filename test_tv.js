const body = {
  filter: [
    { left: "market_cap_basic", operation: "egreater", right: 500000000000 }
  ],
  options: { lang: "en" },
  markets: ["indonesia"],
  symbols: { query: { types: [] }, tickers: [] },
  columns: ["name", "market_cap_basic"],
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
  console.log(`Found ${data.totalCount} tickers`);
  console.log(data.data.slice(0, 5).map(d => d.d[0]));
})
.catch(console.error);

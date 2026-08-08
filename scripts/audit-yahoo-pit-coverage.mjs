import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

const tickers = [
  'TPIA','BMRI','BRPT','DSSA','AMMN','ANTM','CUAN','DEWA','BRMS','BREN',
  'BBNI','MDKA','TINS','RAJA','AMRT','UNTR','ADRO','BULL','ENRG','INCO',
  'MAPI','MBMA','MEDC','KLBF','ESSA','INDY','NCKL','INKP','PGAS','ADMR',
  'WIFI','ITMG','PTBA','CPIN','JPFA','ISAT','TAPG','BRIS','UNVR','AKRA',
  'DGWG'
];

const targets = [
  '2024-09-30',
  '2024-12-31',
  '2025-03-31',
  '2025-06-30'
];

for (const code of tickers) {
  const ticker = `${code}.JK`;

  try {
    const rows = await yahooFinance.fundamentalsTimeSeries(ticker, {
      period1: new Date("2023-01-01"),
      period2: new Date("2025-08-01"),
      type: "quarterly",
      module: "all",
    });

    const dates = new Set(
      rows.map(x => x.date?.toISOString?.().slice(0, 10)).filter(Boolean)
    );

    const coverage = targets.map(d => dates.has(d) ? "Y" : "-").join(" ");

    console.log(
      `${code.padEnd(5)} | ${coverage} | rows=${rows.length}`
    );
  } catch (err) {
    console.log(`${code.padEnd(5)} | ERROR | ${err?.message ?? err}`);
  }

  await new Promise(r => setTimeout(r, 250));
}

console.log("");
console.log("Kolom: Q3-2024 Q4-2024 Q1-2025 Q2-2025");

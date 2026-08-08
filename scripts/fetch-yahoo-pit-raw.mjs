import fs from "node:fs";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

const tickers = [
  'TPIA','BMRI','BRPT','DSSA','AMMN','ANTM','CUAN','DEWA','BRMS','BREN',
  'BBNI','MDKA','TINS','RAJA','AMRT','UNTR','ADRO','BULL','ENRG','INCO',
  'MAPI','MBMA','MEDC','KLBF','ESSA','INDY','NCKL','INKP','PGAS','ADMR',
  'WIFI','ITMG','PTBA','CPIN','JPFA','ISAT','TAPG','BRIS','UNVR','AKRA',
  'DGWG'
];

const targets = new Set([
  '2024-12-31',
  '2025-03-31',
  '2025-06-30'
]);

function csv(v) {
  if (v == null) return '';
  return `"${String(v).replaceAll('"','""')}"`;
}

const out = [];

for (const code of tickers) {
  try {
    const rows = await yahooFinance.fundamentalsTimeSeries(`${code}.JK`, {
      period1: new Date("2024-01-01"),
      period2: new Date("2025-08-01"),
      type: "quarterly",
      module: "all",
    });

    for (const x of rows) {
      const periodEnd = x.date?.toISOString?.().slice(0,10);
      if (!targets.has(periodEnd)) continue;

      out.push({
        ticker: code,
        period_end: periodEnd,
        total_revenue: x.totalRevenue ?? null,
        net_income: x.netIncome ?? null,
        stockholders_equity: x.stockholdersEquity ?? null,
        total_assets: x.totalAssets ?? null,
        total_liabilities: x.totalLiabilitiesNetMinorityInterest ?? null,
        total_debt: x.totalDebt ?? null,
        current_assets: x.currentAssets ?? null,
        current_liabilities: x.currentLiabilities ?? null,
        ordinary_shares: x.ordinarySharesNumber ?? null,
        basic_eps: x.basicEPS ?? null,
        source: 'Yahoo fundamentalsTimeSeries'
      });
    }

    console.log(`${code}: OK`);
  } catch (e) {
    console.log(`${code}: ERROR ${e?.message ?? e}`);
  }

  await new Promise(r => setTimeout(r, 250));
}

out.sort((a,b) =>
  a.ticker.localeCompare(b.ticker) ||
  a.period_end.localeCompare(b.period_end)
);

const headers = Object.keys(out[0] ?? {});

const text = [
  headers.join(','),
  ...out.map(row => headers.map(h => csv(row[h])).join(','))
].join('\n');

fs.writeFileSync(
  'data/financials/yahoo-pit-raw-41-q4-q2.csv',
  text,
  'utf8'
);

console.log('');
console.log(`RAW rows: ${out.length}`);
console.log(`Tickers : ${new Set(out.map(x => x.ticker)).size}`);
console.log('File    : data/financials/yahoo-pit-raw-41-q4-q2.csv');

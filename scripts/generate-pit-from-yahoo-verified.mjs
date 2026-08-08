import fs from "node:fs";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"]
});

const mappingFile = "data/financials/pit-observed-date-41.csv";
const outputFile = "data/financials/pit-batch-41-verified-generated.csv";

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const headers = lines.shift().split(",").map(x => x.replace(/^"|"$/g, "").trim());

  return lines.filter(Boolean).map(line => {
    const parts = [];
    let cur = "", quoted = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) {
        parts.push(cur);
        cur = "";
      } else cur += ch;
    }
    parts.push(cur);

    return Object.fromEntries(
      headers.map((h, i) => [h, (parts[i] ?? "").replace(/^"|"$/g, "").trim()])
    );
  });
}

function csv(v) {
  if (v == null || Number.isNaN(v)) return "";
  return `"${String(v).replaceAll('"', '""')}"`;
}

function round(v, n = 2) {
  if (!Number.isFinite(v)) return null;
  const f = 10 ** n;
  return Math.round(v * f) / f;
}

function dateKey(v) {
  return v?.toISOString?.().slice(0, 10);
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getPriceOnOrBefore(ticker, observedDate) {
  const result = await yahooFinance.chart(ticker, {
    period1: addDays(observedDate, -45),
    period2: addDays(observedDate, 1),
    interval: "1d"
  });

  const valid = result.quotes
    .filter(q =>
      q.close != null &&
      dateKey(q.date) <= observedDate
    )
    .sort((a, b) => b.date - a.date);

  return valid[0]
    ? {
        date: dateKey(valid[0].date),
        close: valid[0].close
      }
    : null;
}

async function getFxOnOrBefore(fromCurrency, toCurrency, observedDate) {
  if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) {
    return {
      rate: 1,
      date: observedDate,
      symbol: null
    };
  }

  // Contoh USD -> IDR memakai USDIDR=X
  const directSymbol = `${fromCurrency}${toCurrency}=X`;

  try {
    const result = await yahooFinance.chart(directSymbol, {
      period1: addDays(observedDate, -45),
      period2: addDays(observedDate, 1),
      interval: "1d"
    });

    const valid = result.quotes
      .filter(q =>
        q.close != null &&
        Number.isFinite(q.close) &&
        dateKey(q.date) <= observedDate
      )
      .sort((a, b) => b.date - a.date);

    if (valid[0]) {
      return {
        rate: valid[0].close,
        date: dateKey(valid[0].date),
        symbol: directSymbol
      };
    }
  } catch {}

  // Fallback pasangan terbalik
  const reverseSymbol = `${toCurrency}${fromCurrency}=X`;

  try {
    const result = await yahooFinance.chart(reverseSymbol, {
      period1: addDays(observedDate, -45),
      period2: addDays(observedDate, 1),
      interval: "1d"
    });

    const valid = result.quotes
      .filter(q =>
        q.close != null &&
        Number.isFinite(q.close) &&
        q.close !== 0 &&
        dateKey(q.date) <= observedDate
      )
      .sort((a, b) => b.date - a.date);

    if (valid[0]) {
      return {
        rate: 1 / valid[0].close,
        date: dateKey(valid[0].date),
        symbol: reverseSymbol
      };
    }
  } catch {}

  return null;
}
const mapping = parseCsv(fs.readFileSync(mappingFile, "utf8"));

const byTicker = new Map();
for (const row of mapping) {
  if (!byTicker.has(row.ticker)) byTicker.set(row.ticker, []);
  byTicker.get(row.ticker).push(row);
}

const output = [];

for (const [code, requestedRows] of byTicker) {
  const ticker = `${code}.JK`;

  console.log(`\n${ticker}`);

  try {
    // JENDELA INI SENGAJA DIPATOK DEKAT PERIODE TARGET, JANGAN DIGANTI KE new Date().
    //
    // Empiris (yahoo-finance2 v4, 2026-08-08): fundamentalsTimeSeries hanya MENGISI
    // nilai untuk ~4 periode terakhir relatif ke period2. Kalau period2 digeser jauh ke
    // depan (mis. hari ini), baris tanggal untuk kuartal lama TETAP dikembalikan tetapi
    // seluruh field-nya kosong - totalRevenue/stockholdersEquity hilang tanpa error.
    // Efeknya senyap: metrik jadi null dan coverage turun, bukan gagal keras. Terbukti
    // pada RAJA/INKP/WIFI untuk period_end 2025-03-31.
    //
    // Tanggal di bawah cocok untuk batch 41 (target s/d Q2 2025). Untuk periode yang
    // lebih baru, geser period2 ke sekitar period_end target + ~120 hari - jangan ke
    // hari ini. scripts/generate-pit-from-yahoo.mjs menurunkannya otomatis dari
    // worklist dan melaporkan baris yang sumbernya tidak lengkap.
    const [annualRows, quarterlyRows, currencyInfo] = await Promise.all([
      yahooFinance.fundamentalsTimeSeries(ticker, {
        period1: new Date("2023-01-01"),
        period2: new Date("2025-04-01"),
        type: "annual",
        module: "all"
      }),

      yahooFinance.fundamentalsTimeSeries(ticker, {
        period1: new Date("2024-01-01"),
        period2: new Date("2025-08-01"),
        type: "quarterly",
        module: "all"
      }),

      yahooFinance.quoteSummary(ticker, {
        modules: ["price", "financialData"]
      })
    ]);

    const priceCurrency = currencyInfo?.price?.currency ?? null;
    const financialCurrency =
      currencyInfo?.financialData?.financialCurrency ??
      priceCurrency ??
      null;

    console.log(
      `  currency price=${priceCurrency ?? "?"} financial=${financialCurrency ?? "?"}`
    );

    const annual = new Map(
      annualRows.map(x => [dateKey(x.date), x])
    );

    const quarterly = new Map(
      quarterlyRows.map(x => [dateKey(x.date), x])
    );

    for (const mapRow of requestedRows) {
      const period = mapRow.period_end;
      const observedDate = mapRow.observed_date;

      let balance;
      let netIncomeYtd = null;
      let revenueYtd = null;
      let revenueGrowth = null;

      // FY2024: WAJIB annual 12M
      if (period === "2024-12-31") {
        const fy = annual.get("2024-12-31");
        const prev = annual.get("2023-12-31");

        if (!fy || fy.periodType !== "12M") {
          console.log(`  ${period}: SKIP - annual 12M tidak tersedia`);
          continue;
        }

        balance = fy;
        netIncomeYtd = fy.netIncome ?? null;
        revenueYtd = fy.totalRevenue ?? null;

        if (
          Number.isFinite(fy.totalRevenue) &&
          Number.isFinite(prev?.totalRevenue) &&
          prev.totalRevenue !== 0
        ) {
          revenueGrowth =
            ((fy.totalRevenue - prev.totalRevenue) / Math.abs(prev.totalRevenue)) * 100;
        }
      }

      // Q1 2025: standalone Q1 = YTD Q1
      else if (period === "2025-03-31") {
        const q1 = quarterly.get("2025-03-31");

        if (!q1) {
          console.log(`  ${period}: SKIP - Q1 tidak tersedia`);
          continue;
        }

        balance = q1;
        netIncomeYtd = q1.netIncome ?? null;
        revenueYtd = q1.totalRevenue ?? null;

        // YoY Q1 2024 tidak tersedia secara terpercaya dari endpoint ini.
        revenueGrowth = null;
      }

      // Q2 2025: P&L harus Q1 + Q2
      else if (period === "2025-06-30") {
        const q1 = quarterly.get("2025-03-31");
        const q2 = quarterly.get("2025-06-30");

        if (!q1 || !q2) {
          console.log(`  ${period}: SKIP - Q1/Q2 tidak lengkap`);
          continue;
        }

        balance = q2;

        if (Number.isFinite(q1.netIncome) && Number.isFinite(q2.netIncome)) {
          netIncomeYtd = q1.netIncome + q2.netIncome;
        }

        if (Number.isFinite(q1.totalRevenue) && Number.isFinite(q2.totalRevenue)) {
          revenueYtd = q1.totalRevenue + q2.totalRevenue;
        }

        // Tidak ada comparator H1 2024 yang tervalidasi.
        revenueGrowth = null;
      } else {
        console.log(`  ${period}: SKIP - periode tidak didukung generator ini`);
        continue;
      }

      const equity =
        balance.stockholdersEquity ??
        balance.commonStockEquity ??
        null;

      const liabilities =
        balance.totalLiabilitiesNetMinorityInterest ??
        null;

      const shares =
        balance.ordinarySharesNumber ??
        balance.dilutedAverageShares ??
        balance.basicAverageShares ??
        null;

      const currentAssets = balance.currentAssets ?? null;
      const currentLiabilities = balance.currentLiabilities ?? null;

      const roe =
        Number.isFinite(netIncomeYtd) &&
        Number.isFinite(equity) &&
        equity > 0
          ? (netIncomeYtd / equity) * 100
          : null;

      // Sesuai pilot: liabilities / equity, BUKAN totalDebt / equity.
      const der =
        Number.isFinite(liabilities) &&
        Number.isFinite(equity) &&
        equity > 0
          ? liabilities / equity
          : null;

      const currentRatio =
        Number.isFinite(currentAssets) &&
        Number.isFinite(currentLiabilities) &&
        currentLiabilities !== 0
          ? currentAssets / currentLiabilities
          : null;
      const priceInfo = await getPriceOnOrBefore(ticker, observedDate);

      let priceInFinancialCurrency = priceInfo?.close ?? null;
      let fxInfo = null;

      if (
        priceInfo &&
        priceCurrency &&
        financialCurrency &&
        priceCurrency !== financialCurrency
      ) {
        fxInfo = await getFxOnOrBefore(
          financialCurrency,
          priceCurrency,
          observedDate
        );

        if (fxInfo?.rate && fxInfo.rate > 0) {
          // USDIDR=X berarti IDR per USD.
          // Harga saham IDR dibagi kurs => harga dalam USD.
          priceInFinancialCurrency = priceInfo.close / fxInfo.rate;
        } else {
          priceInFinancialCurrency = null;
        }
      }

      let per = null;
      let pbv = null;

      if (
        Number.isFinite(priceInFinancialCurrency) &&
        Number.isFinite(shares) &&
        shares > 0 &&
        Number.isFinite(netIncomeYtd) &&
        netIncomeYtd > 0
      ) {
        const epsYtd = netIncomeYtd / shares;

        if (epsYtd > 0) {
          per = priceInFinancialCurrency / epsYtd;
        }
      }

      if (
        Number.isFinite(priceInFinancialCurrency) &&
        Number.isFinite(shares) &&
        shares > 0 &&
        Number.isFinite(equity) &&
        equity > 0
      ) {
        const bvps = equity / shares;

        if (bvps > 0) {
          pbv = priceInFinancialCurrency / bvps;
        }
      }


      output.push({
        ticker: code,
        observed_date: observedDate,
        period_end: period,
        per: round(per),
        pbv: round(pbv),
        roe: round(roe),
        der: round(der),
        current_ratio: round(currentRatio),
        revenue_growth: round(revenueGrowth),
        source:
          `Yahoo fundamentalsTimeSeries (${financialCurrency ?? "?"}) + Yahoo historical close ${priceInfo?.date ?? "N/A"} (${priceCurrency ?? "?"})${fxInfo ? ` + FX ${fxInfo.symbol}@${fxInfo.date}` : ""}; observed_date verified: ${mapRow.publication_source}`
      });

      console.log(
        `  ${period} asof=${observedDate} price=${priceInfo?.close ?? "N/A"} ROE=${round(roe)} DER=${round(der)} PER=${round(per)} PBV=${round(pbv)}`
      );

      await new Promise(r => setTimeout(r, 150));
    }
  } catch (err) {
    console.log(`  ERROR: ${err?.message ?? err}`);
  }

  await new Promise(r => setTimeout(r, 250));
}

output.sort(
  (a, b) =>
    a.ticker.localeCompare(b.ticker) ||
    a.period_end.localeCompare(b.period_end)
);

const headers = [
  "ticker",
  "observed_date",
  "period_end",
  "per",
  "pbv",
  "roe",
  "der",
  "current_ratio",
  "revenue_growth",
  "source"
];

const text = [
  headers.join(","),
  ...output.map(row =>
    headers.map(h => csv(row[h])).join(",")
  )
].join("\n");

fs.writeFileSync(outputFile, text, "utf8");

console.log("");
console.log(`Generated rows : ${output.length}`);
console.log(`Tickers        : ${new Set(output.map(x => x.ticker)).size}`);
console.log(`Output         : ${outputFile}`);



import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();

const PILOT = [
  "ASII", "BBCA", "BBRI", "TLKM", "STAA",
  "AUTO", "BFIN", "GJTL", "INDF", "ICBP",
];

const TARGET_PERIODS = [
  "2024-09-30",
  "2024-12-31",
  "2025-03-31",
  "2025-06-30",
];

function installTsHook() {
  const ts = require("typescript");

  const prevTs = Module._extensions[".ts"];
  const prevResolve = Module._resolveFilename;

  Module._resolveFilename = function (
    request,
    parent,
    isMain,
    options
  ) {
    if (
      typeof request === "string" &&
      request.startsWith("@/")
    ) {
      return prevResolve.call(
        this,
        path.join(repoRoot, request.slice(2)),
        parent,
        isMain,
        options
      );
    }

    return prevResolve.call(
      this,
      request,
      parent,
      isMain,
      options
    );
  };

  Module._extensions[".ts"] = function (
    module,
    filename
  ) {
    const source = fs.readFileSync(filename, "utf8");

    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
      },
      fileName: filename,
    });

    module._compile(output.outputText, filename);
  };

  return () => {
    Module._resolveFilename = prevResolve;

    if (prevTs) {
      Module._extensions[".ts"] = prevTs;
    } else {
      delete Module._extensions[".ts"];
    }
  };
}

function val(row, ...keys) {
  for (const key of keys) {
    if (
      row &&
      Object.prototype.hasOwnProperty.call(row, key)
    ) {
      return row[key];
    }
  }

  return null;
}

function ymd(value) {
  if (value == null) return null;

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const str = String(value);

  const match = str.match(
    /^(\d{4}-\d{2}-\d{2})/
  );

  return match ? match[1] : str;
}

function normalizeTicker(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/\.JK$/, "");
}

function numberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  console.log("");
  console.log("==========================================");
  console.log(" SAHAMLENS FUNDAMENTAL PIT PILOT AUDIT");
  console.log(" READ ONLY - DATABASE TIDAK DIUBAH");
  console.log("==========================================");
  console.log("");

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL tidak ditemukan. " +
      "Jalankan dengan --env-file=.env.local"
    );
  }

  const restore = installTsHook();

  try {
    const { pool } = require(
      path.join(
        repoRoot,
        "shared/database/postgres.client.ts"
      )
    );

    const {
      auditFundamentalHistoryCounts,
    } = require(
      path.join(
        repoRoot,
        "modules/fundamental/repository/" +
        "fundamental-history.repository.ts"
      )
    );

    if (
      typeof auditFundamentalHistoryCounts ===
      "function"
    ) {
      const counts =
        await auditFundamentalHistoryCounts();

      console.log("=== DATABASE COUNTS ===");
      console.log(counts);
      console.log("");
    }

    /*
     * Baca langsung dari DB.
     * READ ONLY: hanya SELECT.
     */
    const { rows: rawRows } = await pool.query(
      `
  SELECT
    ticker,
    observed_date,
    period_end,
    per,
    pbv,
    roe,
    der,
    current_ratio,
    revenue_growth,
    source
  FROM fundamental_history
  WHERE period_end = ANY($1::date[])
  ORDER BY ticker, period_end, observed_date
  `,
      [TARGET_PERIODS]
    );

    console.log("=== RAW TICKER DI TARGET PERIOD ===");

    const rawTickers = [
      ...new Set(
        rawRows.map(row => String(row.ticker))
      )
    ];

    console.log(rawTickers);
    console.log(
      `Raw rows target periods: ${rawRows.length}`
    );
    console.log("");

    const allRows = rawRows
      .filter(row =>
        PILOT.includes(
          normalizeTicker(row.ticker)
        )
      )
      .map(row => ({
        ticker: normalizeTicker(row.ticker),

        rawTicker: String(row.ticker),

        observedDate: ymd(
          row.observed_date
        ),

        periodEnd: ymd(
          row.period_end
        ),

        per: numberOrNull(row.per),
        pbv: numberOrNull(row.pbv),
        roe: numberOrNull(row.roe),
        der: numberOrNull(row.der),

        currentRatio: numberOrNull(
          row.current_ratio
        ),

        revenueGrowth: numberOrNull(
          row.revenue_growth
        ),

        source: row.source,
      }));

    allRows.sort((a, b) =>
      a.ticker.localeCompare(b.ticker) ||
      String(a.periodEnd).localeCompare(
        String(b.periodEnd)
      )
    );

    let errors = 0;
    let warnings = 0;

    console.log("=== COVERAGE ===");

    for (const ticker of PILOT) {
      const rows = allRows.filter(
        r => r.ticker === ticker
      );

      const found = new Set(
        rows.map(r => r.periodEnd)
      );

      const status = TARGET_PERIODS.map(
        p =>
          `${p}:${found.has(p) ? "OK" : "MISS"
          }`
      );

      console.log(
        `${ticker.padEnd(5)} ` +
        `${rows.length}/4  ` +
        status.join("  ")
      );

      for (const period of TARGET_PERIODS) {
        if (!found.has(period)) {
          warnings++;
        }
      }
    }

    console.log("");
    console.log("=== ROW COUNT ===");
    console.log(
      `Rows ditemukan: ${allRows.length}`
    );
    console.log(
      "Expected pilot saat ini: 39"
    );

    if (allRows.length !== 39) {
      console.log(
        `ERROR: jumlah row ${allRows.length}, expected 39.`
      );
      errors++;
    } else {
      console.log(
        "OK: jumlah row sesuai pilot 39."
      );
    }

    console.log("");
    console.log("=== DUPLICATE CHECK ===");

    const byPeriod = new Map();
    const byObserved = new Map();

    for (const row of allRows) {
      const k1 =
        `${row.ticker}|${row.periodEnd}`;

      const k2 =
        `${row.ticker}|${row.observedDate}`;

      byPeriod.set(
        k1,
        (byPeriod.get(k1) ?? 0) + 1
      );

      byObserved.set(
        k2,
        (byObserved.get(k2) ?? 0) + 1
      );
    }

    const dupPeriod = [
      ...byPeriod.entries(),
    ].filter(([, count]) => count > 1);

    const dupObserved = [
      ...byObserved.entries(),
    ].filter(([, count]) => count > 1);

    if (
      dupPeriod.length === 0 &&
      dupObserved.length === 0
    ) {
      console.log(
        "OK: tidak ada duplicate."
      );
    }

    for (const [key, count] of dupPeriod) {
      console.log(
        `ERROR duplicate ticker+period: ` +
        `${key} (${count})`
      );

      errors++;
    }

    for (
      const [key, count] of dupObserved
    ) {
      console.log(
        `ERROR duplicate ticker+observed: ` +
        `${key} (${count})`
      );

      errors++;
    }

    console.log("");
    console.log("=== LOOK-AHEAD CHECK ===");

    let chronologyErrors = 0;

    for (const row of allRows) {
      if (
        !row.observedDate ||
        !row.periodEnd
      ) {
        console.log(
          `ERROR ${row.ticker}: ` +
          "tanggal PIT kosong."
        );

        errors++;
        chronologyErrors++;
        continue;
      }

      if (
        row.observedDate <
        row.periodEnd
      ) {
        console.log(
          `ERROR ${row.ticker} ` +
          `${row.periodEnd}: ` +
          `observed=${row.observedDate}`
        );

        errors++;
        chronologyErrors++;
      }
    }

    if (chronologyErrors === 0) {
      console.log(
        "OK: semua observed_date >= period_end."
      );
    }

    console.log("");
    console.log("=== NULL CHECK ===");

    const metricNames = [
      ["PER", "per"],
      ["PBV", "pbv"],
      ["ROE", "roe"],
      ["DER", "der"],
      [
        "CURRENT_RATIO",
        "currentRatio",
      ],
      [
        "REVENUE_GROWTH",
        "revenueGrowth",
      ],
    ];

    for (
      const [label, key] of metricNames
    ) {
      const populated =
        allRows.filter(
          r =>
            r[key] !== null &&
            r[key] !== undefined
        ).length;

      console.log(
        `${label.padEnd(16)} ` +
        `${populated}/${allRows.length} terisi`
      );
    }

    const noSource =
      allRows.filter(
        r =>
          !r.source ||
          !String(r.source).trim()
      );

    console.log(
      `SOURCE           ` +
      `${allRows.length - noSource.length}/` +
      `${allRows.length} terisi`
    );

    if (noSource.length) {
      console.log(
        `WARNING: ${noSource.length} ` +
        "row source kosong."
      );

      warnings++;
    }

    console.log("");
    console.log("=== SANITY CHECK ===");

    for (const row of allRows) {
      /*
       * Threshold ini bukan scoring.
       * Hanya mendeteksi kesalahan skala/data.
       */

      if (
        row.roe !== null &&
        (
          row.roe < -200 ||
          row.roe > 200
        )
      ) {
        console.log(
          `WARNING ${row.ticker} ` +
          `${row.periodEnd}: ` +
          `ROE=${row.roe}`
        );

        warnings++;
      }

      if (
        row.revenueGrowth !== null &&
        (
          row.revenueGrowth < -500 ||
          row.revenueGrowth > 500
        )
      ) {
        console.log(
          `WARNING ${row.ticker} ` +
          `${row.periodEnd}: ` +
          `growth=${row.revenueGrowth}`
        );

        warnings++;
      }

      if (
        row.pbv !== null &&
        Math.abs(row.pbv) > 50
      ) {
        console.log(
          `WARNING ${row.ticker} ` +
          `${row.periodEnd}: ` +
          `PBV=${row.pbv}`
        );

        warnings++;
      }

      if (
        row.der !== null &&
        (
          row.der < 0 ||
          row.der > 30
        )
      ) {
        console.log(
          `WARNING ${row.ticker} ` +
          `${row.periodEnd}: ` +
          `DER=${row.der}`
        );

        warnings++;
      }
    }

    console.log(
      "Sanity threshold selesai."
    );

    console.log("");
    console.log("=== DETAIL PILOT ===");

    for (const row of allRows) {
      console.log(
        `${row.ticker.padEnd(5)} ` +
        `period=${row.periodEnd} ` +
        `observed=${row.observedDate} ` +
        `PER=${row.per ?? "null"} ` +
        `PBV=${row.pbv ?? "null"} ` +
        `ROE=${row.roe ?? "null"} ` +
        `DER=${row.der ?? "null"} ` +
        `CR=${row.currentRatio ?? "null"
        } ` +
        `RG=${row.revenueGrowth ?? "null"
        }`
      );
    }

    console.log("");
    console.log("==============================");
    console.log(" AUDIT SUMMARY");
    console.log("==============================");
    console.log(
      `rows=${allRows.length}`
    );
    console.log(
      `errors=${errors}`
    );
    console.log(
      `warnings=${warnings}`
    );

    if (errors === 0) {
      console.log("");
      console.log(
        "RESULT: PASS WITH REVIEW"
      );
    } else {
      console.log("");
      console.log(
        "RESULT: FAIL"
      );

      process.exitCode = 2;
    }
  } finally {
    restore();
  }
}

main().catch(error => {
  console.error("");
  console.error("[PIT AUDIT] ERROR:");
  console.error(error);

  process.exitCode = 1;
});
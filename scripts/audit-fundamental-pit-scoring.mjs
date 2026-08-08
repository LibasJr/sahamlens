import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();

const PILOT = new Set([
  "ASII.JK",
  "BBCA.JK",
  "BBRI.JK",
  "TLKM.JK",
  "STAA.JK",
  "AUTO.JK",
  "BFIN.JK",
  "GJTL.JK",
  "INDF.JK",
  "ICBP.JK",
]);

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

function ymd(value) {
  if (value == null) return null;

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  if (value instanceof Date) {
    return [
      value.getUTCFullYear(),
      String(value.getUTCMonth() + 1).padStart(2, "0"),
      String(value.getUTCDate()).padStart(2, "0"),
    ].join("-");
  }

  return String(value).slice(0, 10);
}

function approx(a, b, tolerance = 0.011) {
  return (
    typeof a === "number" &&
    typeof b === "number" &&
    Math.abs(a - b) <= tolerance
  );
}

function parsePercent(text) {
  if (typeof text !== "string") return null;

  const n = Number(
    text
      .replace("%", "")
      .replace("x", "")
      .trim()
  );

  return Number.isFinite(n) ? n : null;
}

async function main() {
  console.log("");
  console.log("==============================================");
  console.log(" SAHAMLENS FUNDAMENTAL PIT SCORING AUDIT");
  console.log(" READ ONLY - DATABASE TIDAK DIUBAH");
  console.log("==============================================");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL tidak ditemukan.");
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
      analyzePe,
      analyzePbv,
      analyzeRoe,
      analyzeRoa,
      analyzeDer,
      analyzeCurrentRatio,
      analyzeQuickRatio,
      analyzeDividend,
      analyzeEpsGrowth,
      analyzeRevenueGrowth,
      analyzeGrossMargin,
      analyzeOperatingMargin,
      analyzeNetMargin,
      computeFundamentalQuality,
    } = require(
      path.join(
        repoRoot,
        "modules/fundamental/index.ts"
      )
    );

    const {
      fundamentalPitToAnalyzerPayload,
    } = require(
      path.join(
        repoRoot,
        "modules/fundamental/service/fundamental-pit-adapter.ts"
      )
    );

    const { rows } = await pool.query(
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
        revenue_growth
      FROM fundamental_history
      WHERE period_end = ANY($1::date[])
      ORDER BY ticker, period_end, observed_date
      `,
      [TARGET_PERIODS]
    );

    const pilotRows = rows.filter(row =>
      PILOT.has(String(row.ticker))
    );

    if (pilotRows.length !== 39) {
      throw new Error(
        `Expected 39 PIT row, ditemukan ${pilotRows.length}`
      );
    }

    let passed = 0;
    let failed = 0;
    let scaleErrors = 0;
    let leakageErrors = 0;

    console.log("");
    console.log("=== SCORING TEST ===");

    for (const raw of pilotRows) {
      const pit = {
        ticker: String(raw.ticker),
        observedDate: ymd(raw.observed_date),
        periodEnd: ymd(raw.period_end),
        per: raw.per == null ? null : Number(raw.per),
        pbv: raw.pbv == null ? null : Number(raw.pbv),
        roe: raw.roe == null ? null : Number(raw.roe),
        der: raw.der == null ? null : Number(raw.der),
        currentRatio:
          raw.current_ratio == null
            ? null
            : Number(raw.current_ratio),
        revenueGrowth:
          raw.revenue_growth == null
            ? null
            : Number(raw.revenue_growth),
      };

      const payload =
        fundamentalPitToAnalyzerPayload(pit);

      const results = [
        analyzePe(payload),
        analyzePbv(payload),
        analyzeRoe(payload),
        analyzeRoa(payload),
        analyzeDer(payload),
        analyzeCurrentRatio(payload),
        analyzeQuickRatio(payload),
        analyzeDividend(payload),
        analyzeEpsGrowth(payload),
        analyzeRevenueGrowth(payload),
        analyzeGrossMargin(payload),
        analyzeOperatingMargin(payload),
        analyzeNetMargin(payload),
      ];

      const [
        pe,
        pbv,
        roe,
        roa,
        der,
        currentRatio,
        quickRatio,
        dividend,
        epsGrowth,
        revenueGrowth,
        grossMargin,
        operatingMargin,
        netMargin,
      ] = results;

      let rowFailed = false;

      // ---------- SCALE CHECK ----------

      if (
        pit.per != null &&
        !approx(parsePercent(pe.value), pit.per)
      ) {
        console.log(
          `FAIL SCALE ${pit.ticker} ${pit.periodEnd} ` +
          `PER expected=${pit.per} got=${pe.value}`
        );

        scaleErrors++;
        rowFailed = true;
      }

      if (
        pit.pbv != null &&
        !approx(parsePercent(pbv.value), pit.pbv)
      ) {
        console.log(
          `FAIL SCALE ${pit.ticker} ${pit.periodEnd} ` +
          `PBV expected=${pit.pbv} got=${pbv.value}`
        );

        scaleErrors++;
        rowFailed = true;
      }

      if (
        pit.roe != null &&
        !approx(parsePercent(roe.value), pit.roe)
      ) {
        console.log(
          `FAIL SCALE ${pit.ticker} ${pit.periodEnd} ` +
          `ROE expected=${pit.roe}% got=${roe.value}`
        );

        scaleErrors++;
        rowFailed = true;
      }

      if (
        pit.der != null &&
        !approx(parsePercent(der.value), pit.der)
      ) {
        console.log(
          `FAIL SCALE ${pit.ticker} ${pit.periodEnd} ` +
          `DER expected=${pit.der}x got=${der.value}`
        );

        scaleErrors++;
        rowFailed = true;
      }

      if (
        pit.currentRatio != null &&
        !approx(
          parsePercent(currentRatio.value),
          pit.currentRatio
        )
      ) {
        console.log(
          `FAIL SCALE ${pit.ticker} ${pit.periodEnd} ` +
          `CR expected=${pit.currentRatio} got=${currentRatio.value}`
        );

        scaleErrors++;
        rowFailed = true;
      }

      if (
        pit.revenueGrowth != null &&
        !approx(
          parsePercent(revenueGrowth.value),
          pit.revenueGrowth
        )
      ) {
        console.log(
          `FAIL SCALE ${pit.ticker} ${pit.periodEnd} ` +
          `RG expected=${pit.revenueGrowth}% got=${revenueGrowth.value}`
        );

        scaleErrors++;
        rowFailed = true;
      }

      // ---------- FUTURE / CURRENT DATA LEAK CHECK ----------
      //
      // PIT tidak punya ROA, quick ratio, dividend,
      // EPS growth, gross/operating/net margin.
      // Analyzer WAJIB neutral/N/A.
      //
      const unavailable = [
        roa,
        quickRatio,
        dividend,
        epsGrowth,
        grossMargin,
        operatingMargin,
        netMargin,
      ];

      for (const result of unavailable) {
        if (
          result.decision !== "NEUTRAL" ||
          result.confidence !== 0
        ) {
          console.log(
            `FAIL LEAK ${pit.ticker} ${pit.periodEnd}: ` +
            `${result.label} = ${result.value}, ` +
            `${result.decision}/${result.confidence}`
          );

          leakageErrors++;
          rowFailed = true;
        }
      }

      // Current ratio pilot saat ini seluruhnya null.
      if (
        pit.currentRatio == null &&
        (
          currentRatio.decision !== "NEUTRAL" ||
          currentRatio.confidence !== 0
        )
      ) {
        console.log(
          `FAIL NULL ${pit.ticker} ${pit.periodEnd}: ` +
          `Current Ratio harus N/A/NEUTRAL`
        );

        leakageErrors++;
        rowFailed = true;
      }

      // Revenue growth boleh null pada 2 row.
      if (
        pit.revenueGrowth == null &&
        (
          revenueGrowth.decision !== "NEUTRAL" ||
          revenueGrowth.confidence !== 0
        )
      ) {
        console.log(
          `FAIL NULL ${pit.ticker} ${pit.periodEnd}: ` +
          `Revenue Growth harus N/A/NEUTRAL`
        );

        leakageErrors++;
        rowFailed = true;
      }

      // ---------- QUALITY VOTE ----------

      let bullish = 0;
      let bearish = 0;

      for (const result of results) {
        if (result.decision === "BULLISH") {
          bullish++;
        } else if (result.decision === "BEARISH") {
          bearish++;
        }
      }

      const quality =
        computeFundamentalQuality(
          bullish,
          bearish
        );

      if (!rowFailed) {
        console.log(
          `PASS ${pit.ticker.padEnd(7)} ` +
          `period=${pit.periodEnd} ` +
          `PE=${pe.value} ` +
          `PBV=${pbv.value} ` +
          `ROE=${roe.value} ` +
          `DER=${der.value} ` +
          `RG=${revenueGrowth.value} ` +
          `Q=${quality.label}/${quality.pct}`
        );

        passed++;
      } else {
        failed++;
      }
    }

    console.log("");
    console.log("==============================================");
    console.log(" PIT SCORING AUDIT SUMMARY");
    console.log("==============================================");
    console.log(`tested=${pilotRows.length}`);
    console.log(`passed=${passed}`);
    console.log(`failed=${failed}`);
    console.log(`scale_errors=${scaleErrors}`);
    console.log(`future_leaks=${leakageErrors}`);

    if (
      failed === 0 &&
      scaleErrors === 0 &&
      leakageErrors === 0
    ) {
      console.log("");
      console.log("RESULT: PASS");
      console.log(
        "PIT adapter menjaga satuan dan tidak mencampur metrik current Yahoo."
      );
    } else {
      console.log("");
      console.log("RESULT: FAIL");
      console.log(
        "Jangan hookup PIT ke route produksi sebelum error diperbaiki."
      );

      process.exitCode = 2;
    }
  } finally {
    restore();
  }
}

main().catch(error => {
  console.error("");
  console.error("[PIT SCORING AUDIT] ERROR:");
  console.error(error);

  process.exitCode = 1;
});
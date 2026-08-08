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
    const source = fs.readFileSync(
      filename,
      "utf8"
    );

    const output = ts.transpileModule(
      source,
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          moduleResolution:
            ts.ModuleResolutionKind.NodeJs,
        },
        fileName: filename,
      }
    );

    module._compile(
      output.outputText,
      filename
    );
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
      String(
        value.getUTCMonth() + 1
      ).padStart(2, "0"),
      String(
        value.getUTCDate()
      ).padStart(2, "0"),
    ].join("-");
  }

  return String(value).slice(0, 10);
}

function previousDay(dateKey) {
  const [y, m, d] =
    dateKey.split("-").map(Number);

  const dt = new Date(
    Date.UTC(y, m - 1, d)
  );

  dt.setUTCDate(
    dt.getUTCDate() - 1
  );

  return dt
    .toISOString()
    .slice(0, 10);
}

async function main() {
  console.log("");
  console.log(
    "=============================================="
  );
  console.log(
    " SAHAMLENS FUNDAMENTAL PIT asOf() AUDIT"
  );
  console.log(
    " READ ONLY - DATABASE TIDAK DIUBAH"
  );
  console.log(
    "=============================================="
  );

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL tidak ditemukan."
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

    const { asOf } = require(
      path.join(
        repoRoot,
        "modules/fundamental/repository/" +
          "fundamental-history.repository.ts"
      )
    );

    if (typeof asOf !== "function") {
      throw new Error(
        "Fungsi asOf() tidak ditemukan."
      );
    }

    /*
     * Ambil 39 row pilot langsung dari DB.
     * HANYA SELECT.
     */
    const { rows } =
      await pool.query(
        `
        SELECT
          ticker,
          observed_date,
          period_end
        FROM fundamental_history
        WHERE period_end =
          ANY($1::date[])
        ORDER BY
          ticker,
          observed_date
        `,
        [TARGET_PERIODS]
      );

    const pilotRows =
      rows.filter(row =>
        PILOT.has(
          String(row.ticker)
        )
      );

    console.log("");
    console.log(
      `Pilot rows ditemukan: ${pilotRows.length}`
    );

    if (pilotRows.length !== 39) {
      throw new Error(
        `Expected 39 row pilot, ditemukan ${pilotRows.length}`
      );
    }

    console.log("");
    console.log(
      "=== BOUNDARY TEST ==="
    );

    let passed = 0;
    let failed = 0;

    for (const row of pilotRows) {
      const ticker =
        String(row.ticker);

      const observed =
        ymd(row.observed_date);

      const expectedPeriod =
        ymd(row.period_end);

      const dayBefore =
        previousDay(observed);

      /*
       * TEST A:
       * Satu hari sebelum publikasi,
       * snapshot ini TIDAK BOLEH terlihat.
       */
      const before =
        await asOf(
          ticker,
          dayBefore
        );

      /*
       * TEST B:
       * Tepat tanggal publikasi,
       * snapshot HARUS sudah terlihat.
       */
      const onDate =
        await asOf(
          ticker,
          observed
        );

      const beforeObserved =
        before
          ? ymd(before.observedDate)
          : null;

      const beforePeriod =
        before
          ? ymd(before.periodEnd)
          : null;

      const onObserved =
        onDate
          ? ymd(onDate.observedDate)
          : null;

      const onPeriod =
        onDate
          ? ymd(onDate.periodEnd)
          : null;

      /*
       * Sebelum tanggal publikasi:
       * boleh null atau snapshot lama,
       * tapi TIDAK boleh snapshot saat ini
       * maupun snapshot masa depan.
       */
      const beforeSafe =
        before === null ||
        (
          beforeObserved !== null &&
          beforeObserved < observed
        );

      /*
       * Tepat tanggal publikasi:
       * harus mengembalikan row yang sama.
       */
      const onDateCorrect =
        onDate !== null &&
        onObserved === observed &&
        onPeriod === expectedPeriod;

      if (
        beforeSafe &&
        onDateCorrect
      ) {
        console.log(
          `PASS ${ticker.padEnd(7)} ` +
          `period=${expectedPeriod} ` +
          `publish=${observed} ` +
          `before=${
            beforePeriod ?? "null"
          } ` +
          `on=${onPeriod}`
        );

        passed++;
      } else {
        console.log("");
        console.log(
          `FAIL ${ticker}`
        );

        console.log(
          `  expected period : ${expectedPeriod}`
        );

        console.log(
          `  publish date    : ${observed}`
        );

        console.log(
          `  day before      : ${dayBefore}`
        );

        console.log(
          `  before observed : ${
            beforeObserved ?? "null"
          }`
        );

        console.log(
          `  before period   : ${
            beforePeriod ?? "null"
          }`
        );

        console.log(
          `  on observed     : ${
            onObserved ?? "null"
          }`
        );

        console.log(
          `  on period       : ${
            onPeriod ?? "null"
          }`
        );

        if (!beforeSafe) {
          console.log(
            "  ERROR: LOOK-AHEAD BIAS!"
          );
        }

        if (!onDateCorrect) {
          console.log(
            "  ERROR: snapshot publish date tidak ditemukan dengan benar."
          );
        }

        failed++;
      }
    }

    console.log("");
    console.log(
      "=============================================="
    );
    console.log(
      " asOf() AUDIT SUMMARY"
    );
    console.log(
      "=============================================="
    );

    console.log(
      `tested=${pilotRows.length}`
    );

    console.log(
      `passed=${passed}`
    );

    console.log(
      `failed=${failed}`
    );

    if (failed === 0) {
      console.log("");
      console.log(
        "RESULT: PASS"
      );

      console.log(
        "Tidak ditemukan look-ahead bias pada 39 boundary snapshot pilot."
      );
    } else {
      console.log("");
      console.log(
        "RESULT: FAIL"
      );

      console.log(
        "JANGAN gunakan PIT untuk scoring/backtest sebelum kegagalan diperbaiki."
      );

      process.exitCode = 2;
    }
  } finally {
    restore();
  }
}

main().catch(error => {
  console.error("");
  console.error(
    "[PIT asOf AUDIT] ERROR:"
  );
  console.error(error);

  process.exitCode = 1;
});
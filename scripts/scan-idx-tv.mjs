#!/usr/bin/env node

/**
 * IDX Market Intelligence & Fast Batch Scanner CLI (TradingView ~843 Emiten)
 * Menampilkan:
 * 1. Market Breadth (Naik / Turun / Stagnan, Turnover, A/D Ratio, Sentimen)
 * 2. Top 10 Relative Strength (RS 1–99, Minervini/IBD style pada universe likuid >= Rp 1 Miliar)
 * 3. Ringkasan Sektoral (Turnover, Pangsa Pasar, Rata-rata Kenaikan)
 * 4. Top 10 Turnover Likuiditas
 * 5. Kuantitatif Filter: --stage2, --near-52w, --pocket-pivot
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Module from 'node:module';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

function installTypeScriptRequireHook(rootDir = repoRoot) {
  const ts = require('typescript');
  const previousTs = Module._extensions['.ts'];
  const previousResolve = Module._resolveFilename;
  const rootWithSep = `${rootDir}${path.sep}`;

  Module._resolveFilename = function resolveWithAlias(request, parent, isMain, options) {
    if (typeof request === 'string' && request.startsWith('@/')) {
      return previousResolve.call(this, path.join(rootWithSep, request.slice(2)), parent, isMain, options);
    }
    return previousResolve.call(this, request, parent, isMain, options);
  };

  Module._extensions['.ts'] = function compileTypeScript(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
      },
      fileName: filename,
    });
    module._compile(output.outputText, filename);
  };

  return () => {
    Module._resolveFilename = previousResolve;
    if (previousTs) Module._extensions['.ts'] = previousTs;
    else delete Module._extensions['.ts'];
  };
}

function printQuantitativeStockTable(title, stocks, maxRows = 25) {
  console.log(`\n${title} (${stocks.length} emiten):`);
  if (stocks.length === 0) {
    console.log('  (Tidak ada emiten yang memenuhi kriteria)');
    return;
  }
  console.log(
    'No. ' +
    'Ticker'.padEnd(7) +
    'Close'.padStart(8) +
    'Change'.padStart(9) +
    'RS'.padStart(5) +
    'Dist 52W'.padStart(10) +
    'RVOL'.padStart(8) +
    'Turnover (M)'.padStart(15) +
    '  ' +
    'Sector'
  );
  stocks.slice(0, maxRows).forEach((s, idx) => {
    const num = String(idx + 1).padStart(2);
    const ticker = s.ticker.padEnd(7);
    const close = (s.close !== null ? s.close.toLocaleString('id-ID') : '-').padStart(8);
    const chg = (s.change !== null ? (s.change >= 0 ? `+${s.change.toFixed(2)}%` : `${s.change.toFixed(2)}%`) : '-').padStart(9);
    const rs = String(s.rsScore ?? '-').padStart(5);
    const dist52w = (s.dist52wHighPct !== null ? `${s.dist52wHighPct.toFixed(2)}%` : '-').padStart(10);
    const rvol = (s.rvol !== null ? `${s.rvol.toFixed(2)}x` : '-').padStart(8);
    const toM = (s.turnover !== null ? (s.turnover / 1e9).toFixed(1) : '-').padStart(15);
    console.log(`${num}. ${ticker}${close}${chg}${rs}${dist52w}${rvol}${toM}  ${s.sector}`);
  });
  if (stocks.length > maxRows) {
    console.log(`... dan ${stocks.length - maxRows} emiten lainnya.`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flagStage2 = args.includes('--stage2');
  const flagNear52w = args.includes('--near-52w');
  const flagPocketPivot = args.includes('--pocket-pivot');
  const flagBlueSky = args.includes('--blue-sky');
  const flagLeading = args.includes('--leading');
  const hasFilter = flagStage2 || flagNear52w || flagPocketPivot || flagBlueSky || flagLeading;

  const uninstallHook = installTypeScriptRequireHook(repoRoot);
  let scanIdxMarket;
  try {
    const serviceModule = require(path.join(repoRoot, 'modules/market-data/service/tradingview-scanner.service.ts'));
    scanIdxMarket = serviceModule.scanIdxMarket;
  } finally {
    uninstallHook();
  }

  const startTime = Date.now();
  console.log('Memindai universe BEI via TradingView scanner...');

  const result = await scanIdxMarket();
  const elapsedMs = Date.now() - startTime;

  const mb = result.marketBreadth;

  console.log('\n' + '='.repeat(78));
  console.log(`IDX MARKET SCANNER REPORT | ${result.timestamp} (${elapsedMs}ms)`);
  console.log('='.repeat(78));
  console.log(`Total Emiten     : ${result.totalCount} dipindai | ${result.liquidCount} universe likuid (Turnover >= Rp 1 Miliar)`);
  if (result.ihsg) {
    const ih = result.ihsg;
    const ihClose = ih.close !== null ? ih.close.toLocaleString('id-ID') : '-';
    const ihChg = ih.change !== null ? (ih.change >= 0 ? `+${ih.change.toFixed(2)}%` : `${ih.change.toFixed(2)}%`) : '-';
    const ihDist52w = ih.dist52wHighPct !== null ? `${ih.dist52wHighPct.toFixed(2)}%` : '-';
    console.log(`IHSG Benchmark   : ${ihClose} (${ihChg}) | Trend: ${ih.trend} | Dist 52W: ${ihDist52w}`);
  }
  console.log(`Market Breadth   : Naik: ${mb.advances} | Turun: ${mb.declines} | Stagnan: ${mb.unchanged}`);
  console.log(`A/D Ratio        : ${mb.advanceDeclineRatio}x | Sentimen: ${mb.sentiment}`);
  console.log(`Total Turnover   : Rp ${mb.totalTurnoverTrillion} Triliun`);
  console.log('-'.repeat(78));

  if (flagNear52w) {
    printQuantitativeStockTable('EMITEN STAGE 2 TERDEKAT DARI 52W HIGH (<= 15%)', result.near52wStocks, 50);
  }

  if (flagPocketPivot) {
    printQuantitativeStockTable('KANDIDAT POCKET PIVOT BREAKOUT (RVOL >= 1.5x, Dist <= 25%)', result.pocketPivotStocks, 50);
  }

  if (flagStage2) {
    printQuantitativeStockTable('UNIVERSE STAGE 2 MOMENTUM (Close > SMA50 > SMA200)', result.stage2Stocks, 50);
  }

  if (flagBlueSky) {
    printQuantitativeStockTable('BLUE SKY RS LEADING DIVERGENCE (Stage 2 + Dist <= 15% + RS >= 80)', result.blueSkyRsStocks, 50);
  }

  if (flagLeading) {
    printQuantitativeStockTable('EMITEN OUTPERFORMING VS IHSG (Alpha 1M & 3M Positif)', result.leadingStocks, 50);
  }

  if (!hasFilter) {
    console.log('TOP 10 RELATIVE STRENGTH (RS 1-99 Minervini/IBD Style):');
    console.log(
      'No. ' +
      'Ticker'.padEnd(7) +
      'Close'.padStart(8) +
      'Change'.padStart(9) +
      'RS'.padStart(5) +
      'Turnover (M)'.padStart(15) +
      'RSI'.padStart(7) +
      '  ' +
      'Sector'
    );
    result.topRs.forEach((s, idx) => {
      const num = String(idx + 1).padStart(2);
      const ticker = s.ticker.padEnd(7);
      const close = (s.close !== null ? s.close.toLocaleString('id-ID') : '-').padStart(8);
      const chg = (s.change !== null ? (s.change >= 0 ? `+${s.change.toFixed(2)}%` : `${s.change.toFixed(2)}%`) : '-').padStart(9);
      const rs = String(s.rsScore ?? '-').padStart(5);
      const toM = (s.turnover !== null ? (s.turnover / 1e9).toFixed(1) : '-').padStart(15);
      const rsi = (s.rsi !== null ? s.rsi.toFixed(1) : '-').padStart(7);
      console.log(`${num}. ${ticker}${close}${chg}${rs}${toM}${rsi}  ${s.sector}`);
    });
    console.log('-'.repeat(78));

    printQuantitativeStockTable('TOP 10 STAGE 2 TERDEKAT DARI 52W HIGH (<= 15%)', result.near52wStocks, 10);
    console.log('-'.repeat(78));

    printQuantitativeStockTable('TOP 5 BLUE SKY RS LEADING DIVERGENCE (Stage 2 + Near 52W High + RS >= 80)', result.blueSkyRsStocks, 5);
    console.log('-'.repeat(78));

    console.log('TOP 5 SEKTOR BERDASARKAN TURNOVER:');
    result.sectors.slice(0, 5).forEach((sec, idx) => {
      const num = String(idx + 1).padStart(2);
      const name = sec.sector.padEnd(25);
      const to = `Rp ${sec.turnoverTrillion.toFixed(2)} T`.padStart(11);
      const share = `(${sec.sharePct.toFixed(1)}%)`.padStart(8);
      const avgChg = (sec.avgChangePct >= 0 ? `+${sec.avgChangePct.toFixed(2)}%` : `${sec.avgChangePct.toFixed(2)}%`).padStart(8);
      const breadth = `(Naik:${sec.up} / Turun:${sec.down})`;
      console.log(`${num}. ${name} : ${to} ${share} | Rata-rata: ${avgChg} | ${breadth}`);
    });
    console.log('-'.repeat(78));

    console.log('TOP 5 TURNOVER LIKUIDITAS:');
    result.topTurnover.slice(0, 5).forEach((t, idx) => {
      const num = String(idx + 1).padStart(2);
      const ticker = t.ticker.padEnd(7);
      const close = (t.close !== null ? t.close.toLocaleString('id-ID') : '-').padStart(8);
      const chg = (t.change !== null ? (t.change >= 0 ? `+${t.change.toFixed(2)}%` : `${t.change.toFixed(2)}%`) : '-').padStart(9);
      const toM = `Rp ${(t.turnover ? (t.turnover / 1e9).toFixed(1) : '0.0')} M`.padStart(14);
      const pe = t.pe !== null ? `PER: ${t.pe.toFixed(1)}x`.padEnd(12) : 'PER: -      ';
      const pbv = t.pbv !== null ? `PBV: ${t.pbv.toFixed(2)}x` : 'PBV: -';
      console.log(`${num}. ${ticker}${close}${chg} | ${toM} | ${pe} | ${pbv}`);
    });
  }

  console.log('='.repeat(78));
  if (!hasFilter) {
    console.log('Flag filter CLI: --near-52w, --pocket-pivot, --stage2, --blue-sky, --leading');
  }
  console.log('\n');
}

main().catch((err) => {
  console.error('ERROR saat menjalankan scan TradingView:', err?.message ?? err);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * CLI Runner: Shadow Forward Ledger Lengan B (Anti-Microcap + Anti-FCA)
 * Usage:
 *   node scripts/shadow-lengan-b-record.mjs [--dry-run] [--bypass-regime] [--date=YYYY-MM-DD]
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
const dotenv = require('dotenv');

// Load env production jika ada
const envProd = path.join(repoRoot, '.env.production');
const envProdApp = '/opt/sahamlens/app/.env.production';
const envRoot = path.join(repoRoot, '.env');
if (fs.existsSync(envProd)) {
  dotenv.config({ path: envProd });
} else if (fs.existsSync(envProdApp)) {
  dotenv.config({ path: envProdApp });
} else if (fs.existsSync(envRoot)) {
  dotenv.config({ path: envRoot });
}

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
}

installTypeScriptRequireHook();

const { executeShadowLenganB, MODEL_VERSION_SHADOW_LENGAN_B } = require('@/modules/decision-agent');

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const bypassRegime = args.includes('--bypass-regime');
  let explicitDate;
  const dateArg = args.find((a) => a.startsWith('--date='));
  if (dateArg) {
    explicitDate = dateArg.split('=')[1];
  }

  console.log(`[Shadow Lengan B] Memulai runner (${MODEL_VERSION_SHADOW_LENGAN_B})...`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN (tanpa menulis DB)' : 'LIVE-PERSIST (menulis ke forward_signal_ledger)'}`);
  if (bypassRegime) console.log('Bypass Regime: AKTIF (mengabaikan filter IHSG > SMA50 untuk pengujian)');
  if (explicitDate) console.log(`Tanggal: ${explicitDate}`);

  const result = await executeShadowLenganB({
    date: explicitDate,
    dryRun,
    bypassRegime,
  });

  console.log('\n--- HASIL EKSEKUSI ---');
  console.log(`Sukses: ${result.success}`);
  console.log(`Rezim IHSG Lolos: ${result.regimePassed}`);
  console.log(`Tanggal: ${result.date}`);
  console.log(`Kandidat Terevaluasi: ${result.candidatesEvaluated}`);
  console.log(`Jumlah Sinyal Lolos: ${result.signalsCount}`);
  console.log(`Jumlah Baris Tercatat di DB: ${result.insertedCount}`);
  if (result.reason) console.log(`Alasan / Catatan: ${result.reason}`);

  if (result.signals.length > 0) {
    console.log('\nDAFTAR SINYAL SHADOW LENGAN B:');
    console.log(
      'No. ' +
      'Ticker'.padEnd(7) +
      'Close'.padStart(8) +
      'EntryRef'.padStart(10) +
      'Stop'.padStart(8) +
      'TP1'.padStart(8) +
      'RR'.padStart(7) +
      'Risk %'.padStart(8) +
      'Skor'.padStart(7) +
      'RS Rank'.padStart(9) +
      'CMF Rank'.padStart(10)
    );
    result.signals.forEach((s, idx) => {
      const num = String(idx + 1).padStart(2);
      const ticker = s.ticker.padEnd(7);
      const close = String(s.close).padStart(8);
      const entryRef = String(s.entryRef).padStart(10);
      const stop = String(s.stop).padStart(8);
      const tp1 = String(s.target).padStart(8);
      const rr = `1:${s.rr}`.padStart(7);
      const risk = `${s.riskPct}%`.padStart(8);
      const score = String(s.compositeScore).padStart(7);
      const rs = String(s.rsRank).padStart(9);
      const cmf = String(s.cmfRank).padStart(10);
      console.log(`${num}. ${ticker}${close}${entryRef}${stop}${tp1}${rr}${risk}${score}${rs}${cmf}`);
    });
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[Shadow Lengan B] Fatal Error:', err);
  process.exit(1);
});

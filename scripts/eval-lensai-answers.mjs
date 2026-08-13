// Evaluasi KUALITAS JAWABAN LensAI - end-to-end lewat /api/chat yang sungguhan.
//
// Bedanya dengan `npm run eval:lensai`:
//   eval:lensai    - mengukur ROUTING (pertanyaan sampai ke data yang benar). Tanpa AI,
//                    deterministik, gratis, jalan di CI.
//   eval:answers   - mengukur JAWABANNYA. Memanggil AI sungguhan lewat server yang
//                    hidup, jadi butuh kuota dan hasilnya tidak identik tiap kali.
//                    SENGAJA tidak dijalankan di CI.
//
// Yang diperiksa untuk tiap pertanyaan - semuanya deterministik, bukan penilaian rasa:
//   1. Intent routing sesuai fixture (sama seperti eval routing, tapi lewat jalur nyata).
//   2. `routing.numberCheck.ok` - tidak ada angka di jawaban yang gagal ditelusuri ke
//      data server. INI sinyal kualitas yang paling berharga di sini: ia menangkap
//      halusinasi angka pada jawaban yang benar-benar dihasilkan model.
//   3. Penutup DYOR ada pada jawaban bermuatan data, dan TIDAK ada pada sapaan/penolakan.
//   4. Jawaban tidak kosong dan tidak berupa error penyedia.
//
// Kuota: satu putaran penuh = 1 panggilan AI per pertanyaan (lebih kalau ada yang kena
// perbaikan verifikasi angka). Pakai --limit untuk mencicil.
//
// Pakai:
//   npm run dev                                   # server harus hidup
//   npm run eval:answers                          # default http://localhost:3001
//   npm run eval:answers -- --limit=10            # 10 pertanyaan pertama
//   npm run eval:answers -- --group=masa-depan    # satu kelompok saja
//   npm run eval:answers -- --url=https://sahamlens.id
//
// CATATAN 9ROUTER: kalau server memakai 9Router, seluruh eval ini lewat satu endpoint
// itu (gateway di-pin di depan cascade). Dari MESIN DEV, `NINEROUTER_BASE_URL` tidak
// boleh 127.0.0.1:20128 - alamat itu hanya sah di dalam VPS. Pakai hostname publiknya.

import fs from 'node:fs';
import path from 'node:path';

const FIXTURES = path.join(process.cwd(), 'app', 'api', 'chat', '__tests__', 'fixtures', 'lensai-questions.json');
const DEFAULT_URL = 'http://localhost:3001';

// Sama dengan daftar di app/api/chat/dyor.ts. Disalin sengaja - skrip ini .mjs polos
// tanpa transpile TypeScript. Kalau daftar di sana berubah, ubah juga di sini.
const NO_DYOR_INTENTS = ['SMALL_TALK', 'OUT_OF_SCOPE', 'SAHAMLENS_PRODUCT_HELP', 'UNKNOWN', 'CLARIFY'];

function arg(name, fallback = null) {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ask(baseUrl, question) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: question, context: '', history: [] }),
  });

  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

function checkOne(fixture, result) {
  const problems = [];
  const { status, body } = result;

  if (!body) {
    problems.push(`respons bukan JSON (HTTP ${status})`);
    return problems;
  }
  if (body.errorCode === 'PROVIDER_ERROR' || body.errorCode === 'RATE_LIMIT') {
    // Bukan cacat jawaban - ini kegagalan infrastruktur. Dilaporkan terpisah supaya
    // tidak tercampur dengan kualitas jawaban.
    problems.push(`SKIP_PROVIDER:${body.detailCode ?? body.errorCode}`);
    return problems;
  }

  const routing = body.routing ?? {};
  const answer = String(body.content ?? '');

  if (routing.intent && routing.intent !== fixture.intent && !(fixture.clarify && routing.intent === 'CLARIFY')) {
    problems.push(`intent ${routing.intent}, seharusnya ${fixture.intent}`);
  }

  if (!answer.trim()) problems.push('jawaban kosong');

  if (routing.numberCheck && routing.numberCheck.ok === false) {
    problems.push(`angka tidak tertelusur: ${(routing.numberCheck.unverified ?? []).join(', ')}`);
  }

  const intent = routing.intent ?? fixture.intent;
  const hasDyor = /\bdyor\b/i.test(answer);
  const shouldHaveDyor = !NO_DYOR_INTENTS.includes(intent);
  if (shouldHaveDyor && !hasDyor) problems.push('penutup DYOR hilang');
  if (!shouldHaveDyor && hasDyor) problems.push('penutup DYOR muncul di jawaban yang tidak seharusnya');

  return problems;
}

async function main() {
  const baseUrl = arg('url', DEFAULT_URL);
  const limit = Number(arg('limit', '0')) || 0;
  const group = arg('group');
  const delayMs = Number(arg('delay', '600')) || 0;

  const fixtures = JSON.parse(fs.readFileSync(FIXTURES, 'utf8')).questions;
  let questions = fixtures.filter((f) => (group ? f.group === group : true));
  if (limit > 0) questions = questions.slice(0, limit);

  if (!questions.length) {
    console.error('[eval:answers] tidak ada pertanyaan yang cocok dengan filter.');
    process.exitCode = 1;
    return;
  }

  console.log(`[eval:answers] ${questions.length} pertanyaan -> ${baseUrl}`);
  console.log('[eval:answers] pastikan server hidup; jawaban dihasilkan AI sungguhan.\n');

  const failures = [];
  const skipped = [];
  let passed = 0;

  for (const fixture of questions) {
    let result;
    try {
      result = await ask(baseUrl, fixture.q);
    } catch (error) {
      console.error(`[eval:answers] GAGAL menghubungi server: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`               Jalankan \`npm run dev\` dulu, atau beri --url=<alamat>.`);
      process.exitCode = 1;
      return;
    }

    const problems = checkOne(fixture, result);
    const providerSkip = problems.find((p) => p.startsWith('SKIP_PROVIDER:'));

    if (providerSkip) {
      skipped.push({ q: fixture.q, reason: providerSkip.replace('SKIP_PROVIDER:', '') });
      process.stdout.write('s');
    } else if (problems.length) {
      failures.push({ q: fixture.q, group: fixture.group, problems });
      process.stdout.write('x');
    } else {
      passed += 1;
      process.stdout.write('.');
    }

    if (delayMs) await sleep(delayMs);
  }

  const evaluated = questions.length - skipped.length;
  console.log('\n');
  console.log(`[eval:answers] ${passed}/${evaluated} jawaban lolos semua pemeriksaan`);

  if (skipped.length) {
    console.log(`[eval:answers] ${skipped.length} dilewati karena penyedia AI gagal/limit:`);
    for (const item of skipped.slice(0, 5)) console.log(`  - "${item.q}" (${item.reason})`);
    console.log('  Ini kegagalan infrastruktur, bukan cacat jawaban - ulangi nanti.');
  }

  if (failures.length) {
    console.log(`\n[eval:answers] ${failures.length} bermasalah:`);
    for (const item of failures) {
      console.log(`  [${item.group}] "${item.q}"`);
      for (const problem of item.problems) console.log(`      - ${problem}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[eval:answers] error tak terduga:', error);
  process.exitCode = 1;
});

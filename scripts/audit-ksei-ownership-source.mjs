#!/usr/bin/env node
/**
 * AUDIT SUMBER KEPEMILIKAN KSEI - dijalankan OPERATOR di VPS.
 *
 * KENAPA SCRIPT INI ADA
 * ---------------------
 * Sandbox pengembangan tidak punya outbound access ke web.ksei.co.id (proxy
 * environment menjawab CONNECT 403). Itu keterbatasan SANDBOX, bukan bukti bahwa
 * sumbernya tidak ada. Karena struktur HTML-nya tidak dapat diverifikasi dari
 * sana, parser produksi TIDAK BOLEH ditandai "verified" berdasarkan ingatan atau
 * dokumentasi saja - itu sama dengan mengarang, hanya saja kesalahannya baru
 * ketahuan setelah ratusan baris palsu masuk tabel histori append-only.
 *
 * Script ini menjembataninya: dijalankan di VPS yang punya internet normal, ia
 * MENGAMATI dan MELAPORKAN - tanpa mengubah database, tanpa mengaktifkan apa pun.
 *
 * CARA PAKAI
 * ----------
 *   npm run audit:ksei-ownership
 *   npm run audit:ksei-ownership -- --tickers BBRI,BBCA --out reports/
 *
 * KELUARAN
 * --------
 *   reports/ksei-ownership-source-audit.json   ringkasan per ticker
 *   data/source-fixtures/ksei/<TICKER>.html    fixture TERSANITASI (opsional)
 *
 * FAIL-CLOSED
 * -----------
 * Script ini TIDAK PERNAH menaikkan status audit. Ia hanya melaporkan. Kesimpulan
 * SOURCE_VERIFIED hanya diberikan ketika SELURUH ticker sampel mengembalikan 200,
 * HTML wajar, dan seluruh label wajib ditemukan. Selain itu: SOURCE_UNVERIFIED.
 *
 * Menaikkan KSEI_REGISTERED_SECURITY.auditStatus tetap keputusan manusia, dalam
 * commit yang juga memuat fixture nyata + test parser terhadapnya.
 * Lihat docs/ownership-flow/source-audit.md.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = 'https://web.ksei.co.id/services/registered-securities/shares/lc';

/** Sampel default: bank besar, telko, konglomerasi, plus emiten kecil/likuiditas
 * rendah (GTSI/ERAL) - justru emiten kecil yang paling mungkin punya halaman
 * berbeda bentuk atau data tidak lengkap. */
const DEFAULT_TICKERS = ['BBRI', 'BBCA', 'TLKM', 'ASII', 'GTSI', 'ERAL', 'SMRA'];

/** Label yang HARUS ditemukan agar parser punya dasar. */
const REQUIRED_LABELS = [
  { key: 'hasShortCode', patterns: [/short\s*code/i, /kode\s*efek/i] },
  { key: 'hasNumberOfSecurities', patterns: [/number\s*of\s*securities/i, /jumlah\s*efek/i] },
  { key: 'hasObservedDate', patterns: [/as\s*of/i, /per\s*tanggal/i, /posisi\s*per/i] },
  { key: 'hasScriplessPercentage', patterns: [/scripless/i] },
  { key: 'hasLocalPercentage', patterns: [/local\s*percentage/i, /persentase\s*lokal/i] },
  { key: 'hasForeignPercentage', patterns: [/foreign\s*percentage/i, /persentase\s*asing/i] },
];

const ANTI_BOT_MARKERS = [
  /captcha/i,
  /recaptcha/i,
  /cf-browser-verification/i,
  /checking your browser/i,
  /access denied/i,
  /request blocked/i,
];

const LOGIN_MARKERS = [/type=["']password["']/i, /silakan login/i, /please login/i];

const USER_AGENT =
  'SahamLens-OwnershipFlow-Audit/1.0 (+https://sahamlens.id; kontak: admin@sahamlens.id)';

function parseArgs(argv) {
  const args = { tickers: DEFAULT_TICKERS, out: 'reports', fixtures: 'data/source-fixtures/ksei', saveFixtures: true, delayMs: 1500, timeoutMs: 20000 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--tickers') args.tickers = String(argv[++i] || '').split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
    else if (arg === '--out') args.out = String(argv[++i] || 'reports');
    else if (arg === '--fixtures') args.fixtures = String(argv[++i] || args.fixtures);
    else if (arg === '--no-fixtures') args.saveFixtures = false;
    else if (arg === '--delay') args.delayMs = Number(argv[++i]) || args.delayMs;
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Buang apa pun yang bisa membawa data pribadi/sesi sebelum fixture disimpan.
 *
 * Fixture ini akan di-commit ke repository, jadi ia harus benar-benar berisi
 * halaman publik dan tidak lebih. Yang dibuang: script (bisa memuat token yang
 * disuntik server), meta CSRF, atribut nonce, input hidden, dan segala yang
 * berbau token/session. Kalau ragu, buang.
 */
function sanitizeHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '<!-- script dibuang saat sanitasi -->')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<meta[^>]*csrf[^>]*>/gi, '<!-- meta csrf dibuang -->')
    .replace(/<input[^>]*type=["']hidden["'][^>]*>/gi, '<!-- input hidden dibuang -->')
    .replace(/\snonce=["'][^"']*["']/gi, '')
    .replace(/\s(data-[a-z-]*token|data-[a-z-]*session)=["'][^"']*["']/gi, '')
    .replace(/([?&](token|session|sid|jsessionid|auth|key)=)[^"'&\s]+/gi, '$1REDACTED');
}

async function auditTicker(ticker, args) {
  const url = `${BASE_URL}/${encodeURIComponent(ticker)}?setLocale=id-ID`;
  const startedAt = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);

  const result = {
    ticker,
    requestedUrl: url,
    finalUrl: null,
    httpStatus: null,
    contentType: null,
    responseLength: null,
    durationMs: null,
    error: null,
    antiBotDetected: false,
    loginDetected: false,
    hasShortCode: false,
    hasNumberOfSecurities: false,
    hasObservedDate: false,
    hasScriplessPercentage: false,
    hasLocalPercentage: false,
    hasForeignPercentage: false,
    tickerMentioned: false,
    fixtureSaved: null,
    verdict: 'SOURCE_UNVERIFIED',
  };

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
      },
    });

    result.httpStatus = response.status;
    result.contentType = response.headers.get('content-type');
    result.finalUrl = response.url || url;

    const body = await response.text();
    result.responseLength = body.length;

    result.antiBotDetected = ANTI_BOT_MARKERS.some((re) => re.test(body));
    result.loginDetected = LOGIN_MARKERS.some((re) => re.test(body));
    result.tickerMentioned = new RegExp(`\\b${ticker}\\b`).test(body);

    for (const { key, patterns } of REQUIRED_LABELS) {
      result[key] = patterns.some((re) => re.test(body));
    }

    const allLabels = REQUIRED_LABELS.every(({ key }) => result[key]);
    if (
      response.ok &&
      !result.antiBotDetected &&
      !result.loginDetected &&
      result.tickerMentioned &&
      allLabels
    ) {
      result.verdict = 'LABELS_PRESENT';
    } else if (!response.ok) {
      result.verdict = `HTTP_${response.status}`;
    } else if (result.antiBotDetected) {
      result.verdict = 'ANTI_BOT';
    } else if (result.loginDetected) {
      result.verdict = 'LOGIN_REQUIRED';
    } else {
      result.verdict = 'LABELS_MISSING';
    }

    // Fixture hanya disimpan untuk halaman yang MASUK AKAL. Menyimpan halaman
    // captcha/login sebagai "fixture" tidak ada gunanya dan berisiko membawa
    // data yang tidak seharusnya masuk repository.
    if (args.saveFixtures && response.ok && !result.antiBotDetected && !result.loginDetected) {
      await fs.mkdir(args.fixtures, { recursive: true });
      const fixturePath = path.join(args.fixtures, `${ticker}.html`);
      const header =
        `<!--\n  FIXTURE AUDIT KSEI - ${ticker}\n` +
        `  Diambil: ${new Date().toISOString()}\n` +
        `  URL: ${result.finalUrl}\n` +
        `  Sudah disanitasi: script/meta csrf/input hidden/nonce/token dibuang.\n` +
        `  Halaman publik tanpa autentikasi. TIDAK memuat cookie/sesi/data pengguna.\n-->\n`;
      await fs.writeFile(fixturePath, header + sanitizeHtml(body), 'utf8');
      result.fixtureSaved = fixturePath;
    }
  } catch (err) {
    result.error = err?.name === 'AbortError' ? `Timeout setelah ${args.timeoutMs} ms` : String(err?.message ?? err);
    result.verdict = 'FETCH_FAILED';
  } finally {
    clearTimeout(timer);
    result.durationMs = Date.now() - startedAt;
  }

  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log('Audit sumber kepemilikan KSEI');
  console.log(`  Ticker : ${args.tickers.join(', ')}`);
  console.log(`  Base   : ${BASE_URL}`);
  console.log(`  Jeda   : ${args.delayMs} ms antar permintaan (berurutan, tidak paralel)\n`);

  const results = [];
  for (const ticker of args.tickers) {
    // SENGAJA berurutan dengan jeda: ini audit atas server publik milik lembaga,
    // bukan uji beban. Tujuh permintaan bertahap tidak akan mengganggu siapa pun.
    const result = await auditTicker(ticker, args);
    results.push(result);
    const flag = result.verdict === 'LABELS_PRESENT' ? 'OK ' : '!! ';
    console.log(
      `${flag}${ticker.padEnd(6)} status=${String(result.httpStatus ?? '-').padEnd(4)} ` +
        `len=${String(result.responseLength ?? '-').padEnd(7)} verdict=${result.verdict}` +
        (result.error ? ` error=${result.error}` : '')
    );
    if (ticker !== args.tickers[args.tickers.length - 1]) await sleep(args.delayMs);
  }

  const allOk = results.length > 0 && results.every((r) => r.verdict === 'LABELS_PRESENT');
  const report = {
    source: 'KSEI',
    sourceId: 'KSEI_REGISTERED_SECURITY',
    baseUrl: BASE_URL,
    auditedAt: new Date().toISOString(),
    auditedBy: 'scripts/audit-ksei-ownership-source.mjs',
    userAgent: USER_AGENT,
    // Kesimpulan keseluruhan. Perhatikan: LABELS_PRESENT pada seluruh sampel
    // BELUM berarti parser sudah benar - ia baru berarti label yang dibutuhkan
    // ADA di halaman. Verifikasi penuh menuntut parser dijalankan atas fixture
    // dan angkanya dicocokkan manusia.
    verdict: allOk ? 'LABELS_PRESENT_ON_ALL_SAMPLES' : 'SOURCE_UNVERIFIED',
    nextStep: allOk
      ? 'Jalankan parser terhadap fixture, cocokkan angkanya secara manual, tambahkan test, baru ubah auditStatus ke VERIFIED.'
      : 'Sumber TIDAK lolos audit. Jangan aktifkan ingestion. Periksa verdict per ticker di bawah.',
    // Cadence TIDAK dapat dijawab satu kali jalan - ia butuh pengamatan beberapa
    // hari berturut-turut atas pergerakan "As of". Sengaja dibiarkan null supaya
    // tidak ada yang mengisinya dengan tebakan.
    observedCadence: null,
    cadenceNote:
      'Jalankan script ini beberapa hari berturut-turut dan bandingkan nilai "As of" untuk menentukan cadence sebenarnya. Jangan menebak.',
    results,
  };

  await fs.mkdir(args.out, { recursive: true });
  const reportPath = path.join(args.out, 'ksei-ownership-source-audit.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`\nLaporan: ${reportPath}`);
  console.log(`Kesimpulan: ${report.verdict}`);
  console.log(`Langkah berikutnya: ${report.nextStep}`);

  if (!allOk) {
    console.log('\nIngestion produksi TETAP tertutup (fail-closed).');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Audit gagal dijalankan:', err);
  process.exitCode = 1;
});

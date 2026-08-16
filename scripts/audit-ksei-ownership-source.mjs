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

const DEFAULT_BASE_URL = 'https://web.ksei.co.id/services/registered-securities/shares/lc';

/** Sampel default: bank besar, telko, konglomerasi, plus emiten kecil/likuiditas
 * rendah (GTSI/ERAL) - justru emiten kecil yang paling mungkin punya halaman
 * berbeda bentuk atau data tidak lengkap. */
const DEFAULT_TICKERS = ['BBRI', 'BBCA', 'TLKM', 'ASII', 'GTSI', 'ERAL', 'SMRA'];

/**
 * Label yang HARUS ditemukan agar parser punya dasar.
 *
 * PENTING (koreksi 2026-08-16 dari temuan VPS): keberadaan LABEL tidak sama
 * dengan keberadaan NILAI. Fixture TLKM nyata memuat label "As of" dengan
 * lengkap, tetapi tanggal di sebelahnya tidak dapat diparse dan ketiga
 * persentasenya 0,00%. Kalau audit hanya mencari labelnya, halaman kosong
 * seperti itu akan dilaporkan LULUS - dan itu justru kesimpulan paling
 * berbahaya yang bisa dihasilkan script ini.
 *
 * Karena itu setiap label di bawah punya `extract`: audit baru menandai `true`
 * kalau NILAI di sebelah labelnya benar-benar terbaca.
 */
const REQUIRED_LABELS = [
  { key: 'hasShortCode', patterns: [/short\s*code/i, /kode\s*efek/i], kind: 'text' },
  { key: 'hasNumberOfSecurities', patterns: [/number\s*of\s*securities/i, /jumlah\s*efek/i], kind: 'number' },
  { key: 'hasObservedDate', patterns: [/as\s*of/i, /per\s*tanggal/i, /posisi\s*per/i], kind: 'date' },
  { key: 'hasScriplessPercentage', patterns: [/scripless\s*percentage/i, /persentase\s*scripless/i, /scripless/i], kind: 'percent' },
  { key: 'hasLocalPercentage', patterns: [/local\s*percentage/i, /persentase\s*lokal/i], kind: 'percent' },
  { key: 'hasForeignPercentage', patterns: [/foreign\s*percentage/i, /persentase\s*asing/i], kind: 'percent' },
];

/** Teks datar dari HTML - label dan nilainya jadi bertetangga. */
function flatten(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' | ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[ \t]+/g, ' ');
}

/**
 * Ambil nilai yang mengikuti sebuah label, lalu buktikan ia benar-benar terbaca
 * sesuai jenisnya. Mengembalikan { found, value } - `found` false kalau labelnya
 * ada tapi nilainya kosong/tidak terparse.
 */
function extractLabeledValue(flat, patterns, kind) {
  for (const re of patterns) {
    const m = re.exec(flat);
    if (!m) continue;
    // Ambil potongan setelah label; batasi supaya tidak menyeret separuh halaman.
    const after = flat.slice(m.index + m[0].length, m.index + m[0].length + 160);
    const cleaned = after.replace(/^[\s|:：]+/, '');
    const token = cleaned.split('|')[0].trim();
    if (!token) continue;

    if (kind === 'percent') {
      const num = parsePercentLike(token);
      if (num !== null) return { found: true, value: num };
      continue;
    }
    if (kind === 'number') {
      const num = Number(token.replace(/[.,\s]/g, ''));
      if (Number.isFinite(num) && token.replace(/[^\d]/g, '').length > 0) return { found: true, value: num };
      continue;
    }
    if (kind === 'date') {
      const parsed = parseDateLike(token);
      if (parsed) return { found: true, value: parsed };
      continue;
    }
    return { found: true, value: token };
  }
  return { found: false, value: null };
}

function parsePercentLike(token) {
  const m = token.match(/-?[\d.,]+/);
  if (!m) return null;
  let t = m[0];
  const hasDot = t.includes('.');
  const hasComma = t.includes(',');
  if (hasDot && hasComma) {
    const dec = t.lastIndexOf(',') > t.lastIndexOf('.') ? ',' : '.';
    const thou = dec === ',' ? '.' : ',';
    t = t.split(thou).join('').replace(dec, '.');
  } else if (hasComma) {
    t = t.replace(',', '.');
  }
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

const MONTHS = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',mei:'05',jun:'06',jul:'07',
  aug:'08',agu:'08',ags:'08',sep:'09',oct:'10',okt:'10',nov:'11',dec:'12',des:'12' };

/** Hanya bentuk TIDAK AMBIGU yang diterima - sama seperti parser produksi. */
function parseDateLike(token) {
  const iso = token.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const named = token.match(/(\d{1,2})[\s\-/]+([A-Za-z]+)[\s\-/]+(\d{4})/);
  if (named) {
    const mm = MONTHS[named[2].toLowerCase().slice(0, 3)];
    if (mm) return `${named[3]}-${mm}-${named[1].padStart(2, '0')}`;
  }
  return null;
}

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
  const args = { tickers: DEFAULT_TICKERS, out: 'reports', fixtures: 'data/source-fixtures/ksei', saveFixtures: true, delayMs: 1500, timeoutMs: 20000, baseUrl: DEFAULT_BASE_URL };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--tickers') args.tickers = String(argv[++i] || '').split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
    else if (arg === '--out') args.out = String(argv[++i] || 'reports');
    else if (arg === '--fixtures') args.fixtures = String(argv[++i] || args.fixtures);
    else if (arg === '--no-fixtures') args.saveFixtures = false;
    else if (arg === '--delay') args.delayMs = Number(argv[++i]) || args.delayMs;
    // --base-url: untuk memverifikasi script ini sendiri terhadap server tiruan
    // sebelum diarahkan ke server sungguhan. Default-nya tetap URL resmi KSEI;
    // flag ini tidak pernah mengubah tujuan kecuali diketik operator.
    else if (arg === '--base-url') args.baseUrl = String(argv[++i] || args.baseUrl);
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
  const url = `${args.baseUrl}/${encodeURIComponent(ticker)}?setLocale=id-ID`;
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
    // Nilai yang BENAR-BENAR terparse per label - inti pembeda "label ada" vs
    // "data ada". Ikut ditulis ke laporan supaya operator bisa melihat sendiri.
    values: {},
    labelsPresentButUnparsed: [],
    placeholderData: false,
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

    // Label ADA vs NILAI TERBACA - dibedakan tegas. Lihat catatan di
    // REQUIRED_LABELS: fixture TLKM nyata punya seluruh labelnya tapi nol nilai.
    const flat = flatten(body);
    const labelsPresent = [];
    for (const { key, patterns, kind } of REQUIRED_LABELS) {
      const labelSeen = patterns.some((re) => re.test(body));
      if (labelSeen) labelsPresent.push(key);
      const { found, value } = extractLabeledValue(flat, patterns, kind);
      result[key] = found;                 // true HANYA kalau nilainya terparse
      result.values[key] = value;
    }
    result.labelsPresentButUnparsed = labelsPresent.filter((k) => !result[k]);

    // PLACEHOLDER 0/0/0: halaman emitennya asli, tapi ketiga persentasenya nol.
    // Ini keadaan yang berbeda dari "label hilang" dan dari "fetch gagal", dan
    // ia TIDAK membaik dengan retry - jadi ia punya verdict sendiri.
    const pcts = [result.values.hasLocalPercentage, result.values.hasForeignPercentage, result.values.hasScriplessPercentage];
    const anyPrinted = pcts.some((v) => v !== null && v !== undefined);
    const nonePositive = pcts.every((v) => v === null || v === undefined || Math.abs(v) < 0.005);
    result.placeholderData = anyPrinted && nonePositive;

    const allValues = REQUIRED_LABELS.every(({ key }) => result[key]);

    if (!response.ok) {
      result.verdict = `HTTP_${response.status}`;
    } else if (result.antiBotDetected) {
      result.verdict = 'ANTI_BOT';
    } else if (result.loginDetected) {
      result.verdict = 'LOGIN_REQUIRED';
    } else if (!result.tickerMentioned) {
      result.verdict = 'TICKER_NOT_FOUND';
    } else if (result.placeholderData) {
      result.verdict = 'PLACEHOLDER_DATA';
    } else if (!result.hasObservedDate) {
      // Dipisahkan dari LABELS_MISSING: tanpa tanggal observasi yang terparse,
      // tidak ada point-in-time sama sekali - dan itu satu-satunya field yang
      // ketiadaannya membuat seluruh baris tak berguna walaupun angkanya ada.
      result.verdict = 'OBSERVED_DATE_UNPARSED';
    } else if (!allValues) {
      result.verdict = 'VALUES_UNPARSED';
    } else {
      result.verdict = 'VALUES_PARSED';
    }

    // Fixture hanya disimpan untuk halaman yang MASUK AKAL. Menyimpan halaman
    // captcha/login sebagai "fixture" tidak ada gunanya dan berisiko membawa
    // data yang tidak seharusnya masuk repository.
    // Halaman placeholder TETAP disimpan sebagai fixture - justru ia berharga:
    // ia jadi kasus uji regresi bahwa parser MENOLAK 0/0/0. Yang tidak disimpan
    // hanya halaman captcha/login (tidak ada nilainya sebagai fixture, dan
    // berisiko membawa hal yang tidak seharusnya masuk repository).
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
  console.log(`  Base   : ${args.baseUrl}`);
  console.log(`  Jeda   : ${args.delayMs} ms antar permintaan (berurutan, tidak paralel)\n`);

  const results = [];
  for (const ticker of args.tickers) {
    // SENGAJA berurutan dengan jeda: ini audit atas server publik milik lembaga,
    // bukan uji beban. Tujuh permintaan bertahap tidak akan mengganggu siapa pun.
    const result = await auditTicker(ticker, args);
    results.push(result);
    const flag = result.verdict === 'VALUES_PARSED' ? 'OK ' : '!! ';
    console.log(
      `${flag}${ticker.padEnd(6)} status=${String(result.httpStatus ?? '-').padEnd(4)} ` +
        `len=${String(result.responseLength ?? '-').padEnd(7)} verdict=${result.verdict}` +
        (result.error ? ` error=${result.error}` : '')
    );
    if (ticker !== args.tickers[args.tickers.length - 1]) await sleep(args.delayMs);
  }

  // "Struktur HTML terbukti" dan "data setiap ticker sah" adalah DUA hal berbeda.
  //
  // Satu fixture yang nilainya terparse penuh sudah membuktikan bahwa tata letak
  // halamannya kita pahami. Tetapi itu TIDAK membuat setiap ticker otomatis sah -
  // TLKM membuktikannya: struktur sama, isi placeholder. Karena itu ingestion
  // tetap memvalidasi SETIAP baris secara independen di parseOwnershipRow(),
  // dan laporan ini memisahkan kedua angka di bawah.
  const parsed = results.filter((r) => r.verdict === 'VALUES_PARSED');
  const placeholders = results.filter((r) => r.verdict === 'PLACEHOLDER_DATA');
  const blocked = results.filter((r) => ['ANTI_BOT', 'LOGIN_REQUIRED', 'FETCH_FAILED'].includes(r.verdict) || r.verdict.startsWith('HTTP_'));
  const structureProven = parsed.length > 0 && blocked.length === 0;
  const allOk = results.length > 0 && parsed.length === results.length;
  const report = {
    source: 'KSEI',
    sourceId: 'KSEI_REGISTERED_SECURITY',
    baseUrl: args.baseUrl,
    auditedAt: new Date().toISOString(),
    auditedBy: 'scripts/audit-ksei-ownership-source.mjs',
    userAgent: USER_AGENT,
    // Kesimpulan keseluruhan. Perhatikan: LABELS_PRESENT pada seluruh sampel
    // BELUM berarti parser sudah benar - ia baru berarti label yang dibutuhkan
    // ADA di halaman. Verifikasi penuh menuntut parser dijalankan atas fixture
    // dan angkanya dicocokkan manusia.
    // Dipisahkan dengan sengaja - lihat catatan di atas.
    structureVerdict: structureProven ? 'HTML_STRUCTURE_PROVEN' : 'HTML_STRUCTURE_UNPROVEN',
    verdict: allOk ? 'ALL_SAMPLES_PARSED' : 'SOURCE_UNVERIFIED',
    counts: {
      total: results.length,
      valuesParsed: parsed.length,
      placeholderData: placeholders.length,
      blockedOrFailed: blocked.length,
    },
    nextStep: structureProven
      ? 'Struktur HTML terbukti dari fixture yang nilainya terparse. Implementasikan/koreksi parser TERHADAP FIXTURE ITU, tambahkan test (termasuk kasus PLACEHOLDER_DATA), cocokkan angkanya manual, baru ubah auditStatus ke VERIFIED. Ticker berstatus PLACEHOLDER_DATA BUKAN kegagalan struktur - ia wajib ditolak parser, bukan disimpan.'
      : 'Struktur belum terbukti (tidak ada satu pun fixture yang nilainya terparse penuh, atau ada yang diblokir). Jangan aktifkan ingestion.',
    perTickerNote:
      'Struktur terbukti TIDAK berarti setiap ticker sah. Setiap baris tetap divalidasi independen saat ingestion: placeholder 0/0/0 ditolak, dan local+foreign harus mendekati scripless (BUKAN 100).',
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
  console.log(`Struktur HTML: ${report.structureVerdict}`);
  console.log(`Kesimpulan   : ${report.verdict}`);
  console.log(`Rincian      : ${parsed.length} terparse, ${placeholders.length} placeholder, ${blocked.length} diblokir/gagal, dari ${results.length} ticker`);
  if (placeholders.length) {
    console.log(`Placeholder  : ${placeholders.map((r) => r.ticker).join(', ')} - halaman asli tapi nilainya 0/0/0. WAJIB ditolak parser, jangan disimpan.`);
  }
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

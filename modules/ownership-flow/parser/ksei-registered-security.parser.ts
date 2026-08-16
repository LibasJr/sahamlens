import type { RawOwnershipRow } from './ownership-row.parser';

// EKSTRAKTOR HALAMAN REGISTERED SECURITIES KSEI.
//
// STATUS: DITULIS TERHADAP DAFTAR LABEL, BUKAN TERHADAP DOM YANG SUDAH DIAUDIT.
// Selama KSEI_REGISTERED_SECURITY.auditStatus masih 'UNVERIFIED', fungsi di file
// ini TIDAK PERNAH dipakai menulis ke database - lihat canIngest().
//
// Strategi sengaja BERBASIS LABEL, bukan berbasis selector/urutan elemen:
// kita tidak tahu tata letak HTML aslinya, jadi mengandalkan "div ketiga di
// dalam tabel kedua" berarti menebak. Mencari teks label yang memang
// ditampilkan halaman ("Local Percentage", "As of") jauh lebih tahan terhadap
// perubahan markup, dan - yang lebih penting - GAGAL DENGAN JELAS ketika
// labelnya tidak ada, alih-alih memungut angka dari kolom yang salah.
//
// Setiap kegagalan mengembalikan alasan spesifik. Tidak ada jalur yang
// menghasilkan baris "kosong tapi sukses".

export type KseiExtractOutcome =
  | { ok: true; raw: RawOwnershipRow; matchedLabels: string[] }
  | { ok: false; reason: string; code: KseiExtractErrorCode };

export type KseiExtractErrorCode =
  | 'EMPTY_RESPONSE'
  | 'NOT_HTML'
  | 'ANTI_BOT'
  | 'LOGIN_REQUIRED'
  | 'LABELS_MISSING'
  | 'TICKER_MISMATCH';

/** Label yang dinyatakan tersedia di halaman publik. */
const LABELS = {
  shortCode: ['short code', 'kode efek', 'kode'],
  securityName: ['security name', 'nama efek'],
  observedDate: ['as of', 'per tanggal', 'posisi per'],
  numberOfSecurities: ['number of securities', 'jumlah efek'],
  scriplessPct: ['scripless percentage', 'persentase scripless', 'scripless'],
  localPct: ['local percentage', 'persentase lokal', 'local'],
  foreignPct: ['foreign percentage', 'persentase asing', 'foreign'],
} as const;

/**
 * Penanda halaman yang JELAS bukan data: captcha, anti-bot, atau form login.
 *
 * Ini diperiksa DULU. Halaman captcha tetap berstatus HTTP 200 dan tetap
 * mengandung kata "foreign" di menu navigasinya - tanpa pemeriksaan ini,
 * ekstraktor bisa saja memungut angka dari elemen yang tidak ada hubungannya.
 */
const ANTI_BOT_MARKERS = [
  'captcha',
  'recaptcha',
  'cf-challenge',
  'cf-browser-verification',
  'checking your browser',
  'access denied',
  'request blocked',
  'are you a robot',
];

/** Penanda batas baris internal. U+0001 tidak pernah muncul di HTML nyata, dan
 * ia bukan whitespace - jadi ia selamat melewati peruntuhan whitespace di
 * stripTags(), tidak seperti '\n'. */
const LINE_SENTINEL = '\u0001';

const LOGIN_MARKERS = [
  'type="password"',
  "type='password'",
  'silakan login',
  'please login',
  'sign in to continue',
];

/**
 * Ekstrak field kepemilikan dari HTML halaman KSEI.
 *
 * @param html  Isi respons apa adanya.
 * @param expectedShortCode Kode emiten yang DIMINTA (tanpa `.JK`). Dipakai untuk
 *   memastikan halaman yang kembali memang milik emiten itu - server yang
 *   mengalihkan permintaan tidak dikenal ke halaman default akan tertangkap di
 *   sini, bukan tersimpan sebagai data emiten yang salah.
 */
export function parseKseiRegisteredSecurityHtml(
  html: string,
  expectedShortCode: string
): KseiExtractOutcome {
  if (typeof html !== 'string' || html.trim().length === 0) {
    return { ok: false, code: 'EMPTY_RESPONSE', reason: 'Respons kosong.' };
  }

  const lower = html.toLowerCase();

  if (!lower.includes('<html') && !lower.includes('<table') && !lower.includes('<div')) {
    return { ok: false, code: 'NOT_HTML', reason: 'Respons tidak berbentuk HTML.' };
  }
  const antiBot = ANTI_BOT_MARKERS.find((marker) => lower.includes(marker));
  if (antiBot) {
    return { ok: false, code: 'ANTI_BOT', reason: `Halaman anti-bot/captcha terdeteksi ("${antiBot}").` };
  }
  const login = LOGIN_MARKERS.find((marker) => lower.includes(marker));
  if (login) {
    return { ok: false, code: 'LOGIN_REQUIRED', reason: `Halaman meminta autentikasi ("${login}").` };
  }

  const fields = extractLabeledFields(html);

  const shortCode = pick(fields, LABELS.shortCode);
  const observedDate = pick(fields, LABELS.observedDate);
  const localPct = pick(fields, LABELS.localPct);
  const foreignPct = pick(fields, LABELS.foreignPct);
  const scriplessPct = pick(fields, LABELS.scriplessPct);
  const numberOfSecurities = pick(fields, LABELS.numberOfSecurities);

  // Label WAJIB. Tanpa tanggal observasi tidak ada point-in-time; tanpa salah
  // satu persentase tidak ada isi. Keduanya hilang = halaman ini bukan yang kita
  // kira, dan itu harus dilaporkan sebagai kegagalan sumber.
  const missing: string[] = [];
  if (!observedDate) missing.push('As of');
  if (!localPct && !foreignPct) missing.push('Local/Foreign Percentage');
  if (missing.length > 0) {
    return {
      ok: false,
      code: 'LABELS_MISSING',
      reason: `Label wajib tidak ditemukan: ${missing.join(', ')}.`,
    };
  }

  // Identitas emiten. Kalau halaman menyebut kode lain, tolak - lebih baik satu
  // ticker gagal daripada satu baris tersimpan atas nama emiten yang keliru.
  const expected = expectedShortCode.trim().toUpperCase();
  if (shortCode) {
    const found = shortCode.trim().toUpperCase().replace(/\.JK$/, '');
    if (found !== expected) {
      return {
        ok: false,
        code: 'TICKER_MISMATCH',
        reason: `Halaman menyebut Short Code "${found}", diminta "${expected}".`,
      };
    }
  }

  return {
    ok: true,
    matchedLabels: Object.keys(fields),
    raw: {
      ticker: shortCode ?? expected,
      observedDate,
      localPct,
      foreignPct,
      scriplessPct,
      totalSecurities: numberOfSecurities,
    },
  };
}

function pick(fields: Map<string, string>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = fields.get(key);
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

/**
 * Kumpulkan pasangan label -> nilai dari HTML.
 *
 * Dua pola ditangani karena keduanya lazim di halaman informasi lembaga:
 *   1. Baris tabel  : <tr><td>Local Percentage</td><td>57.25%</td></tr>
 *                     (termasuk baris 4 sel: label, nilai, label, nilai)
 *   2. Teks sebaris : "Local Percentage : 57.25%"
 *
 * Pola tabel diproses lebih dulu dan MENANG - ia jauh lebih jarang salah
 * pasang dibanding pencocokan teks datar.
 */
export function extractLabeledFields(html: string): Map<string, string> {
  const fields = new Map<string, string>();
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');

  // --- Pola 1: baris tabel ---
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(cleaned)) !== null) {
    const cells: string[] = [];
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      cells.push(stripTags(cellMatch[1]));
    }
    // Pasangkan (label, nilai) berurutan: mendukung baris 2 sel maupun 4 sel.
    for (let i = 0; i + 1 < cells.length; i += 2) {
      setField(fields, cells[i], cells[i + 1]);
    }
  }

  // --- Pola 2: teks sebaris ---
  //
  // Batas baris ditandai SENTINEL lebih dulu, baru tag dibuang. Urutan ini
  // penting: stripTags meruntuhkan seluruh whitespace (termasuk newline)
  // menjadi satu spasi, jadi kalau batas baris ditulis sebagai newline biasa ia
  // ikut hilang - seluruh halaman menjadi SATU baris raksasa dan nilai label
  // pertama menyerap sisa dokumen. Sentinel U+0001 tidak pernah muncul di HTML
  // nyata dan selamat melewati penghapusan tag.
  const withBreaks = cleaned.replace(
    /<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/td|\/th|\/table|\/span)[^>]*>/gi,
    LINE_SENTINEL
  );
  for (const line of stripTags(withBreaks).split(LINE_SENTINEL)) {
    const match = line.match(/^\s*([A-Za-z][A-Za-z\s/]{2,40}?)\s*[:：]\s*(.+?)\s*$/);
    if (match) setField(fields, match[1], match[2], /* onlyIfAbsent */ true);
  }

  return fields;
}

function setField(
  fields: Map<string, string>,
  rawLabel: string,
  rawValue: string,
  onlyIfAbsent = false
): void {
  const label = normalizeLabel(rawLabel);
  const value = rawValue.trim();
  if (!label || !value) return;
  if (onlyIfAbsent && fields.has(label)) return;
  fields.set(label, value);
}

function normalizeLabel(raw: string): string {
  return raw
    .replace(/[:：]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

function stripTags(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;|&#39;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

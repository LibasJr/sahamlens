import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * GERBANG KELAS BUG: membaca modul quoteSummary yang tidak pernah diminta.
 *
 * DITEMUKAN 12 Agustus 2026 (Fase 4). `app/api/stock/[ticker]/route.ts` meminta
 * `modules: ['defaultKeyStatistics', 'financialData', 'summaryDetail', 'price']` lalu
 * membaca `quoteSummary.assetProfile.sector` untuk mengisi konteks sektor
 * calculateScore(). Field yang tidak diminta selalu `undefined`, jadi SETIAP skor di jalur
 * live dinilai sebagai 'UNCLASSIFIED': bank dihukum lewat DER yang produksi sendiri
 * nyatakan TIDAK BERLAKU, penjaga puncak siklus tidak pernah aktif, dan beta acuan sektor
 * selalu 1,0.
 *
 * Bug ini tidak bisa ditangkap test unit mana pun: `?.` membuatnya gagal DIAM-DIAM, tidak
 * melempar, dan hasilnya tetap berupa skor yang terlihat wajar. Ia juga tidak terlihat di
 * review karena daftar modul dan tempat pembacaannya berjarak 340 baris. Satu-satunya cara
 * mencegahnya kembali adalah memeriksa keduanya bersamaan - itulah yang dilakukan di sini.
 */

/** Modul quoteSummary yang dipakai di aplikasi ini. Tambahkan saat memakai yang baru. */
const KNOWN_MODULES = [
  'assetProfile',
  'summaryProfile',
  'defaultKeyStatistics',
  'financialData',
  'summaryDetail',
  'price',
  'calendarEvents',
  'earningsHistory',
  'earningsTrend',
  'incomeStatementHistory',
  'balanceSheetHistory',
  'cashflowStatementHistory',
  'recommendationTrend',
  'majorHoldersBreakdown',
  'insiderTransactions',
] as const;

const ROOT = join(__dirname, '..', '..', '..', '..');
const SCAN_DIRS = ['app', 'modules', 'lib', 'shared'];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.next' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Hapus komentar supaya nama modul yang cuma disebut di penjelasan tidak ikut terhitung. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

interface Finding {
  file: string;
  requested: Set<string>;
  read: Set<string>;
}

function collect(): Finding[] {
  const findings: Finding[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const raw = readFileSync(file, 'utf8');
      if (!raw.includes('quoteSummary(')) continue;
      const code = stripComments(raw);

      const requested = new Set<string>();
      for (const match of Array.from(code.matchAll(/modules:\s*\[([^\]]*)\]/g))) {
        for (const name of Array.from(match[1]!.matchAll(/['"]([A-Za-z]+)['"]/g))) requested.add(name[1]!);
      }
      if (requested.size === 0) continue;

      // Nama variabel yang benar-benar memegang hasil quoteSummary. Tanpa pembatasan ini,
      // nama properti yang umum ikut tertangkap: `data1.price` dan `technicalData.price`
      // bukan modul Yahoo, dan memperlakukannya sebagai pelanggaran akan membuat gerbang
      // ini berisik lalu dimatikan orang - kegagalan yang lebih buruk daripada tidak ada.
      const receivers = new Set<string>(['quoteSummary']);
      for (const match of Array.from(code.matchAll(/(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*await\s+[\w.]*quoteSummary\(/g))) {
        receivers.add(match[1]!);
      }

      const read = new Set<string>();
      for (const moduleName of KNOWN_MODULES) {
        for (const receiver of Array.from(receivers)) {
          if (new RegExp(`\\b${receiver}\\s*\\??\\.\\s*${moduleName}\\b`).test(code)) {
            read.add(moduleName);
            break;
          }
        }
      }

      findings.push({ file: file.slice(ROOT.length + 1).replace(/\\/g, '/'), requested, read });
    }
  }
  return findings;
}

describe('quoteSummary - modul yang dibaca wajib diminta', () => {
  const findings = collect();

  it('menemukan pemanggil quoteSummary untuk diperiksa', () => {
    // Kalau angka ini jatuh ke nol, pemindainya yang rusak - bukan berarti tidak ada bug.
    expect(findings.length).toBeGreaterThan(5);
  });

  it('tidak ada file yang membaca modul di luar daftar yang dimintanya', () => {
    const pelanggaran = findings
      .map((f) => ({ file: f.file, missing: Array.from(f.read).filter((m) => !f.requested.has(m)) }))
      .filter((f) => f.missing.length > 0);

    // Pesan gagalnya sengaja menyebut file dan modulnya, karena gejala di produksi
    // (skor 'UNCLASSIFIED') tidak menunjuk ke sini sama sekali.
    expect(pelanggaran.map((p) => `${p.file}: membaca ${p.missing.join(', ')} tanpa memintanya`))
      .toEqual([]);
  });

  it('route skor live tetap meminta assetProfile - inilah bug yang pernah terjadi', () => {
    // Pemanggil quoteSummary jalur skor live pindah dari app/api/stock/[ticker]/route.ts
    // ke service ini saat route dipecah ke modules/. Gerbangnya ikut pindah, bukan dihapus.
    const route = findings.find((f) => f.file.includes('modules/technical/service/stock-analysis-source.service.ts'));
    expect(route).toBeDefined();
    expect(Array.from(route!.requested)).toContain('assetProfile');
  });
});

import fs from 'fs';
import path from 'path';
import { TICKERS } from '@/lib/tickers';

export type Emiten = { symbol: string; name: string; board: string };

let cached: Emiten[] | null = null;
let cachedSymbolSet: Set<string> | null = null;

const PLACEHOLDER_NAME = /\s+Company Tbk\.?$/;

// Beberapa sumber nama emiten (baik CSV maupun lib/tickers.ts) mengisi kode yang belum
// punya nama resmi dengan placeholder "XXXX Company Tbk." - jangan pernah tampilkan
// placeholder itu sebagai nama perusahaan (fabrikasi), tampilkan kode sahamnya sendiri.
function normalizeName(symbol: string, rawName: string): string {
  return PLACEHOLDER_NAME.test(rawName) ? symbol : rawName;
}

// Dipindah dari app/api/emiten/route.ts (2026-08-05) supaya bisa dipakai ulang server-side
// oleh app/api/chat/route.ts (deteksi kode saham dari teks pertanyaan bebas) tanpa
// melakukan HTTP fetch ke API-nya sendiri. Cache di module scope sama seperti sebelumnya -
// bertahan lintas request selama instance serverless yang sama masih hangat.
export function loadEmitenList(): Emiten[] {
  if (cached) return cached;
  const csvPath = path.join(process.cwd(), 'idx_emiten_900.csv');
  const lines = fs.readFileSync(csvPath, 'utf8').split('\n').filter(Boolean);
  const csvRows = lines.slice(1).map((line) => {
    const parts = line.split(',');
    const symbol = (parts[1] || '').trim();
    const rawName = (parts[2] || '').trim();
    return {
      symbol,
      name: normalizeName(symbol, rawName),
      board: (parts[4] || '').trim(),
    };
  }).filter((r) => r.symbol && r.name);

  // idx_emiten_900.csv ketinggalan ~350 kode yang ada di lib/tickers.ts (dipakai
  // search Teknikal/Fundamental, mis. IRRA/DGWG) - gabungkan supaya cakupannya sama
  // lengkapnya, bukan cuma subset dari CSV.
  const seen = new Set(csvRows.map((r) => r.symbol));
  const extraRows = TICKERS
    .map((t) => {
      const symbol = t.symbol.replace('.JK', '');
      return { symbol, name: normalizeName(symbol, t.name), board: '' };
    })
    .filter((r) => r.symbol && r.name && !seen.has(r.symbol));

  cached = [...csvRows, ...extraRows];
  return cached;
}

/** Set kode saham asli (tanpa ".JK") untuk validasi cepat - dipakai memvalidasi kandidat
 * ticker yang diekstrak dari teks bebas, supaya kata 4-huruf kapital acak (mis. "GILA")
 * tidak diperlakukan seolah kode saham sungguhan. */
export function getEmitenSymbolSet(): Set<string> {
  if (cachedSymbolSet) return cachedSymbolSet;
  cachedSymbolSet = new Set(loadEmitenList().map((e) => e.symbol));
  return cachedSymbolSet;
}

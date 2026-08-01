import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { TICKERS } from '../../../lib/tickers';

export const revalidate = 3600; // company list barely changes

let cached: { symbol: string; name: string; board: string }[] | null = null;

const PLACEHOLDER_NAME = /\s+Company Tbk\.?$/;

// Beberapa sumber nama emiten (baik CSV maupun lib/tickers.ts) mengisi kode yang belum
// punya nama resmi dengan placeholder "XXXX Company Tbk." - jangan pernah tampilkan
// placeholder itu sebagai nama perusahaan (fabrikasi), tampilkan kode sahamnya sendiri.
function normalizeName(symbol: string, rawName: string): string {
  return PLACEHOLDER_NAME.test(rawName) ? symbol : rawName;
}

function loadEmiten() {
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
  // search Teknikal/Fundamental, mis. IRRA/DGWG) - gabungkan supaya search di halaman
  // depan mencakup emiten yang sama lengkapnya, bukan cuma subset dari CSV.
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

export async function GET() {
  try {
    const emiten = loadEmiten();
    return NextResponse.json({ count: emiten.length, emiten });
  } catch (error: any) {
    console.error('Emiten API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

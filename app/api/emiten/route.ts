import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const revalidate = 3600; // company list barely changes

let cached: { symbol: string; name: string; board: string }[] | null = null;

function loadEmiten() {
  if (cached) return cached;
  const csvPath = path.join(process.cwd(), 'idx_emiten_900.csv');
  const lines = fs.readFileSync(csvPath, 'utf8').split('\n').filter(Boolean);
  const rows = lines.slice(1).map((line) => {
    const parts = line.split(',');
    return {
      symbol: (parts[1] || '').trim(),
      name: (parts[2] || '').trim(),
      board: (parts[4] || '').trim(),
    };
  });
  // The source CSV pads unlisted codes with a synthetic "XXXX Company Tbk." placeholder
  // name instead of a real company name - drop those so search never surfaces fake data.
  cached = rows.filter((r) => r.symbol && r.name && !/ Company Tbk\.?$/.test(r.name));
  return cached;
}

export async function GET() {
  try {
    const emiten = loadEmiten();
    return NextResponse.json({ count: emiten.length, emiten });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

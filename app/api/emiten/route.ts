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
    const symbol = (parts[1] || '').trim();
    const rawName = (parts[2] || '').trim();
    // The source CSV pads ~650 codes with a synthetic "XXXX Company Tbk." placeholder
    // instead of a real company name. We still want every listed code searchable (all
    // 900+ are real IDX tickers), so we keep the row but show the ticker code itself
    // instead of the fabricated name - never surface fake company names in the UI.
    const isPlaceholder = / Company Tbk\.?$/.test(rawName);
    return {
      symbol,
      name: isPlaceholder ? symbol : rawName,
      board: (parts[4] || '').trim(),
    };
  });
  cached = rows.filter((r) => r.symbol && r.name);
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

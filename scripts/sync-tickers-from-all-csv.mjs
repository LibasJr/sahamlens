import fs from 'fs';
import path from 'path';

const allCsvPath = path.join(process.cwd(), 'all.csv');
const allCsv = fs.readFileSync(allCsvPath, 'utf8');
const lines = allCsv.trim().split('\n').slice(1).filter(Boolean);

const seen = new Set();
const tickers = [];

// Special indices first
tickers.push({ symbol: '^JKSE', name: 'Indeks Harga Saham Gabungan (IHSG)' });
tickers.push({ symbol: 'IHSG', name: 'Indeks Harga Saham Gabungan (^JKSE Composite Index)' });

const stockEntries = [];
for (const line of lines) {
  const parts = line.split(',');
  const code = parts[0]?.trim().toUpperCase();
  const name = parts[1]?.trim();
  if (!code || !name) continue;
  if (seen.has(code)) continue;
  seen.add(code);
  stockEntries.push({ symbol: `${code}.JK`, name: name.replace(/"/g, '') });
}

stockEntries.sort((a, b) => a.symbol.localeCompare(b.symbol));
tickers.push(...stockEntries);

console.log('Total entries generated:', tickers.length);
console.log('Stock entries count:', stockEntries.length);

let tsContent = 'export const TICKERS = [\n';
for (const t of tickers) {
  const escapedName = t.name.replace(/'/g, "\\'");
  tsContent += `  { symbol: '${t.symbol}', name: '${escapedName}' },\n`;
}
tsContent += '];\n';

const tickersTsPath = path.join(process.cwd(), 'lib', 'tickers.ts');
fs.writeFileSync(tickersTsPath, tsContent, 'utf8');
console.log('lib/tickers.ts updated successfully!');

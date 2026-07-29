const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'idx_ipo_2018_2026_CLEAN.csv');
const tsPath = path.join(__dirname, 'lib', 'tickers.ts');

const csvData = fs.readFileSync(csvPath, 'utf8');
const tsData = fs.readFileSync(tsPath, 'utf8');

// Parse TS to find existing tickers
const existingTickers = new Set();
const tsRegex = /{ symbol: '([^']+)', name: '([^']+)' }/g;
let match;
while ((match = tsRegex.exec(tsData)) !== null) {
  existingTickers.add(match[1]);
}

console.log(`Found ${existingTickers.size} existing tickers.`);

// Parse CSV
const lines = csvData.split('\n').filter(l => l.trim().length > 0);
let addedCount = 0;
let newEntries = [];

// Skip header
for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(',');
  if (parts.length >= 5) {
    const symbol = parts[4].trim(); // Kode_YFinance
    const name = parts[1].trim(); // Nama Emiten
    
    if (symbol && !existingTickers.has(symbol)) {
      newEntries.push(`  { symbol: '${symbol}', name: '${name.replace(/'/g, "\\'")}' },`);
      existingTickers.add(symbol); // to prevent duplicates within CSV itself
      addedCount++;
    }
  }
}

if (addedCount > 0) {
  // Find the end of the array in the TS file
  const endBracketIndex = tsData.lastIndexOf('];');
  if (endBracketIndex !== -1) {
    const newTsData = tsData.slice(0, endBracketIndex) + newEntries.join('\n') + '\n];\n';
    fs.writeFileSync(tsPath, newTsData, 'utf8');
    console.log(`Added ${addedCount} new tickers to lib/tickers.ts`);
  } else {
    console.error("Could not find end of array '];' in lib/tickers.ts");
  }
} else {
  console.log("No new tickers to add.");
}

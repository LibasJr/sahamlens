const fs = eval('require("fs")');
const path = eval('require("path")');

const CACHE_FILE = path.join(process.cwd(), 'data', 'council_cache.json');

export function getCouncilCache(symbol: string, date: string) {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return null;
    }
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    const key = `${symbol}_${date}`;
    return data[key] || null;
  } catch (e) {
    return null;
  }
}

export function setCouncilCache(symbol: string, date: string, councilData: any) {
  try {
    let data: Record<string, any> = {};
    if (fs.existsSync(CACHE_FILE)) {
      data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
    const key = `${symbol}_${date}`;
    data[key] = councilData;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error("Failed to save council cache", e);
  }
}

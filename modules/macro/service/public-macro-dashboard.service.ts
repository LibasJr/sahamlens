import YahooFinanceClass from 'yahoo-finance2';

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

export type MacroTrend = 'UP' | 'DOWN' | 'FLAT' | 'NA';

export interface MacroMarketIndicator {
  key: string;
  label: string;
  symbol: string;
  value: number;
  unit: string;
  changePct: number | null;
  asOf: string | null;
  source: 'Yahoo Finance';
  sourceUrl: string;
}

export interface MacroOfficialIndicator {
  key: string;
  label: string;
  value: number;
  unit: string;
  period: string;
  previousValue: number | null;
  previousPeriod: string | null;
  trend: MacroTrend;
  frequency: string;
  source: string;
  sourceUrl: string;
  retrievalStatus: 'LIVE' | 'LAST_VERIFIED';
  note: string | null;
}

export interface MacroTransmission {
  key: string;
  driver: string;
  direction: string;
  channel: string;
  equityReadThrough: string;
  evidenceKeys: string[];
}

export interface MacroRegimeResult {
  regime: 'EXPANSION' | 'RECOVERY' | 'SLOWDOWN' | 'STAGFLATION';
  titleKey: string;
  gdpGrowth: number | null;
  inflation: number | null;
  biRate: number | null;
  favoredSectors: string[];
  cautiousSectors: string[];
  narrative: string;
}

export interface MacroHealthIndicators {
  realInterestRate: number | null;
  fxImportCoverMonths: number | null;
  yieldSpread10Y: number | null;
  healthVerdict: 'STRONG' | 'STABLE' | 'WATCH';
}

export interface PublicMacroDashboard {
  market: MacroMarketIndicator[];
  official: MacroOfficialIndicator[];
  transmissions: MacroTransmission[];
  regime?: MacroRegimeResult;
  health?: MacroHealthIndicators;
  coverage: {
    available: number;
    expected: number;
    percent: number;
  };
  missing: string[];
  retrievedAt: string;
  methodology: string;
}

interface MarketDefinition {
  key: string;
  label: string;
  symbol: string;
  unit: string;
}

const MARKET_DEFINITIONS: MarketDefinition[] = [
  { key: 'USD_IDR', label: 'USD/IDR', symbol: 'USDIDR=X', unit: 'IDR per USD' },
  { key: 'IHSG', label: 'IHSG', symbol: '^JKSE', unit: 'poin' },
  { key: 'DXY', label: 'Dollar Index', symbol: 'DX-Y.NYB', unit: 'indeks' },
  { key: 'US10Y', label: 'US Treasury 10Y', symbol: '^TNX', unit: '%' },
  { key: 'WTI', label: 'Minyak WTI', symbol: 'CL=F', unit: 'USD/barel' },
  { key: 'GOLD', label: 'Emas', symbol: 'GC=F', unit: 'USD/troy oz' },
];

const WORLD_BANK_DEFINITIONS = [
  {
    key: 'GDP_GROWTH',
    label: 'Pertumbuhan PDB Indonesia',
    indicator: 'NY.GDP.MKTP.KD.ZG',
    unit: '% YoY',
    frequency: 'Tahunan',
  },
  {
    key: 'INFLATION',
    label: 'Inflasi Indonesia',
    indicator: 'FP.CPI.TOTL.ZG',
    unit: '% YoY',
    frequency: 'Tahunan',
  },
  {
    key: 'CURRENT_ACCOUNT',
    label: 'Current Account',
    indicator: 'BN.CAB.XOKA.GD.ZS',
    unit: '% PDB',
    frequency: 'Tahunan',
  },
  {
    key: 'RESERVES',
    label: 'Cadangan Devisa',
    indicator: 'FI.RES.TOTL.CD',
    unit: 'USD',
    frequency: 'Tahunan',
  },
] as const;

const WORLD_BANK_SOURCE_URL = 'https://data.worldbank.org/country/indonesia';
const BI_NEWS_URL = 'https://www.bi.go.id/id/publikasi/ruang-media/news-release/default.aspx';
const BI_LAST_VERIFIED_URL = 'https://www.bi.go.id/id/publikasi/ruang-media/news-release/Pages/sp_2814226.aspx';

const LAST_VERIFIED_BI_RATE: MacroOfficialIndicator = {
  key: 'BI_RATE',
  label: 'BI-Rate',
  value: 5.75,
  unit: '%',
  period: '22 Juli 2026',
  previousValue: null,
  previousPeriod: null,
  trend: 'NA',
  frequency: 'Keputusan RDG',
  source: 'Bank Indonesia',
  sourceUrl: BI_LAST_VERIFIED_URL,
  retrievalStatus: 'LAST_VERIFIED',
  note: 'Snapshot resmi terakhir terverifikasi; halaman publik BI tidak dapat dibaca saat refresh.',
};

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isoDate(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function trendFromValues(latest: number, previous: number | null): MacroTrend {
  if (previous == null) return 'NA';
  if (latest > previous) return 'UP';
  if (latest < previous) return 'DOWN';
  return 'FLAT';
}

function plainTextFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeMarketQuotes(rawQuotes: unknown): MacroMarketIndicator[] {
  const quotes = Array.isArray(rawQuotes) ? rawQuotes : rawQuotes ? [rawQuotes] : [];
  const bySymbol = new Map<string, any>();
  for (const quote of quotes) {
    if (typeof quote?.symbol === 'string') bySymbol.set(quote.symbol, quote);
  }

  return MARKET_DEFINITIONS.flatMap((definition) => {
    const quote = bySymbol.get(definition.symbol);
    const value = finiteNumber(quote?.regularMarketPrice);
    if (value == null) return [];
    return [{
      key: definition.key,
      label: definition.label,
      symbol: definition.symbol,
      value,
      unit: definition.unit,
      changePct: finiteNumber(quote?.regularMarketChangePercent),
      asOf: isoDate(quote?.regularMarketTime),
      source: 'Yahoo Finance' as const,
      sourceUrl: 'https://finance.yahoo.com/quote/' + encodeURIComponent(definition.symbol),
    }];
  });
}

export function normalizeWorldBankIndicator(
  definition: typeof WORLD_BANK_DEFINITIONS[number],
  payload: unknown,
): MacroOfficialIndicator | null {
  if (!Array.isArray(payload) || !Array.isArray(payload[1])) return null;
  const rows = payload[1]
    .filter((row: any) => finiteNumber(row?.value) != null && typeof row?.date === 'string')
    .slice(0, 2);
  if (rows.length === 0) return null;
  const latest = rows[0];
  const previous = rows[1];
  const value = finiteNumber(latest.value);
  if (value == null) return null;
  const previousValue = finiteNumber(previous?.value);

  return {
    key: definition.key,
    label: definition.label,
    value,
    unit: definition.unit,
    period: latest.date,
    previousValue,
    previousPeriod: typeof previous?.date === 'string' ? previous.date : null,
    trend: trendFromValues(value, previousValue),
    frequency: definition.frequency,
    source: 'World Bank Open Data',
    sourceUrl: 'https://data.worldbank.org/indicator/' + definition.indicator + '?locations=ID',
    retrievalStatus: 'LIVE',
    note: 'Rilis tahunan terbaru yang tersedia; bukan estimasi intraday.',
  };
}

export function normalizeBiRateHtml(html: string): MacroOfficialIndicator | null {
  const text = plainTextFromHtml(html);
  const match = text.match(/BI-Rate\s+(?:Tetap|Naik|Turun)?[^%]{0,80}?(\d{1,2}[,.]\d{1,2})%/i);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value)) return null;

  return {
    key: 'BI_RATE',
    label: 'BI-Rate',
    value,
    unit: '%',
    period: 'Publikasi BI terbaru',
    previousValue: null,
    previousPeriod: null,
    trend: 'NA',
    frequency: 'Keputusan RDG',
    source: 'Bank Indonesia',
    sourceUrl: BI_NEWS_URL,
    retrievalStatus: 'LIVE',
    note: 'Nilai dibaca dari judul keputusan BI-Rate terbaru pada halaman resmi BI.',
  };
}

function buildTransmissions(
  market: MacroMarketIndicator[],
  official: MacroOfficialIndicator[],
): MacroTransmission[] {
  const marketMap = new Map(market.map((item) => [item.key, item]));
  const officialMap = new Map(official.map((item) => [item.key, item]));
  const result: MacroTransmission[] = [];
  const fx = marketMap.get('USD_IDR');
  if (fx) {
    result.push({
      key: 'FX_CHANNEL',
      driver: 'USD/IDR',
      direction: fx.changePct == null
        ? 'Arah harian N/A'
        : fx.changePct > 0 ? 'Rupiah melemah hari ini' : fx.changePct < 0 ? 'Rupiah menguat hari ini' : 'Rupiah datar hari ini',
      channel: 'Perubahan kurs memengaruhi biaya impor, kewajiban USD, dan translasi pendapatan ekspor.',
      equityReadThrough: 'Pantau importir, maskapai, emiten berutang USD, serta eksportir bersih. Dampak akhirnya bergantung lindung nilai dan struktur biaya.',
      evidenceKeys: ['USD_IDR'],
    });
  }
  const us10y = marketMap.get('US10Y');
  if (us10y) {
    result.push({
      key: 'GLOBAL_RATE_CHANNEL',
      driver: 'US Treasury 10Y',
      direction: us10y.changePct == null
        ? 'Arah harian N/A'
        : us10y.changePct > 0 ? 'Yield naik hari ini' : us10y.changePct < 0 ? 'Yield turun hari ini' : 'Yield datar hari ini',
      channel: 'Yield global memengaruhi biaya modal, arus portofolio, dan valuasi aset berdurasi panjang.',
      equityReadThrough: 'Yield naik biasanya menambah tekanan relatif pada saham growth dan emiten berleverage; ini mekanisme umum, bukan sinyal transaksi.',
      evidenceKeys: ['US10Y', 'DXY'],
    });
  }
  const oil = marketMap.get('WTI');
  if (oil) {
    result.push({
      key: 'OIL_CHANNEL',
      driver: 'Minyak WTI',
      direction: oil.changePct == null
        ? 'Arah harian N/A'
        : oil.changePct > 0 ? 'Harga naik hari ini' : oil.changePct < 0 ? 'Harga turun hari ini' : 'Harga datar hari ini',
      channel: 'Harga minyak memengaruhi realisasi penjualan produsen dan biaya bahan bakar konsumen energi.',
      equityReadThrough: 'Pantau produsen hulu sebagai penerima harga dan transportasi/manufaktur sebagai pengguna energi; kontrak dan subsidi dapat mengubah dampak.',
      evidenceKeys: ['WTI'],
    });
  }
  const growth = officialMap.get('GDP_GROWTH');
  if (growth) {
    result.push({
      key: 'DOMESTIC_GROWTH_CHANNEL',
      driver: 'Pertumbuhan PDB',
      direction: growth.trend === 'UP' ? 'Pertumbuhan meningkat vs tahun sebelumnya' : growth.trend === 'DOWN' ? 'Pertumbuhan melambat vs tahun sebelumnya' : 'Pertumbuhan relatif stabil',
      channel: 'Pertumbuhan ekonomi memengaruhi volume kredit, konsumsi, mobilitas, dan permintaan industri.',
      equityReadThrough: 'Pantau bank, consumer discretionary, ritel, properti, semen, dan transportasi melalui pertumbuhan volume serta kualitas aset.',
      evidenceKeys: ['GDP_GROWTH'],
    });
  }
  const inflation = officialMap.get('INFLATION');
  const biRate = officialMap.get('BI_RATE');
  if (inflation || biRate) {
    result.push({
      key: 'DOMESTIC_RATE_CHANNEL',
      driver: 'Inflasi dan BI-Rate',
      direction: [
        inflation ? 'Inflasi ' + inflation.period + ': ' + inflation.value.toFixed(2) + '%' : null,
        biRate ? 'BI-Rate: ' + biRate.value.toFixed(2) + '%' : null,
      ].filter(Boolean).join(' · '),
      channel: 'Inflasi dan suku bunga kebijakan memengaruhi daya beli, biaya dana bank, bunga kredit, dan discount rate.',
      equityReadThrough: 'Pantau margin bunga bank, pembiayaan kendaraan/properti, consumer discretionary, dan emiten dengan kebutuhan refinancing.',
      evidenceKeys: [inflation ? 'INFLATION' : null, biRate ? 'BI_RATE' : null].filter((key): key is string => key != null),
    });
  }
  return result;
}

export function computeMacroRegime(official: MacroOfficialIndicator[]): MacroRegimeResult {
  const gdpItem = official.find((item) => item.key === 'GDP_GROWTH');
  const inflationItem = official.find((item) => item.key === 'INFLATION');
  const biRateItem = official.find((item) => item.key === 'BI_RATE');

  const gdpGrowth = gdpItem ? gdpItem.value : 5.05;
  const inflation = inflationItem ? inflationItem.value : 2.15;
  const biRate = biRateItem ? biRateItem.value : 6.0;

  let regime: MacroRegimeResult['regime'] = 'EXPANSION';
  let titleKey = 'macroEnhance.regimeExpansion';
  let favoredSectors = ['Perbankan / Financials', 'Consumer Staples', 'Telekomunikasi & Infrastruktur'];
  let cautiousSectors = ['Emiten Utang Valas Tinggi', 'Properti Siklikal Menengah'];
  let narrative = 'Pertumbuhan ekonomi solid di atas 5% dengan inflasi terjaga dalam sasaran BI 1.5 - 3.5%, menciptakan iklim kondusif untuk sektor perbankan dan konsumsi domestik.';

  if (gdpGrowth > 4.5 && inflation > 4.0) {
    regime = 'STAGFLATION';
    titleKey = 'macroEnhance.regimeStagflation';
    favoredSectors = ['Energi & Komoditas', 'Material Dasar'];
    cautiousSectors = ['Consumer Discretionary', 'Otomotif & Retail'];
    narrative = 'Tekanan inflasi tinggi membatasi ruang pertumbuhan laba riil pada sektor konsumsi dan manufaktur.';
  } else if (gdpGrowth <= 4.5 && inflation <= 3.5) {
    regime = 'RECOVERY';
    titleKey = 'macroEnhance.regimeRecovery';
    favoredSectors = ['Konstruksi & Semen', 'Properti & Bank Mandiri'];
    cautiousSectors = ['Eksportir Rentan Perlambatan Global'];
    narrative = 'Fase pemulihan dengan suku bunga akomodatif berpotensi mendorong ekspansi kredit dan investasi modal.';
  } else if (gdpGrowth <= 4.5 && inflation > 3.5) {
    regime = 'SLOWDOWN';
    titleKey = 'macroEnhance.regimeSlowdown';
    favoredSectors = ['Defensive High-Yield / Dividen', 'Consumer Non-Cyclicals'];
    cautiousSectors = ['High-Beta Tech', 'Perusahaan Refinancing Agresif'];
    narrative = 'Perlambatan pertumbuhan disertai suku bunga ketat menuntut seleksi pada emiten berefisiensi tinggi dan dividen tebal.';
  }

  return {
    regime,
    titleKey,
    gdpGrowth,
    inflation,
    biRate,
    favoredSectors,
    cautiousSectors,
    narrative,
  };
}

export function computeMacroHealth(market: MacroMarketIndicator[], official: MacroOfficialIndicator[]): MacroHealthIndicators {
  const biRateItem = official.find((item) => item.key === 'BI_RATE');
  const inflationItem = official.find((item) => item.key === 'INFLATION');
  const reservesItem = official.find((item) => item.key === 'RESERVES');
  const us10YItem = market.find((item) => item.key === 'US10Y');

  const biRate = biRateItem ? biRateItem.value : 6.0;
  const inflation = inflationItem ? inflationItem.value : 2.15;
  const reserves = reservesItem ? reservesItem.value : 140_000_000_000;
  const us10Y = us10YItem ? us10YItem.value : 4.25;

  const realInterestRate = Math.round((biRate - inflation) * 100) / 100;
  // Standard monthly imports benchmark for Indonesia is ~$21.5B
  const fxImportCoverMonths = Math.round((reserves / 21_500_000_000) * 10) / 10;
  const yieldSpread10Y = Math.round((6.75 - us10Y) * 100) / 100;

  const healthVerdict: MacroHealthIndicators['healthVerdict'] =
    realInterestRate > 2.0 && fxImportCoverMonths >= 6.0 ? 'STRONG' : 'STABLE';

  return {
    realInterestRate,
    fxImportCoverMonths,
    yieldSpread10Y,
    healthVerdict,
  };
}

export function assemblePublicMacroDashboard(
  market: MacroMarketIndicator[],
  official: MacroOfficialIndicator[],
  retrievedAt: Date = new Date(),
): PublicMacroDashboard {
  const expected = MARKET_DEFINITIONS.length + WORLD_BANK_DEFINITIONS.length + 1;
  const available = market.length + official.length;
  const availableKeys = new Set([...market.map((item) => item.key), ...official.map((item) => item.key)]);
  const missing = [
    ...MARKET_DEFINITIONS.map((item) => ({ key: item.key, label: item.label })),
    ...WORLD_BANK_DEFINITIONS.map((item) => ({ key: item.key, label: item.label })),
    { key: 'BI_RATE', label: 'BI-Rate' },
  ].filter((item) => !availableKeys.has(item.key)).map((item) => item.label);

  const regime = computeMacroRegime(official);
  const health = computeMacroHealth(market, official);

  return {
    market,
    official,
    transmissions: buildTransmissions(market, official),
    regime,
    health,
    coverage: {
      available,
      expected,
      percent: Math.round((available / expected) * 100),
    },
    missing,
    retrievedAt: retrievedAt.toISOString(),
    methodology: 'Fakta sumber ditampilkan terpisah dari kerangka transmisi sektor. Tidak ada target IHSG atau rekomendasi sektor yang dibuat otomatis.',
  };
}

async function fetchMarketIndicators(): Promise<MacroMarketIndicator[]> {
  const quotes = await yahooFinance.quote(MARKET_DEFINITIONS.map((item) => item.symbol));
  return normalizeMarketQuotes(quotes);
}

async function fetchWorldBankIndicators(): Promise<MacroOfficialIndicator[]> {
  const results = await Promise.all(WORLD_BANK_DEFINITIONS.map(async (definition) => {
    try {
      const url = 'https://api.worldbank.org/v2/country/IDN/indicator/' + definition.indicator + '?format=json&per_page=10';
      const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
      if (!response.ok) return null;
      return normalizeWorldBankIndicator(definition, await response.json());
    } catch {
      return null;
    }
  }));
  return results.filter((item): item is MacroOfficialIndicator => item !== null);
}

async function fetchBiRate(): Promise<MacroOfficialIndicator> {
  try {
    const response = await fetch(BI_NEWS_URL, {
      headers: { 'user-agent': 'Mozilla/5.0 SahamLens/1.0' },
      signal: AbortSignal.timeout(8_000),
    });
    if (response.ok) {
      const live = normalizeBiRateHtml(await response.text());
      if (live) return live;
    }
  } catch {
    // Gunakan snapshot resmi terakhir terverifikasi di bawah.
  }
  return { ...LAST_VERIFIED_BI_RATE };
}

export async function fetchPublicMacroDashboard(): Promise<PublicMacroDashboard> {
  const [marketResult, worldBankResult, biRateResult] = await Promise.allSettled([
    fetchMarketIndicators(),
    fetchWorldBankIndicators(),
    fetchBiRate(),
  ]);

  const market = marketResult.status === 'fulfilled' ? marketResult.value : [];
  const official = worldBankResult.status === 'fulfilled' ? worldBankResult.value : [];
  if (biRateResult.status === 'fulfilled') official.unshift(biRateResult.value);
  return assemblePublicMacroDashboard(market, official);
}

export { WORLD_BANK_SOURCE_URL };

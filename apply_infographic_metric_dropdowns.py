from pathlib import Path
import shutil
from datetime import datetime

p = Path('app/admin/infographic-studio/page.tsx')
if not p.exists():
    raise SystemExit('ERROR: jalankan script ini dari root repository SahamLens; file app/admin/infographic-studio/page.tsx tidak ditemukan')
backup = p.with_suffix(p.suffix + '.bak-infographic-selectors-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
shutil.copy2(p, backup)
s = p.read_text()

# 1) Constants and helper type definitions
marker = "const POPULAR_TICKERS = ['BBCA', 'BBRI', 'BMRI', 'TLKM', 'ASII', 'ITMG', 'BREN', 'UNVR', 'ICBP'];\n"
addition = r'''

const MAX_STUDIO_METRICS = 8;

const FUNDAMENTAL_METRIC_OPTIONS = [
  { key: 'returnOnEquity', label: 'ROE — Return on Equity' },
  { key: 'returnOnAssets', label: 'ROA — Return on Assets' },
  { key: 'profitMargins', label: 'Net Profit Margin' },
  { key: 'operatingMargins', label: 'Operating Margin' },
  { key: 'grossMargins', label: 'Gross Profit Margin' },
  { key: 'trailingPE', label: 'PER — Price to Earnings' },
  { key: 'forwardPE', label: 'Forward P/E' },
  { key: 'priceToBook', label: 'PBV — Price to Book Value' },
  { key: 'debtToEquity', label: 'DER — Debt to Equity' },
  { key: 'currentRatio', label: 'Current Ratio' },
  { key: 'quickRatio', label: 'Quick Ratio' },
  { key: 'revenueGrowth', label: 'Revenue Growth' },
  { key: 'earningsGrowth', label: 'Earnings Growth' },
  { key: 'dividendYield', label: 'Dividend Yield' },
  { key: 'marketCap', label: 'Market Capitalization' },
  { key: 'totalRevenue', label: 'Total Revenue' },
  { key: 'ebitda', label: 'EBITDA' },
] as const;

type FundamentalMetricKey = (typeof FUNDAMENTAL_METRIC_OPTIONS)[number]['key'];

const DEFAULT_FUNDAMENTAL_METRICS: FundamentalMetricKey[] = [
  'returnOnEquity',
  'returnOnAssets',
  'profitMargins',
  'operatingMargins',
  'trailingPE',
  'priceToBook',
  'revenueGrowth',
  'dividendYield',
];

function analyzerKey(analyzer: any): string {
  return String(analyzer?.label || analyzer?.name || '').trim();
}
'''
if 'const MAX_STUDIO_METRICS = 8;' not in s:
    if marker not in s:
        raise SystemExit('marker POPULAR_TICKERS not found')
    s = s.replace(marker, marker + addition, 1)

# 2) State
marker = "  const [isDropdownOpen, setIsDropdownOpen] = useState(false);\n"
addition = "  const [selectedTechnicalIndicators, setSelectedTechnicalIndicators] = useState<string[]>([]);\n  const [selectedFundamentalMetrics, setSelectedFundamentalMetrics] = useState<FundamentalMetricKey[]>(DEFAULT_FUNDAMENTAL_METRICS);\n"
if 'selectedTechnicalIndicators' not in s:
    if marker not in s:
        raise SystemExit('state marker not found')
    s = s.replace(marker, marker + addition, 1)

# 3) Selection-derived options and helpers after filteredTickers memo
marker = "  }, [tickerInput]);\n\n  const selectTicker = (symbol: string) => {\n"
addition = r'''  }, [tickerInput]);

  const technicalIndicatorOptions = React.useMemo(() => {
    const analyzers = Array.isArray(data?.technical?.analyzers) ? data.technical.analyzers : [];
    const seen = new Set<string>();
    return analyzers
      .map((analyzer: any) => ({
        key: analyzerKey(analyzer),
        label: analyzerKey(analyzer),
        value: analyzer?.value,
      }))
      .filter((item: { key: string; label: string; value: unknown }) => {
        if (!item.key || seen.has(item.key)) return false;
        if (item.value == null || item.value === 'N/A' || String(item.value).startsWith('N/A')) return false;
        seen.add(item.key);
        return true;
      });
  }, [data?.technical?.analyzers]);

  const availableFundamentalOptions = React.useMemo(() => {
    const fundamentals = data?.fundamental?.fundamentals || {};
    return FUNDAMENTAL_METRIC_OPTIONS.filter((item) => {
      const value = fundamentals[item.key];
      return typeof value === 'number' && Number.isFinite(value);
    });
  }, [data?.fundamental?.fundamentals]);

  useEffect(() => {
    if (technicalIndicatorOptions.length === 0) {
      setSelectedTechnicalIndicators([]);
      return;
    }
    setSelectedTechnicalIndicators((current) => {
      const valid = current.filter((key) => technicalIndicatorOptions.some((item) => item.key === key));
      if (valid.length > 0) return valid.slice(0, MAX_STUDIO_METRICS);
      return technicalIndicatorOptions.slice(0, MAX_STUDIO_METRICS).map((item) => item.key);
    });
  }, [technicalIndicatorOptions]);

  useEffect(() => {
    if (availableFundamentalOptions.length === 0) {
      setSelectedFundamentalMetrics([]);
      return;
    }
    setSelectedFundamentalMetrics((current) => {
      const available = new Set(availableFundamentalOptions.map((item) => item.key));
      const valid = current.filter((key) => available.has(key));
      if (valid.length > 0) return valid.slice(0, MAX_STUDIO_METRICS);
      const preferred = DEFAULT_FUNDAMENTAL_METRICS.filter((key) => available.has(key));
      const fallback = availableFundamentalOptions.map((item) => item.key);
      return (preferred.length > 0 ? preferred : fallback).slice(0, MAX_STUDIO_METRICS);
    });
  }, [availableFundamentalOptions]);

  const toggleTechnicalIndicator = (key: string) => {
    setSelectedTechnicalIndicators((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      if (current.length >= MAX_STUDIO_METRICS) {
        showToast(`Maksimal ${MAX_STUDIO_METRICS} indikator teknikal per infografis.`, 'info');
        return current;
      }
      return [...current, key];
    });
  };

  const toggleFundamentalMetric = (key: FundamentalMetricKey) => {
    setSelectedFundamentalMetrics((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      if (current.length >= MAX_STUDIO_METRICS) {
        showToast(`Maksimal ${MAX_STUDIO_METRICS} indikator fundamental per infografis.`, 'info');
        return current;
      }
      return [...current, key];
    });
  };

  const selectTicker = (symbol: string) => {
'''
if 'const technicalIndicatorOptions = React.useMemo' not in s:
    if marker not in s:
        raise SystemExit('filteredTickers marker not found')
    s = s.replace(marker, addition, 1)

# 4) Filtered payload memos before handleDownloadImage
marker = "  const handleDownloadImage = async () => {\n"
addition = r'''  const selectedTechnicalAnalyzers = React.useMemo(() => {
    const analyzers = Array.isArray(data?.technical?.analyzers) ? data.technical.analyzers : [];
    if (selectedTechnicalIndicators.length === 0) return [];
    const selected = new Set(selectedTechnicalIndicators);
    return analyzers.filter((analyzer: any) => selected.has(analyzerKey(analyzer)));
  }, [data?.technical?.analyzers, selectedTechnicalIndicators]);

  const selectedFundamentalsForExport = React.useMemo(() => {
    const source = data?.fundamental?.fundamentals || {};
    const filtered: Record<string, number | null> = {};
    for (const key of selectedFundamentalMetrics) {
      const value = source[key];
      if (typeof value === 'number' && Number.isFinite(value)) filtered[key] = value;
    }
    return filtered;
  }, [data?.fundamental?.fundamentals, selectedFundamentalMetrics]);

  const handleDownloadImage = async () => {
'''
if 'const selectedTechnicalAnalyzers = React.useMemo' not in s:
    if marker not in s:
        raise SystemExit('download marker not found')
    s = s.replace(marker, addition, 1)

# 5) Insert metric selectors before theme selector
marker = "            {/* 2. Theme Selector & Randomize Button */}\n"
selector_jsx = r'''            {/* 2. Content selectors: only real values available in the loaded payload */}
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <details className={`relative group ${cardMode === 'technical' ? '' : 'opacity-60'}`}>
                <summary className={`list-none cursor-pointer flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                  cardMode === 'technical'
                    ? `${active3DTheme.accentBorder} ${active3DTheme.accentBg} ${active3DTheme.accentText}`
                    : 'border-slate-700 bg-[#030612] text-slate-400'
                }`}>
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Indikator Teknikal</span>
                  <span className="font-mono text-[10px]">{selectedTechnicalIndicators.length}/{Math.min(MAX_STUDIO_METRICS, technicalIndicatorOptions.length)}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </summary>
                <div className="absolute left-0 z-50 mt-2 w-[320px] max-w-[85vw] rounded-2xl border border-slate-700 bg-[#07101f] p-3 shadow-2xl">
                  <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                    <div>
                      <div className="text-[11px] font-bold text-white">Pilih indikator yang dicantumkan</div>
                      <div className="text-[9px] text-slate-400">Hanya indikator dengan nilai tersedia • maksimal {MAX_STUDIO_METRICS}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedTechnicalIndicators(technicalIndicatorOptions.slice(0, MAX_STUDIO_METRICS).map((item) => item.key))}
                      className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300"
                    >
                      Default
                    </button>
                  </div>
                  <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                    {technicalIndicatorOptions.length > 0 ? technicalIndicatorOptions.map((item) => {
                      const checked = selectedTechnicalIndicators.includes(item.key);
                      return (
                        <label key={item.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2.5 py-2 hover:bg-white/5">
                          <span className="min-w-0 truncate text-[11px] text-slate-200">{item.label}</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTechnicalIndicator(item.key)}
                            className="h-4 w-4 accent-cyan-500"
                          />
                        </label>
                      );
                    }) : (
                      <div className="rounded-xl border border-slate-800 p-3 text-[10px] text-slate-400">Belum ada indikator teknikal valid pada payload emiten ini.</div>
                    )}
                  </div>
                </div>
              </details>

              <details className={`relative group ${cardMode === 'fundamental_moat_earnings' ? '' : 'opacity-60'}`}>
                <summary className={`list-none cursor-pointer flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                  cardMode === 'fundamental_moat_earnings'
                    ? `${active3DTheme.accentBorder} ${active3DTheme.accentBg} ${active3DTheme.accentText}`
                    : 'border-slate-700 bg-[#030612] text-slate-400'
                }`}>
                  <Landmark className="w-3.5 h-3.5" />
                  <span>Fundamental</span>
                  <span className="font-mono text-[10px]">{selectedFundamentalMetrics.length}/{Math.min(MAX_STUDIO_METRICS, availableFundamentalOptions.length)}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </summary>
                <div className="absolute right-0 z-50 mt-2 w-[340px] max-w-[85vw] rounded-2xl border border-slate-700 bg-[#07101f] p-3 shadow-2xl">
                  <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                    <div>
                      <div className="text-[11px] font-bold text-white">Pilih rasio fundamental</div>
                      <div className="text-[9px] text-slate-400">Hanya field dengan data nyata pada payload • maksimal {MAX_STUDIO_METRICS}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const available = new Set(availableFundamentalOptions.map((item) => item.key));
                        const preferred = DEFAULT_FUNDAMENTAL_METRICS.filter((key) => available.has(key));
                        setSelectedFundamentalMetrics((preferred.length > 0 ? preferred : availableFundamentalOptions.map((item) => item.key)).slice(0, MAX_STUDIO_METRICS));
                      }}
                      className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300"
                    >
                      Default
                    </button>
                  </div>
                  <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                    {availableFundamentalOptions.length > 0 ? availableFundamentalOptions.map((item) => {
                      const checked = selectedFundamentalMetrics.includes(item.key);
                      return (
                        <label key={item.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2.5 py-2 hover:bg-white/5">
                          <span className="min-w-0 truncate text-[11px] text-slate-200">{item.label}</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFundamentalMetric(item.key)}
                            className="h-4 w-4 accent-cyan-500"
                          />
                        </label>
                      );
                    }) : (
                      <div className="rounded-xl border border-slate-800 p-3 text-[10px] text-slate-400">Belum ada rasio fundamental valid untuk emiten ini.</div>
                    )}
                  </div>
                </div>
              </details>
            </div>

            {/* 3. Theme Selector & Randomize Button */}
'''
if 'Pilih indikator yang dicantumkan' not in s:
    if marker not in s:
        raise SystemExit('theme marker not found')
    s = s.replace(marker, selector_jsx, 1)

# 6) Pass filtered data to the cards
s = s.replace('                      analyzers={data.technical.analyzers}\n', '                      analyzers={selectedTechnicalAnalyzers}\n', 1)
s = s.replace('                      fundamentals={data.fundamental.fundamentals}\n', '                      fundamentals={selectedFundamentalsForExport}\n', 1)

p.write_text(s)
print('✓ Backup:', backup)
print('✓ Infographic Studio metric dropdowns berhasil diterapkan:', p)

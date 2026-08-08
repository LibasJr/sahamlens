'use client';

import React, { useMemo, useState } from 'react';
import {
  Activity,
  AreaChart,
  BarChart3,
  ChevronDown,
  LineChart,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  INDICATOR_LIBRARY,
  defaultIndicator,
  indicatorLabel,
  type ChartType,
  type IndicatorConfig,
  type IndicatorKind,
} from '@/lib/chart-indicators';

const CHART_TYPES: Array<{ value: ChartType; label: string; short: string }> = [
  { value: 'candlestick', label: 'Candlestick', short: 'Candles' },
  { value: 'bar', label: 'OHLC Bars', short: 'Bars' },
  { value: 'line', label: 'Line', short: 'Line' },
  { value: 'area', label: 'Area', short: 'Area' },
  { value: 'baseline', label: 'Baseline', short: 'Baseline' },
  { value: 'heikin-ashi', label: 'Heikin Ashi', short: 'Heikin' },
];

const CATEGORIES = ['Trend', 'Momentum', 'Volatility', 'Volume / Flow'] as const;

function clampInt(value: number | undefined, fallback: number, min = 1, max = 500): number {
  const next = Number.isFinite(value) ? Math.round(value as number) : fallback;
  return Math.min(max, Math.max(min, next));
}

function normalizeIndicator(indicator: IndicatorConfig): IndicatorConfig {
  if (indicator.kind === 'MACD') {
    const fast = clampInt(indicator.fast, 12, 2, 100);
    const slow = Math.max(fast + 1, clampInt(indicator.slow, 26, 3, 200));
    const signal = clampInt(indicator.signal, 9, 2, 100);
    return { ...indicator, fast, slow, signal };
  }
  if (indicator.kind === 'BB') {
    return {
      ...indicator,
      period: clampInt(indicator.period, 20, 2, 500),
      stdDev: Math.min(5, Math.max(0.5, Number(indicator.stdDev) || 2)),
    };
  }
  if (indicator.kind === 'VOLUME') return indicator;
  return { ...indicator, period: clampInt(indicator.period, indicator.kind === 'CMF' ? 20 : 14, 2, 500) };
}

function ChartTypeIcon({ type }: { type: ChartType }) {
  if (type === 'line') return <LineChart className="h-4 w-4" />;
  if (type === 'area' || type === 'baseline') return <AreaChart className="h-4 w-4" />;
  if (type === 'bar') return <BarChart3 className="h-4 w-4" />;
  return <Activity className="h-4 w-4" />;
}

export type FinancialChartToolbarProps = {
  symbol: string;
  timeframe: string;
  timeframeOptions?: string[];
  onTimeframeChange?: (timeframe: string) => void;
  chartType: ChartType;
  onChartTypeChange: (type: ChartType) => void;
  indicators: IndicatorConfig[];
  onIndicatorsChange: (indicators: IndicatorConfig[]) => void;
  onFitContent: () => void;
  onReset: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  variant?: 'compact' | 'full';
};

export default function FinancialChartToolbar({
  symbol,
  timeframe,
  timeframeOptions = [],
  onTimeframeChange,
  chartType,
  onChartTypeChange,
  indicators,
  onIndicatorsChange,
  onFitContent,
  onReset,
  isFullscreen,
  onToggleFullscreen,
  variant = 'full',
}: FinancialChartToolbarProps) {
  const [chartTypeOpen, setChartTypeOpen] = useState(false);
  const [indicatorOpen, setIndicatorOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [draftIndicator, setDraftIndicator] = useState<IndicatorConfig | null>(null);

  const currentChartType = CHART_TYPES.find((item) => item.value === chartType) ?? CHART_TYPES[0];
  const activeIndicators = indicators.filter((indicator) => indicator.visible !== false);
  const oscillatorCount = useMemo(() => activeIndicators.filter((indicator) => {
    const meta = INDICATOR_LIBRARY.find((item) => item.kind === indicator.kind);
    return meta?.pane === 'oscillator';
  }).length, [activeIndicators]);
  const overlayCount = useMemo(() => activeIndicators.filter((indicator) => {
    const meta = INDICATOR_LIBRARY.find((item) => item.kind === indicator.kind);
    return meta?.pane === 'overlay';
  }).length, [activeIndicators]);

  const filteredLibrary = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return INDICATOR_LIBRARY;
    return INDICATOR_LIBRARY.filter((item) => (
      item.kind.toLowerCase().includes(needle)
      || item.name.toLowerCase().includes(needle)
      || item.category.toLowerCase().includes(needle)
    ));
  }, [search]);

  const addIndicator = (kind: IndicatorKind) => {
    const meta = INDICATOR_LIBRARY.find((item) => item.kind === kind);
    if (!meta) return;

    const allowMultiple = kind === 'SMA' || kind === 'EMA';
    const existing = indicators.find((indicator) => indicator.kind === kind);
    if (existing && !allowMultiple) {
      if (kind !== 'VOLUME') setDraftIndicator({ ...existing });
      return;
    }

    if (meta.pane === 'overlay' && overlayCount >= 5) return;
    if (meta.pane === 'oscillator' && oscillatorCount >= 4) return;

    const next = defaultIndicator(kind);
    onIndicatorsChange([...indicators, next]);
    if (kind !== 'VOLUME') setDraftIndicator({ ...next });
  };

  const removeIndicator = (id: string) => {
    onIndicatorsChange(indicators.filter((indicator) => indicator.id !== id));
  };

  const applyIndicatorSettings = () => {
    if (!draftIndicator) return;
    const normalized = normalizeIndicator(draftIndicator);
    onIndicatorsChange(indicators.map((indicator) => indicator.id === normalized.id ? normalized : indicator));
    setDraftIndicator(null);
  };

  return (
    <div className="border-b border-tv-border bg-tv-card/95">
      <div className="flex min-w-0 flex-col gap-2 px-2.5 py-2.5 sm:px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="hidden shrink-0 items-center rounded-md border border-tv-border bg-tv-bg px-2.5 py-2 text-xs font-bold tracking-wide text-white sm:flex">
            {symbol}
          </div>

          {timeframeOptions.length > 0 && onTimeframeChange && (
            <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max items-center gap-1 rounded-lg border border-tv-border bg-tv-bg p-1">
                {timeframeOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onTimeframeChange(option)}
                    className={`min-h-10 shrink-0 rounded-md px-2.5 text-[11px] font-bold transition-colors sm:px-3 ${
                      timeframe === option
                        ? 'bg-tv-blue text-white'
                        : 'text-tv-muted hover:bg-tv-hover hover:text-white'
                    }`}
                    aria-pressed={timeframe === option}
                  >
                    {option === 'ALL' ? 'MAX' : option}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => {
                setChartTypeOpen((open) => !open);
                setMoreOpen(false);
              }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-tv-border bg-tv-bg px-2.5 text-xs font-semibold text-tv-text hover:border-tv-borderLight hover:bg-tv-hover sm:px-3"
              aria-haspopup="menu"
              aria-expanded={chartTypeOpen}
            >
              <ChartTypeIcon type={chartType} />
              <span className={variant === 'compact' ? 'hidden md:inline' : 'hidden sm:inline'}>{currentChartType.short}</span>
              <ChevronDown className="h-3.5 w-3.5 text-tv-muted" />
            </button>

            {chartTypeOpen && (
              <div className="absolute right-0 top-[calc(100%+0.4rem)] z-50 w-48 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-tv-border bg-tv-surface p-1.5 shadow-2xl">
                {CHART_TYPES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => {
                      onChartTypeChange(item.value);
                      setChartTypeOpen(false);
                    }}
                    className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs transition-colors ${
                      chartType === item.value ? 'bg-tv-blue/15 text-tv-blue' : 'text-tv-text hover:bg-tv-hover'
                    }`}
                  >
                    <ChartTypeIcon type={item.value} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIndicatorOpen(true)}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-tv-border bg-tv-bg px-2.5 text-xs font-semibold text-tv-text hover:border-tv-borderLight hover:bg-tv-hover sm:px-3"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">Indicators</span>
            <span className="sm:hidden">ƒx</span>
          </button>

          <button
            type="button"
            onClick={onToggleFullscreen}
            className="hidden min-h-10 shrink-0 items-center justify-center rounded-lg border border-tv-border bg-tv-bg px-2.5 text-tv-muted hover:border-tv-borderLight hover:bg-tv-hover hover:text-white sm:inline-flex"
            aria-label={isFullscreen ? 'Keluar dari layar penuh' : 'Buka chart layar penuh'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          <div className="relative shrink-0 sm:hidden">
            <button
              type="button"
              onClick={() => {
                setMoreOpen((open) => !open);
                setChartTypeOpen(false);
              }}
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-tv-border bg-tv-bg text-tv-muted hover:bg-tv-hover hover:text-white"
              aria-label="Kontrol chart lainnya"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-[calc(100%+0.4rem)] z-50 w-48 rounded-xl border border-tv-border bg-tv-surface p-1.5 shadow-2xl">
                <button type="button" onClick={() => { onFitContent(); setMoreOpen(false); }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-xs text-tv-text hover:bg-tv-hover">
                  <RotateCcw className="h-4 w-4" /> Fit content
                </button>
                <button type="button" onClick={() => { onReset(); setMoreOpen(false); }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-xs text-tv-text hover:bg-tv-hover">
                  <Settings2 className="h-4 w-4" /> Reset chart
                </button>
                <button type="button" onClick={() => { onToggleFullscreen(); setMoreOpen(false); }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-xs text-tv-text hover:bg-tv-hover">
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  {isFullscreen ? 'Keluar fullscreen' : 'Fullscreen'}
                </button>
              </div>
            )}
          </div>

          <div className="hidden shrink-0 items-center gap-1 lg:flex">
            <button type="button" onClick={onFitContent} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs text-tv-muted hover:bg-tv-hover hover:text-white" title="Fit content">
              <RotateCcw className="h-4 w-4" />
              <span className="hidden xl:inline">Fit</span>
            </button>
            <button type="button" onClick={onReset} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs text-tv-muted hover:bg-tv-hover hover:text-white" title="Reset chart">
              <Settings2 className="h-4 w-4" />
              <span className="hidden xl:inline">Reset</span>
            </button>
          </div>
        </div>

        {activeIndicators.length > 0 && (
          <div className="min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max items-center gap-1.5 pr-2">
              {activeIndicators.map((indicator) => (
                <div key={indicator.id} className="inline-flex min-h-8 shrink-0 items-center rounded-md border border-tv-border bg-tv-bg text-[10px] font-semibold text-tv-muted">
                  <button
                    type="button"
                    className="inline-flex min-h-8 items-center gap-1 px-2 hover:text-white"
                    onClick={() => indicator.kind !== 'VOLUME' && setDraftIndicator({ ...indicator })}
                    title={indicator.kind === 'VOLUME' ? 'Volume OHLCV server' : 'Atur indikator'}
                  >
                    {indicatorLabel(indicator)}
                    {indicator.kind !== 'VOLUME' && <Settings2 className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeIndicator(indicator.id)}
                    className="inline-flex min-h-8 min-w-8 items-center justify-center border-l border-tv-border text-tv-muted hover:bg-tv-red/10 hover:text-tv-red"
                    aria-label={`Hapus ${indicatorLabel(indicator)}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {indicatorOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={() => setIndicatorOpen(false)}>
          <div className="max-h-[82dvh] w-full overflow-hidden rounded-t-2xl border border-tv-border bg-tv-surface shadow-2xl sm:max-w-xl sm:rounded-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-tv-border px-4 py-3">
              <div>
                <div className="text-sm font-bold text-white">Indicators</div>
                <div className="text-[11px] text-tv-muted">Visualisasi chart saja — tidak mengubah LensScore atau sinyal production.</div>
              </div>
              <button type="button" onClick={() => setIndicatorOpen(false)} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-tv-muted hover:bg-tv-hover hover:text-white" aria-label="Tutup daftar indikator">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3">
              <label className="flex min-h-11 items-center gap-2 rounded-xl border border-tv-border bg-tv-bg px-3 focus-within:border-tv-blue">
                <Search className="h-4 w-4 text-tv-muted" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari SMA, RSI, MACD..."
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-tv-muted"
                  autoFocus
                />
              </label>
            </div>

            <div className="max-h-[60dvh] overflow-y-auto px-3 pb-4">
              {CATEGORIES.map((category) => {
                const items = filteredLibrary.filter((item) => item.category === category);
                if (items.length === 0) return null;
                return (
                  <div key={category} className="mb-4 last:mb-0">
                    <div className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-tv-muted">{category}</div>
                    <div className="space-y-1">
                      {items.map((item) => {
                        const metaCount = item.pane === 'overlay' ? overlayCount : oscillatorCount;
                        const atLimit = item.pane === 'overlay' ? metaCount >= 5 : metaCount >= 4;
                        const singleExisting = item.kind !== 'SMA' && item.kind !== 'EMA' && indicators.some((indicator) => indicator.kind === item.kind);
                        return (
                          <button
                            key={item.kind}
                            type="button"
                            onClick={() => addIndicator(item.kind)}
                            disabled={atLimit && !singleExisting}
                            className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-tv-hover disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-tv-border bg-tv-bg text-tv-blue">
                              <Activity className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-tv-text">{item.name}</span>
                              <span className="block truncate text-[11px] text-tv-muted">{item.description}</span>
                            </span>
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-tv-muted">
                              {singleExisting ? <Settings2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {(overlayCount >= 5 || oscillatorCount >= 4) && (
                <div className="mt-3 rounded-xl border border-tv-yellow/30 bg-tv-yellow/10 p-3 text-xs text-tv-yellow">
                  Batas tampilan: maksimal 5 overlay harga dan 4 pane indikator agar chart tetap terbaca di mobile.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {draftIndicator && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={() => setDraftIndicator(null)}>
          <div className="w-full rounded-t-2xl border border-tv-border bg-tv-surface p-4 shadow-2xl sm:max-w-md sm:rounded-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-white">{indicatorLabel(draftIndicator)}</div>
                <div className="text-[11px] text-tv-muted">Pengaturan visual chart, bukan parameter model SahamLens.</div>
              </div>
              <button type="button" onClick={() => setDraftIndicator(null)} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-tv-muted hover:bg-tv-hover hover:text-white" aria-label="Tutup pengaturan indikator">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {draftIndicator.kind !== 'VOLUME' && draftIndicator.kind !== 'MACD' && (
                <label className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-tv-muted">Period</span>
                  <input type="number" min={2} max={500} value={draftIndicator.period ?? 14} onChange={(event) => setDraftIndicator({ ...draftIndicator, period: Number(event.target.value) })} className="min-h-11 w-full rounded-lg border border-tv-border bg-tv-bg px-3 text-sm text-white outline-none focus:border-tv-blue" />
                </label>
              )}

              {draftIndicator.kind === 'BB' && (
                <label className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-tv-muted">Std Dev</span>
                  <input type="number" min={0.5} max={5} step={0.1} value={draftIndicator.stdDev ?? 2} onChange={(event) => setDraftIndicator({ ...draftIndicator, stdDev: Number(event.target.value) })} className="min-h-11 w-full rounded-lg border border-tv-border bg-tv-bg px-3 text-sm text-white outline-none focus:border-tv-blue" />
                </label>
              )}

              {draftIndicator.kind === 'MACD' && (
                <>
                  <label className="space-y-1.5"><span className="text-[11px] font-semibold text-tv-muted">Fast</span><input type="number" min={2} max={100} value={draftIndicator.fast ?? 12} onChange={(event) => setDraftIndicator({ ...draftIndicator, fast: Number(event.target.value) })} className="min-h-11 w-full rounded-lg border border-tv-border bg-tv-bg px-3 text-sm text-white outline-none focus:border-tv-blue" /></label>
                  <label className="space-y-1.5"><span className="text-[11px] font-semibold text-tv-muted">Slow</span><input type="number" min={3} max={200} value={draftIndicator.slow ?? 26} onChange={(event) => setDraftIndicator({ ...draftIndicator, slow: Number(event.target.value) })} className="min-h-11 w-full rounded-lg border border-tv-border bg-tv-bg px-3 text-sm text-white outline-none focus:border-tv-blue" /></label>
                  <label className="space-y-1.5"><span className="text-[11px] font-semibold text-tv-muted">Signal</span><input type="number" min={2} max={100} value={draftIndicator.signal ?? 9} onChange={(event) => setDraftIndicator({ ...draftIndicator, signal: Number(event.target.value) })} className="min-h-11 w-full rounded-lg border border-tv-border bg-tv-bg px-3 text-sm text-white outline-none focus:border-tv-blue" /></label>
                </>
              )}
            </div>

            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setDraftIndicator(null)} className="min-h-11 flex-1 rounded-xl border border-tv-border px-4 text-sm font-semibold text-tv-muted hover:bg-tv-hover">Batal</button>
              <button type="button" onClick={applyIndicatorSettings} className="min-h-11 flex-1 rounded-xl bg-tv-blue px-4 text-sm font-bold text-white hover:bg-tv-blueHover">Terapkan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

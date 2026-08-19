'use client';

import { Activity, Play, Square } from 'lucide-react';
import { Button, Card, Select } from '@/components/ui';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import CandleReplayChart, { type ReplayCandle } from '@/components/backtest/CandleReplayChart';
import { BACKTEST_PERIOD_MONTHS } from '@/modules/backtest/constants/backtest-periods';

interface SingleStockReplayPanelProps {
  replayInput: string;
  setReplayInput: (value: string) => void;
  replaySymbol: string;
  setReplaySymbol: (value: string) => void;
  replayPeriod: number;
  setReplayPeriod: (value: number) => void;
  replayCandles: ReplayCandle[];
  replayLoading: boolean;
  replayError: string;
  replayToken: number;
  replayPlaying: boolean;
  setReplayPlaying: (value: boolean) => void;
  runReplay: () => void;
}

export default function SingleStockReplayPanel({
  replayInput,
  setReplayInput,
  replaySymbol,
  setReplaySymbol,
  replayPeriod,
  setReplayPeriod,
  replayCandles,
  replayLoading,
  replayError,
  replayToken,
  replayPlaying,
  setReplayPlaying,
  runReplay,
}: SingleStockReplayPanelProps) {
  return (
    <Card padding="none" radius="lg" elevation="sm" overflow="visible" highlight={false} className="border-tv-border p-5">
      <h3 className="font-heading font-bold text-tv-text flex items-center gap-2 mb-1">
        <Activity className="w-5 h-5 text-tv-blue" /> Backtest Saham Tunggal
      </h3>
      <p className="text-[11px] text-tv-muted mb-4">Pilih emiten dan periode, lalu lihat histori harganya sebagai animasi candle - pratinjau visual, bukan simulasi strategi.</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <SymbolAutocomplete
            value={replayInput}
            onChange={(value) => { setReplayInput(value); setReplaySymbol(''); }}
            onSelect={(value) => { setReplaySymbol(value); setReplayInput(value.replace('.JK', '')); }}
            placeholder="Cari emiten (mis. BBCA)"
            className="w-full rounded-md border border-tv-border bg-tv-bg/60 px-4 py-2.5 text-sm font-number font-bold text-tv-text focus:border-tv-blue focus:outline-none"
          />
        </div>
        <div className="w-full sm:w-40">
          <Select value={replayPeriod} onChange={(event) => setReplayPeriod(Number(event.target.value))}>
            {BACKTEST_PERIOD_MONTHS.map((bulan) => <option key={bulan} value={bulan}>{bulan} Bulan</option>)}
          </Select>
        </div>
        <Button onClick={runReplay} disabled={replayLoading} loading={replayLoading} variant="primary" className="sm:w-auto">
          {!replayLoading && <Play className="w-4 h-4" />} Backtest
        </Button>
        <Button onClick={() => setReplayPlaying(true)} disabled={replayCandles.length === 0 || replayPlaying} variant="secondary" className="!bg-tv-green !text-white sm:w-auto">
          <Play className="w-4 h-4" /> Start
        </Button>
        <Button onClick={() => setReplayPlaying(false)} disabled={!replayPlaying} variant="secondary" className="sm:w-auto">
          <Square className="w-4 h-4" /> Stop
        </Button>
      </div>

      {replayError && <p className="mt-3 text-xs text-tv-red">{replayError}</p>}
      {replayCandles.length > 0 && (
        <div className="mt-4">
          <CandleReplayChart
            candles={replayCandles}
            symbol={(replaySymbol || replayInput).trim().toUpperCase().replace('.JK', '')}
            playToken={replayToken}
            playing={replayPlaying}
            onComplete={() => setReplayPlaying(false)}
            height={420}
          />
        </div>
      )}
    </Card>
  );
}

'use client';

import React, { useState, useMemo, useRef } from 'react';
import { Calculator, Shield, X, Copy, Check, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { calculatePositionSize } from '@/lib/utils/position-sizer';
import { formatRupiah } from '@/shared/config/pricing';
import { copyText } from '@/shared/browser/copy-text';
import { useModalBehavior } from '@/lib/hooks/useModalBehavior';
import { AnimatePresence, motion } from 'framer-motion';

interface HitungLotSheetProps {
  ticker: string;
  currentPrice?: number | null;
  entryPrice?: number | null;
  cutLossPrice?: number | null;
  takeProfit1Price?: number | null;
  takeProfit2Price?: number | null;
}

const CAPITAL_PRESETS = [5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000];
const RISK_PRESETS = [1.0, 2.0, 3.0];

export default function HitungLotSheet({
  ticker,
  currentPrice,
  entryPrice: initialEntry,
  cutLossPrice: initialCutLoss,
  takeProfit1Price: initialTP1,
  takeProfit2Price: initialTP2,
}: HitungLotSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useModalBehavior({
    open: isOpen,
    onClose: () => setIsOpen(false),
    containerRef: sheetRef,
  });

  const cleanTicker = useMemo(() => {
    return ticker.replace('.JK', '').toUpperCase();
  }, [ticker]);

  // Default values
  const defaultEntry = initialEntry && initialEntry > 0 ? initialEntry : (currentPrice ?? 1000);
  const defaultCutLoss = initialCutLoss && initialCutLoss > 0 && initialCutLoss < defaultEntry
    ? initialCutLoss
    : Math.round(defaultEntry * 0.95);

  const [capital, setCapital] = useState<number>(10_000_000);
  const [riskPct, setRiskPct] = useState<number>(2.0);
  const [entry, setEntry] = useState<number>(defaultEntry);
  const [cutLoss, setCutLoss] = useState<number>(defaultCutLoss);
  const [tp1, setTp1] = useState<number | null>(initialTP1 ?? Math.round(defaultEntry * 1.08));
  const [tp2, setTp2] = useState<number | null>(initialTP2 ?? null);
  const [copied, setCopied] = useState(false);

  // Update whenever props change if user hasn't edited
  React.useEffect(() => {
    if (initialEntry && initialEntry > 0) setEntry(initialEntry);
    else if (currentPrice && currentPrice > 0) setEntry(currentPrice);

    if (initialCutLoss && initialCutLoss > 0) setCutLoss(initialCutLoss);
    if (initialTP1 !== undefined) setTp1(initialTP1);
    if (initialTP2 !== undefined) setTp2(initialTP2);
  }, [initialEntry, initialCutLoss, initialTP1, initialTP2, currentPrice]);

  const result = useMemo(() => {
    return calculatePositionSize({
      capitalIdr: capital,
      riskTolerancePct: riskPct,
      entryPrice: entry,
      cutLossPrice: cutLoss,
      takeProfit1Price: tp1,
      takeProfit2Price: tp2,
    });
  }, [capital, riskPct, entry, cutLoss, tp1, tp2]);

  const handleCopyPlan = async () => {
    if (!result.isValid) return;
    const lossPct = (((entry - cutLoss) / entry) * 100).toFixed(1);
    const text = `🎯 TRADING PLAN SAHAMLENS (${cleanTicker})
• Entry: Rp ${entry.toLocaleString('id-ID')}
• Cut Loss: Rp ${cutLoss.toLocaleString('id-ID')} (-${lossPct}%)
${tp1 ? `• TP 1: Rp ${tp1.toLocaleString('id-ID')} (+${result.reward1Pct}% • R:R 1:${result.riskRewardRatio1})\n` : ''}${tp2 ? `• TP 2: Rp ${tp2.toLocaleString('id-ID')} (+${result.reward2Pct}% • R:R 1:${result.riskRewardRatio2})\n` : ''}• Max Size: ${result.maxLots.toLocaleString('id-ID')} Lot (${result.totalShares.toLocaleString('id-ID')} lembar • ${formatRupiah(result.totalPositionCostIdr)})
• Batas Risiko: ${riskPct}% (${formatRupiah(result.actualRiskLossIdr)})
• Alokasi Modal: ${result.portfolioAllocationPct}% dari ${formatRupiah(capital)}`;

    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Jangan render jika emiten indeks IHSG
  if (cleanTicker === 'IHSG' || cleanTicker.startsWith('^')) {
    return null;
  }

  return (
    <>
      {/* Floating Action Button (FAB) Mobile */}
      <div className="fixed right-4 bottom-[calc(var(--lens-mobile-nav-clearance,4.5rem)+14px)] z-30 md:hidden">
        <Button
          variant="bare"
          size="none"
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 rounded-full border border-tv-blue/40 bg-tv-blue/90 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-tv-blue/30 backdrop-blur-md transition-all active:scale-95 hover:bg-tv-blue"
          aria-label={`Hitung lot dan manajemen risiko untuk ${cleanTicker}`}
        >
          <Calculator className="h-4 w-4 shrink-0 text-white" />
          <span>Hitung Lot</span>
        </Button>
      </div>

      {/* Sliding Bottom Sheet Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center md:hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/75 backdrop-blur-sm"
              aria-hidden="true"
            />

            {/* Sheet Panel */}
            <motion.div
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="sheet-title"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative z-10 w-full max-h-[88vh] overflow-y-auto rounded-t-[24px] border-t border-white/[0.12] bg-[#0A101B] p-5 pb-9 shadow-2xl font-sans"
            >
              {/* Drag Pill Handle */}
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20" />

              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tv-blue/15 border border-tv-blue/30 text-tv-blue">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 id="sheet-title" className="text-base font-bold text-white flex items-center gap-1.5">
                      Hitung Lot <span className="font-mono text-tv-blue">{cleanTicker}</span>
                    </h3>
                    <p className="text-xs text-tv-muted">
                      Position sizing anti-margin-call & risk rule 1–3%
                    </p>
                  </div>
                </div>
                <Button
                  variant="bare"
                  size="none"
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg p-1.5 text-tv-muted hover:bg-white/[0.08] hover:text-white"
                  aria-label="Tutup kalkulator"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Form Controls */}
              <div className="mt-4 space-y-4">
                {/* 1. Modal Kas */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-semibold text-tv-muted">Modal Trading (Rp)</label>
                    <span className="text-xs font-mono font-bold text-white">{formatRupiah(capital)}</span>
                  </div>
                  <input
                    type="number"
                    min="500000"
                    step="500000"
                    value={capital}
                    onChange={(e) => setCapital(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] text-white font-mono text-sm font-bold focus:outline-none focus:border-tv-blue transition-all"
                  />
                  {/* Preset Pills */}
                  <div className="flex items-center gap-1.5 mt-2 overflow-x-auto no-scrollbar">
                    {CAPITAL_PRESETS.map((preset) => (
                      <Button
                        key={preset}
                        variant="bare"
                        size="none"
                        type="button"
                        onClick={() => setCapital(preset)}
                        className={`min-h-7 shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold border transition-all ${
                          capital === preset
                            ? 'border-tv-blue bg-tv-blue/20 text-tv-blue'
                            : 'border-white/[0.08] bg-white/[0.03] text-tv-muted hover:text-white'
                        }`}
                      >
                        {preset >= 1_000_000 ? `${preset / 1_000_000} Jt` : `${preset / 1000} Rb`}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* 2. Toleransi Risiko % */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-semibold text-tv-muted">Toleransi Risiko per Trade</label>
                    <span className="text-xs font-mono font-bold text-tv-yellow">{riskPct}% ({formatRupiah(result.actualRiskLossIdr)})</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {RISK_PRESETS.map((preset) => (
                      <Button
                        key={preset}
                        variant="bare"
                        size="none"
                        type="button"
                        onClick={() => setRiskPct(preset)}
                        className={`min-h-8 rounded-xl py-1 text-xs font-bold border transition-all ${
                          riskPct === preset
                            ? 'border-tv-blue bg-tv-blue text-white shadow-sm'
                            : 'border-white/[0.08] bg-white/[0.04] text-tv-muted hover:text-white'
                        }`}
                      >
                        {preset}% {preset === 1 ? '(Konservatif)' : preset === 2 ? '(Standar)' : '(Agresif)'}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* 3. Level Harga: Entry & Stop Loss */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-tv-muted mb-1">
                      Harga Beli / Entry
                    </label>
                    <input
                      type="number"
                      step="5"
                      value={entry}
                      onChange={(e) => setEntry(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] text-white font-mono text-sm font-bold focus:outline-none focus:border-tv-blue"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-tv-muted mb-1">
                      Cut Loss / Batas Batal
                    </label>
                    <input
                      type="number"
                      step="5"
                      value={cutLoss}
                      onChange={(e) => setCutLoss(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.1] text-tv-red font-mono text-sm font-bold focus:outline-none focus:border-tv-red"
                    />
                  </div>
                </div>

                {/* 4. Hasil Komputasi Kartu */}
                <div className="rounded-2xl border border-white/[0.1] bg-white/[0.03] p-4 space-y-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-tv-muted">Maksimal Pembelian:</span>
                    <div className="text-right">
                      <span className="text-xl font-mono font-extrabold text-tv-green">
                        {result.maxLots.toLocaleString('id-ID')}
                      </span>
                      <span className="text-xs font-bold text-tv-green ml-1">Lot</span>
                      <p className="text-[11px] font-mono text-tv-muted">
                        ({result.totalShares.toLocaleString('id-ID')} lembar)
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.06] text-xs">
                    <div>
                      <span className="text-tv-muted block">Nilai Posisi:</span>
                      <span className="font-mono font-bold text-white">{formatRupiah(result.totalPositionCostIdr)}</span>
                      <span className="text-[10px] text-tv-muted ml-1">({result.portfolioAllocationPct}%)</span>
                    </div>
                    <div>
                      <span className="text-tv-muted block">Batas Kerugian:</span>
                      <span className="font-mono font-bold text-tv-red">{formatRupiah(result.actualRiskLossIdr)}</span>
                      <span className="text-[10px] text-tv-red ml-1">(-{result.riskPerShareIdr > 0 ? (((entry - cutLoss) / entry) * 100).toFixed(1) : 0}%)</span>
                    </div>
                  </div>

                  {tp1 && result.riskRewardRatio1 != null && (
                    <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs">
                      <span className="text-tv-muted">Target TP1 & R:R Ratio:</span>
                      <span className="font-mono font-bold text-tv-blue">
                        Rp {tp1.toLocaleString('id-ID')} (1:{result.riskRewardRatio1})
                      </span>
                    </div>
                  )}
                </div>

                {/* Tombol Salin Trading Plan */}
                <Button
                  variant="bare"
                  size="none"
                  type="button"
                  onClick={handleCopyPlan}
                  className="w-full min-h-11 flex items-center justify-center gap-2 rounded-xl border border-tv-blue/30 bg-tv-blue/20 hover:bg-tv-blue/30 text-tv-blue font-bold text-xs transition-all active:scale-98"
                >
                  {copied ? <Check className="h-4 w-4 text-tv-green" /> : <Copy className="h-4 w-4" />}
                  <span>{copied ? 'Rencana Trading Berhasil Disalin!' : 'Salin Rencana Trading'}</span>
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

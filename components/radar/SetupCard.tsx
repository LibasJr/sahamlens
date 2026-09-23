'use client';

import React from 'react';
import { Shield, Target, ArrowUpDown, AlertTriangle, Info } from 'lucide-react';
import { Card, Badge, Button } from '@/components/ui';
import { useLanguage } from '@/lib/i18n';
import type { AiPickItem } from '@/app/breakout-radar/radar-model';
import { categorizeSetup, setupCategoryLabel, setupCategoryColor } from '@/app/breakout-radar/setup-category';

/**
 * SetupCard — kartu evidence-first untuk tiap kandidat LensRadar.
 *
 * Prinsip:
 * - Menampilkan APA yang sudah dihitung sistem (entry, stop, TP, RR, alasan).
 *   Tidak pernah menciptakan angka baru.
 * - Setiap field opsional: kalau data tidak tersedia, slot itu tidak tampil
 *   (bukan "N/A" atau "—").
 * - Kategorisasi deterministik dari field yang ada (lihat setup-category.ts).
 * - Warna netral: kategori adalah label deskriptif, bukan sinyal beli/jual.
 * - Tidak pernah menampilkan kata "Buy", "Strong Buy", atau implikasi
 *   performa tervalidasi.
 */

interface SetupCardProps {
  item: AiPickItem;
  isExpanded: boolean;
  onToggle: () => void;
}

export function SetupCard({ item, isExpanded, onToggle }: SetupCardProps) {
  const { language } = useLanguage();
  const isId = language === 'id';
  const category = categorizeSetup(item);
  const categoryColor = setupCategoryLabel(category, isId);
  const categoryBadgeClass = setupCategoryColor(category);

  const entry = item.tradePlan?.entry ?? null;
  const stopLoss = item.tradePlan?.stopLoss ?? item.tradePlan?.cutLoss ?? null;
  const takeProfit1 = item.tradePlan?.takeProfit1 ?? null;
  const takeProfit2 = item.tradePlan?.takeProfit2 ?? null;
  const rr = item.tradePlan?.riskReward ?? null;
  const riskPct = item.tradePlan?.riskPercent ?? null;
  const riskLevel = item.tradePlan?.riskLevel ?? null;
  const confidenceLevel = item.tradePlan?.confidenceLevel ?? null;

  const hasSetup = entry != null && stopLoss != null;
  const supportPrice = item.tradePlan?.nearestSupport?.price ?? item.tradePlan?.support?.price ?? null;
  const resistancePrice = item.tradePlan?.resistance?.price ?? null;
  const reasons = item.tradePlan?.reasons ?? item.topReasons ?? [];
  const missingData = item.tradePlan?.missingData ?? [];
  const caveats = item.tradePlan?.caveats ?? [];

  return (
    <Card
      padding="none"
      radius="md"
      elevation="sm"
      className={`border-tv-border ${isExpanded ? 'bg-tv-bg/60' : 'bg-tv-bg/30'}`}
    >
      <Button
        variant="bare"
        size="none"
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-tv-blue/50"
        aria-expanded={isExpanded}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${categoryBadgeClass}`}>
                {categoryColor}
              </span>
              {item.flagged && (
                <span className="inline-flex items-center gap-1 text-[10px] text-tv-red">
                  <AlertTriangle className="w-3 h-3" />
                  {item.flagReason}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-sm text-tv-text">
                {item.symbol.replace('.JK', '')}
              </span>
              <span className="text-xs text-tv-muted font-number">
                Rp {Math.round(item.price).toLocaleString(isId ? 'id-ID' : 'en-US')}
              </span>
              <span className={`text-xs font-number ${item.changePct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                {item.changePct >= 0 ? '+' : ''}{item.changePct.toFixed(1)}%
              </span>
            </div>
            {reasons.length > 0 && !isExpanded && (
              <p className="text-[11px] text-tv-muted mt-1 line-clamp-2">
                {reasons[0]}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold font-number text-tv-text">{item.finalScore}</div>
            {typeof item.coverage === 'number' && (
              <div className="text-[10px] text-tv-muted">
                {isId ? 'data' : 'data'} {item.coverage}%
              </div>
            )}
          </div>
        </div>
      </Button>

      {isExpanded && (
        <div className="border-t border-tv-border px-4 py-3 space-y-3">
          {/* Alasan / Evidence */}
          {reasons.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-tv-muted mb-1">
                {isId ? 'Alasan Utama' : 'Key Drivers'}
              </div>
              <ul className="space-y-0.5">
                {reasons.map((r, i) => (
                  <li key={i} className="text-[11px] text-tv-text">✓ {r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Setup Teknikal: Entry, Stop, TP, RR */}
          {hasSetup ? (
            <div className="grid grid-cols-2 gap-2">
              {entry != null && (
                <div className="rounded-md bg-tv-bg/60 border border-tv-border px-3 py-2">
                  <div className="text-[10px] text-tv-muted uppercase tracking-wide flex items-center gap-1">
                    <ArrowUpDown className="w-3 h-3" />
                    {isId ? 'Entry Ref' : 'Entry Ref'}
                  </div>
                  <div className="text-sm font-bold font-number text-tv-text mt-0.5">
                    {entry.toLocaleString(isId ? 'id-ID' : 'en-US')}
                  </div>
                  <div className="text-[10px] text-tv-muted">
                    {item.tradePlan?.entryReference === 'OPEN_H_PLUS_1'
                      ? (isId ? 'Open H+1' : 'Open H+1')
                      : (isId ? 'Harga saat ini' : 'Current price')}
                  </div>
                </div>
              )}
              {stopLoss != null && (
                <div className="rounded-md bg-tv-red/5 border border-tv-red/20 px-3 py-2">
                  <div className="text-[10px] text-tv-muted uppercase tracking-wide flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    {isId ? 'Stop / Inval' : 'Stop / Invalid'}
                  </div>
                  <div className="text-sm font-bold font-number text-tv-red mt-0.5">
                    {stopLoss.toLocaleString(isId ? 'id-ID' : 'en-US')}
                  </div>
                  {riskPct != null && (
                    <div className="text-[10px] text-tv-muted">
                      -{riskPct.toFixed(1)}% {isId ? 'dari entry' : 'from entry'}
                    </div>
                  )}
                </div>
              )}
              {takeProfit1 != null && (
                <div className="rounded-md bg-tv-green/5 border border-tv-green/20 px-3 py-2">
                  <div className="text-[10px] text-tv-muted uppercase tracking-wide flex items-center gap-1">
                    <Target className="w-3 h-3" />
                    {isId ? 'Target 1' : 'Target 1'}
                  </div>
                  <div className="text-sm font-bold font-number text-tv-green mt-0.5">
                    {takeProfit1.toLocaleString(isId ? 'id-ID' : 'en-US')}
                  </div>
                </div>
              )}
              {takeProfit2 != null && (
                <div className="rounded-md bg-tv-green/5 border border-tv-green/15 px-3 py-2">
                  <div className="text-[10px] text-tv-muted uppercase tracking-wide flex items-center gap-1">
                    <Target className="w-3 h-3" />
                    {isId ? 'Target 2' : 'Target 2'}
                  </div>
                  <div className="text-sm font-bold font-number text-tv-green mt-0.5">
                    {takeProfit2.toLocaleString(isId ? 'id-ID' : 'en-US')}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md bg-tv-bg/40 border border-tv-border px-3 py-2">
              <p className="text-[11px] text-tv-muted flex items-center gap-1">
                <Info className="w-3 h-3" />
                {isId
                  ? 'Setup entry/stop/target belum tersedia untuk saham ini — bukan berarti tidak ada peluang.'
                  : 'Entry/stop/target setup not yet available for this stock — not an indication of no opportunity.'}
              </p>
            </div>
          )}

          {/* Risk/Reward */}
          {rr != null && rr >= 1.5 && (
            <div className="flex items-center justify-between rounded-md bg-tv-bg/60 border border-tv-border px-3 py-2">
              <span className="text-[11px] text-tv-muted">
                {isId ? 'Risk/Reward' : 'Risk/Reward'}
              </span>
              <span className="text-sm font-bold font-number text-tv-text">
                1:{rr.toFixed(1)}
              </span>
            </div>
          )}

          {/* Risk Level & Confidence */}
          {(riskLevel != null || confidenceLevel != null) && (
            <div className="flex items-center gap-2">
              {riskLevel != null && (
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  riskLevel === 'LOW' ? 'text-tv-green bg-tv-green/10 border-tv-green/25' :
                  riskLevel === 'MEDIUM' ? 'text-tv-yellow bg-tv-yellow/10 border-tv-yellow/25' :
                  'text-tv-red bg-tv-red/10 border-tv-red/25'
                }`}>
                  {isId ? 'Risiko' : 'Risk'}: {riskLevel}
                </span>
              )}
              {confidenceLevel != null && (
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  confidenceLevel === 'HIGH' ? 'text-tv-green bg-tv-green/10 border-tv-green/25' :
                  confidenceLevel === 'MEDIUM' ? 'text-tv-blue bg-tv-blue/10 border-tv-blue/25' :
                  'text-tv-muted bg-tv-hover/30 border-tv-border'
                }`}>
                  {isId ? 'Kepercayaan' : 'Confidence'}: {confidenceLevel}
                </span>
              )}
            </div>
          )}

          {/* Support / Resistance */}
          {(supportPrice != null || resistancePrice != null) && (
            <div className="flex items-center gap-4 text-[11px]">
              {supportPrice != null && (
                <div>
                  <span className="text-tv-muted">{isId ? 'Support' : 'Support'}: </span>
                  <span className="font-number text-tv-text">{supportPrice.toLocaleString(isId ? 'id-ID' : 'en-US')}</span>
                </div>
              )}
              {resistancePrice != null && (
                <div>
                  <span className="text-tv-muted">{isId ? 'Resistance' : 'Resistance'}: </span>
                  <span className="font-number text-tv-text">{resistancePrice.toLocaleString(isId ? 'id-ID' : 'en-US')}</span>
                </div>
              )}
            </div>
          )}

          {/* Missing Data */}
          {missingData.length > 0 && (
            <div className="rounded-md bg-tv-yellow/5 border border-tv-yellow/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-tv-yellow mb-0.5">
                {isId ? 'Data Belum Tersedia' : 'Data Not Yet Available'}
              </div>
              <p className="text-[11px] text-tv-muted">
                {missingData.join(', ')}
              </p>
            </div>
          )}

          {/* Caveats */}
          {caveats.length > 0 && (
            <div className="space-y-0.5">
              {caveats.map((c, i) => (
                <p key={i} className="text-[10px] text-tv-muted leading-relaxed">
                  ⚠ {c}
                </p>
              ))}
            </div>
          )}

          {/* Coverage & Freshness */}
          <div className="flex items-center gap-3 text-[10px] text-tv-muted pt-1 border-t border-tv-border/50">
            {typeof item.coverage === 'number' && (
              <span>{isId ? 'Cakupan data' : 'Data coverage'}: {item.coverage}%</span>
            )}
            {item.signals && item.signals.length > 0 && (
              <span>{isId ? 'Sinyal' : 'Signals'}: {item.signals.join(', ')}</span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

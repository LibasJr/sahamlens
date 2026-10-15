'use client';

import React from 'react';
import { Bell, Plus, Trash2, ArrowDownCircle, ArrowUpCircle, Gauge, Target, ShieldAlert, Sparkles } from 'lucide-react';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import { Card, Input, Select, Button, Badge, EmptyState } from '@/components/ui';

export interface AlertItem {
  id: string;
  symbol: string;
  conditionType: string;
  targetValue: string;
  isActive: boolean;
  createdAt: string;
}

export const ALERT_OPTIONS = [
  { value: 'PRICE_BELOW', label: 'Harga Turun Di Bawah', needsValue: true, placeholder: 'Target harga' },
  { value: 'PRICE_ABOVE', label: 'Harga Naik Di Atas', needsValue: true, placeholder: 'Target harga' },
  { value: 'LENS_SCORE_ABOVE', label: 'LensScore Minimal', needsValue: true, placeholder: 'Target skor 0-100' },
  { value: 'LENS_CONFIDENCE_BELOW', label: 'Keyakinan Skor Turun Di Bawah', needsValue: true, placeholder: 'Target keyakinan %' },
  { value: 'BREAKOUT_SCORE_ABOVE', label: 'LensRadar Score Minimal', needsValue: true, placeholder: 'Target score radar' },
  { value: 'BREADTH_ADVANCING_BELOW', label: 'Market Breadth Melemah', needsValue: true, placeholder: 'Jumlah saham naik maksimal' },
  { value: 'CONSENSUS_STRONG_BUY', label: 'Konsensus Sangat Positif', needsValue: false, placeholder: '' },
  { value: 'RSI_OVERSOLD', label: 'RSI Oversold (< 30)', needsValue: false, placeholder: '' },
] as const;

export function getAlertOption(conditionType: string) {
  return ALERT_OPTIONS.find((option) => option.value === conditionType);
}

export function alertConditionText(alert: AlertItem) {
  const value = alert.targetValue;
  switch (alert.conditionType) {
    case 'PRICE_BELOW': return `Harga < ${value}`;
    case 'PRICE_ABOVE': return `Harga > ${value}`;
    case 'LENS_SCORE_ABOVE': return `LensScore >= ${value}`;
    case 'LENS_CONFIDENCE_BELOW': return `Keyakinan skor < ${value}%`;
    case 'BREAKOUT_SCORE_ABOVE': return `LensRadar score >= ${value}`;
    case 'BREADTH_ADVANCING_BELOW': return `Market breadth naik < ${value}`;
    case 'CONSENSUS_STRONG_BUY': return 'Konsensus Sangat Positif';
    case 'RSI_OVERSOLD': return 'RSI Oversold';
    default: return getAlertOption(alert.conditionType)?.label ?? alert.conditionType;
  }
}

interface WatchlistAlertsPanelProps {
  alerts: AlertItem[];
  isAdmin: boolean;
  alertSymbol: string;
  setAlertSymbol: (value: string) => void;
  alertCondition: string;
  setAlertCondition: (value: string) => void;
  alertValue: string;
  setAlertValue: (value: string) => void;
  onAddAlert: (e: React.FormEvent) => void;
  onRemoveAlert: (id: string) => void;
  onTriggerCron: () => void;
}

export function WatchlistAlertsPanel({
  alerts,
  isAdmin,
  alertSymbol,
  setAlertSymbol,
  alertCondition,
  setAlertCondition,
  alertValue,
  setAlertValue,
  onAddAlert,
  onRemoveAlert,
  onTriggerCron,
}: WatchlistAlertsPanelProps) {
  const displayTicker = (symbol: string) => symbol.replace('.JK', '');

  return (
    <div className="space-y-6 h-full">
      <Card padding="none" radius="lg" elevation="sm" highlight={false} className="border-tv-border p-5 h-full flex flex-col">
        <div className="flex items-center justify-between border-b border-tv-border pb-3 mb-4">
          <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2">
            <Bell className="w-5 h-5 text-tv-yellow" />
            LensAlert
          </h3>
          {isAdmin && (
            <Button variant="bare" size="none" onClick={onTriggerCron} className="lens-meta text-tv-muted hover:text-tv-text underline">
              Test Cron
            </Button>
          )}
        </div>

        <form onSubmit={onAddAlert} className="space-y-3 mb-6">
          <SymbolAutocomplete
            containerClassName="relative w-full"
            placeholder="Simbol (BBCA)"
            value={alertSymbol}
            onChange={(val) => setAlertSymbol(val)}
            className="w-full bg-tv-bg/60 border border-tv-border text-tv-text rounded-md px-3 py-2 text-sm focus:outline-none focus:border-tv-yellow transition-colors"
            required
          />
          <Select value={alertCondition} onChange={(e) => setAlertCondition(e.target.value)}>
            {ALERT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
          {getAlertOption(alertCondition)?.needsValue && (
            <Input
              type="number"
              placeholder={getAlertOption(alertCondition)?.placeholder || 'Target nilai'}
              value={alertValue}
              onChange={(e) => setAlertValue(e.target.value)}
              required
              className="font-number"
            />
          )}
          <Button type="submit" variant="secondary" className="w-full">
            <Plus className="w-4 h-4" /> Set Alert
          </Button>
        </form>

        <div className="space-y-2 flex-1 min-h-[120px] max-h-[400px] overflow-y-auto pr-1">
          {alerts.map((alert) => {
            const AlertIcon = alert.conditionType === 'PRICE_BELOW' ? ArrowDownCircle
              : alert.conditionType === 'PRICE_ABOVE' ? ArrowUpCircle
              : alert.conditionType === 'RSI_OVERSOLD' ? Gauge
              : alert.conditionType === 'LENS_SCORE_ABOVE' ? Target
              : alert.conditionType === 'LENS_CONFIDENCE_BELOW' ? ShieldAlert
              : Sparkles;
            return (
              <div key={alert.id} className={`p-3 rounded-md border flex flex-col gap-2 ${alert.isActive ? 'bg-tv-bg border-tv-border' : 'bg-tv-bg/50 border-tv-border/50 opacity-50'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-tv-text font-number">{displayTicker(alert.symbol)}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={alert.isActive ? 'success' : 'neutral'}>{alert.isActive ? 'Active' : 'Triggered'}</Badge>
                    <Button variant="bare" size="none" aria-label={`Hapus alert ${displayTicker(alert.symbol)}`} onClick={() => onRemoveAlert(alert.id)} className="text-tv-muted hover:text-tv-red">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-tv-muted flex items-center gap-1.5">
                  <AlertIcon className="w-3.5 h-3.5 shrink-0" />
                  {alertConditionText(alert)}
                </div>
              </div>
            );
          })}
          {alerts.length === 0 && (
            <EmptyState
              illustration="empty"
              title="Belum ada alert"
              description="Alert berjalan di server, jadi tetap aktif walau halaman ini ditutup. Notifikasi hp butuh izin browser - izinnya diminta saat alert pertama dibuat."
            />
          )}
        </div>
      </Card>
    </div>
  );
}

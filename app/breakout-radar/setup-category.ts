import type { AiPickItem } from './radar-model';

/**
 * Kategorisasi setup teknikal yang DETERMINISTIK dari field yang sudah ada.
 * Tidak pernah menciptakan entry/stop/target baru — hanya membaca apa yang
 * sudah dihitung scoring service dan trade-plan.
 */

export type SetupCategory = 'Breakout' | 'Retest' | 'Momentum continuation' | 'Reversal' | 'Setup teknikal';

const SUPPORT_NEAR_PCT = 2.5;

export function categorizeSetup(item: AiPickItem): SetupCategory {
  const hasBreakout = item.signals?.includes('breakout') ?? false;
  const hasGoldenCross = item.signals?.includes('golden cross') ?? false;
  const hasAccumulation = item.signals?.includes('akumulasi') ?? false;

  const supportPrice = item.tradePlan?.nearestSupport?.price ?? item.tradePlan?.support?.price ?? null;
  const isNearSupport = supportPrice != null && item.price > 0
    ? ((item.price - supportPrice) / item.price) * 100 <= SUPPORT_NEAR_PCT
    : false;

  // 1. Breakout: sinyal breakout dari scanner
  if (hasBreakout) return 'Breakout';

  // 2. Reversal: akumulasi + ada setup + dekat support (paling spesifik setelah breakout)
  if (hasAccumulation && isNearSupport && item.tradePlan != null) return 'Reversal';

  // 3. Retest: ada support struktural dan harga mendekatinya
  if (isNearSupport && item.tradePlan != null) return 'Retest';

  // 4. Momentum continuation: golden cross ATAU (ada trade plan + tidak di support + naik)
  if (hasGoldenCross) return 'Momentum continuation';
  if (item.tradePlan != null && !isNearSupport && (item.changePct ?? 0) > 0) return 'Momentum continuation';

  return 'Setup teknikal';
}

/**
 * Label kategori untuk UI — bahasa mengikuti preferensi user (id/en).
 */
export function setupCategoryLabel(category: SetupCategory, isId = true): string {
  const labels: Record<SetupCategory, { id: string; en: string }> = {
    'Breakout': { id: 'Breakout', en: 'Breakout' },
    'Retest': { id: 'Retest', en: 'Retest' },
    'Momentum continuation': { id: 'Lanjutan Momentum', en: 'Momentum Continuation' },
    'Reversal': { id: 'Reversal', en: 'Reversal' },
    'Setup teknikal': { id: 'Setup Teknikal', en: 'Technical Setup' },
  };
  return isId ? labels[category].id : labels[category].en;
}

/**
 * Warna badge per kategori — konsisten dengan palet TV.
 */
export function setupCategoryColor(category: SetupCategory): string {
  switch (category) {
    case 'Breakout': return 'text-tv-green bg-tv-green/10 border-tv-green/25';
    case 'Retest': return 'text-tv-blue bg-tv-blue/10 border-tv-blue/25';
    case 'Momentum continuation': return 'text-tv-purple bg-tv-purple/10 border-tv-purple/25';
    case 'Reversal': return 'text-tv-yellow bg-tv-yellow/10 border-tv-yellow/25';
    case 'Setup teknikal': return 'text-tv-muted bg-tv-hover/30 border-tv-border';
  }
}

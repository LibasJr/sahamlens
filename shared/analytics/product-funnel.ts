'use client';

import { apiRequest } from '@/shared/http/api-client';
// Identitas anonim dipakai bersama dengan analitik perjalanan riset - dua kunci berarti
// dua populasi yang tidak bisa dibandingkan. Lihat shared/analytics/visitor-id.ts.
import { getVisitorId } from '@/shared/analytics/visitor-id';

export type ProductFunnelEventType = 'locked_view' | 'signup_click' | 'signup_completed';

const SIGNUP_SOURCE_KEY = 'sahamlens.product-funnel.signup-source.v1';

export function trackProductFunnelEvent(eventType: ProductFunnelEventType, feature: string): void {
  const visitorId = getVisitorId();
  if (!visitorId) return;
  const body = JSON.stringify({ visitorId, eventType, feature });
  void apiRequest<void>('/api/analytics/funnel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export function trackSignupClick(feature: string): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(SIGNUP_SOURCE_KEY, feature);
  trackProductFunnelEvent('signup_click', feature);
}

export function trackSignupCompleted(): void {
  const feature = typeof window === 'undefined'
    ? 'signup_direct'
    : window.localStorage.getItem(SIGNUP_SOURCE_KEY) || 'signup_direct';
  trackProductFunnelEvent('signup_completed', feature);
  if (typeof window !== 'undefined') window.localStorage.removeItem(SIGNUP_SOURCE_KEY);
}

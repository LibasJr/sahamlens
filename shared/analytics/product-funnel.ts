import { apiRequest } from '@/shared/http/api-client';
'use client';

export type ProductFunnelEventType = 'locked_view' | 'signup_click' | 'signup_completed';

const VISITOR_KEY = 'sahamlens.product-funnel.visitor.v1';
const SIGNUP_SOURCE_KEY = 'sahamlens.product-funnel.signup-source.v1';

function getVisitorId(): string | null {
  if (typeof window === 'undefined') return null;
  const saved = window.localStorage.getItem(VISITOR_KEY);
  if (saved && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved)) return saved;
  if (!window.crypto?.randomUUID) return null;
  const visitorId = window.crypto.randomUUID();
  window.localStorage.setItem(VISITOR_KEY, visitorId);
  return visitorId;
}

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

import { recordProductFunnelEvent, type ProductFunnelEventType } from '@/modules/user/repository/user.repository';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';
import type { HttpResult } from '@/shared/types/http-result.types';
import { logger } from '@/shared/logger/logger';

const EVENT_TYPES = new Set<ProductFunnelEventType>(['locked_view', 'signup_click', 'signup_completed']);
const FEATURE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function handleProductFunnelEvent(request: Request): Promise<HttpResult | Response> {
  assertTrustedSameOrigin(request);
  try {
    const body: unknown = await request.json();
    const value = body as { visitorId?: unknown; eventType?: unknown; feature?: unknown };
    if (
      typeof value.visitorId !== 'string' || !UUID_V4_PATTERN.test(value.visitorId) ||
      typeof value.eventType !== 'string' || !EVENT_TYPES.has(value.eventType as ProductFunnelEventType) ||
      typeof value.feature !== 'string' || !FEATURE_PATTERN.test(value.feature)
    ) {
      return { status: 400, body: { error: 'Event funnel tidak valid', code: 'VALIDATION_ERROR' } };
    }
    await recordProductFunnelEvent({
      visitorId: value.visitorId,
      eventType: value.eventType as ProductFunnelEventType,
      feature: value.feature,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    logger.error('product funnel event failed', { error });
    return { status: 500, body: { error: 'Event funnel tidak dapat disimpan', code: 'INTERNAL_ERROR' } };
  }
}

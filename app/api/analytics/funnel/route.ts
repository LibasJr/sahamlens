import { NextResponse } from 'next/server';
import { recordProductFunnelEvent, type ProductFunnelEventType } from '@/modules/user/repository/user.repository';

export const dynamic = 'force-dynamic';

const EVENT_TYPES = new Set<ProductFunnelEventType>(['locked_view', 'signup_click', 'signup_completed']);
const FEATURE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const value = body as { visitorId?: unknown; eventType?: unknown; feature?: unknown };
    if (
      typeof value.visitorId !== 'string' || !UUID_V4_PATTERN.test(value.visitorId) ||
      typeof value.eventType !== 'string' || !EVENT_TYPES.has(value.eventType as ProductFunnelEventType) ||
      typeof value.feature !== 'string' || !FEATURE_PATTERN.test(value.feature)
    ) {
      return NextResponse.json({ error: 'Event funnel tidak valid' }, { status: 400 });
    }
    await recordProductFunnelEvent({
      visitorId: value.visitorId,
      eventType: value.eventType as ProductFunnelEventType,
      feature: value.feature,
    });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'Event funnel tidak dapat disimpan' }, { status: 500 });
  }
}

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { requireUser } from '@/shared/middleware/require-auth';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';
import {
  getPushClientConfig,
  parseBrowserPushSubscription,
  parsePushEndpoint,
  registerBrowserPushSubscription,
  unregisterBrowserPushSubscription,
} from '@/modules/notification/service/push-subscription.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  return runController(async () => {
    await requireUser();
    return { status: 200, body: getPushClientConfig() };
  });
}

export async function POST(req: NextRequest) {
  return runController(async () => {
    assertTrustedSameOrigin(req);
    const session = await requireUser();
    const subscription = parseBrowserPushSubscription(await req.json());
    await registerBrowserPushSubscription(session.id, subscription, req.headers.get('user-agent'));
    return { status: 200, body: { success: true } };
  }, req);
}

export async function DELETE(req: NextRequest) {
  return runController(async () => {
    assertTrustedSameOrigin(req);
    const session = await requireUser();
    const endpoint = parsePushEndpoint(await req.json());
    await unregisterBrowserPushSubscription(session.id, endpoint);
    return { status: 200, body: { success: true } };
  }, req);
}

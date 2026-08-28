import { logger } from '@/shared/logger/logger';
import type { AlertCheckResult } from './alert-evaluation.service';
import { checkAndTriggerAlerts } from './alert-evaluation.service';
import {
  disablePushSubscriptionById,
  getTriggeredAlertOwners,
  listActivePushSubscriptions,
  markPushDelivery,
  reservePushDelivery,
} from '../repository/push-subscription.repository';
import { getWebPushPublicConfig, sendWebPush } from './web-push.service';

export interface AlertPushDispatchOptions {
  /** Manual check: browser user already gets the foreground notification locally. */
  skipPushUserId?: string | null;
}

export interface AlertPushDispatchSummary {
  attempted: number;
  sent: number;
  failed: number;
  gone: number;
  deduplicated: number;
  skippedForUser: number;
  configured: boolean;
}

function notificationUrl(conditionType: string, symbol: string): string {
  const bareSymbol = symbol.replace('.JK', '');
  if (conditionType === 'BREAKOUT_SCORE_ABOVE') return '/breakout-radar';
  if (conditionType === 'BREADTH_ADVANCING_BELOW') return '/market-pulse';
  return `/dashboard?symbol=${encodeURIComponent(bareSymbol)}`;
}

function payloadForAlert(
  alertId: string,
  message: string,
  conditionType: string,
  symbol: string,
  origin: string,
): string {
  const compactBody = message
    .replace(/<[^>]*>?/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1_800);
  return JSON.stringify({
    title: 'SahamLens LensAlert',
    body: compactBody,
    url: new URL(notificationUrl(conditionType, symbol), origin).toString(),
    tag: `lensalert:${alertId}`,
    alertId,
    timestamp: Date.now(),
  });
}

export async function dispatchTriggeredAlertPushes(
  triggeredAlerts: AlertCheckResult['triggeredAlerts'],
  origin: string,
  options: AlertPushDispatchOptions = {},
): Promise<AlertPushDispatchSummary> {
  const summary: AlertPushDispatchSummary = {
    attempted: 0,
    sent: 0,
    failed: 0,
    gone: 0,
    deduplicated: 0,
    skippedForUser: 0,
    configured: getWebPushPublicConfig().configured,
  };
  if (triggeredAlerts.length === 0 || !summary.configured) return summary;

  const ownerByAlertId = await getTriggeredAlertOwners(triggeredAlerts.map((alert) => alert.id));

  for (const triggered of triggeredAlerts) {
    const owner = ownerByAlertId.get(triggered.id);
    if (!owner) continue;
    if (options.skipPushUserId && owner.userId === options.skipPushUserId) {
      summary.skippedForUser += 1;
      continue;
    }

    const subscriptions = await listActivePushSubscriptions(owner.userId);
    const payload = payloadForAlert(
      triggered.id,
      triggered.message,
      owner.conditionType,
      owner.symbol,
      origin,
    );

    for (const subscription of subscriptions) {
      const reserved = await reservePushDelivery(triggered.id, subscription.id);
      if (!reserved) {
        summary.deduplicated += 1;
        continue;
      }
      summary.attempted += 1;

      try {
        const result = await sendWebPush(subscription, payload);
        if (result.ok) {
          await markPushDelivery(triggered.id, subscription.id, {
            status: 'SENT',
            statusCode: result.status,
          });
          summary.sent += 1;
          continue;
        }

        const gone = result.status === 404 || result.status === 410;
        await markPushDelivery(triggered.id, subscription.id, {
          status: gone ? 'GONE' : 'FAILED',
          statusCode: result.status || null,
          error: result.responseText ?? 'Push provider rejected request',
        });
        if (gone) {
          await disablePushSubscriptionById(subscription.id);
          summary.gone += 1;
        } else {
          summary.failed += 1;
        }
      } catch (error) {
        await markPushDelivery(triggered.id, subscription.id, {
          status: 'FAILED',
          error: error instanceof Error ? error.message : String(error),
        });
        summary.failed += 1;
        logger.warn('LensAlert Web Push delivery failed', {
          module: 'web-push',
          alertId: triggered.id,
          subscriptionId: subscription.id,
          err: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  logger.info('LensAlert Web Push dispatch completed', { module: 'web-push', ...summary });
  return summary;
}

export async function checkTriggerAndDispatchAlerts(
  origin: string,
  options: AlertPushDispatchOptions = {},
): Promise<AlertCheckResult> {
  const result = await checkAndTriggerAlerts(origin);
  await dispatchTriggeredAlertPushes(result.triggeredAlerts, origin, options);
  return result;
}

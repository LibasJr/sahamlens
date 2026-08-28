import { ValidationError } from '@/shared/errors/app-error';
import {
  disablePushSubscription,
  upsertPushSubscription,
} from '../repository/push-subscription.repository';
import { getWebPushPublicConfig } from './web-push.service';

export interface BrowserPushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

function validBase64Url(value: string, minLength: number, maxLength: number): boolean {
  return value.length >= minLength
    && value.length <= maxLength
    && /^[A-Za-z0-9_-]+$/.test(value);
}

function validateEndpoint(endpoint: unknown): string {
  if (typeof endpoint !== 'string' || endpoint.length < 10 || endpoint.length > 2_048) {
    throw new ValidationError('Push endpoint tidak valid');
  }
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new ValidationError('Push endpoint tidak valid');
  }
  if (parsed.protocol !== 'https:') throw new ValidationError('Push endpoint wajib HTTPS');
  return endpoint;
}

export function parseBrowserPushSubscription(raw: unknown): BrowserPushSubscriptionInput {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('Payload push subscription tidak valid');
  }
  const input = raw as Record<string, unknown>;
  const keys = input.keys;
  if (keys == null || typeof keys !== 'object' || Array.isArray(keys)) {
    throw new ValidationError('Push subscription keys tidak valid');
  }
  const keyRecord = keys as Record<string, unknown>;
  const p256dh = keyRecord.p256dh;
  const auth = keyRecord.auth;
  if (typeof p256dh !== 'string' || !validBase64Url(p256dh, 80, 160)) {
    throw new ValidationError('Push p256dh tidak valid');
  }
  if (typeof auth !== 'string' || !validBase64Url(auth, 16, 64)) {
    throw new ValidationError('Push auth secret tidak valid');
  }

  return {
    endpoint: validateEndpoint(input.endpoint),
    keys: { p256dh, auth },
  };
}

export function parsePushEndpoint(raw: unknown): string {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('Payload push subscription tidak valid');
  }
  return validateEndpoint((raw as Record<string, unknown>).endpoint);
}

export function getPushClientConfig() {
  return getWebPushPublicConfig();
}

export async function registerBrowserPushSubscription(
  userId: string,
  input: BrowserPushSubscriptionInput,
  userAgent?: string | null,
): Promise<void> {
  const config = getWebPushPublicConfig();
  if (!config.configured) throw new ValidationError('Web Push belum dikonfigurasi di server');
  await upsertPushSubscription(userId, {
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    userAgent,
  });
}

export async function unregisterBrowserPushSubscription(userId: string, endpoint: string): Promise<void> {
  await disablePushSubscription(userId, endpoint);
}

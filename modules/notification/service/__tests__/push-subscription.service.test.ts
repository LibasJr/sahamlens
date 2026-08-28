import { afterEach, describe, expect, it } from 'vitest';
import {
  getPushClientConfig,
  parseBrowserPushSubscription,
  parsePushEndpoint,
} from '../push-subscription.service';

const VALID_PUBLIC_KEY = `B${'A'.repeat(86)}`;
const VALID_PRIVATE_KEY = 'A'.repeat(43);

afterEach(() => {
  delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  delete process.env.WEB_PUSH_VAPID_SUBJECT;
});

describe('push subscription input', () => {
  it('accepts a standards-shaped HTTPS subscription', () => {
    const parsed = parseBrowserPushSubscription({
      endpoint: 'https://push.example.test/send/device-1',
      keys: {
        p256dh: 'A'.repeat(87),
        auth: 'B'.repeat(22),
      },
    });

    expect(parsed.endpoint).toBe('https://push.example.test/send/device-1');
    expect(parsed.keys.auth).toHaveLength(22);
  });

  it('rejects non-HTTPS endpoints', () => {
    expect(() => parsePushEndpoint({ endpoint: 'http://push.example.test/device' })).toThrow();
  });

  it('rejects malformed browser keys', () => {
    expect(() => parseBrowserPushSubscription({
      endpoint: 'https://push.example.test/device',
      keys: { p256dh: '***', auth: 'bad' },
    })).toThrow();
  });
});

describe('Web Push runtime config', () => {
  it('is fail-closed when VAPID keys are absent', () => {
    expect(getPushClientConfig()).toEqual({ configured: false, publicKey: null });
  });

  it('exposes only the public VAPID key when configured', () => {
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = VALID_PUBLIC_KEY;
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = VALID_PRIVATE_KEY;
    process.env.WEB_PUSH_VAPID_SUBJECT = 'mailto:test@sahamlens.id';

    expect(getPushClientConfig()).toEqual({ configured: true, publicKey: VALID_PUBLIC_KEY });
  });
});

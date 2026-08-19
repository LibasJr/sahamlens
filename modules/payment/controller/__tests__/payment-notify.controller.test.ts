import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/user', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/telegram', () => ({ sendTelegramMessage: vi.fn() }));
vi.mock('@/shared/middleware/rate-limiter', () => ({ checkRateLimitShared: vi.fn() }));
vi.mock('@/shared/http/client-ip', () => ({ getTrustedClientIp: vi.fn(() => '127.0.0.1') }));
vi.mock('@/shared/http/same-origin', () => ({ assertTrustedSameOrigin: vi.fn() }));
vi.mock('../../repository/payment-order.repository', () => ({ claimPaymentOrder: vi.fn() }));

import { handlePaymentNotify } from '../payment-notify.controller';
import { getSession } from '@/modules/user';
import { sendTelegramMessage } from '@/lib/telegram';
import { checkRateLimitShared } from '@/shared/middleware/rate-limiter';
import { claimPaymentOrder } from '../../repository/payment-order.repository';

function request() {
  return new Request('http://localhost/api/payment/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
    body: JSON.stringify({ planCode: '1m', reference: '59c09c28-18e7-4d21-8898-75199fc17b0d' }),
  });
}

describe('handlePaymentNotify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimitShared).mockResolvedValue({ allowed: true });
    vi.mocked(getSession).mockResolvedValue({ id: 'u1', email: 'u@example.com' } as any);
    vi.mocked(claimPaymentOrder).mockResolvedValue({ id: 'order-1' } as any);
    vi.mocked(sendTelegramMessage).mockResolvedValue(undefined as any);
  });

  it('preserves Retry-After when rate limited', async () => {
    vi.mocked(checkRateLimitShared).mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    const result = await handlePaymentNotify(request());
    expect(result).toMatchObject({ status: 429, headers: { 'Retry-After': '30' } });
    expect(claimPaymentOrder).not.toHaveBeenCalled();
  });

  it('requires an authenticated account before creating an order', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const result = await handlePaymentNotify(request());
    expect(result).toMatchObject({ status: 401, body: { code: 'UNAUTHENTICATED' } });
    expect(claimPaymentOrder).not.toHaveBeenCalled();
  });

  it('keeps the persisted order when Telegram notification fails', async () => {
    vi.mocked(sendTelegramMessage).mockRejectedValue(new Error('telegram down'));
    const result = await handlePaymentNotify(request());
    expect(result).toMatchObject({ status: 202, body: { ok: true, orderId: 'order-1', notification: 'TELEGRAM_FAILED' } });
  });

  it('maps reference reuse mismatch to conflict without pretending a new order exists', async () => {
    vi.mocked(claimPaymentOrder).mockRejectedValue({ code: 'PAYMENT_REFERENCE_REUSE_MISMATCH' });
    const result = await handlePaymentNotify(request());
    expect(result).toMatchObject({ status: 409, body: { code: 'CONFLICT' } });
  });
});

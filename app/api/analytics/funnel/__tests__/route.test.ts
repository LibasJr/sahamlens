import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/user/repository/user.repository', () => ({
  recordProductFunnelEvent: vi.fn(),
}));

import { POST } from '../route';
import { recordProductFunnelEvent } from '@/modules/user/repository/user.repository';

const visitorId = '59c09c28-18e7-4d21-8898-75199fc17b0d';

describe('POST /api/analytics/funnel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merekam event funnel yang tervalidasi tanpa data identitas pengguna', async () => {
    const response = await POST(new Request('http://localhost/api/analytics/funnel', {
      method: 'POST',
      body: JSON.stringify({ visitorId, eventType: 'locked_view', feature: 'fundamental_indicators' }),
      headers: { 'Content-Type': 'application/json' },
    }));

    expect(response.status).toBe(204);
    expect(recordProductFunnelEvent).toHaveBeenCalledWith({
      visitorId,
      eventType: 'locked_view',
      feature: 'fundamental_indicators',
    });
  });

  it('menolak tipe event, ID browser, atau nama fitur yang tidak valid', async () => {
    const response = await POST(new Request('http://localhost/api/analytics/funnel', {
      method: 'POST',
      body: JSON.stringify({ visitorId: 'bukan-uuid', eventType: 'anything', feature: '<script>' }),
      headers: { 'Content-Type': 'application/json' },
    }));

    expect(response.status).toBe(400);
    expect(recordProductFunnelEvent).not.toHaveBeenCalled();
  });
});

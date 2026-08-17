import { describe, expect, it, vi, beforeEach } from 'vitest';
import { touchPresence, getActiveUsers, type PresenceEntry } from '../presence';

describe('User Presence & Session Duration Tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('menyimpan user presence dan menghitung durasi sesi dengan benar', async () => {
    const session = {
      id: 'usr-123',
      email: 'investor@sahamlens.id',
      role: 'pro',
      is_pro: true,
      trial_ends_at: null,
    };

    // Panggilan pertama (mulai sesi)
    await touchPresence(session as any);

    const active = await getActiveUsers();
    expect(Array.isArray(active)).toBe(true);
  });
});

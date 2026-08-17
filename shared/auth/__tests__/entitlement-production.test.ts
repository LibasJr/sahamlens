import { describe, expect, it } from 'vitest';
import { evaluateEntitlement } from '../entitlement';
import type { SessionPayload } from '../jwt';

const NOW = Date.parse('2026-08-17T00:00:00.000Z');
const base: SessionPayload = {
  id: 'u1', email: 'u@example.com', role: 'user', is_pro: false,
  trial_ends_at: null, pro_expires_at: null,
};
const evalProd = (session: SessionPayload | null) => evaluateEntitlement(session, { testingOpen: false, nowMs: NOW });

describe('production entitlement lifecycle', () => {
  it('guest dan akun free ditolak saat testing-open dimatikan', () => {
    expect(evalProd(null)).toBe(false);
    expect(evalProd(base)).toBe(false);
  });
  it('trial aktif diterima, trial tepat sekarang/kedaluwarsa ditolak', () => {
    expect(evalProd({ ...base, trial_ends_at: '2026-08-17T00:00:01.000Z' })).toBe(true);
    expect(evalProd({ ...base, trial_ends_at: '2026-08-17T00:00:00.000Z' })).toBe(false);
    expect(evalProd({ ...base, trial_ends_at: '2026-08-16T23:59:59.000Z' })).toBe(false);
  });
  it('Pro hanya aktif jika is_pro dan expiry masih di masa depan', () => {
    expect(evalProd({ ...base, is_pro: true, pro_expires_at: '2026-08-18T00:00:00.000Z' })).toBe(true);
    expect(evalProd({ ...base, is_pro: true, pro_expires_at: '2026-08-16T00:00:00.000Z' })).toBe(false);
    expect(evalProd({ ...base, is_pro: true, pro_expires_at: null })).toBe(false);
  });
  it('role pro tanpa entitlement eksplisit tidak menjadi bypass; admin tetap boleh', () => {
    expect(evalProd({ ...base, role: 'pro' })).toBe(false);
    expect(evalProd({ ...base, role: 'admin' })).toBe(true);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/user', () => ({
  getSession: vi.fn(),
}));
vi.mock('@/modules/fundamental', () => ({
  calculateDcfModel: vi.fn(),
}));
vi.mock('@/shared/cache/redis-cache', () => ({
  getOrCompute: vi.fn(),
}));

import { GET } from '../route';
import { calculateDcfModel } from '@/modules/fundamental';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { getSession } from '@/modules/user';

function makeRequest(ticker: string): Request {
  return new Request(`http://localhost/api/dcf/${ticker}`);
}
function makeParams(ticker: string) {
  return { params: Promise.resolve({ ticker }) };
}

const mockDcfData = {
  stock: { symbol: 'TLKM' },
  quant: {
    fair_value: 4200,
    current_price: 3200,
    valuation_status: 'UNDERVALUED',
    fcf_projections: [
      { year: '2025', fcf_per_share: 250, pv_fcf: 220 },
      { year: '2026', fcf_per_share: 270, pv_fcf: 215 },
      { year: '2027', fcf_per_share: 290, pv_fcf: 210 },
      { year: '2028', fcf_per_share: 310, pv_fcf: 205 },
      { year: '2029', fcf_per_share: 330, pv_fcf: 200 },
    ],
    sensitivity_table: [
      { discount_rate_pct: '11.00', 'g_3.0%': 4100, 'g_3.5%': 4300, 'g_4.0%': 4500 },
      { discount_rate_pct: '12.00', 'g_3.0%': 3800, 'g_3.5%': 4000, 'g_4.0%': 4200 },
      { discount_rate_pct: '13.00', 'g_3.0%': 3500, 'g_3.5%': 3700, 'g_4.0%': 3900 },
    ],
  },
};

describe('GET /api/dcf/[ticker]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(null);
  });

  it('membaca lewat getOrCompute, kunci cache per ticker', async () => {
    vi.mocked(getOrCompute).mockImplementation(async (_key, _ttl, compute) => compute());
    vi.mocked(calculateDcfModel).mockResolvedValue(mockDcfData as any);

    const res = await GET(makeRequest('TLKM'), makeParams('TLKM'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.quant.fair_value).toBe(4200);
    expect(getOrCompute).toHaveBeenCalledWith(
      expect.stringContaining('sahamlens:cache:computed:dcf:'),
      expect.any(Number),
      expect.any(Function),
    );
  });

  it('tamu (guest) menerima ringkasan nilai wajar tapi proyeksi FCF dibatasi 2 tahun dan sensitivitas dikosongkan', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(getOrCompute).mockResolvedValue(mockDcfData as any);

    const res = await GET(makeRequest('TLKM'), makeParams('TLKM'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.quant.fair_value).toBe(4200);
    expect(json.quant.fcf_projections).toHaveLength(2);
    expect(json.quant.fcf_locked_count).toBe(3);
    expect(json.quant.sensitivity_table).toEqual([]);
    expect(json.is_guest_limited).toBe(true);
  });

  it('pengguna login menerima proyeksi 5-tahun dan tabel sensitivitas penuh', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'u1', email: 'u1@sahamlens.id' } as any);
    vi.mocked(getOrCompute).mockResolvedValue(mockDcfData as any);

    const res = await GET(makeRequest('TLKM'), makeParams('TLKM'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.quant.fair_value).toBe(4200);
    expect(json.quant.fcf_projections).toHaveLength(5);
    expect(json.quant.sensitivity_table).toHaveLength(3);
    expect(json.is_guest_limited).toBe(false);
  });

  it('data tidak tersedia -> 404, hasil "not found" tetap dibungkus supaya bisa dicache', async () => {
    vi.mocked(getOrCompute).mockImplementation(async (_key, _ttl, compute) => compute());
    vi.mocked(calculateDcfModel).mockResolvedValue(null);

    const res = await GET(makeRequest('XXXX'), makeParams('XXXX'));

    expect(res.status).toBe(404);
  });
});

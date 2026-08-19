import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();
vi.mock('@/shared/http/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const { sharedMarketRequest, resetSharedMarketRequests } = await import('../shared-market-request');

beforeEach(() => {
  apiRequest.mockReset();
  resetSharedMarketRequests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('satu request untuk beberapa pemanggil', () => {
  it('tiga komponen meminta endpoint yang sama -> satu panggilan jaringan', async () => {
    apiRequest.mockResolvedValue({ price: 8120 });

    const hasil = await Promise.all([
      sharedMarketRequest('/api/live/^JKSE'),
      sharedMarketRequest('/api/live/^JKSE'),
      sharedMarketRequest('/api/live/^JKSE'),
    ]);

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(hasil).toEqual([{ price: 8120 }, { price: 8120 }, { price: 8120 }]);
  });

  it('endpoint berbeda tetap request sendiri-sendiri', async () => {
    apiRequest.mockResolvedValue({});
    await Promise.all([
      sharedMarketRequest('/api/live/^JKSE'),
      sharedMarketRequest('/api/market-summary'),
    ]);
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it('selalu no-store: peta ini menggabungkan request, bukan menambah lapisan cache HTTP', async () => {
    apiRequest.mockResolvedValue({});
    await sharedMarketRequest('/api/market-summary');
    expect(apiRequest).toHaveBeenCalledWith('/api/market-summary', { cache: 'no-store' });
  });
});

describe('kegagalan tidak ikut disimpan', () => {
  it('percobaan setelah gagal benar-benar menembus jaringan lagi', async () => {
    // Kalau kegagalan ikut di-cache, tombol "Coba lagi" di UI akan mengembalikan error
    // yang sama tanpa pernah menghubungi server - dan terlihat seperti server yang rusak.
    apiRequest.mockRejectedValueOnce(new Error('jaringan putus'));
    await expect(sharedMarketRequest('/api/market-summary')).rejects.toThrow('jaringan putus');

    apiRequest.mockResolvedValueOnce({ topValue: [] });
    await expect(sharedMarketRequest('/api/market-summary')).resolves.toEqual({ topValue: [] });
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it('penolakan diteruskan ke SETIAP pemanggil, bukan ditelan diam-diam', async () => {
    apiRequest.mockRejectedValue(new Error('502'));
    const a = sharedMarketRequest('/api/live/^JKSE');
    const b = sharedMarketRequest('/api/live/^JKSE');
    await expect(a).rejects.toThrow('502');
    await expect(b).rejects.toThrow('502');
  });
});

describe('jendela berbagi punya batas waktu', () => {
  it('setelah TTL lewat, request berikutnya mengambil data segar', async () => {
    vi.useFakeTimers();
    apiRequest.mockResolvedValue({});

    await sharedMarketRequest('/api/live/^JKSE', 30_000);
    vi.advanceTimersByTime(30_001);
    await sharedMarketRequest('/api/live/^JKSE', 30_000);

    expect(apiRequest).toHaveBeenCalledTimes(2);
  });
});

/**
 * Gerbang pemindai sumber.
 *
 * Peta di atas hanya berguna kalau ketiga pemanggilnya benar-benar memakainya. Regresinya
 * senyap dengan cara yang paling buruk: seseorang menulis ulang salah satu komponen dengan
 * `apiRequest` biasa, semua test lulus, semua audit hijau, dan beranda diam-diam kembali
 * mengirim empat request untuk dua jawaban.
 *
 * Komentar dibuang sebelum dicocokkan (CLAUDE.md §2): berkas-berkas ini MENJELASKAN pola
 * lamanya di komentar, dan pemindai yang menghitung prosa akan lulus/gagal karena catatan
 * sejarah, bukan karena kodenya.
 */
const ROOT = path.resolve(__dirname, '../../..');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const PEMANGGIL: { file: string; endpoint: string }[] = [
  { file: 'components/TopMarketBar.tsx', endpoint: '/api/live/^JKSE' },
  { file: 'components/MarketTicker.tsx', endpoint: '/api/market-summary' },
  { file: 'components/home/useHomeWorkspaceData.ts', endpoint: '/api/live/^JKSE' },
  { file: 'components/home/useHomeWorkspaceData.ts', endpoint: '/api/market-summary' },
];

describe('pemanggil endpoint pasar ganda memakai peta bersama', () => {
  it('berkas yang dijaga masih ada (penjaga tidak lulus karena file pindah)', () => {
    // Kalau salah satu berkas pindah, gerbang ini akan LULUS tanpa memeriksa apa pun -
    // dan itu jauh lebih buruk daripada gagal.
    for (const { file } of PEMANGGIL) {
      expect(fs.existsSync(path.join(ROOT, file)), `${file} hilang - pindahkan gerbangnya`).toBe(true);
    }
  });

  it.each(PEMANGGIL)('$file tidak memanggil $endpoint lewat apiRequest langsung', ({ file, endpoint }) => {
    const source = stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    expect(source, `${file} harus menyebut ${endpoint}`).toContain(endpoint);

    // Cari pemanggilan apiRequest/jsonOrNull yang membawa endpoint ini pada baris yang sama.
    const langsung = source
      .split(/\r?\n/)
      .filter((line) => line.includes(endpoint) && /\b(apiRequest|jsonOrNull)\s*[<(]/.test(line));

    expect(langsung, `${file}: ${endpoint} harus lewat sharedMarketRequest\n${langsung.join('\n')}`).toEqual([]);
    expect(source).toContain('sharedMarketRequest');
  });
});

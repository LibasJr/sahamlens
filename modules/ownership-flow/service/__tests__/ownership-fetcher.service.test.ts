import { describe, expect, it, vi } from 'vitest';
import { fetchOwnershipPage, mapWithConcurrency } from '../ownership-fetcher.service';

// Tidak ada jaringan nyata di test ini: fetch & sleep disuntik. Yang diuji adalah
// KEBIJAKANNYA - apa yang diulang, apa yang tidak, dan seberapa banyak request
// yang boleh berjalan bersamaan.

const noSleep = async () => {};

function jsonResponse(status: number, body = '<html><body>ok</body></html>'): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html' } });
}

describe('fetchOwnershipPage - retry', () => {
  it('tidak mengulang ketika sukses', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200));
    const result = await fetchOwnershipPage('https://example.test/a', {
      timeoutMs: 1000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: noSleep,
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([429, 500, 502, 503, 504, 507])('mengulang error transien %i', async (status) => {
    const fetchImpl = vi.fn(async () => jsonResponse(status));
    const result = await fetchOwnershipPage('https://example.test/a', {
      timeoutMs: 1000,
      maxAttempts: 3,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: noSleep,
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.errorCode).toBe(status === 429 ? 'RATE_LIMITED' : 'SERVER_ERROR');
  });

  it('HTTP 500 diulang dan diberi sandi SERVER_ERROR, bukan CLIENT_ERROR', async () => {
    // REGRESI (dikoreksi 2026-08-16): daftar status transien lama
    // {429,502,503,504} tidak memuat 500, jadi ia jatuh ke cabang CLIENT_ERROR -
    // salah dua kali sekaligus. 500 adalah kegagalan SERVER, bukan permintaan
    // kita yang keliru, dan ia sering sesaat; akibatnya ia TIDAK PERNAH diulang
    // padahal justru seharusnya diulang. Kalau test ini gagal, bug itu kembali.
    const fetchImpl = vi.fn(async () => jsonResponse(500));
    const result = await fetchOwnershipPage('https://example.test/a', {
      timeoutMs: 1000,
      maxAttempts: 3,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: noSleep,
    });
    expect(result.errorCode).toBe('SERVER_ERROR');
    expect(result.errorCode).not.toBe('CLIENT_ERROR');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('membedakan 429 (kita terlalu cepat) dari 5xx (server sumber bermasalah)', async () => {
    // Dua keadaan ini menuntut tindakan operator yang berbeda: turunkan
    // konkurensi vs tunggu saja. Menyamakan sandinya menghilangkan petunjuk itu.
    const make = async (status: number) => {
      const fetchImpl = vi.fn(async () => jsonResponse(status));
      return fetchOwnershipPage('https://example.test/a', {
        timeoutMs: 1000,
        maxAttempts: 1,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sleepImpl: noSleep,
      });
    };
    expect((await make(429)).errorCode).toBe('RATE_LIMITED');
    expect((await make(503)).errorCode).toBe('SERVER_ERROR');
    expect((await make(404)).errorCode).toBe('CLIENT_ERROR');
  });

  it('TIDAK mengulang 404 - permintaan kita memang salah', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(404));
    const result = await fetchOwnershipPage('https://example.test/a', {
      timeoutMs: 1000,
      maxAttempts: 3,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: noSleep,
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('CLIENT_ERROR');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('berhasil pada percobaan kedua setelah error transien', async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return call === 1 ? jsonResponse(503) : jsonResponse(200);
    });
    const result = await fetchOwnershipPage('https://example.test/a', {
      timeoutMs: 1000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: noSleep,
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('mengembalikan TIMEOUT tanpa melempar', async () => {
    const fetchImpl = vi.fn(async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    });
    const result = await fetchOwnershipPage('https://example.test/a', {
      timeoutMs: 5,
      maxAttempts: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: noSleep,
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('TIMEOUT');
  });

  it('mengirim User-Agent yang menyebut identitas dan kontak', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200));
    await fetchOwnershipPage('https://example.test/a', {
      timeoutMs: 1000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: noSleep,
    });
    const init = (fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>)[0][1];
    const headers = init.headers as Record<string, string>;
    expect(headers['User-Agent']).toContain('SahamLens');
    expect(headers['User-Agent']).toContain('sahamlens.id');
    // Tidak ada kredensial apa pun yang ikut terkirim.
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('cookie');
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('authorization');
  });
});

describe('mapWithConcurrency', () => {
  it('tidak pernah melampaui batas paralel', async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 25 }, (_, i) => i);

    await mapWithConcurrency(items, 3, async (item) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return item;
    });

    // Inti §8: 25 item TIDAK berarti 25 koneksi serempak ke server sumber.
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('mengembalikan hasil urut sesuai input, bukan urut selesai', async () => {
    const items = [30, 10, 20];
    const results = await mapWithConcurrency(items, 3, async (item) => {
      await new Promise((resolve) => setTimeout(resolve, item / 10));
      return item * 2;
    });
    expect(results).toEqual([60, 20, 40]);
  });

  it('satu item gagal TIDAK menggagalkan sisanya', async () => {
    const items = ['BBRI', 'BBCA', 'XYZ', 'TLKM'];
    const results = await mapWithConcurrency(
      items,
      2,
      async (ticker) => {
        if (ticker === 'XYZ') throw new Error('parser gagal');
        return `${ticker}:ok`;
      },
      { onError: (ticker) => `${ticker}:failed` }
    );

    // §27: BBRI/BBCA/TLKM tetap terproses walaupun XYZ gagal.
    expect(results).toEqual(['BBRI:ok', 'BBCA:ok', 'XYZ:failed', 'TLKM:ok']);
  });

  it('menangani daftar kosong tanpa menggantung', async () => {
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
  });
});

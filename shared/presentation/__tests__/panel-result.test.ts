import { describe, expect, it, vi } from 'vitest';
import { loadPanel, panelValueOr } from '../panel-result';

vi.mock('@/shared/logger/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe('isolasi galat panel admin', () => {
  it('meneruskan nilai saat pemuatan berhasil', async () => {
    const result = await loadPanel('funnel', async () => ({ visitors: 12 }));
    expect(result).toEqual({ ok: true, value: { visitors: 12 } });
  });

  it('menangkap kegagalan alih-alih melemparnya', async () => {
    // Inti perbaikan ini. Halaman admin memuat SEMUA panelnya dalam satu Promise.all,
    // jadi sebelum ini satu panel opsional yang gagal - tabel belum dimigrasi, misalnya -
    // menjatuhkan seluruh halaman, termasuk Payment Order dan panel operasional yang tidak
    // ada hubungannya dengan kegagalan itu.
    const result = await loadPanel('perjalanan riset', async () => {
      throw new Error('relation "product_journey_events" does not exist');
    });

    expect(result.ok).toBe(false);
  });

  it('tidak membocorkan pesan galat mentah ke layar', async () => {
    // Galat basis data membawa nama host, port, dan kadang kredensial di dalam pesannya.
    // Halaman ini memang hanya untuk admin, tapi tangkapan layar admin beredar di tiket
    // dukungan dan grup chat - detailnya masuk log, bukan ke DOM.
    const result = await loadPanel('perjalanan riset', async () => {
      throw new Error('connection to 10.0.0.5:5432 failed: password authentication failed');
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).not.toContain('10.0.0.5');
    expect(result.message).not.toContain('password');
    expect(result.message).toContain('perjalanan riset');
  });

  it('mencatat galat aslinya ke logger supaya tetap bisa didiagnosis', async () => {
    const { logger } = await import('@/shared/logger/logger');
    vi.mocked(logger.error).mockClear();

    const boom = new Error('relation does not exist');
    await loadPanel('funnel', async () => { throw boom; });

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [, context] = vi.mocked(logger.error).mock.calls[0];
    // Kuncinya WAJIB `err`. Hanya `err` yang diekstrak jadi errMessage/errStack dan
    // dikirim ke Sentry sebagai exception; kunci lain berakhir di JSON.stringify dan
    // menjadi `{}` karena Error tidak punya properti enumerable - persis kebalikan dari
    // yang dijanjikan nama test ini. Lihat shared/logger/__tests__/logger-error-key.test.ts.
    expect(context).toMatchObject({ panel: 'funnel', err: boom });
    expect(context).not.toHaveProperty('error');
  });

  it('nilai yang dilempar bukan Error tetap tertangani', async () => {
    const result = await loadPanel('funnel', async () => { throw 'string mentah'; });
    expect(result.ok).toBe(false);
  });

  it('panelValueOr memberi nilai cadangan saat panel gagal', async () => {
    const gagal = await loadPanel('aktivitas', async () => { throw new Error('x'); });
    const berhasil = await loadPanel('aktivitas', async () => [1, 2, 3]);

    expect(panelValueOr(gagal, [])).toEqual([]);
    expect(panelValueOr(berhasil, [])).toEqual([1, 2, 3]);
  });

  it('satu panel gagal tidak menghentikan panel lain di Promise.all', async () => {
    // Bentuk pemakaian sebenarnya di app/admin/page.tsx.
    const [a, b, c] = await Promise.all([
      loadPanel('a', async () => 'satu'),
      loadPanel('b', async () => { throw new Error('tabel hilang'); }),
      loadPanel('c', async () => 'tiga'),
    ]);

    expect(a).toEqual({ ok: true, value: 'satu' });
    expect(b.ok).toBe(false);
    expect(c).toEqual({ ok: true, value: 'tiga' });
  });
});

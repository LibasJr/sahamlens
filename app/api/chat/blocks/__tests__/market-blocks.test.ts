import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/cache/redis-cache', () => ({
  cacheGet: vi.fn(),
  getCacheTtlRemaining: vi.fn(),
}));

import { marketMoversBlock, sectorAndBreadthBlock, macroBlock } from '../market-blocks';
import { cacheGet, getCacheTtlRemaining } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';

// BARU (2026-08-14, laporan pengguna: LensAI bilang "top gainer" kosong jam 19:00 WIB
// padahal Beranda menampilkannya - akar masalah TTL cron yang salah, sudah diperbaiki
// jadi lantai 3 hari sama seperti BREAKOUT_RADAR). Konsekuensinya blok-blok ini sekarang
// bisa membaca data berumur berjam-jam - test di sini memverifikasi ageNote() tetap
// jujur menandai data lama sebagai "sesi sebelumnya", bukan diam-diam disajikan seolah live.
describe('market-blocks - ageNote (kejujuran umur data cron)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cache kosong -> pesan "belum tersedia", tidak ada umur data', async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);

    const result = await marketMoversBlock();

    expect(result).toContain('belum tersedia');
    expect(getCacheTtlRemaining).not.toHaveBeenCalled();
  });

  it('data baru (5 menit lalu) -> TIDAK ditandai sebagai sesi sebelumnya', async () => {
    vi.mocked(cacheGet).mockResolvedValue({ topGainers: [{ symbol: 'BBCA.JK', changePct: 1.2 }] });
    // Ditulis cron dengan TTL 3 hari; sisa 3 hari dikurangi 5 menit = baru saja ditulis.
    vi.mocked(getCacheTtlRemaining).mockResolvedValue(CACHE_TTL_SEC.MARKET_SUMMARY_CRON - 5 * 60);

    const result = await marketMoversBlock();

    expect(result).toContain('Umur data: 5 menit lalu');
    expect(result).not.toContain('sesi sebelumnya');
  });

  it('data berumur berjam-jam (mis. malam hari, cron sudah berhenti) -> WAJIB ditandai sesi sebelumnya', async () => {
    vi.mocked(cacheGet).mockResolvedValue({ topGainers: [{ symbol: 'BBCA.JK', changePct: 1.2 }] });
    // Sisa TTL jauh lebih kecil dari total 3 hari -> data sudah berumur ~4 jam.
    vi.mocked(getCacheTtlRemaining).mockResolvedValue(CACHE_TTL_SEC.MARKET_SUMMARY_CRON - 4 * 60 * 60);

    const result = await marketMoversBlock();

    expect(result).toContain('DATA SESI SEBELUMNYA');
    expect(result).toContain('bukan kondisi saat ini');
  });

  it('sectorAndBreadthBlock (market-pulse) ikut menandai data lama', async () => {
    vi.mocked(cacheGet).mockResolvedValue({ breadth: { advancing: 100, declining: 50, unchanged: 10, total: 160 } });
    vi.mocked(getCacheTtlRemaining).mockResolvedValue(CACHE_TTL_SEC.MARKET_PULSE_CRON - 3 * 60 * 60);

    const result = await sectorAndBreadthBlock();

    expect(result).toContain('DATA SESI SEBELUMNYA');
  });

  it('macroBlock berumur 2 jam -> tetap WAJIB ditandai sesi sebelumnya', async () => {
    vi.mocked(cacheGet).mockResolvedValue({ market: [{ label: 'USD/IDR', value: 16200, unit: '' }] });
    vi.mocked(getCacheTtlRemaining).mockResolvedValue(CACHE_TTL_SEC.MACRO_DASHBOARD - 2 * 60 * 60);

    const result = await macroBlock();

    expect(result).toContain('DATA SESI SEBELUMNYA');
  });

  it('macroBlock berumur 25 menit (>=20 menit, tapi ageHours membulat ke 0) -> tanda "KEMUNGKINAN sesi sebelumnya"', async () => {
    vi.mocked(cacheGet).mockResolvedValue({ market: [{ label: 'USD/IDR', value: 16200, unit: '' }] });
    vi.mocked(getCacheTtlRemaining).mockResolvedValue(CACHE_TTL_SEC.MACRO_DASHBOARD - 25 * 60);

    const result = await macroBlock();

    expect(result).toContain('KEMUNGKINAN dari sesi bursa sebelumnya');
  });

  it('getCacheTtlRemaining null (Redis tidak terkonfigurasi) -> tidak melempar, cuma tanpa catatan umur', async () => {
    vi.mocked(cacheGet).mockResolvedValue({ topGainers: [] });
    vi.mocked(getCacheTtlRemaining).mockResolvedValue(null);

    const result = await marketMoversBlock();

    expect(result).not.toContain('Umur data');
  });
});

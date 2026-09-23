import { describe, expect, it } from 'vitest';
import { buildExternalUrlContext } from './external-url-context';

describe('buildExternalUrlContext', () => {
  it('menolak private URL tanpa request jaringan', async () => {
    await expect(buildExternalUrlContext('cek http://192.168.1.9/admin')).resolves.toContain('ditolak');
  });
  it('membaca URL dari riwayat yang digabung caller', async () => {
    await expect(buildExternalUrlContext('https://example.com\nbuka itu')).resolves.not.toBe('');
  });
  it('tidak melakukan fetch bila prompt tanpa URL', async () => {
    await expect(buildExternalUrlContext('analisis BBCA')).resolves.toBe('');
  });
});

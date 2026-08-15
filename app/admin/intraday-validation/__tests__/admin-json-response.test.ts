import { describe, expect, it } from 'vitest';
import { readAdminJsonResponse } from '../admin-json-response';

describe('readAdminJsonResponse', () => {
  it('membaca respons JSON normal', async () => {
    await expect(readAdminJsonResponse<{ ok: boolean }>(new Response('{"ok":true}', {
      headers: { 'Content-Type': 'application/json' },
    }))).resolves.toEqual({ ok: true });
  });

  it('menerjemahkan HTML dari proxy menjadi pesan yang dapat ditindaklanjuti', async () => {
    await expect(readAdminJsonResponse(new Response('<!DOCTYPE html><title>524</title>', {
      status: 524,
      headers: { 'X-Request-Id': 'req-intraday-1' },
    }))).rejects.toThrow('HTTP 524');
  });
});

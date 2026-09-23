import { describe, expect, it, vi } from 'vitest';

// Kedua modul ini distub supaya yang benar-benar diuji adalah perilaku route terhadap
// BENTUK request, bukan isi gate admin atau rantai side-effect-nya.
vi.mock('@/shared/http/same-origin', () => ({
  assertTrustedSameOrigin: vi.fn(),
}));

vi.mock('@/modules/user', () => ({
  handleAdminLoginByKey: vi.fn(async () => ({ status: 404, body: { error: 'Not found' } })),
}));

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { handleAdminLoginByKey } from '@/modules/user';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';

const URL_ADMIN = 'http://localhost/admin-login/key';

function formRequest(key: string): NextRequest {
  const fd = new FormData();
  fd.set('key', key);
  return new NextRequest(URL_ADMIN, { method: 'POST', body: fd });
}

function jsonRequest(payload: unknown): NextRequest {
  return new NextRequest(URL_ADMIN, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('POST /admin-login/key', () => {
  it('membalas 400, bukan 500, saat Content-Type bukan form-data', async () => {
    // `req.formData()` melempar TypeError untuk request JSON. Sebelum 2026-09-24
    // lemparan itu sampai ke catch runController dan menjadi 500 INTERNAL_ERROR -
    // terbaca seperti server rusak, padahal hanya bentuk request klien yang salah.
    const res = await POST(jsonRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(res.headers.get('X-Request-Id')).toBeTruthy();
    expect(json.error).toBeTruthy();
    // Yang penting: gate admin tidak pernah dievaluasi untuk request yang tidak sah
    // bentuknya, jadi tidak ada kerja tambahan (dan tidak ada oracle) di sana.
    expect(handleAdminLoginByKey).not.toHaveBeenCalled();
  });

  it('meneruskan key dari form dan mempertahankan balasan 404 untuk key salah', async () => {
    const res = await POST(formRequest('bukan-key-yang-benar'));

    expect(assertTrustedSameOrigin).toHaveBeenCalled();
    expect(handleAdminLoginByKey).toHaveBeenCalledWith('bukan-key-yang-benar');
    // 404 "Not found", bukan 401: keberadaan gate admin tidak dikonfirmasi ke penebak.
    expect(res.status).toBe(404);
  });
});
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/auth/desktop/login/route';

describe('desktop authentication route', () => {
  it('does not reject the Tauri application origin before validating credentials', async () => {
    const request = new NextRequest('https://sahamlens.id/api/auth/desktop/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'tauri://localhost',
      },
      body: JSON.stringify({
        email: 'invalid-repro@example.invalid',
        password: 'invalid-repro-password',
      }),
    });

    const response = await POST(request);
    const body = await response.json() as { error?: string; code?: string };

    expect(response.status).not.toBe(403);
    expect(body.code).not.toBe('FORBIDDEN');
    expect(body.error).not.toBe('Origin tidak dikenali');
  });
});

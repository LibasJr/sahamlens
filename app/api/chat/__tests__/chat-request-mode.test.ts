import { describe, expect, it } from 'vitest';
import { parseChatRequest } from '@/modules/ai/chat/chat-request';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost:3001/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('parseChatRequest mode (operator 2026-09-22)', () => {
  it('body.mode "caveman" diterima apa adanya', async () => {
    const parsed = await parseChatRequest(makeRequest({ prompt: 'ANTM sekarang', mode: 'caveman' }));
    expect(parsed.mode).toBe('caveman');
  });

  it('tanpa mode / mode lain = null (default), bukan error', async () => {
    const tanpaMode = await parseChatRequest(makeRequest({ prompt: 'ANTM sekarang' }));
    const modeAneh = await parseChatRequest(makeRequest({ prompt: 'x', mode: 'haiku' }));
    expect(tanpaMode.mode).toBeNull();
    expect(modeAneh.mode).toBeNull();
  });
});

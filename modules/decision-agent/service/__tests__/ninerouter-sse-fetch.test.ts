import { afterEach, describe, expect, it, vi } from 'vitest';
import { assembleChatCompletionSse, ninerouterCompatibleFetch } from '../ninerouter-sse-fetch';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

function line(value: unknown) {
  return `data: ${JSON.stringify(value)}\n\n`;
}

describe('9Router non-stream SSE compatibility', () => {
  it('merakit delta content dan usage menjadi chat completion JSON', () => {
    const body = [
      line({ id: 'chatcmpl-1', object: 'chat.completion.chunk', created: 1788317223, model: 'claude-sonnet-5', choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] }),
      line({ id: 'chatcmpl-1', object: 'chat.completion.chunk', created: 1788317223, model: 'claude-sonnet-5', choices: [{ index: 0, delta: { content: '{"reviews":[' }, finish_reason: null }] }),
      line({ id: 'chatcmpl-1', object: 'chat.completion.chunk', created: 1788317224, model: 'claude-sonnet-5', choices: [{ index: 0, delta: { content: ']}' }, finish_reason: null }] }),
      line({ id: 'chatcmpl-1', object: 'chat.completion.chunk', created: 1788317224, model: 'claude-sonnet-5', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 7005, completion_tokens: 1170, total_tokens: 8175 } }),
      'data: [DONE]\n\n',
    ].join('');
    expect(assembleChatCompletionSse(body)).toEqual({
      id: 'chatcmpl-1', object: 'chat.completion', created: 1788317223, model: 'claude-sonnet-5',
      choices: [{ index: 0, message: { role: 'assistant', content: '{"reviews":[]}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 7005, completion_tokens: 1170, total_tokens: 8175 },
    });
  });

  it('menormalisasi SSE menjadi application/json untuk AI SDK', async () => {
    global.fetch = vi.fn(async () => new Response([
      line({ id: 'x', model: 'claude-sonnet-5', choices: [{ delta: { content: '{"ok":' }, finish_reason: null }] }),
      line({ id: 'x', model: 'claude-sonnet-5', choices: [{ delta: { content: 'true}' }, finish_reason: 'stop' }] }),
    ].join(''), { headers: { 'content-type': 'text/event-stream' } }));
    const response = await ninerouterCompatibleFetch('https://router.invalid/v1/chat/completions');
    expect(response.headers.get('content-type')).toBe('application/json');
    expect((await response.json() as any).choices[0].message.content).toBe('{"ok":true}');
  });

  it('melewatkan respons JSON normal tanpa mengubah body', async () => {
    const payload = { id: 'normal', choices: [{ message: { role: 'assistant', content: '{}' }, finish_reason: 'stop' }] };
    global.fetch = vi.fn(async () => Response.json(payload));
    const response = await ninerouterCompatibleFetch('https://router.invalid/v1/chat/completions');
    expect(await response.json()).toEqual(payload);
  });

  it('fail-closed bila SSE berisi JSON rusak atau tidak punya content', () => {
    expect(() => assembleChatCompletionSse('data: {rusak}\n\n')).toThrow('NINEROUTER_SSE_INVALID_JSON');
    expect(() => assembleChatCompletionSse(line({ choices: [{ delta: {}, finish_reason: 'stop' }] }))).toThrow('NINEROUTER_SSE_NO_CONTENT');
  });
});

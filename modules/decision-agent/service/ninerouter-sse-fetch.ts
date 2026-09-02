type ChatChunk = {
  id?: string;
  model?: string;
  created?: number;
  choices?: Array<{
    index?: number;
    delta?: { role?: string; content?: string };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

function isEventStream(response: Response, body: string): boolean {
  return response.headers.get('content-type')?.toLowerCase().includes('text/event-stream') === true
    || /^\s*data:\s*\{/m.test(body);
}

export function assembleChatCompletionSse(body: string): Record<string, unknown> {
  const chunks: ChatChunk[] = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      throw new Error('NINEROUTER_SSE_INVALID_JSON');
    }
    if (!parsed || typeof parsed !== 'object') throw new Error('NINEROUTER_SSE_INVALID_CHUNK');
    chunks.push(parsed as ChatChunk);
  }
  if (chunks.length === 0) throw new Error('NINEROUTER_SSE_EMPTY');

  const first = chunks[0];
  const content = chunks.flatMap((chunk) => chunk.choices ?? [])
    .map((choice) => choice.delta?.content ?? '').join('');
  const lastChoice = [...chunks].reverse()
    .map((chunk) => chunk.choices?.[0])
    .find((choice) => choice !== undefined);
  const usage = [...chunks].reverse().find((chunk) => chunk.usage)?.usage;
  if (!content) throw new Error('NINEROUTER_SSE_NO_CONTENT');

  return {
    id: first.id ?? 'ninerouter-sse-repaired',
    object: 'chat.completion',
    created: first.created ?? Math.floor(Date.now() / 1000),
    model: first.model ?? 'unknown',
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: lastChoice?.finish_reason ?? 'stop',
    }],
    ...(usage ? { usage } : {}),
  };
}

/** Repair only the provider contract violation observed in production: a non-stream
 * chat completion returned as SSE chunks. Normal JSON/error responses pass through. */
export async function ninerouterCompatibleFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (!response.ok) return response;
  const body = await response.text();
  if (!isEventStream(response, body)) {
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  const completion = assembleChatCompletionSse(body);
  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/json');
  headers.delete('content-length');
  return new Response(JSON.stringify(completion), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

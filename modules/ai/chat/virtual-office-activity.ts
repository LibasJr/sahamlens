import { randomUUID } from 'crypto';

const ACTIVITY_URL = process.env.VIRTUAL_OFFICE_ACTIVITY_URL
  ?? 'http://127.0.0.1:8088/internal/ask-ai-activity';

export type AskAiLifecycle = 'started' | 'completed' | 'failed';

/**
 * Best-effort local lifecycle signal for the Virtual Office.
 * Payload intentionally excludes prompt, answer, user identity, provider, and model.
 */
export async function reportAskAiActivity(
  lifecycle: AskAiLifecycle,
  requestId: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  try {
    await fetcher(ACTIVITY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lifecycle, requestId }),
      signal: AbortSignal.timeout(1_000),
    });
  } catch {
    // Virtual Office telemetry must never affect a user's Ask AI response.
  }
}

export function createAskAiActivityId(): string {
  return randomUUID();
}

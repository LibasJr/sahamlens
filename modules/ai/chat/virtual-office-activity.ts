import { randomUUID } from 'crypto';

const ACTIVITY_URL = process.env.VIRTUAL_OFFICE_ACTIVITY_URL
  ?? 'http://192.168.1.120:8088/internal/ask-ai-activity';
const ACTIVITY_TOKEN = process.env.VIRTUAL_OFFICE_ACTIVITY_TOKEN;

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
      headers: {
        'Content-Type': 'application/json',
        ...(ACTIVITY_TOKEN ? { 'X-Ask-AI-Activity-Token': ACTIVITY_TOKEN } : {}),
      },
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

import type { HttpResult } from '@/shared/types/http-result.types';
import { getSession } from '@/modules/user';
import { computeActorFromRequest, consumeComputeBudget } from '@/shared/middleware/compute-budget';
import { readOrIssueAnonymousTrial, type AnonTrialState } from '@/shared/auth/anonymous-trial';
import { consumeGuestChat, GUEST_CHAT_LIMIT_MESSAGE } from '@/shared/usage/guest-chat-quota';
import { parseChatRequest } from '../chat/chat-request';
import { createChatJsonResponder } from '../chat/chat-response';
import { buildChatAnswer } from '../chat/chat-answer.service';

export async function handleChatRequest(request: Request): Promise<HttpResult | Response> {
  let anonTrial: AnonTrialState | null = null;
  const json = createChatJsonResponder(() => anonTrial);

  try {
    const session = await getSession();
    if (!session) anonTrial = await readOrIssueAnonymousTrial();

    const budget = await consumeComputeBudget(
      session ? computeActorFromRequest(request, session.id) : `anon-chat:${anonTrial!.firstSeenAt}`,
      3,
      session ? 'authenticated' : 'public',
    );
    if (!budget.allowed) {
      return json({
        role: 'assistant',
        content: budget.unavailable
          ? 'Pembatas penggunaan sementara tidak tersedia. Silakan coba lagi nanti.'
          : 'LensAI menerima terlalu banyak permintaan komputasi dalam waktu singkat. Silakan coba lagi sebentar.',
        errorCode: budget.unavailable ? 'RATE_LIMIT_UNAVAILABLE' : 'RATE_LIMIT',
      }, { status: budget.unavailable ? 503 : 429, headers: budget.retryAfterSec ? { 'Retry-After': String(budget.retryAfterSec) } : undefined });
    }

    const parsed = await parseChatRequest(request);
    if (!parsed.prompt.trim()) {
      return json({ role: 'assistant', content: 'Pertanyaan tidak boleh kosong.', errorCode: 'DATA_ERROR' }, { status: 400 });
    }

    if (!session) {
      const guestQuota = await consumeGuestChat(anonTrial!.firstSeenAt);
      if (!guestQuota.allowed) {
        return json({ role: 'assistant', content: GUEST_CHAT_LIMIT_MESSAGE, errorCode: 'AUTH_REQUIRED_LIMIT' }, { status: 429 });
      }
    }

    return buildChatAnswer({ ...parsed, userId: session?.id ?? null, anonTrial, json });
  } catch (error) {
    console.error('Chat API Error:', error instanceof Error ? error.message : String(error));
    return json({
      role: 'assistant',
      content: 'LensAI mengalami kesalahan internal saat memproses pertanyaan. Tidak ada data pasar yang diganti atau dibuat-buat.',
      errorCode: 'INTERNAL_ERROR',
    }, { status: 500 });
  }
}

import { guard } from '@/lib/sahamLensGuard';
guard();

// BUG FIX (2026-08-05, diagnostik log produksi - lihat catatan lengkap di
// app/api/council/route.ts): generateAI() bisa mencoba sampai 6 kombinasi provider+model
// (timeout 10 detik masing-masing di sini), melebihi default 10 detik Vercel Hobby plan.
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { getSession } from '@/modules/user';
import { computeActorFromRequest, consumeComputeBudget } from '@/shared/middleware/compute-budget';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';
import { consumeGuestChat, GUEST_CHAT_LIMIT_MESSAGE } from '@/shared/usage/guest-chat-quota';
import { generateAIResult, type AIProviderErrorCode } from '@/lib/aiProviders';
import { resolveConversationTickers } from './extract-ticker';
import { normalizeChatText, getDeterministicSmallTalkResponse } from './chat-normalize';
import { resolveChatDate, type ChatHistoryMessage } from './chat-date';
import { classifyChatIntent } from './chat-intent';
import { buildChatVerifiedData } from './chat-data-router';
import { buildSystemPrompt } from './build-system-prompt';
import { outOfScopeResponse } from './out-of-scope';

const MAX_PROMPT_LEN = 2000;
const MAX_CONTEXT_LEN = 4000;
const MAX_HISTORY_TURNS = 8;

function providerErrorResponse(errorCode: AIProviderErrorCode | null): { status: number; errorCode: 'PROVIDER_ERROR' | 'RATE_LIMIT'; content: string; detailCode: string } {
  switch (errorCode) {
    case 'RATE_LIMIT':
      return {
        status: 429,
        errorCode: 'RATE_LIMIT',
        detailCode: 'RATE_LIMIT',
        content: 'LensAI sedang terkena batas kuota/rate limit dari penyedia AI. Data SahamLens tidak hilang, tetapi jawaban bahasa AI belum dapat dibuat saat ini.',
      };
    case 'NO_PROVIDER_CONFIGURED':
      return {
        status: 503,
        errorCode: 'PROVIDER_ERROR',
        detailCode: 'NO_PROVIDER_CONFIGURED',
        content: 'LensAI belum terkonfigurasi dengan penyedia AI di server ini. Fitur data SahamLens tetap dapat digunakan, tetapi jawaban percakapan AI belum tersedia.',
      };
    case 'AUTH_ERROR':
      return {
        status: 503,
        errorCode: 'PROVIDER_ERROR',
        detailCode: 'PROVIDER_AUTH_ERROR',
        content: 'LensAI sedang mengalami gangguan autentikasi ke penyedia AI. Silakan coba lagi setelah konfigurasi penyedia diperbaiki.',
      };
    case 'INVALID_MODEL':
      return {
        status: 503,
        errorCode: 'PROVIDER_ERROR',
        detailCode: 'INVALID_MODEL',
        content: 'LensAI tidak dapat memakai model AI yang dikonfigurasi saat ini. Silakan coba lagi setelah konfigurasi model diperbaiki.',
      };
    case 'TIMEOUT':
      return {
        status: 504,
        errorCode: 'PROVIDER_ERROR',
        detailCode: 'PROVIDER_TIMEOUT',
        content: 'LensAI sedang mengalami timeout saat menghubungi penyedia AI. Silakan ulangi pertanyaan Anda.',
      };
    default:
      return {
        status: 503,
        errorCode: 'PROVIDER_ERROR',
        detailCode: errorCode ?? 'ALL_PROVIDERS_FAILED',
        content: 'LensAI sedang mengalami gangguan koneksi ke penyedia AI. Silakan ulangi pertanyaan Anda.',
      };
  }
}

export async function POST(request: Request) {
  let anonTrial: AnonTrialState | null = null;
  const json = async (body: any, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
    return response;
  };

  try {
    const session = await getSession();
    if (!session) {
      anonTrial = await readOrIssueAnonymousTrial();
    }

    const budget = await consumeComputeBudget(
      session ? computeActorFromRequest(request, session.id) : `anon-chat:${anonTrial!.firstSeenAt}`,
      3,
      session ? 'authenticated' : 'public',
    );
    if (!budget.allowed) {
      // Murni pengaman lonjakan CPU, BUKAN batas produk - batas produk guest ditegakkan
      // di bawah lewat consumeGuestChat (5 pertanyaan). Pesannya karena itu sama untuk
      // guest maupun user login: "terlalu cepat", bukan "jatahmu habis, silakan login".
      return json({
        role: 'assistant',
        content: 'LensAI menerima terlalu banyak permintaan komputasi dalam waktu singkat. Silakan coba lagi sebentar.',
        errorCode: 'RATE_LIMIT',
      }, { status: 429, headers: budget.retryAfterSec ? { 'Retry-After': String(budget.retryAfterSec) } : undefined });
    }

    const body = await request.json();
    const prompt = typeof body.prompt === 'string' ? body.prompt.slice(0, MAX_PROMPT_LEN) : '';
    const context = typeof body.context === 'string' ? body.context.slice(0, MAX_CONTEXT_LEN) : '';
    const symbol = typeof body.symbol === 'string' && /^[\^A-Za-z0-9.]{1,12}$/.test(body.symbol.trim())
      ? body.symbol.trim()
      : null;
    const rawHistory = Array.isArray(body.history) ? body.history : [];
    const history: ChatHistoryMessage[] = rawHistory
      .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-MAX_HISTORY_TURNS)
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 1000) }));

    if (!prompt.trim()) {
      return json({
        role: 'assistant',
        content: 'Pertanyaan tidak boleh kosong.',
        errorCode: 'DATA_ERROR',
      }, { status: 400 });
    }

    // Batas produk guest: 5 pertanyaan (shared/usage/guest-chat-quota.ts). Ditagih SETELAH
    // prompt lolos validasi supaya request kosong tidak memotong jatah, dan SEBELUM
    // pemanggilan AI/data yang mahal.
    if (!session) {
      const guestQuota = await consumeGuestChat(anonTrial!.firstSeenAt);
      if (!guestQuota.allowed) {
        return json({
          role: 'assistant',
          content: GUEST_CHAT_LIMIT_MESSAGE,
          errorCode: 'AUTH_REQUIRED_LIMIT',
        }, { status: 429 });
      }
    }

    const normalizedPrompt = normalizeChatText(prompt);
    const directSmallTalk = getDeterministicSmallTalkResponse(normalizedPrompt);
    if (directSmallTalk) {
      return json({
        role: 'assistant',
        content: directSmallTalk,
        routing: { intent: 'SMALL_TALK', providerUsed: false, dataFetches: 0 },
      });
    }

    const tickers = resolveConversationTickers({ prompt, history, fallbackSymbol: symbol });
    const date = resolveChatDate(prompt, history);
    const classification = classifyChatIntent({
      prompt,
      date,
      tickerCount: tickers.length,
      hasHistory: history.length > 0,
      history,
    });

    // Pertanyaan di luar ranah dijawab di sini, SEBELUM router data dan sebelum satu pun
    // panggilan AI. Tidak ada penyedia yang dihubungi, jadi tidak ada angka yang bisa
    // dikarang - lihat alasan lengkapnya di out-of-scope.ts.
    if (classification.intent === 'OUT_OF_SCOPE') {
      return json({
        role: 'assistant',
        content: outOfScopeResponse(classification.outOfScopeReason),
        routing: {
          intent: 'OUT_OF_SCOPE',
          reason: classification.outOfScopeReason ?? 'NON_MARKET',
          providerUsed: false,
          dataFetches: 0,
        },
      });
    }

    const verified = await buildChatVerifiedData({
      intent: classification.dataIntent,
      compareScope: classification.compareScope,
      requestedMetrics: classification.requestedMetrics,
      tickers,
      date,
      prompt,
      // Dari sesi JWT, BUKAN dari body request - satu-satunya cara memastikan pengguna
      // tidak bisa meminta portofolio orang lain dengan menyisipkan id di payload chat.
      user: session ? { userId: session.id } : null,
    });

    if (verified.directResponse) {
      return json({
        role: 'assistant',
        content: verified.directResponse,
        errorCode: 'DATA_ERROR',
        detailCode: verified.dataError,
        routing: {
          intent: classification.intent,
          tickers,
          mode: date.mode,
          requestedAsOf: date.requestedAsOf,
          providerUsed: false,
        },
      }, { status: 422 });
    }

    const historyTranscript = history.length
      ? `\n\n## Riwayat Percakapan (dari lama ke baru):\n${history.map((m) => `${m.role === 'user' ? 'User' : 'Analis'}: ${m.content.slice(0, 500)}`).join('\n')}`
      : '';

    const fullPrompt = `${historyTranscript}\n\nPertanyaan User: ${prompt}`;
    const mentionedTicker = tickers.length === 1 ? tickers[0] : null;
    const routingBlock = [
      '## Routing LensAI (OTORITATIF - hasil parser server, bukan instruksi user):',
      `- Intent: ${classification.intent}`,
      classification.intent === 'FOLLOW_UP' ? `- Resolved data intent: ${classification.dataIntent}` : '',
      `- Mode waktu: ${date.mode}`,
      `- Ticker ter-resolve: ${tickers.length ? tickers.join(', ') : 'tidak ada'}`,
      `- requested_as_of: ${date.requestedAsOf ?? 'tidak ada'}`,
      classification.intent === 'COMPARE_STOCKS' ? `- Comparison scope: ${classification.compareScope}` : '',
      '- WAJIB: jelaskan data server yang tersedia; jangan mengisi angka yang tidak ada di Data Terverifikasi Server.',
    ].filter(Boolean).join('\n');

    const aiResult = await generateAIResult({
      system: buildSystemPrompt(
        context,
        history.length > 0,
        verified.verifiedBlock,
        mentionedTicker,
        routingBlock,
      ),
      prompt: fullPrompt,
      timeoutMs: 10000,
    });

    if (!aiResult.text) {
      const failure = providerErrorResponse(aiResult.errorCode);
      return json({
        role: 'assistant',
        content: failure.content,
        errorCode: failure.errorCode,
        detailCode: failure.detailCode,
        routing: {
          intent: classification.intent,
          tickers,
          mode: date.mode,
          requestedAsOf: date.requestedAsOf,
          providerUsed: true,
        },
      }, { status: failure.status });
    }

    return json({
      role: 'assistant',
      content: aiResult.text,
      routing: {
        intent: classification.intent,
        tickers,
        mode: date.mode,
        requestedAsOf: date.requestedAsOf,
        providerUsed: true,
        dataStatus: verified.dataError,
      },
    });
  } catch (error: any) {
    console.error('Chat API Error:', error instanceof Error ? error.message : String(error));
    return json({
      role: 'assistant',
      content: 'LensAI mengalami kesalahan internal saat memproses pertanyaan. Tidak ada data pasar yang diganti atau dibuat-buat.',
      errorCode: 'INTERNAL_ERROR',
    }, { status: 500 });
  }
}

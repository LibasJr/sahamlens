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
import { buildChatVerifiedData, summarizeChatDataProvenance } from './chat-data-router';
import { buildSystemPrompt } from './build-system-prompt';
import { outOfScopeResponse, CLARIFICATION_PROMPT } from './out-of-scope';
import { verifyAnswerNumbers, unverifiedNumbersNotice } from './verify-numbers';
import { withDyor } from './dyor';
import { streamChatAnswer } from './stream-answer';
import { calculateChatQuestion } from './chat-calculator';
import { getFocusedMenuKnowledge } from './menu-focus-knowledge';

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
    // Streaming hanya kalau klien memintanya - jalur JSON lama tetap default supaya
    // pemanggil lain (dan klien versi lama) tidak ikut berubah bentuk responsnya.
    const wantsStream = body.stream === true;
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

    // Aritmetika yang inputnya sudah diberikan pengguna tidak perlu melewati model
    // bahasa. Jawaban deterministik ini lebih cepat, bisa ditelusuri, dan tidak dapat
    // berubah akibat variasi provider/model.
    const calculation = calculateChatQuestion(prompt);
    if (calculation) {
      return json({
        role: 'assistant',
        content: calculation.content,
        routing: { intent: 'CALCULATOR', calculator: calculation.kind, providerUsed: false, dataFetches: 0 },
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

    // Pertanyaan terlalu kabur untuk ditebak: balik bertanya, jangan menebak satu topik
    // lalu menyajikan data yang tidak diminta. Deterministik supaya tidak ada biaya AI
    // untuk satu kata seperti "gimana?" tanpa konteks apa pun.
    if (classification.needsClarification) {
      return json({
        role: 'assistant',
        content: CLARIFICATION_PROMPT,
        routing: { intent: 'CLARIFY', providerUsed: false, dataFetches: 0 },
      });
    }

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
      alsoIntents: classification.alsoIntents,
      // Dari sesi JWT, BUKAN dari body request - satu-satunya cara memastikan pengguna
      // tidak bisa meminta portofolio orang lain dengan menyisipkan id di payload chat.
      user: session ? { userId: session.id } : null,
    });
    const dataProvenance = summarizeChatDataProvenance(verified.verifiedBlock);

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

    const systemPrompt = buildSystemPrompt(
      context,
      history.length > 0,
      verified.verifiedBlock,
      mentionedTicker,
      routingBlock,
      getFocusedMenuKnowledge(prompt),
    );
    const verificationSources = [verified.verifiedBlock, prompt, historyTranscript];
    const baseRouting = {
      intent: classification.intent,
      alsoIntents: classification.alsoIntents,
      tickers,
      mode: date.mode,
      requestedAsOf: date.requestedAsOf,
      providerUsed: true,
      dataStatus: verified.dataError,
      dataProvenance,
    };

    // Jalur streaming - dipakai kalau klien memintanya. Lihat catatan panjang di
    // streamChatAnswer() untuk alasan gerbang paragrafnya.
    if (wantsStream) {
      return await streamChatAnswer({
        system: systemPrompt,
        prompt: fullPrompt,
        sources: verificationSources,
        intent: classification.intent,
        routing: baseRouting,
        anonTrial,
      });
    }

    const aiResult = await generateAIResult({
      system: systemPrompt,
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

    // ---------------------------------------------------------------------------
    // Verifikasi angka. Aturan prompt melarang mengarang; lapisan ini MEMERIKSA.
    // Satu kali perbaikan diberikan (model sering benar setelah ditunjukkan angka mana
    // yang bermasalah), lalu kalau masih ada yang tidak tertelusur, jawabannya tetap
    // dikirim dengan catatan jujur - bukan disunting diam-diam.
    // ---------------------------------------------------------------------------
    let answer = aiResult.text;
    let numberCheck = verifyAnswerNumbers(answer, [verified.verifiedBlock, prompt, historyTranscript]);

    if (!numberCheck.ok) {
      console.warn('[LensAI:verify] angka tidak tertelusur', {
        intent: classification.intent,
        unverified: numberCheck.unverified,
      });

      const retry = await generateAIResult({
        system: buildSystemPrompt(context, history.length > 0, verified.verifiedBlock, mentionedTicker, routingBlock, getFocusedMenuKnowledge(prompt)),
        prompt:
          `${fullPrompt}\n\n## KOREKSI WAJIB (dari pemeriksa server, bukan dari pengguna):\n` +
          `Jawaban sebelumnya memuat angka yang TIDAK ADA di Data Terverifikasi Server: ${numberCheck.unverified.join(', ')}.\n` +
          'Tulis ulang jawabannya memakai HANYA angka yang benar-benar ada di data tersebut. ' +
          'Kalau sebuah angka memang tidak tersedia, katakan tidak tersedia - jangan diganti perkiraan lain.',
        timeoutMs: 10000,
      });

      if (retry.text) {
        const retryCheck = verifyAnswerNumbers(retry.text, [verified.verifiedBlock, prompt, historyTranscript]);
        // Perbaikan hanya dipakai kalau benar-benar lebih baik. Kalau percobaan kedua
        // justru memunculkan angka asing yang lebih banyak, jawaban pertama yang dipakai.
        if (retryCheck.unverified.length < numberCheck.unverified.length) {
          answer = retry.text;
          numberCheck = retryCheck;
        }
      }

      if (!numberCheck.ok) answer += unverifiedNumbersNotice(numberCheck.unverified);
    }

    // DYOR ditempel PALING AKHIR dan di server - lihat alasannya di dyor.ts. Urutannya
    // penting: catatan angka tak tertelusur (kalau ada) lebih dulu, baru penafian, supaya
    // peringatan yang spesifik tidak tenggelam di bawah penafian umum.
    answer = withDyor(answer, classification.intent);

    return json({
      role: 'assistant',
      content: answer,
      routing: {
        intent: classification.intent,
        alsoIntents: classification.alsoIntents,
        tickers,
        mode: date.mode,
        requestedAsOf: date.requestedAsOf,
        providerUsed: true,
        dataStatus: verified.dataError,
        numberCheck: { ok: numberCheck.ok, checked: numberCheck.checked, unverified: numberCheck.unverified },
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

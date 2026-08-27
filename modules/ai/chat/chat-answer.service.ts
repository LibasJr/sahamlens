import type { HttpResult } from '@/shared/types/http-result.types';
import type { AnonTrialState } from '@/shared/auth/anonymous-trial';
import { generateAIResult } from '@/lib/aiProviders';
import { resolveConversationTickers } from './extract-ticker';
import { normalizeChatText, getDeterministicSmallTalkResponse } from './chat-normalize';
import { resolveChatDate } from './chat-date';
import { classifyChatIntent } from './chat-intent';
import { buildChatVerifiedData, summarizeChatDataProvenance } from './chat-data-router';
import { buildSystemPrompt, pakaiStrukturAnalisis, STRUKTUR_ANALISIS } from './build-system-prompt';
import { outOfScopeResponse, CLARIFICATION_PROMPT } from './out-of-scope';
import { verifyAnswerNumbers, unverifiedNumbersNotice } from './verify-numbers';
import { withDyor } from './dyor';
import { streamChatAnswer } from './stream-answer';
import { calculateChatQuestion } from './chat-calculator';
import { getFocusedMenuKnowledge } from './menu-focus-knowledge';
import { providerErrorResponse } from './provider-error';
import { getDeterministicProductHelpResponse } from './product-help';
import { scoringMethodologyBlock } from './blocks/lens-blocks';
import type { ParsedChatRequest } from './chat-request';
import type { ChatJsonResponder } from './chat-response';

export async function buildChatAnswer(args: ParsedChatRequest & {
  userId: string | null;
  anonTrial: AnonTrialState | null;
  json: ChatJsonResponder;
}): Promise<HttpResult | Response> {
  const { prompt, context, symbol, wantsStream, history, userId, anonTrial, json } = args;
  const normalizedPrompt = normalizeChatText(prompt);
  const directSmallTalk = getDeterministicSmallTalkResponse(normalizedPrompt);
  if (directSmallTalk) {
    return json({ role: 'assistant', content: directSmallTalk, routing: { intent: 'SMALL_TALK', providerUsed: false, dataFetches: 0 } });
  }

  const calculation = calculateChatQuestion(prompt);
  if (calculation) {
    return json({ role: 'assistant', content: calculation.content, routing: { intent: 'CALCULATOR', calculator: calculation.kind, providerUsed: false, dataFetches: 0 } });
  }

  const tickers = resolveConversationTickers({ prompt, history, fallbackSymbol: symbol });
  const date = resolveChatDate(prompt, history);
  const classification = classifyChatIntent({ prompt, date, tickerCount: tickers.length, hasHistory: history.length > 0, history });

  if (classification.needsClarification) {
    return json({ role: 'assistant', content: CLARIFICATION_PROMPT, routing: { intent: 'CLARIFY', providerUsed: false, dataFetches: 0 } });
  }
  if (classification.intent === 'OUT_OF_SCOPE') {
    return json({
      role: 'assistant',
      content: outOfScopeResponse(classification.outOfScopeReason),
      routing: { intent: 'OUT_OF_SCOPE', reason: classification.outOfScopeReason ?? 'NON_MARKET', providerUsed: false, dataFetches: 0 },
    });
  }
  if (classification.intent === 'SCORING_METHOD' && tickers.length === 0) {
    return json({
      role: 'assistant',
      content: `LensScore ditentukan secara rule-based dari komponen teknikal, fundamental, dan flow; skor akhirnya dinormalisasi hanya terhadap komponen yang datanya tersedia.\n\n${scoringMethodologyBlock()}`,
      routing: { intent: classification.intent, providerUsed: false, dataFetches: 0, answerMode: 'VERIFIED_METHODOLOGY' },
    });
  }
  if (classification.intent === 'SAHAMLENS_PRODUCT_HELP') {
    return json({
      role: 'assistant',
      content: getDeterministicProductHelpResponse(prompt),
      routing: { intent: classification.intent, providerUsed: false, dataFetches: 0, answerMode: 'PRODUCT_KNOWLEDGE' },
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
    user: userId ? { userId } : null,
  });
  const dataProvenance = summarizeChatDataProvenance(verified.verifiedBlock);

  if (verified.directResponse) {
    return json({
      role: 'assistant',
      content: verified.directResponse,
      errorCode: 'DATA_ERROR',
      detailCode: verified.dataError,
      routing: { intent: classification.intent, tickers, mode: date.mode, requestedAsOf: date.requestedAsOf, providerUsed: false },
    }, { status: 422 });
  }

  const historyTranscript = history.length
    ? `\n\n## Riwayat Percakapan (dari lama ke baru):\n${history.map((message) => `${message.role === 'user' ? 'User' : 'Analis'}: ${message.content.slice(0, 500)}`).join('\n')}`
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
    pakaiStrukturAnalisis(classification.intent, classification.dataIntent) ? STRUKTUR_ANALISIS : '',
    '- WAJIB: jelaskan data server yang tersedia; jangan mengisi angka yang tidak ada di Data Terverifikasi Server.',
  ].filter(Boolean).join('\n');

  const focusedKnowledge = getFocusedMenuKnowledge(prompt);
  const systemPrompt = buildSystemPrompt(context, history.length > 0, verified.verifiedBlock, mentionedTicker, routingBlock, focusedKnowledge);
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

  if (wantsStream) {
    return streamChatAnswer({ system: systemPrompt, prompt: fullPrompt, sources: verificationSources, intent: classification.intent, routing: baseRouting, anonTrial });
  }

  const aiResult = await generateAIResult({ system: systemPrompt, prompt: fullPrompt, timeoutMs: 10000 });
  if (!aiResult.text) {
    const failure = providerErrorResponse(aiResult.errorCode);
    return json({
      role: 'assistant',
      content: failure.content,
      errorCode: failure.errorCode,
      detailCode: failure.detailCode,
      routing: { intent: classification.intent, tickers, mode: date.mode, requestedAsOf: date.requestedAsOf, providerUsed: true },
    }, { status: failure.status });
  }

  let answer = aiResult.text;
  let numberCheck = verifyAnswerNumbers(answer, verificationSources);
  if (!numberCheck.ok) {
    console.warn('[LensAI:verify] angka tidak tertelusur', { intent: classification.intent, unverified: numberCheck.unverified });
    const retry = await generateAIResult({
      system: buildSystemPrompt(context, history.length > 0, verified.verifiedBlock, mentionedTicker, routingBlock, focusedKnowledge),
      prompt: `${fullPrompt}\n\n## KOREKSI WAJIB (dari pemeriksa server, bukan dari pengguna):\n` +
        `Jawaban sebelumnya memuat angka yang TIDAK ADA di Data Terverifikasi Server: ${numberCheck.unverified.join(', ')}.\n` +
        'Tulis ulang jawabannya memakai HANYA angka yang benar-benar ada di data tersebut. Kalau sebuah angka memang tidak tersedia, katakan tidak tersedia - jangan diganti perkiraan lain.',
      timeoutMs: 10000,
    });
    if (retry.text) {
      const retryCheck = verifyAnswerNumbers(retry.text, verificationSources);
      if (retryCheck.unverified.length < numberCheck.unverified.length) {
        answer = retry.text;
        numberCheck = retryCheck;
      }
    }
    if (!numberCheck.ok) answer += unverifiedNumbersNotice(numberCheck.unverified);
  }

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
      dataProvenance,
      numberCheck: { ok: numberCheck.ok, checked: numberCheck.checked, unverified: numberCheck.unverified },
    },
  });
}
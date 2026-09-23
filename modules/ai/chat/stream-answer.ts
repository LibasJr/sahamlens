import { NextResponse } from 'next/server';
import { generateAIStream, generateAIResult } from '@/lib/aiProviders';
import { recordDataSourceHealth } from '@/modules/observability/service/data-source-health.service';
import { applyAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';
import { createStreamGate } from './stream-gate';
import { verifyAnswerNumbers, verifyStructuredEvidence, unverifiedNumbersNotice } from './verify-numbers';
import { withDyor } from './dyor';
import { FollowUpStreamStripper, parseFollowUps } from './follow-ups';
import { sanitizeChatAnswerText } from './chat-normalize';
import type { ChatIntent } from './chat-intent';

/**
 * Jawaban streaming dengan gerbang verifikasi angka.
 *
 * KENAPA TIDAK STREAMING POLOS. Kalau token dialirkan apa adanya, angka karangan
 * terbaca pengguna pada detik pertama dan koreksi apa pun datang terlambat - catatan di
 * bawah jawaban tidak menghapus angka yang sudah masuk kepala. Itu membuka kembali persis
 * kelas bug yang melahirkan aturan #21 di system prompt, hanya dengan catatan kaki.
 *
 * KENAPA TETAP BISA CEPAT. Verifikasi angka di sini deterministik dan tidak memanggil AI
 * (verify-numbers.ts), jadi biayanya mikrodetik. Teks cukup ditahan sampai satu satuan
 * utuh - paragraf, atau kalimat yang sudah cukup panjang - lalu diperiksa dan dilepas.
 * Token pertama tetap muncul jauh sebelum jawaban selesai.
 *
 * SAAT ADA ANGKA TAK TERTELUSUR. Aliran dihentikan sebelum satuan itu dilepas, lalu
 * jalur perbaikan yang sudah ada dipakai: satu permintaan ulang dengan menyebut angka
 * yang bermasalah. Hasilnya dikirim sebagai peristiwa `replace` yang mengganti seluruh
 * teks yang sudah tampil. Pengguna melihat jeda singkat, bukan angka yang salah.
 *
 * PROTOKOL (NDJSON, satu peristiwa per baris):
 *   {"t":"delta","v":"..."}      tambahkan ke jawaban yang sedang tampil
 *   {"t":"replace","v":"..."}    ganti SELURUH jawaban dengan teks ini
 *   {"t":"done","routing":{...}} selesai; membawa metadata routing & hasil verifikasi
 *   {"t":"error","content":"...","errorCode":"..."}
 *
 * NDJSON, bukan SSE: pesannya menempel pada satu respons fetch biasa, tidak butuh
 * EventSource (yang hanya mendukung GET), dan parsing di klien cukup memecah newline.
 */

export interface StreamChatArgs {
  system: string;
  prompt: string;
  sources: string[];
  intent: ChatIntent;
  routing: Record<string, unknown>;
  anonTrial: AnonTrialState | null;
}

/** Timeout per percobaan provider - sama dengan jalur non-streaming. */
const STREAM_TIMEOUT_MS = 10000;

export async function streamChatAnswer(args: StreamChatArgs): Promise<NextResponse> {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const gate = createStreamGate(args.sources);
        // Marker [[FOLLOWUP]] tidak boleh terlihat mengalir di layar - stripper
        // menahan teks ekor yang berpotensi jadi awal marker dan menelan baris
        // marker utuh (isinya dikirim terpisah di peristiwa `done`).
        const followUpStripper = new FollowUpStreamStripper();
        let shown = '';
        let rawStreamAnswer = '';
        let cleanStreamAnswer = '';

        const result = await generateAIStream({
          system: args.system,
          prompt: args.prompt,
          timeoutMs: STREAM_TIMEOUT_MS,
          onDelta: (chunk) => {
            rawStreamAnswer += chunk;
            const nextClean = sanitizeChatAnswerText(rawStreamAnswer);
            const releaseCandidate = nextClean.startsWith(cleanStreamAnswer)
              ? nextClean.slice(cleanStreamAnswer.length)
              : nextClean;
            cleanStreamAnswer = nextClean;
            if (!releaseCandidate) return;
            const gated = gate.push(releaseCandidate);
            if (gated.release) {
              const safeRelease = followUpStripper.push(gated.release);
              if (safeRelease) {
                shown += safeRelease;
                send({ t: 'delta', v: safeRelease });
              }
            }
          },
        });

        if (!result.text) {
          const detailCode = result.errorCode ?? 'ALL_PROVIDERS_FAILED';
          const errorCode = detailCode === 'RATE_LIMIT' ? 'RATE_LIMIT' : 'PROVIDER_ERROR';
          const latencyMs = Date.now() - startedAt;
          console.warn('[LensAI:stream] provider gagal', {
            status: 'error', errorCode, detailCode, latencyMs,
            failureKinds: result.failureKinds,
          });
          void recordDataSourceHealth({
            sourceId: 'AI_CHAT_STREAM', ok: false, latencyMs,
            detail: { status: 'error', errorCode, detailCode, failureKinds: result.failureKinds },
          });
          send({
            t: 'error',
            errorCode,
            detailCode,
            content: 'LensAI belum berhasil menyelesaikan jawaban dari penyedia AI. Silakan ulangi pertanyaan Anda.',
          });
          controller.close();
          return;
        }

        const tail = gate.flush();
        if (tail.release) {
          const safeTail = followUpStripper.push(tail.release);
          if (safeTail) {
            shown += safeTail;
            send({ t: 'delta', v: safeTail });
          }
        }
        const heldBack = followUpStripper.flush();
        if (heldBack) {
          shown += heldBack;
          send({ t: 'delta', v: heldBack });
        }

        // Verifikasi ulang atas jawaban UTUH. Gerbang memeriksa per satuan; pemeriksaan
        // penutup ini menangkap angka yang baru bermasalah ketika dibaca sebagai satu
        // kesatuan, dan menjadi satu-satunya sumber untuk `routing.numberCheck`.
        let answer = sanitizeChatAnswerText(result.text);
        let numberCheck = verifyAnswerNumbers(answer, args.sources);
        let evidenceCheck = verifyStructuredEvidence(answer, args.sources);

        if (gate.isBlocked || !numberCheck.ok || !evidenceCheck.ok) {
          console.warn('[LensAI:verify] evidence tidak lolos (streaming)', {
            intent: args.intent,
            unverified: numberCheck.unverified,
            evidenceIssues: evidenceCheck.issues.map((issue) => issue.kind),
          });

          const issueLines = evidenceCheck.issues.map((issue) => `- ${issue.kind}: ${issue.detail}`).join('\n');
          const retry = await generateAIResult({
            system: args.system,
            prompt:
              `${args.prompt}\n\n## KOREKSI WAJIB (dari pemeriksa server, bukan dari pengguna):\n` +
              `Jawaban sebelumnya memuat angka yang TIDAK ADA di Data Terverifikasi Server: ${numberCheck.unverified.join(', ') || '(tidak ada)'}.\n` +
              (issueLines ? `Masalah structured evidence:\n${issueLines}\n` : '') +
              'Tulis ulang jawabannya memakai HANYA angka, periode, metrik, kesegaran, dan status rekomendasi yang benar-benar ada di Data Terverifikasi Server. ' +
              'Kalau sebuah angka/metric/periode/rekomendasi tidak tersedia atau sumber konflik, katakan apa adanya - jangan diganti perkiraan lain.',
            timeoutMs: STREAM_TIMEOUT_MS,
          });

          if (retry.text) {
            const retryText = sanitizeChatAnswerText(retry.text);
            const retryNumberCheck = verifyAnswerNumbers(retryText, args.sources);
            const retryEvidenceCheck = verifyStructuredEvidence(retryText, args.sources);
            if (retryNumberCheck.unverified.length + retryEvidenceCheck.issues.length < numberCheck.unverified.length + evidenceCheck.issues.length) {
              answer = retryText;
              numberCheck = retryNumberCheck;
              evidenceCheck = retryEvidenceCheck;
            }
          }

          if (!numberCheck.ok) answer += unverifiedNumbersNotice(numberCheck.unverified);
        }

        const finalEvidenceCheck = verifyStructuredEvidence(answer, args.sources);
        if (!finalEvidenceCheck.ok) {
          answer +=
            '\n\n---\n_Catatan: sebagian klaim evidence di atas belum lolos pemeriksaan server: ' +
            finalEvidenceCheck.issues.map((issue) => issue.kind).join(', ') +
            '._';
          evidenceCheck = finalEvidenceCheck;
        }

        const withDyorAnswer = withDyor(answer, args.intent);
        // Sama seperti jalur non-streaming: marker di barisnya sendiri dipisah dari
        // jawaban, isinya dikirim sebagai field followUps di peristiwa `done`.
        const { text: finalAnswer, followUps } = parseFollowUps(withDyorAnswer);

        // `replace` dikirim kalau teks final berbeda dari yang sudah tampil - termasuk
        // kasus biasa: penutup DYOR selalu menambah bagian baru di akhir. Mengirim
        // seluruh teks (bukan selisihnya) membuat klien tidak perlu menebak apa pun.
        if (finalAnswer !== shown) {
          send({ t: 'replace', v: finalAnswer });
        }

        const latencyMs = Date.now() - startedAt;
        console.info('[LensAI:stream] selesai', {
          status: 'success', latencyMs, provider: result.provider ?? null, model: result.model ?? null,
          verification: { numbers: numberCheck.ok, evidence: finalEvidenceCheck.ok },
        });
        void recordDataSourceHealth({
          sourceId: 'AI_CHAT_STREAM', ok: true, latencyMs,
          detail: {
            status: 'success', provider: result.provider ?? null, model: result.model ?? null,
            numberCheckOk: numberCheck.ok, evidenceCheckOk: finalEvidenceCheck.ok,
          },
        });
        send({
          t: 'done',
          followUps,
          routing: {
            ...args.routing,
            streamed: true,
            provider: result.provider ?? null,
            model: result.model ?? null,
            numberCheck: { ok: numberCheck.ok, checked: numberCheck.checked, unverified: numberCheck.unverified },
            evidenceCheck: { ok: evidenceCheck.ok, issues: evidenceCheck.issues },
          },
        });
        controller.close();
      } catch (error) {
        const latencyMs = Date.now() - startedAt;
        const detailCode = 'INTERNAL_ERROR';
        console.error('[LensAI:stream] gagal', { status: 'error', detailCode, latencyMs, message: error instanceof Error ? error.message : String(error) });
        void recordDataSourceHealth({
          sourceId: 'AI_CHAT_STREAM', ok: false, latencyMs,
          detail: { status: 'error', detailCode },
        });
        send({
          t: 'error',
          errorCode: detailCode,
          content: 'LensAI mengalami kesalahan internal saat menyiapkan jawaban.',
        });
        controller.close();
      }
    },
  });

  const response = new NextResponse(body, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      // Nginx di VPS mem-buffer respons proxy secara default - tanpa header ini,
      // seluruh "streaming" tertahan di reverse proxy lalu tiba sekaligus, dan
      // pengguna tidak melihat bedanya sama sekali dengan sebelum ada streaming.
      'X-Accel-Buffering': 'no',
    },
  });

  if (args.anonTrial) {
    // WAJIB di-await. applyAnonymousTrialCookie() menandatangani token dulu (await
    // encrypt) baru memasang cookie-nya; kalau dipanggil fire-and-forget, respons sudah
    // dikirim sebelum cookie terpasang. Akibatnya bukan sekadar cookie hilang:
    // readOrIssueAnonymousTrial() akan menerbitkan trial BARU di tiap request, sehingga
    // batas 5 pertanyaan untuk pengunjung tidak pernah tercapai.
    await applyAnonymousTrialCookie(response, args.anonTrial);
  }

  return response;
}

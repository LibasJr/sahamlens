'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { symbolFromPathname, tickerStarters, MARKET_STARTERS } from './ai-chat-starters';
import { Bot, X, Send, Sparkles, Maximize2, Minimize2, ThumbsDown, ThumbsUp, Reply, Forward } from 'lucide-react';
import dynamic from 'next/dynamic';

/**
 * Parser Markdown ditunda sampai benar-benar ada jawaban yang dirender.
 *
 * TEMUAN PageSpeed production 2026-08-13: chunk react-markdown (micromark/remark, ~33 KiB
 * terkirim) ikut terunduh di SETIAP halaman meski panel chat tidak pernah dibuka. AIChat
 * memang sudah `dynamic()`, tapi itu hanya menunda sampai hidrasi - bukan sampai dipakai,
 * dan tombol mengambangnya harus tetap ada di layar. Yang bisa ditunda adalah parser-nya.
 *
 * `loading` sengaja merender teks apa adanya, bukan kosong: jawaban harus tetap terbaca
 * selama parser dimuat - terutama sekarang teksnya mengalir bertahap.
 */
const ReactMarkdown = dynamic(
  async () => (await import('react-markdown')).default as React.ComponentType<{ children: string }>,
  { ssr: false, loading: () => null },
);
import { usePathname } from 'next/navigation';
import { getTickerName } from '@/lib/trendingTickers';
import { apiRequest } from '@/shared/http/api-client';
import { ApiErrorHint } from '@/components/ui/ApiErrorHint';
import { trackJourneyEvent } from '@/shared/analytics/product-journey';
import { sanitizeChatAnswerText } from '@/modules/ai/chat/chat-normalize';
import { insertThreadMessage, replyHistory } from '@/components/ai-chat-message-tree';

type ChatDataProvenance = {
  sourceLabel: string;
  timestamp: string | null;
  freshness: string | null;
};

type ChatRouting = {
  intent?: string;
  dataProvenance?: ChatDataProvenance | null;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  routing?: ChatRouting;
  feedback?: 'up' | 'down';
  /** Saran pertanyaan lanjutan dari server (marker [[FOLLOWUP]] yang dipisah di
   *  backend). Di-render sebagai chip yang bisa diklik di bawah jawaban. */
  followUps?: string[];
  /** X-Request-Id dari respons yang GAGAL. Dipisah dari `content` supaya kalimat
   *  errornya tetap terbaca manusia, sementara referensinya bisa disalin utuh ke
   *  laporan dukungan. Null/absen untuk jawaban yang berhasil. */
  supportRequestId?: string | null;
  /** Parent message for an inline reply branch. */
  replyToId?: string;
};


function makeMessageId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `lensai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function AIChat() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeContextData, setActiveContextData] = useState<any>(null);
  // Keadaan penyedia AI menurut JAWABAN TERAKHIR server, bukan asumsi. Baris status di
  // header dulu selalu bertuliskan "AI sedang aktif" dengan titik hijau berdenyut tanpa
  // memeriksa apa pun - jadi saat server menjawab 503 NO_PROVIDER_CONFIGURED, UI tetap
  // mengklaim aktif sementara isi percakapannya bilang sebaliknya. null = belum pernah
  // dikirimi pertanyaan, jadi memang belum ada yang bisa dipastikan.
  const [penyediaSiap, setPenyediaSiap] = useState<boolean | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyScrollTargetId = useRef<string | null>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  // Parser Markdown dimuat saat panel DIBUKA, bukan saat jawaban tiba - jadi begitu
  // jawaban pertama muncul, parser biasanya sudah siap dan tidak ada kedipan teks mentah.
  const [markdownReady, setMarkdownReady] = useState(false);
  // Mode caveman (operator, 2026-09-22): gaya jawaban super ringkas per kata kunci.
  // Dikirim sebagai `mode` di body request; hanya mengubah gaya bahasa server-side.
  const [caveman, setCaveman] = useState(false);
  // Operator: swipe kiri ATAU kanan membuka balasan inline pada pesan yang dipilih.
  // Forward tetap tersedia lewat tombol agar kedua arah gestur konsisten di HP.
  const swipeStartRef = useRef<{ x: number; y: number; locked: boolean } | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; role: 'user' | 'assistant'; content: string } | null>(null);
  const [swipeToast, setSwipeToast] = useState<string | null>(null);
  // Gerakan bubble saat swipe diatur LANGSUNG lewat DOM (CSSOM), bukan atribut
  // style={} JSX - ratchet adopsi (audit:adoption) menghitung atribut style inline
  // sebagai kemunduran CSP style-src-attr, sedangkan manipulasi el.style.* lewat JS
  // tidak diblokir CSP dan tidak terhitung. Lihat scripts/audit-adoption-ratchet.mjs.
  const bubbleRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!swipeToast) return;
    const timer = setTimeout(() => setSwipeToast(null), 2500);
    return () => clearTimeout(timer);
  }, [swipeToast]);

  const handleSwipeReply = (msg: ChatMessage) => {
    setReplyTo({ id: msg.id, role: msg.role, content: msg.content });
    chatInputRef.current?.focus();
  };

  const handleSwipeForward = (msg: ChatMessage) => {
    const text = (msg.role === 'user' ? 'Pertanyaan saya di SahamLens: ' : 'Jawaban LensAI (SahamLens): ') + msg.content;
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: 'LensAI - SahamLens', text }).catch(() => {});
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => setSwipeToast('✅ Disalin - tempel di mana saja untuk forward'))
        .catch(() => setSwipeToast('⚠️ Gagal menyalin'));
      return;
    }
    setSwipeToast('⚠️ Perangkat tidak mendukung forward');
  };

  const onMessageTouchStart = (id: string) => (e: React.TouchEvent) => {
    const touch = e.touches[0];
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY, locked: false };
  };

  const onMessageTouchMove = (id: string) => (e: React.TouchEvent) => {
    const start = swipeStartRef.current;
    if (!start) return;
    const touch = e.touches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (!start.locked) {
      // Kunci arah gestur sekali: hanya geser horizontal yang jadi swipe, vertikal
      // tetap milik scroll halaman. Threshold 12px mencegah swipe nyasar saat scroll.
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        swipeStartRef.current = null;
        resetSwipeVisual(id);
        return;
      }
      start.locked = true;
    }
    e.preventDefault?.();
    const clamped = Math.max(-90, Math.min(90, dx));
    const el = bubbleRefs.current.get(id);
    if (el) {
      el.style.transform = `translateX(${clamped}px)`;
      el.classList.toggle('lensai-swipe-fwd', clamped >= 60);
      el.classList.toggle('lensai-swipe-rep', clamped <= -60);
    }
  };

  const resetSwipeVisual = (id: string) => {
    const el = bubbleRefs.current.get(id);
    if (!el) return;
    el.classList.remove('lensai-swipe-fwd', 'lensai-swipe-rep');
    el.style.transition = 'transform 0.2s ease-out';
    el.style.transform = '';
    setTimeout(() => { el.style.transition = ''; }, 220);
  };

  const onMessageTouchEnd = (msg: ChatMessage) => () => {
    const el = bubbleRefs.current.get(msg.id);
    const active = el ? parseFloat(el.style.transform.replace(/[^0-9.\-]/g, '') || '0') : 0;
    swipeStartRef.current = null;
    resetSwipeVisual(msg.id);
    if (Math.abs(active) >= 60) handleSwipeReply(msg);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const targetId = replyScrollTargetId.current;
    if (targetId) {
      document.getElementById(`lensai-message-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!isOpen || markdownReady) return;
    let cancelled = false;
    import('react-markdown').then(() => { if (!cancelled) setMarkdownReady(true); }).catch(() => {});
    return () => { cancelled = true; };
  }, [isOpen, markdownReady]);

  // BUG FIX (2026-08-22): panel ini tidak punya Escape-to-close maupun pengelolaan
  // fokus sama sekali - pengguna keyboard-only harus Tab manual dari awal setiap kali
  // panel dibuka, dan tidak ada jalan pintas menutupnya selain mengklik tombol X.
  // BUKAN lib/hooks/useModalBehavior.ts: hook itu mengunci scroll & focus-trap ke
  // dalam dialog, cocok untuk modal yang MEMBLOKIR sisa halaman (ada backdrop) -
  // panel LensAI ini sengaja TIDAK punya backdrop, mengambang di pojok sambil sisa
  // halaman tetap bisa dipakai, jadi mengunci fokus ke dalamnya akan salah perilaku.
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusTimer = setTimeout(() => chatInputRef.current?.focus(), 30);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    const handleOpenChat = (e: any) => {
      setIsOpen(true);
      if (e.detail?.prompt) {
        setInput(e.detail.prompt);
      }
    };
    const handleContextUpdate = (e: any) => {
      if (e.detail) {
        setActiveContextData(e.detail);
      }
    };
    window.addEventListener('open-ai-chat', handleOpenChat);
    window.addEventListener('update-ai-context', handleContextUpdate);
    return () => {
      window.removeEventListener('open-ai-chat', handleOpenChat);
      window.removeEventListener('update-ai-context', handleContextUpdate);
    };
  }, []);

  /**
   * Konsumsi aliran NDJSON dari /api/chat.
   *
   * Peristiwa `delta` menambah teks, `replace` mengganti SELURUH jawaban (dipakai saat
   * server menempelkan penutup DYOR atau mengganti jawaban yang angkanya gagal
   * diverifikasi). Return false kalau tidak ada satu pun peristiwa yang bisa dibaca,
   * supaya pemanggil bisa jatuh ke jalur JSON biasa.
   */
  const consumeStream = async (stream: ReadableStream<Uint8Array>, userMessageId?: string): Promise<boolean> => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let carry = '';
    let answer = '';
    let started = false;
    let assistantMessageId: string | null = null;

    const paint = (text: string) => {
      const sanitizedText = sanitizeChatAnswerText(text);
      setMessages(prev => {
        const next = [...prev];
        if (started && assistantMessageId) {
          const index = next.findIndex((message) => message.id === assistantMessageId);
          if (index >= 0) {
            next[index] = { ...next[index], content: sanitizedText };
            return next;
          }
        }
        assistantMessageId = makeMessageId();
        return insertThreadMessage(next, {
          id: assistantMessageId,
          role: 'assistant',
          content: sanitizedText,
          ...(userMessageId ? { replyToId: userMessageId } : {}),
        });
      });
      started = true;
    };

    const handleEvent = (event: any) => {
      if (event?.t === 'delta' && typeof event.v === 'string') {
        answer += event.v;
        // Spinner dimatikan begitu teks pertama tampil - dua penanda "sedang bekerja"
        // sekaligus (spinner + teks yang mengalir) cuma bikin panel gelisah.
        setIsLoading(false);
        paint(answer);
      } else if (event?.t === 'replace' && typeof event.v === 'string') {
        answer = event.v;
        setIsLoading(false);
        paint(answer);
      } else if (event?.t === 'done') {
        setPenyediaSiap(true);
        const followUps = Array.isArray(event.followUps)
          ? event.followUps.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 3)
          : undefined;
        setMessages((prev) => prev.map((message) => (
          message.id === assistantMessageId
            ? { ...message, ...(event.routing ? { routing: event.routing as ChatRouting } : {}), ...(followUps?.length ? { followUps } : {}) }
            : message
        )));
      } else if (event?.t === 'error') {
        if (event.detailCode === 'NO_PROVIDER_CONFIGURED' || event.detailCode === 'PROVIDER_AUTH_ERROR') {
          setPenyediaSiap(false);
        }
        paint(event.content || 'LensAI belum dapat memproses pertanyaan ini.');
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });
      const lines = carry.split('\n');
      carry = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          handleEvent(JSON.parse(line));
        } catch {
          // Satu baris rusak tidak boleh membatalkan aliran yang lain.
        }
      }
    }
    if (carry.trim()) {
      try { handleEvent(JSON.parse(carry)); } catch { /* abaikan sisa yang tidak utuh */ }
    }

    return started;
  };

  const handleSend = async (promptOverride?: string) => {
    // override string = pertanyaan dari chip saran / starter; argumen lain (mis. event
    // klik dari tombol kirim) diabaikan dan dipakai isi input seperti biasa.
    const rawPrompt = typeof promptOverride === 'string' ? promptOverride : input;
    if (!rawPrompt.trim()) return;

    const userPrompt = rawPrompt;
    const replyTarget = replyTo;
    const userMessageId = makeMessageId();
    // Reply: pertanyaan yang dikirim ke server membawa kutipan pesan yang dibalas
    // (konteks eksplisit untuk model), tetapi bubble pengguna tetap bersih.
    const replyQuote = replyTarget
      ? `Membalas ${replyTarget.role === 'user' ? 'pertanyaan saya' : 'jawaban LensAI'} sebelumnya:\n> ${replyTarget.content.slice(0, 300).replace(/\n+/g, '\n> ')}\n\n`
      : '';
    const composedPrompt = replyQuote + userPrompt;
    const historyForRequest = replyHistory(messages, replyTarget?.id);
    setReplyTo(null);
    setInput('');
    if (replyTarget) replyScrollTargetId.current = userMessageId;
    setMessages(prev => insertThreadMessage(prev, {
      id: userMessageId,
      role: 'user',
      content: userPrompt,
      ...(replyTarget ? { replyToId: replyTarget.id } : {}),
    }));
    setIsLoading(true);

    const segments = pathname.split('/');
    const pathSymbol = segments.length > 2 ? segments[segments.length - 1] : 'Umum';
    // Beranda (Dashboard.tsx) dispatch 'update-ai-context' dengan symbol+isIndex chart
    // yang SEDANG tampil (IHSG atau saham hasil search) - dipakai dulu kalau ada, baru
    // fallback ke kode di URL (halaman /technical/[symbol] dst yang tidak dispatch
    // symbol/isIndex secara eksplisit).
    const currentSymbol: string = activeContextData?.symbol ?? pathSymbol;
    const isIndex: boolean = activeContextData?.isIndex ?? currentSymbol.startsWith('^');

    // "Pertanyaan LensAI yang merujuk konteks emiten yang terlihat" (PRD, Beta
    // evaluation). Keduanya dicatat: yang pertama penyebutnya, yang kedua pembilangnya.
    // Konteks di sini adalah konteks yang SAMA yang dikirim ke model di bawah - kalau
    // suatu saat keduanya menyimpang, angka ini ikut salah, jadi ia sengaja dibaca dari
    // variabel yang sama, bukan dihitung ulang.
    trackJourneyEvent('lensai_question_asked', 'lensai');
    if (!isIndex && currentSymbol && currentSymbol !== 'Umum') {
      trackJourneyEvent('lensai_question_with_stock_context', 'lensai');
    }

    // BUG FIX (permintaan eksplisit): index (mis. IHSG) BUKAN saham/emiten - sebelumnya
    // context SELALU bilang "halaman saham: X" apa pun X-nya, jadi saat X = index, AI
    // ikut memperlakukannya seperti saham (nyari fundamental/EPS, kesimpulan
    // BELI/JUAL/TAHAN per lot, dst) padahal itu tidak masuk akal untuk sebuah indeks.
    let context = isIndex
      ? `Pengguna saat ini sedang melihat INDEKS ${activeContextData?.name || 'IHSG'} (BUKAN saham/emiten individual - indeks adalah rata-rata tertimbang pergerakan seluruh/sebagian saham di bursa, tidak punya laporan keuangan/EPS/PER sendiri, dan tidak bisa "dibeli 1 lot" langsung seperti saham). Jika bertanya tanpa menyebut kode, asumsikan indeks ini.`
      : `Pengguna saat ini sedang melihat halaman saham: ${currentSymbol}. Jika bertanya tanpa menyebut kode, asumsikan saham ini.`;

    // Nama resmi emiten HARUS diambil dari data terverifikasi (lib/tickers.ts), BUKAN
    // ditebak/diingat sendiri oleh model - sebelumnya context ini tidak menyertakan nama
    // perusahaan sama sekali, jadi AI mengarang nama yang salah (mis. DGWG dijawab sebagai
    // "Dwi Guna Laksana Tbk" padahal nama resminya "Delta Giri Wacana Tbk"). Tidak berlaku
    // untuk index (tidak ada "nama resmi emiten" untuk IHSG).
    if (!isIndex && currentSymbol && currentSymbol !== 'Umum') {
      const officialName = getTickerName(currentSymbol);
      if (officialName && officialName !== currentSymbol.replace('.JK', '')) {
        context += `\nNama resmi emiten ${currentSymbol.replace('.JK', '')}: "${officialName}". WAJIB pakai nama ini persis, JANGAN pernah menyebut nama perusahaan lain/versi lama/tebakan.`;
      }
    }

    if (activeContextData) {
       // Kirim data analisis teknikal/fundamental
       const councilSummary = activeContextData.analyzers || activeContextData.council;
       if (councilSummary) {
         context += `\n\nHasil Analisis Indikator Teknikal & Fundamental:\n${JSON.stringify(councilSummary)}`;
       }
       // Kirim data teknikal (harga, score, konsensus)
       if (activeContextData.price) {
         context += `\nHarga saat ini: ${activeContextData.price}`;
       }
       if (activeContextData.consensus) {
         context += `\nKonsensus: ${activeContextData.consensus}`;
       }
       if (activeContextData.score) {
         context += `\nSkor Breakout: ${activeContextData.score}`;
       }
       if (activeContextData.technical) {
         context += `\nData Teknikal: ${JSON.stringify(activeContextData.technical)}`;
       }
       // Semantik keputusan dipisah dari arah sinyal. Semua field ini masih termasuk
       // Data Referensi browser (server /api/chat tetap menganggapnya unverified), tetapi
       // membantu LensAI menyebut status UI dengan istilah yang sama dan tidak mengubah
       // advisory=false menjadi NETRAL/HOLD.
       if (activeContextData.modelSignal) {
         context += `\nSinyal model LensScore (INFORMASIONAL): ${activeContextData.modelSignal}`;
       }
       if (activeContextData.scoreExplainability) {
         context += `\nExplainability LensScore: ${JSON.stringify(activeContextData.scoreExplainability)}`;
       }
       if (activeContextData.trust) {
         context += `\nStatus trust data/skor: ${JSON.stringify(activeContextData.trust)}`;
       }
       if (activeContextData.dataFreshness || activeContextData.dataTimestamp) {
         context += `\nKesegaran data halaman: ${JSON.stringify({ freshness: activeContextData.dataFreshness, dataTimestamp: activeContextData.dataTimestamp })}`;
       }
       if (activeContextData.decision) {
         context += `\nStatus decision SahamLens: ${JSON.stringify(activeContextData.decision)}`;
       }
       if (activeContextData.eligibility) {
         context += `\nStatus eligibility: ${JSON.stringify(activeContextData.eligibility)}`;
       }
       if (activeContextData.modelValidation) {
         context += `\nStatus validasi model dari halaman: ${JSON.stringify(activeContextData.modelValidation)}`;
       }
       // Halaman "Stock Recommended" saat model belum tervalidasi adalah scanner/konsensus
       // indikator, bukan daftar recommendation actionable. Nama blok dibuat eksplisit
       // supaya LensAI tidak menaikkan consensus BUY menjadi ajakan beli.
       if (activeContextData.recommendations) {
         context += `\n\nData Scanner/Konsensus Indikator (BUKAN otomatis rekomendasi actionable):\n${JSON.stringify(activeContextData.recommendations)}`;
       }
    }

    try {
      // Intentional raw fetch: LensAI mengirim NDJSON streaming; apiRequest() membaca
      // body sampai selesai dan karena itu tidak boleh dipakai untuk jalur streaming ini.
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: composedPrompt,
          context: context,
          // Simbol dikirim TERPISAH dari context (audit 2026-08-05, temuan H-12) - server
          // memakainya untuk mengambil ulang harga/RSI dari sumber data sendiri, lalu
          // memperlakukan angka hasil pengambilannya sebagai yang otoritatif.
          symbol: currentSymbol && currentSymbol !== 'Umum' ? currentSymbol : undefined,
          // Kirim riwayat percakapan sebelumnya (bukan cuma pesan terakhir) supaya AI
          // tidak "amnesia" begitu satu giliran gagal/error - sebelumnya balasan singkat
          // seperti "lah"/"waduh error" dikirim tanpa konteks sama sekali dan AI menjawab
          // ngasal/generik karena tidak tahu topik yang sedang dibahas.
          history: historyForRequest,
          // Mode caveman: gaya jawaban super ringkas (operator, 2026-09-22).
          mode: caveman ? 'caveman' : undefined,
          // Streaming: server mengalirkan teks yang SUDAH lolos verifikasi angka per
          // paragraf (lihat app/api/chat/stream-answer.ts). Jalur JSON lama tetap ada
          // sebagai cadangan di bawah kalau server membalas bukan NDJSON.
          stream: true,
        })
      });

      const isStream = res.ok && (res.headers.get('content-type') || '').includes('ndjson');
      if (isStream && res.body) {
        const handled = await consumeStream(res.body, userMessageId);
        if (handled) return;
      }

      const data = await res.json();

      if (!res.ok || !data?.content) {
        // Contract error LensAI tetap boleh membawa `content` yang aman dan spesifik
        // (AUTH_ERROR, DATA_ERROR, RATE_LIMIT, PROVIDER_ERROR, INTERNAL_ERROR). Jangan
        // membuang content itu atau menyamakan semua kegagalan menjadi satu pesan palsu.
        const fallbackByCode: Record<string, string> = {
          AUTH_ERROR: 'Silakan login untuk menggunakan LensAI.',
          AUTH_REQUIRED_LIMIT: 'Jatah pertanyaan LensAI untuk pengunjung sudah habis. Silakan masuk untuk melanjutkan percakapan.',
          DATA_ERROR: 'Data yang dibutuhkan untuk menjawab pertanyaan ini belum tersedia.',
          RATE_LIMIT: 'LensAI sedang terkena batas kuota penyedia AI. Silakan coba lagi nanti.',
          PROVIDER_ERROR: 'LensAI sedang mengalami gangguan koneksi ke penyedia AI.',
          INTERNAL_ERROR: 'LensAI mengalami kesalahan internal saat memproses pertanyaan.',
        };
        const safeMessage = data?.content
          || fallbackByCode[data?.errorCode]
          || data?.error
          || 'Maaf, LensAI belum dapat memproses pertanyaan ini.';
        // Setiap respons runController membawa X-Request-Id. Jalur ini memakai fetch
        // mentah (streaming NDJSON), jadi ApiClientError tidak pernah terbentuk dan
        // referensinya harus diambil sendiri dari header - tanpa ini, kegagalan LensAI
        // adalah satu-satunya error di aplikasi yang tidak bisa ditelusuri di log.
        const supportRequestId = res.headers.get('X-Request-Id')
          || (typeof data?.meta?.requestId === 'string' ? data.meta.requestId : null);
        // Hanya kegagalan PENYEDIA yang mematikan lampu status. Kuota habis, perlu
        // login, atau data kurang bukan berarti AI-nya mati - menyamakannya akan
        // membuat lampu itu berbohong ke arah sebaliknya.
        if (data?.detailCode === 'NO_PROVIDER_CONFIGURED' || data?.detailCode === 'PROVIDER_AUTH_ERROR') {
          setPenyediaSiap(false);
        }
        setMessages(prev => insertThreadMessage(prev, {
          id: makeMessageId(), role: 'assistant', content: sanitizeChatAnswerText(safeMessage), supportRequestId, replyToId: userMessageId,
        }));
        return;
      }

      setPenyediaSiap(true);
      setMessages(prev => insertThreadMessage(prev, {
        id: makeMessageId(),
        role: 'assistant',
        content: sanitizeChatAnswerText(data.content),
        routing: data.routing,
        replyToId: userMessageId,
        ...(Array.isArray(data.followUps) && data.followUps.length ? { followUps: data.followUps.slice(0, 3) } : {}),
      }));
    } catch (e) {
      setMessages(prev => insertThreadMessage(prev, {
        id: makeMessageId(), role: 'assistant', replyToId: userMessageId,
        content: 'Maaf, sistem AI sedang mengalami gangguan koneksi. Silakan ulangi pertanyaan Anda.',
      }));
    } finally {
      setIsLoading(false);
    }
  };

  // Contoh pembuka mengikuti halaman: di halaman emiten diarahkan ke emiten itu, di
  // halaman lain ke pertanyaan pasar. Daftarnya di components/ai-chat-starters.ts -
  // setiap contoh wajib punya jalur data yang nyata, lihat catatan di file itu.
  const activeSymbol = symbolFromPathname(pathname);
  const starters = activeSymbol ? tickerStarters(activeSymbol) : MARKET_STARTERS;

  const sendFeedback = (message: ChatMessage, prompt: string, rating: 'up' | 'down') => {
    if (message.role !== 'assistant') return;
    setMessages((prev) => prev.map((item) => item.id === message.id ? { ...item, feedback: rating } : item));

    // Best-effort: feedback tidak boleh mengganggu percakapan ketika jaringan/database
    // sedang bermasalah. Pengguna tetap melihat pilihannya diterima di UI.
    void apiRequest('/api/chat/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: message.id,
        rating,
        prompt,
        answer: message.content,
        intent: message.routing?.intent,
        sourceLabel: message.routing?.dataProvenance?.sourceLabel,
        dataTimestamp: message.routing?.dataProvenance?.timestamp,
      }),
    }).catch(() => undefined);
  };

  return (
    // MobileNav mengukur tinggi + safe-area aktual ke --lens-mobile-nav-clearance.
    // Pakai nilai nyata itu agar trigger/panel LensAI tidak mengandalkan bottom hard-coded
    // yang bisa bertabrakan dengan nav pada WebView atau perangkat dengan inset berbeda.
    <div className="fixed bottom-[calc(var(--lens-mobile-nav-clearance,5.25rem)+0.75rem)] right-3 z-50 flex flex-col items-end sm:right-6 md:bottom-6">

      {/* Chat Window */}
      {/* Lebar dulu w-[400px]/w-[600px] TETAP tanpa breakpoint sama sekali - di layar HP
          (~375px, termasuk WebView yang disebut eksplisit dipakai) panel 400px + margin
          24px kanan-kiri MELUBER keluar viewport, terpotong/tumpang tindih. Markdown dan
          CSS .ai-response-nya sudah benar (ReactMarkdown + spacing lengkap di globals.css)
          - yang rusak adalah kontainernya, bukan isinya, sehingga teks yang sebenarnya
          terformat rapi terlihat "berantakan" karena lebar sisa yang tidak menentu.
          calc(100vw-2rem) di layar sempit, kembali ke ukuran tetap mulai breakpoint sm. */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="LensAI Research"
          className={`overflow-hidden flex flex-col mb-3 origin-bottom-right w-[calc(100vw-1.5rem)] max-h-[80vh] rounded-[24px] border border-tv-border bg-tv-surface shadow-[0_28px_90px_rgba(0,0,0,0.58)] backdrop-blur-2xl transition-all duration-300 ${isExpanded ? 'sm:w-[600px] h-[80vh] sm:h-[700px]' : 'sm:w-[400px] h-[70vh] sm:h-[500px]'}`}>

          {/* Header */}
          <div className="flex items-center justify-between border-b border-tv-border bg-white/[0.025] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center sm:h-9 sm:w-9 justify-center rounded-xl border border-tv-blue/20 bg-tv-blue/10">
                <Sparkles className="w-4 h-4 text-tv-blue" />
              </div>
              <div>
                <h3 className="font-heading text-base font-bold text-tv-text sm:text-sm">LensAI Research</h3>
                <p className={`lens-meta flex items-center gap-1 font-semibold ${
                  penyediaSiap === false ? 'text-tv-red' : penyediaSiap ? 'text-tv-green' : 'text-tv-muted'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    penyediaSiap === false ? 'bg-tv-red' : penyediaSiap ? 'bg-tv-green animate-pulse' : 'bg-tv-muted'
                  }`}></span>
                  {penyediaSiap === false
                    ? 'Penyedia AI belum terpasang'
                    : penyediaSiap
                      ? 'Data siap ditelusuri'
                      : 'Tanya konteks, risiko, atau alasan'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="bare" size="none" type="button" onClick={() => setIsExpanded(!isExpanded)} aria-label={isExpanded ? "Kecilkan LensAI" : "Perbesar LensAI"} className="rounded-xl p-2 text-tv-muted hover:bg-white/[0.05] hover:text-tv-text">
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </Button>
              <Button variant="bare" size="none" type="button" onClick={() => setIsOpen(false)} aria-label="Tutup LensAI" className="rounded-xl p-2 text-tv-muted hover:bg-white/[0.05] hover:text-tv-text">
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          {/* BUG FIX (2026-08-22): jawaban LensAI datang streaming (delta demi delta) tapi
              kontainer ini tidak punya aria-live/role apa pun - pembaca layar tidak
              pernah diberi tahu ada konten baru masuk, jadi fitur chat ini praktis tidak
              bisa dipakai secara real-time oleh pengguna screen reader. "polite" (bukan
              "assertive") supaya pengumuman tidak memotong apa pun yang sedang dibaca
              user di tempat lain. */}
          <div role="log" aria-live="polite" aria-relevant="additions text" className="flex-1 space-y-4 overflow-y-auto bg-transparent p-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl border border-tv-border bg-tv-surface/80">
                  <Bot className="w-7 h-7 text-tv-blue" />
                </div>
                {/* Layar pembuka mengikuti konteks, bukan menyapa (PRD §22). Saat pengguna
                    sedang membuka satu emiten, judulnya menyebut emiten itu - jadi jelas
                    pertanyaannya akan dijawab tentang apa, tanpa harus menuliskan kodenya
                    lagi di kotak input. */}
                <h4 className="font-heading text-lg font-bold text-tv-text">
                  {activeSymbol ? `Tanyakan tentang ${activeSymbol}` : 'LensAI Research'}
                </h4>
                <p className="max-w-xs text-base leading-relaxed text-tv-muted sm:text-sm">
                  {activeSymbol
                    ? `Konteks, risiko, dan alasan di balik angka ${activeSymbol} — beserta sumber data yang dipakai untuk menjawabnya.`
                    : 'Tanyakan kondisi pasar, kandidat LensRadar, atau cara sebuah skor dihitung. LensAI menjelaskan konteks dan risikonya, lalu menunjukkan sumber data yang dipakai.'}
                </p>
                <div className="mt-4 flex w-full max-w-xs flex-col gap-2">
                  {starters.map((starter) => (
                    <Button variant="bare" size="none"
                      key={starter.prompt}
                      onClick={() => setInput(starter.prompt)}
                      className="group flex items-center justify-between border-b border-tv-border/60 px-1 py-3 text-left text-sm text-tv-muted transition-colors last:border-b-0 hover:text-tv-text sm:text-xs"
                    >
                      {starter.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  id={`lensai-message-${msg.id}`}
                  key={msg.id}
                  ref={(el) => { if (el) bubbleRefs.current.set(msg.id, el); else bubbleRefs.current.delete(msg.id); }}
                  onTouchStart={onMessageTouchStart(msg.id)}
                  onTouchMove={onMessageTouchMove(msg.id)}
                  onTouchEnd={onMessageTouchEnd(msg)}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start border-t border-tv-border/50 pt-4 first:border-t-0 first:pt-0'}`}
                >
                  <div className={`text-base leading-relaxed sm:text-sm ${
                    msg.role === 'user'
                      ? 'max-w-[85%] rounded-2xl rounded-tr-md bg-tv-blue p-4 text-white'
                      : 'w-full max-w-prose text-tv-text'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <div className="ai-response">
                        {markdownReady ? (
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        ) : (
                          <span className="whitespace-pre-wrap">{msg.content}</span>
                        )}
                        <ApiErrorHint requestId={msg.supportRequestId} />
                        {msg.routing?.dataProvenance && (
                          <p className="lens-meta mt-3 border-t border-tv-border/50 pt-2 leading-relaxed text-tv-muted">
                            {msg.routing.dataProvenance.sourceLabel}
                            {msg.routing.dataProvenance.timestamp ? ` · ${msg.routing.dataProvenance.timestamp}` : ''}
                            {!msg.routing.dataProvenance.timestamp && msg.routing.dataProvenance.freshness ? ` · ${msg.routing.dataProvenance.freshness}` : ''}
                          </p>
                        )}
                        {msg.followUps && msg.followUps.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {msg.followUps.map((question) => (
                              <Button
                                key={question}
                                variant="bare"
                                size="none"
                                type="button"
                                disabled={isLoading}
                                onClick={() => handleSend(question)}
                                className="rounded-full border border-tv-border/70 bg-white/[0.04] px-3 py-1.5 text-xs text-tv-muted transition-colors hover:border-tv-blue/50 hover:text-tv-blue disabled:opacity-40"
                              >
                                {question}
                              </Button>
                            ))}
                          </div>
                        )}
                        <div className="lens-meta mt-3 flex items-center gap-1 border-t border-tv-border/50 pt-2 text-tv-muted">
                          <Button variant="bare" size="none"
                            type="button"
                            aria-label="Balas pesan ini"
                            title="Balas (geser kiri di HP)"
                            onClick={() => handleSwipeReply(msg)}
                            className="rounded p-1 transition-colors hover:text-tv-blue"
                          >
                            <Reply className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="bare" size="none"
                            type="button"
                            aria-label="Teruskan pesan ini"
                            title="Forward (geser kanan di HP)"
                            onClick={() => handleSwipeForward(msg)}
                            className="rounded p-1 transition-colors hover:text-tv-blue"
                          >
                            <Forward className="h-3.5 w-3.5" />
                          </Button>
                          <span className="mr-1">Jawaban ini membantu?</span>
                          <Button variant="bare" size="none"
                            type="button"
                            aria-label="Jawaban membantu"
                            title="Membantu"
                            onClick={() => sendFeedback(msg, [...messages.slice(0, idx)].reverse().find((item) => item.role === 'user')?.content ?? '', 'up')}
                            className={`rounded p-1 transition-colors hover:text-tv-green ${msg.feedback === 'up' ? 'text-tv-green' : ''}`}
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="bare" size="none"
                            type="button"
                            aria-label="Jawaban tidak tepat"
                            title="Tidak tepat"
                            onClick={() => sendFeedback(msg, [...messages.slice(0, idx)].reverse().find((item) => item.role === 'user')?.content ?? '', 'down')}
                            className={`rounded p-1 transition-colors hover:text-tv-red ${msg.feedback === 'down' ? 'text-tv-red' : ''}`}
                          >
                            <ThumbsDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))
            )}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex w-full max-w-prose items-center gap-3 text-base text-tv-muted sm:text-sm">
                  {/* Sejak 2026-08-13 /api/chat benar-benar mengalirkan teks. Visual ini
                      hanya tampil SEBELUM potongan pertama tiba - begitu teks mengalir,
                      ia dimatikan (lihat consumeStream). */}
                  <span className="lensai-candles" aria-hidden="true">
                    <i className="lensai-candle lensai-candle-1" />
                    <i className="lensai-candle lensai-candle-2" />
                    <i className="lensai-candle lensai-candle-3" />
                  </span>
                  {/* Permintaan operator (2026-09-22): label "mengetik" + visual pensil
                      di sebelahnya; spinner diganti candlestick mini (2026-09-23). */}
                  <span className="lensai-pencil" aria-hidden="true">✏️</span>
                  LensAI sedang mengetik...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box */}
          <div className="border-t border-tv-border bg-white/[0.025] p-3">
            {replyTo && (
              <div className="mb-2 flex items-center gap-2 rounded-xl border-l-4 border-tv-blue bg-white/[0.05] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-tv-blue">
                    {replyTo.role === 'user' ? 'Membalas pertanyaanmu' : 'Membalas jawaban LensAI'}
                  </p>
                  <p className="truncate text-xs text-tv-muted">{replyTo.content}</p>
                </div>
                <Button variant="bare" size="none"
                  type="button"
                  aria-label="Batalkan balasan"
                  onClick={() => setReplyTo(null)}
                  className="rounded p-1 text-tv-muted transition-colors hover:text-tv-red"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            {swipeToast && (
              <div className="mb-2 rounded-xl bg-tv-blue/15 px-3 py-2 text-center text-xs text-tv-blue">
                {swipeToast}
              </div>
            )}
            <div className="relative flex items-center">
              <Button
                variant="bare"
                size="none"
                type="button"
                onClick={() => setCaveman(v => !v)}
                title={caveman ? 'Mode Caveman AKTIF - jawaban super ringkas. Klik untuk matikan.' : 'Aktifkan Mode Caveman - jawaban super ringkas per kata kunci.'}
                aria-pressed={caveman}
                aria-label="Mode Caveman"
                className={`absolute left-2 z-10 inline-flex min-h-9 min-w-9 items-center justify-center rounded-xl p-2 text-base transition-colors ${caveman ? 'bg-tv-warning/20 text-tv-warning ring-1 ring-tv-warning/50' : 'text-tv-muted hover:text-tv-text'}`}
              >
                🪨
              </Button>
              <input
                ref={chatInputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder={caveman ? 'Tanya singkat... jawaban pasti singkat' : 'Tanya LensAI tentang saham atau fitur SahamLens...'}
                aria-label="Tanya LensAI tentang saham atau fitur SahamLens"
                className="w-full rounded-2xl border border-white/[0.08] bg-black/20 min-h-12 py-3 pl-14 pr-12 text-base text-tv-text sm:min-h-0 sm:text-sm placeholder:text-tv-muted/60 transition-all focus:border-tv-blue/60 focus:outline-none focus:ring-2 focus:ring-tv-blue/10"
              />
              <Button variant="bare" size="none"
                type="button"
                aria-label="Kirim pertanyaan"
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className="absolute right-2 inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl bg-tv-blue p-2 text-white transition-colors hover:bg-tv-blueHover disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
        </div>
      )}

      {/* Floating LensAI trigger - sengaja menjadi SATU-SATUNYA tombol global.
          Tombol header dihapus supaya tidak dobel, dan trigger ini tetap terlihat di HP. */}
      {!isOpen && (
        <Button variant="bare" size="none"
          type="button"
          onClick={() => setIsOpen(true)}
          title="Ask LensAI"
          aria-label="Ask LensAI"
          className="group flex h-12 items-center justify-center gap-2 rounded-2xl border border-tv-border bg-tv-card/95 px-3.5 text-tv-text shadow-[0_16px_45px_rgba(0,0,0,0.34)] transition-all hover:border-tv-blue/35 hover:text-tv-blue active:scale-95 md:h-12 md:px-4"
        >
          <Sparkles className="h-5 w-5" />
          <span className="hidden text-xs font-bold md:inline">LensAI</span>
        </Button>
      )}
    </div>
  );
}

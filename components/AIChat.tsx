'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Sparkles, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { usePathname } from 'next/navigation';
import { getTickerName } from '@/lib/trendingTickers';

export default function AIChat() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeContextData, setActiveContextData] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userPrompt = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userPrompt }]);
    setIsLoading(true);

    const segments = pathname.split('/');
    const pathSymbol = segments.length > 2 ? segments[segments.length - 1] : 'Umum';
    // Beranda (Dashboard.tsx) dispatch 'update-ai-context' dengan symbol+isIndex chart
    // yang SEDANG tampil (IHSG atau saham hasil search) - dipakai dulu kalau ada, baru
    // fallback ke kode di URL (halaman /technical/[symbol] dst yang tidak dispatch
    // symbol/isIndex secara eksplisit).
    const currentSymbol: string = activeContextData?.symbol ?? pathSymbol;
    const isIndex: boolean = activeContextData?.isIndex ?? currentSymbol.startsWith('^');

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
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userPrompt,
          context: context,
          // Simbol dikirim TERPISAH dari context (audit 2026-08-05, temuan H-12) - server
          // memakainya untuk mengambil ulang harga/RSI dari sumber data sendiri, lalu
          // memperlakukan angka hasil pengambilannya sebagai yang otoritatif.
          symbol: currentSymbol && currentSymbol !== 'Umum' ? currentSymbol : undefined,
          // Kirim riwayat percakapan sebelumnya (bukan cuma pesan terakhir) supaya AI
          // tidak "amnesia" begitu satu giliran gagal/error - sebelumnya balasan singkat
          // seperti "lah"/"waduh error" dikirim tanpa konteks sama sekali dan AI menjawab
          // ngasal/generik karena tidak tahu topik yang sedang dibahas.
          history: messages.slice(-8),
        })
      });
      const data = await res.json();

      if (!res.ok || !data?.content) {
        // Contract error LensAI tetap boleh membawa `content` yang aman dan spesifik
        // (AUTH_ERROR, DATA_ERROR, RATE_LIMIT, PROVIDER_ERROR, INTERNAL_ERROR). Jangan
        // membuang content itu atau menyamakan semua kegagalan menjadi satu pesan palsu.
        const fallbackByCode: Record<string, string> = {
          AUTH_ERROR: 'Silakan login untuk menggunakan LensAI.',
          DATA_ERROR: 'Data yang dibutuhkan untuk menjawab pertanyaan ini belum tersedia.',
          RATE_LIMIT: 'LensAI sedang terkena batas kuota penyedia AI. Silakan coba lagi nanti.',
          PROVIDER_ERROR: 'LensAI sedang mengalami gangguan koneksi ke penyedia AI.',
          INTERNAL_ERROR: 'LensAI mengalami kesalahan internal saat memproses pertanyaan.',
        };
        const safeMessage = data?.content
          || fallbackByCode[data?.errorCode]
          || data?.error
          || 'Maaf, LensAI belum dapat memproses pertanyaan ini.';
        setMessages(prev => [...prev, { role: 'assistant', content: safeMessage }]);
        return;
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Maaf, sistem AI sedang mengalami gangguan koneksi. Silakan ulangi pertanyaan Anda.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const setDemoPrompt = () => {
    const segments = pathname.split('/');
    const currentSymbol = segments.length > 2 ? segments[segments.length - 1].replace('.JK', '') : 'IHSG';
    setInput(`Tolong jelaskan secara singkat pandangan teknikal dan prospek pergerakan harga untuk saham ${currentSymbol} hari ini.`);
  };

  return (
    <div className="fixed bottom-24 right-3 z-50 flex flex-col items-end sm:right-6 md:bottom-6">

      {/* Chat Window */}
      {/* Lebar dulu w-[400px]/w-[600px] TETAP tanpa breakpoint sama sekali - di layar HP
          (~375px, termasuk WebView yang disebut eksplisit dipakai) panel 400px + margin
          24px kanan-kiri MELUBER keluar viewport, terpotong/tumpang tindih. Markdown dan
          CSS .ai-response-nya sudah benar (ReactMarkdown + spacing lengkap di globals.css)
          - yang rusak adalah kontainernya, bukan isinya, sehingga teks yang sebenarnya
          terformat rapi terlihat "berantakan" karena lebar sisa yang tidak menentu.
          calc(100vw-2rem) di layar sempit, kembali ke ukuran tetap mulai breakpoint sm. */}
      {isOpen && (
        <div className={`overflow-hidden flex flex-col mb-3 origin-bottom-right w-[calc(100vw-1.5rem)] max-h-[80vh] rounded-[24px] border border-white/10 bg-[#0A111D]/98 shadow-[0_28px_90px_rgba(0,0,0,0.58)] backdrop-blur-2xl transition-all duration-300 ${isExpanded ? 'sm:w-[600px] h-[80vh] sm:h-[700px]' : 'sm:w-[400px] h-[70vh] sm:h-[500px]'}`}>

          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.025] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-accent shadow-[0_10px_26px_rgba(79,140,255,0.22)]">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-heading text-sm font-bold text-tv-text">LensAI Copilot</h3>
                <p className="flex items-center gap-1 text-[10px] font-semibold text-tv-green">
                  <span className="w-1.5 h-1.5 rounded-full bg-tv-green animate-pulse"></span>
                  AI sedang aktif
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setIsExpanded(!isExpanded)} aria-label={isExpanded ? "Kecilkan LensAI" : "Perbesar LensAI"} className="rounded-xl p-2 text-tv-muted hover:bg-white/[0.05] hover:text-tv-text">
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Tutup LensAI" className="rounded-xl p-2 text-tv-muted hover:bg-white/[0.05] hover:text-tv-text">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-4 overflow-y-auto bg-transparent p-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-[22px] border border-tv-blue/15 bg-gradient-accent-soft">
                  <Bot className="w-8 h-8 text-tv-blue" />
                </div>
                <h4 className="font-heading text-lg font-bold text-tv-text">LensAI</h4>
                <p className="text-sm text-tv-muted max-w-xs">
                  Tanya tentang fitur SahamLens, teknikal, fundamental, LensScore, TP/CL, atau konsep pasar modal Indonesia. Saya akan jelaskan dengan bahasa sederhana.
                </p>
                <button
                  onClick={setDemoPrompt}
                  className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.035] px-4 py-2.5 text-left text-xs text-tv-muted transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  {(() => {
                    const segments = pathname.split('/');
                    const currentSymbol = segments.length > 2 ? segments[segments.length - 1].replace('.JK', '') : 'IHSG';
                    return `"Tolong analisis teknikal singkat saham ${currentSymbol}?"`;
                  })()}
                </button>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl p-4 text-sm ${
                    msg.role === 'user'
                      ? 'bg-tv-blue text-white rounded-tr-md shadow-[0_8px_24px_rgba(79,140,255,0.16)]'
                      : 'border border-white/[0.07] bg-white/[0.04] text-tv-text rounded-tl-md'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <div className="ai-response">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
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
                <div className="flex items-center gap-3 rounded-2xl rounded-tl-md border border-white/[0.07] bg-white/[0.04] p-4 text-sm text-tv-muted">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AI sedang menganalisis...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box */}
          <div className="border-t border-white/[0.07] bg-white/[0.025] p-3">
            <div className="relative flex items-center">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Tanya LensAI tentang saham atau fitur SahamLens..."
                className="w-full rounded-2xl border border-white/[0.08] bg-black/20 py-3 pl-4 pr-12 text-sm text-tv-text placeholder:text-tv-muted/60 transition-all focus:border-tv-blue/60 focus:outline-none focus:ring-2 focus:ring-tv-blue/10"
              />
              <button
                type="button"
                aria-label="Kirim pertanyaan"
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="absolute right-2 rounded-xl bg-gradient-accent p-2 text-white transition-all hover:brightness-110 disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
          
        </div>
      )}

      {/* Floating LensAI trigger - sengaja menjadi SATU-SATUNYA tombol global.
          Tombol header dihapus supaya tidak dobel, dan trigger ini tetap terlihat di HP. */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title="Ask LensAI"
          aria-label="Ask LensAI"
          className="group flex h-12 items-center justify-center gap-2 rounded-2xl border border-tv-blue/25 bg-gradient-accent px-3.5 text-white shadow-[0_18px_50px_rgba(79,140,255,0.28)] transition-all hover:brightness-110 active:scale-95 md:h-12 md:px-4"
        >
          <Sparkles className="h-5 w-5" />
          <span className="hidden text-xs font-bold md:inline">LensAI</span>
        </button>
      )}
    </div>
  );
}


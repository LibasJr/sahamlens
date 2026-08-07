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
       // Kirim data rekomendasi saham (dari halaman Stock Recommended)
       if (activeContextData.recommendations) {
         context += `\n\nData Rekomendasi Saham:\n${JSON.stringify(activeContextData.recommendations)}`;
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
        // Response error (rate limit/paywall/500) sering tetap balas JSON, jadi tanpa
        // cek res.ok bubble chat akan dirender dengan content=undefined - kosong tanpa
        // indikasi ada yang salah, bukan pesan error yang ramah di blok catch di bawah.
        setMessages(prev => [...prev, { role: 'assistant', content: data?.error || 'Maaf, sistem AI sedang mengalami gangguan. Silakan coba lagi.' }]);
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
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end">

      {/* Chat Window */}
      {/* Lebar dulu w-[400px]/w-[600px] TETAP tanpa breakpoint sama sekali - di layar HP
          (~375px, termasuk WebView yang disebut eksplisit dipakai) panel 400px + margin
          24px kanan-kiri MELUBER keluar viewport, terpotong/tumpang tindih. Markdown dan
          CSS .ai-response-nya sudah benar (ReactMarkdown + spacing lengkap di globals.css)
          - yang rusak adalah kontainernya, bukan isinya, sehingga teks yang sebenarnya
          terformat rapi terlihat "berantakan" karena lebar sisa yang tidak menentu.
          calc(100vw-2rem) di layar sempit, kembali ke ukuran tetap mulai breakpoint sm. */}
      {isOpen && (
        <div className={`bg-tv-bg border border-tv-border rounded-xl shadow-2 overflow-hidden flex flex-col mb-4 transition-all duration-300 origin-bottom-right w-[calc(100vw-2rem)] max-h-[80vh] ${isExpanded ? 'sm:w-[600px] h-[80vh] sm:h-[700px]' : 'sm:w-[400px] h-[70vh] sm:h-[500px]'}`}>

          {/* Header */}
          <div className="bg-tv-card p-4 flex items-center justify-between border-b border-tv-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-accent flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-heading font-bold text-tv-text text-sm">Tanya AI</h3>
                <p className="text-xs text-tv-green flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-tv-green animate-pulse"></span>
                  AI sedang aktif
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setIsExpanded(!isExpanded)} className="text-tv-muted hover:text-tv-text p-1 rounded-md hover:bg-tv-hover">
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button onClick={() => setIsOpen(false)} className="text-tv-muted hover:text-tv-text p-1 rounded-md hover:bg-tv-hover">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-tv-bg">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-gradient-accent-soft flex items-center justify-center mb-2">
                  <Bot className="w-8 h-8 text-tv-blue" />
                </div>
                <h4 className="font-heading text-lg font-bold text-tv-text">LensAI</h4>
                <p className="text-sm text-tv-muted max-w-xs">
                  Tanya tentang fitur SahamLens, teknikal, fundamental, LensScore, TP/CL, atau konsep pasar modal Indonesia. Saya akan jelaskan dengan bahasa sederhana.
                </p>
                <button
                  onClick={setDemoPrompt}
                  className="mt-4 px-4 py-2 bg-tv-hover hover:bg-tv-borderLight text-xs rounded-full text-tv-muted border border-tv-border transition-colors text-left"
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
                      ? 'bg-tv-blue text-white rounded-tr-none'
                      : 'bg-teal-950/60 border border-teal-800/60 text-teal-100 rounded-tl-none'
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
                <div className="bg-teal-950/60 border border-teal-800/60 rounded-2xl rounded-tl-none p-4 text-teal-200 text-sm flex items-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AI sedang menganalisis...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box */}
          <div className="p-3 bg-tv-card border-t border-tv-border">
            <div className="relative flex items-center">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Tanya LensAI tentang saham atau fitur SahamLens..."
                className="w-full bg-tv-bg/60 text-tv-text border border-tv-border rounded-full py-3 pl-4 pr-12 focus:outline-none focus:border-tv-blue transition-colors text-sm"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="absolute right-2 p-2 bg-gradient-accent hover:brightness-110 disabled:opacity-40 text-white rounded-full transition-all"
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
          className="flex h-14 w-14 items-center justify-center rounded-full border border-tv-blue/30 bg-tv-blue text-white shadow-2 hover:brightness-110 active:scale-95 transition-all"
        >
          <Sparkles className="h-5 w-5" />
          <span className="sr-only">Ask LensAI</span>
        </button>
      )}
    </div>
  );
}

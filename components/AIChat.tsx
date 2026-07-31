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
    const currentSymbol = segments.length > 2 ? segments[segments.length - 1] : 'Umum';
    let context = `Pengguna saat ini sedang melihat halaman saham: ${currentSymbol}. Jika bertanya tanpa menyebut kode, asumsikan saham ini.`;

    // Nama resmi emiten HARUS diambil dari data terverifikasi (lib/tickers.ts), BUKAN
    // ditebak/diingat sendiri oleh model - sebelumnya context ini tidak menyertakan nama
    // perusahaan sama sekali, jadi AI mengarang nama yang salah (mis. DGWG dijawab sebagai
    // "Dwi Guna Laksana Tbk" padahal nama resminya "Delta Giri Wacana Tbk").
    if (currentSymbol && currentSymbol !== 'Umum') {
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
          // Kirim riwayat percakapan sebelumnya (bukan cuma pesan terakhir) supaya AI
          // tidak "amnesia" begitu satu giliran gagal/error - sebelumnya balasan singkat
          // seperti "lah"/"waduh error" dikirim tanpa konteks sama sekali dan AI menjawab
          // ngasal/generik karena tidak tahu topik yang sedang dibahas.
          history: messages.slice(-8),
        })
      });
      const data = await res.json();

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
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      
      {/* Chat Window */}
      {isOpen && (
        <div className={`bg-[#0f172a] border border-[#1e293b] rounded-2xl shadow-2xl overflow-hidden flex flex-col mb-4 transition-all duration-300 origin-bottom-right ${isExpanded ? 'w-[600px] h-[700px]' : 'w-[400px] h-[500px]'}`}>
          
          {/* Header */}
          <div className="bg-[#1e293b] p-4 flex items-center justify-between border-b border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-teal-500/20 flex items-center justify-center border border-teal-500/30">
                <Sparkles className="w-4 h-4 text-teal-400" />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">Tanya AI</h3>
                <p className="text-xs text-teal-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse"></span>
                  AI sedang aktif
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setIsExpanded(!isExpanded)} className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-gray-800">
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-gray-800">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-tv-bg">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-teal-500/10 flex items-center justify-center mb-2">
                  <Bot className="w-8 h-8 text-teal-500" />
                </div>
                <h4 className="text-lg font-bold text-white">SahamLens AI Analyst</h4>
                <p className="text-sm text-tv-muted max-w-xs">
                  Tanyakan apapun tentang teknikal, fundamental, atau aliran dana asing saham yang sedang Anda buka.
                </p>
                <button 
                  onClick={setDemoPrompt}
                  className="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-xs rounded-full text-gray-300 border border-gray-700 transition-colors text-left"
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
                      ? 'bg-blue-600 text-white rounded-tr-none' 
                      : 'bg-[#134e4a] border border-[#0f766e] text-[#ccfbf1] rounded-tl-none'
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
                <div className="bg-[#134e4a] border border-[#0f766e] rounded-2xl rounded-tl-none p-4 text-teal-200 text-sm flex items-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AI sedang menganalisis...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box */}
          <div className="p-3 bg-[#1e293b] border-t border-gray-800">
            <div className="relative flex items-center">
              <input 
                type="text" 
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Tanya AI tentang saham ini..."
                className="w-full bg-[#0f172a] text-white border border-gray-700 rounded-full py-3 pl-4 pr-12 focus:outline-none focus:border-teal-500 text-sm"
              />
              <button 
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="absolute right-2 p-2 bg-teal-600 hover:bg-teal-500 disabled:bg-gray-700 text-white rounded-full transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
          
        </div>
      )}

      {/* Floating Button */}
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white p-4 rounded-full shadow-[0_0_20px_rgba(13,148,136,0.4)] transition-all hover:scale-105"
        >
          <Sparkles className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

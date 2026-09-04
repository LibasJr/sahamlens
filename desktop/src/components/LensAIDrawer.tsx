import React, { useState } from 'react';
import { Sparkles, Send, Bot, User } from 'lucide-react';
import { askLensAI } from '../api';

interface LensAIDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTicker: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  time: string;
}

export const LensAIDrawer: React.FC<LensAIDrawerProps> = ({
  isOpen,
  onClose,
  selectedTicker,
}) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Halo! Saya LensAI Research Copilot. Saya siap membantu menganalisis emiten **${selectedTicker}**, mengecek flow bandarmology, valuasi DCF, atau membaca sentimen pasar secara objektif.`,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMsg: Message = {
      role: 'user',
      content: query,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const historyPayload = messages.slice(-4).map((m) => ({ role: m.role, content: m.content }));
      const reply = await askLensAI(query, selectedTicker, historyPayload);

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: reply,
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Terjadi gangguan jaringan saat menghubungi model LensAI. Silakan coba lagi.',
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <aside className="w-84 h-[calc(100vh-2.5rem)] bg-pro-surface border-l border-pro-border flex flex-col justify-between select-text shadow-2xl z-40 transition-all">
      {/* Header */}
      <div className="p-3.5 border-b border-pro-border flex items-center justify-between bg-pro-bg/50">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-pro-purple/20 border border-pro-purple/40 flex items-center justify-center text-pro-purple">
            <Sparkles size={14} />
          </div>
          <div>
            <h3 className="font-bold text-xs text-pro-text flex items-center gap-1.5">
              LensAI Research <span className="font-mono text-[9px] px-1 py-0.2 bg-pro-purple/15 text-pro-purple rounded">COPILOT</span>
            </h3>
            <span className="text-[10px] text-pro-textSubtle font-mono">Fokus: {selectedTicker}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-pro-textSubtle hover:text-pro-text text-xs px-2 py-1 rounded hover:bg-pro-card transition"
        >
          ✕
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3 font-sans text-xs">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col gap-1 ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-1.5 text-[10px] text-pro-textSubtle px-1">
              {m.role === 'user' ? <User size={10} /> : <Bot size={10} className="text-pro-purple" />}
              <span>{m.role === 'user' ? 'Anda' : 'Lens AI'}</span>
              <span>•</span>
              <span>{m.time}</span>
            </div>
            <div
              className={`p-2.5 rounded-xl max-w-[92%] leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-pro-card text-pro-text border border-pro-borderStrong'
                  : 'bg-pro-card/90 text-pro-text border border-pro-border'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-pro-purple p-2 text-xs font-mono">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-pro-purple border-t-transparent animate-spin" />
            <span>LensAI sedang menyusun analisa...</span>
          </div>
        )}
      </div>

      {/* Suggested Quick Starters */}
      <div className="px-3 py-2 border-t border-pro-border bg-pro-card/30">
        <div className="text-[10px] font-bold text-pro-textSubtle uppercase tracking-wider mb-1.5">
          Pertanyaan Cepat:
        </div>
        <div className="flex flex-wrap gap-1">
          {[`Valuasi wajar ${selectedTicker}?`, `Sinyal teknikal ${selectedTicker}`, `Peta akumulasi bandar`].map((prompt) => (
            <button
              key={prompt}
              onClick={() => handleSend(prompt)}
              className="text-[10px] px-2 py-1 rounded bg-pro-surface hover:bg-pro-card border border-pro-border text-pro-textMuted hover:text-pro-text transition truncate max-w-full"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Input Box */}
      <div className="p-3 border-t border-pro-border bg-pro-bg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Tanya LensAI tentang ${selectedTicker}...`}
            className="flex-1 bg-pro-surface border border-pro-border focus:border-pro-purple rounded-lg px-3 py-2 text-xs text-pro-text placeholder:text-pro-textSubtle outline-hidden transition"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-2 bg-pro-purple hover:bg-purple-600 disabled:opacity-50 text-white rounded-lg transition"
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </aside>
  );
};

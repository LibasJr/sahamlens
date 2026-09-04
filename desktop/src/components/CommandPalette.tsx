import React, { useState, useEffect } from 'react';
import { Search, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { searchEmiten } from '../api';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTicker: (ticker: string) => void;
}

const POPULAR_TICKERS = [
  { symbol: 'BBCA', name: 'Bank Central Asia Tbk' },
  { symbol: 'BBRI', name: 'Bank Rakyat Indonesia Tbk' },
  { symbol: 'BMRI', name: 'Bank Mandiri Tbk' },
  { symbol: 'TLKM', name: 'Telkom Indonesia Tbk' },
  { symbol: 'ASII', name: 'Astra International Tbk' },
  { symbol: 'AMMN', name: 'Amman Mineral Internasional Tbk' },
  { symbol: 'BREN', name: 'Barito Renewables Energy Tbk' },
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectTicker,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ symbol: string; name: string }>>([]);

  useEffect(() => {
    if (!query.trim()) {
      setResults(POPULAR_TICKERS);
      return;
    }
    const timer = setTimeout(() => {
      searchEmiten(query).then((items) => {
        if (items && items.length) {
          setResults(items);
        } else {
          // Fallback simple search
          const filtered = POPULAR_TICKERS.filter(
            (t) => t.symbol.includes(query.toUpperCase()) || t.name.toLowerCase().includes(query.toLowerCase())
          );
          setResults(filtered.length ? filtered : [{ symbol: query.toUpperCase(), name: 'Emiten BEI' }]);
        }
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  // Handle ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onClose();
      }
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-24 z-50 select-none">
      <div className="w-full max-w-lg bg-pro-surface border border-pro-borderStrong rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-pro-border bg-pro-card/50">
          <Search size={18} className="text-pro-accent" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari kode saham (misal: BBCA, TLKM)..."
            className="flex-1 bg-transparent text-sm text-pro-text placeholder:text-pro-textSubtle outline-hidden font-medium"
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-pro-surface border border-pro-border text-pro-textSubtle">ESC</kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          <div className="px-2 py-1 text-[10px] font-bold text-pro-textSubtle uppercase tracking-wider">
            {query.trim() ? 'Hasil Pencarian' : 'Saham Terpopuler'}
          </div>
          {results.map((item) => (
            <button
              key={item.symbol}
              onClick={() => {
                onSelectTicker(item.symbol);
                onClose();
              }}
              className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-pro-card transition text-left group"
            >
              <div className="flex items-center gap-2.5">
                <span className="font-mono font-bold text-sm text-pro-accent group-hover:underline">
                  {item.symbol}
                </span>
                <span className="text-xs text-pro-textMuted truncate max-w-[260px]">
                  {item.name}
                </span>
              </div>
              <ArrowRight size={14} className="text-pro-textSubtle group-hover:text-pro-text transition" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

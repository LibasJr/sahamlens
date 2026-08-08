'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { TICKERS } from '@/lib/tickers';
import TickerAvatar from '@/components/ui/TickerAvatar';

interface SymbolAutocompleteProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'onSelect'> {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  containerClassName?: string;
}

export default function SymbolAutocomplete({
  value,
  onChange,
  onSelect,
  containerClassName = 'relative w-full',
  className,
  onFocus,
  onKeyDown,
  ...props
}: SymbolAutocompleteProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [suggestions, setSuggestions] = useState<typeof TICKERS>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value.length >= 2 && showDropdown) {
      const match = value.toUpperCase().replace('.JK', '');
      const filtered = TICKERS.filter((ticker) => ticker.symbol.startsWith(match) || ticker.name.toUpperCase().includes(match));
      setSuggestions(filtered.slice(0, 8));
      setActiveIndex(0);
    } else {
      setSuggestions([]);
    }
  }, [value, showDropdown]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (symbol: string) => {
    const symbolWithJK = symbol.includes('.JK') ? symbol : `${symbol}.JK`;
    onChange(symbolWithJK);
    setShowDropdown(false);
    onSelect?.(symbolWithJK);
  };

  return (
    <div className={containerClassName} ref={dropdownRef}>
      <input
        type="text"
        value={value}
        onChange={(event) => {
          onChange(event.target.value.toUpperCase());
          setShowDropdown(true);
        }}
        onFocus={(event) => {
          setShowDropdown(true);
          onFocus?.(event);
        }}
        onKeyDown={(event) => {
          if (!showDropdown || suggestions.length === 0) {
            onKeyDown?.(event);
            return;
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            handleSelect(suggestions[activeIndex].symbol);
          } else if (event.key === 'Escape') {
            setShowDropdown(false);
          } else {
            onKeyDown?.(event);
          }
        }}
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
        autoCapitalize="characters"
        className={className}
        aria-expanded={showDropdown && suggestions.length > 0}
        aria-autocomplete="list"
        {...props}
      />

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-2 w-full min-w-[260px] overflow-hidden rounded-2xl border border-white/10 bg-[#101A2A]/98 p-1.5 shadow-[0_24px_70px_rgba(0,0,0,0.48)] backdrop-blur-xl" role="listbox">
          <div className="flex items-center gap-2 px-2.5 py-2 text-[9px] font-bold uppercase tracking-[0.14em] text-tv-muted">
            <Search className="h-3 w-3" /> Hasil emiten
          </div>
          {suggestions.map((item, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              key={item.symbol}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => handleSelect(item.symbol)}
              className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors ${index === activeIndex ? 'bg-tv-blue/10' : 'hover:bg-white/[0.04]'}`}
            >
              <TickerAvatar symbol={item.symbol} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block font-number text-xs font-bold text-white">{item.symbol}</span>
                <span className="mt-0.5 block truncate text-[10px] text-tv-muted">{item.name}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

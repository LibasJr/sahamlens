'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { TICKERS } from '@/lib/tickers';
import TickerAvatar from '@/components/ui/TickerAvatar';
import { Button as PrimitiveButton } from '@/components/ui/Button';

const POPULAR_SEARCH_RANK = new Map<string, number>([
  ['BBRI.JK', 0],
  ['BBCA.JK', 1],
  ['BBNI.JK', 2],
  ['BMRI.JK', 3],
]);

interface SymbolAutocompleteProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'onSelect'> {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  containerClassName?: string;
  showSearchIcon?: boolean;
  endAdornment?: React.ReactNode;
  maxSuggestions?: number;
}

export default function SymbolAutocomplete({
  value,
  onChange,
  onSelect,
  containerClassName = 'relative w-full',
  className,
  onFocus,
  onKeyDown,
  showSearchIcon = false,
  endAdornment,
  maxSuggestions = 50,
  ...props
}: SymbolAutocompleteProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [suggestions, setSuggestions] = useState<typeof TICKERS>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (value.length >= 2 && showDropdown) {
      const match = value.toUpperCase().replace('.JK', '').trim();
      const filtered = TICKERS
        .filter((ticker) => ticker.symbol.replace('.JK', '').startsWith(match) || ticker.name.toUpperCase().includes(match))
        .sort((a, b) => {
          const aSymbol = a.symbol.replace('.JK', '');
          const bSymbol = b.symbol.replace('.JK', '');
          const aExactPrefix = aSymbol.startsWith(match) ? 0 : 1;
          const bExactPrefix = bSymbol.startsWith(match) ? 0 : 1;
          if (aExactPrefix !== bExactPrefix) return aExactPrefix - bExactPrefix;

          // Untuk query pendek seperti "BB", tampilkan bank IDX yang paling umum
          // terlebih dahulu. Ini hanya ranking hasil pencarian, bukan data finansial.
          const aPopular = POPULAR_SEARCH_RANK.get(a.symbol) ?? 99;
          const bPopular = POPULAR_SEARCH_RANK.get(b.symbol) ?? 99;
          if (aPopular !== bPopular) return aPopular - bPopular;

          return aSymbol.localeCompare(bSymbol);
        });
      setSuggestions(filtered.slice(0, maxSuggestions));
      setActiveIndex(0);
    } else {
      setSuggestions([]);
    }
  }, [maxSuggestions, value, showDropdown]);

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
    onSelect?.(symbolWithJK);
    setShowDropdown(false);
  };

  return (
    <div ref={dropdownRef} className={containerClassName}>
      {showSearchIcon && (
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tv-muted" />
      )}
      <input
        type="text"
        role="combobox"
        aria-controls={listboxId}
        aria-activedescendant={showDropdown && suggestions.length > 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next);
          setShowDropdown(next.trim().length >= 2);
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

      {endAdornment && (
        <div className="pointer-events-none absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 items-center gap-0.5 sm:flex">
          {endAdornment}
        </div>
      )}

      {showDropdown && suggestions.length > 0 && (
        <div id={listboxId} className="absolute left-0 top-full z-50 mt-2 max-h-72 w-full min-w-[260px] overflow-y-auto rounded-2xl border border-tv-border bg-tv-surface p-1.5 shadow-[0_24px_70px_rgba(0,0,0,0.48)] backdrop-blur-xl" role="listbox">
          <div className="flex items-center gap-2 px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-tv-muted">
            <Search className="h-3 w-3" /> Hasil emiten
          </div>
          {suggestions.map((item, index) => (
            <PrimitiveButton variant="bare" size="none"
              type="button"
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              key={item.symbol}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => handleSelect(item.symbol)}
              className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors ${index === activeIndex ? 'bg-tv-blue/10' : 'hover:bg-tv-hover'}`}
            >
              <TickerAvatar symbol={item.symbol} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block font-number text-xs font-bold text-tv-text">{item.symbol}</span>
                <span className="mt-0.5 block truncate text-[10px] text-tv-muted">{item.name}</span>
              </span>
            </PrimitiveButton>
          ))}
        </div>
      )}
    </div>
  );
}

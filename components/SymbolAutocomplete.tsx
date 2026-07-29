'use client';

import React, { useState, useEffect, useRef } from 'react';
import { TICKERS } from '@/lib/tickers';

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
  containerClassName = "relative w-full",
  className,
  ...props 
}: SymbolAutocompleteProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [suggestions, setSuggestions] = useState<typeof TICKERS>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value.length >= 2 && showDropdown) {
      const match = value.toUpperCase().replace('.JK', '');
      const filtered = TICKERS.filter(t => t.symbol.startsWith(match) || t.name.toUpperCase().includes(match));
      setSuggestions(filtered.slice(0, 8)); // Max 8 suggestions
    } else {
      setSuggestions([]);
    }
  }, [value, showDropdown]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (symbol: string) => {
    const symbolWithJK = symbol.includes('.JK') ? symbol : `${symbol}.JK`;
    onChange(symbolWithJK);
    setShowDropdown(false);
    if (onSelect) onSelect(symbolWithJK);
  };

  return (
    <div className={containerClassName} ref={dropdownRef}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setShowDropdown(true);
        }}
        onFocus={(e) => {
          setShowDropdown(true);
          if (props.onFocus) props.onFocus(e);
        }}
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
        autoCapitalize="characters"
        className={className}
        {...props}
      />
      
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-full bg-[#1e293b] border border-[#334155] rounded-lg shadow-xl z-50 overflow-hidden">
          {suggestions.map((item) => (
            <div 
              key={item.symbol}
              onClick={() => handleSelect(item.symbol)}
              className="px-4 py-2 hover:bg-[#334155] cursor-pointer text-sm font-mono text-white transition-colors"
            >
              {item.symbol} - <span className="text-gray-400 text-xs">{item.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

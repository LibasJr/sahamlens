'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';

export default function AskAIButton({ prompt, className }: { prompt: string, className?: string }) {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent('open-ai-chat', { detail: { prompt } }))}
      className={`bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/30 px-2 py-1 rounded transition-colors flex items-center gap-1 text-[10px] sm:text-xs font-mono font-bold ${className || ''}`}
    >
      <Sparkles className="w-3 h-3" /> Tanya AI
    </button>
  );
}

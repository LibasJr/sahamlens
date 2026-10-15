'use client';

import React from 'react';
import { Pencil, X, Check } from 'lucide-react';
import { Button } from '@/components/ui';

export interface WatchlistItem {
  symbol: string;
  buy_price: number;
  alert_price?: number;
  lot?: number;
  journal_note?: string | null;
  created_at: string;
  updated_at: string | null;
}

export function JournalBadge({ item, currentPrice }: { item: WatchlistItem; currentPrice: number }) {
  if (!item.buy_price && !item.alert_price) return null;
  if (item.alert_price && currentPrice <= item.alert_price) {
    return (
      <span className="lens-chip font-bold px-1.5 py-0.5 rounded border bg-tv-red/15 border-tv-red/50 text-tv-red">
        ⚠ Stop Terlihat
      </span>
    );
  }
  if (item.buy_price && currentPrice <= item.buy_price * 0.95) {
    return (
      <span className="lens-chip font-bold px-1.5 py-0.5 rounded border bg-tv-yellow/15 border-tv-yellow/50 text-tv-yellow">
        📉 Di Bawah Entry
      </span>
    );
  }
  if (item.buy_price && currentPrice >= item.buy_price * 1.1) {
    return (
      <span className="lens-chip font-bold px-1.5 py-0.5 rounded border bg-tv-green/15 border-tv-green/50 text-tv-green">
        📈 Di Atas Entry
      </span>
    );
  }
  return null;
}

export function JournalSection({
  item, isEditing, onStartEdit, onCancelEdit, onSave, journalNote, setJournalNote, saving,
}: {
  item: WatchlistItem;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (note: string) => void;
  journalNote: string;
  setJournalNote: (v: string) => void;
  saving: boolean;
}) {
  const notePreview = item.journal_note ? item.journal_note.slice(0, 60) + (item.journal_note.length > 60 ? '…' : '') : null;
  const savedDate = item.updated_at ? new Date(item.updated_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

  if (isEditing) {
    return (
      <div className="mt-1.5 flex flex-col gap-1.5">
        <textarea
          value={journalNote}
          onChange={(e) => setJournalNote(e.target.value)}
          placeholder="Catatan thesis: alasan beli, target, invalidasi..."
          maxLength={500}
          rows={2}
          className="w-full bg-tv-bg/60 border border-tv-border text-tv-text rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-tv-blue resize-none"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-white/40">{journalNote.length}/500</span>
          <div className="flex items-center gap-1.5">
            <Button variant="bare" size="none" onClick={onCancelEdit} className="p-1 text-tv-muted hover:text-tv-text" aria-label={`Batalkan edit catatan ${item.symbol}`}>
              <X className="w-3.5 h-3.5" />
            </Button>
            <Button variant="bare" size="none" onClick={() => onSave(journalNote)} disabled={saving} className="p-1 text-tv-green hover:text-tv-green/80 disabled:opacity-50" aria-label={journalNote.trim() ? `Simpan catatan ${item.symbol}` : `Hapus catatan ${item.symbol}`}>
              <Check className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1.5">
      {notePreview ? (
        <div className="flex items-start gap-1.5">
          <span className="text-xs text-white/50 italic leading-snug">
            📝 {notePreview}
            {savedDate && <span className="text-white/30 ml-1">— {savedDate}</span>}
          </span>
          <Button variant="bare" size="none" onClick={onStartEdit} className="p-0.5 text-tv-muted hover:text-tv-blue shrink-0" aria-label={`Edit catatan ${item.symbol}`}>
            <Pencil className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        <Button variant="bare" size="none" onClick={onStartEdit} className="text-xs text-tv-muted hover:text-tv-blue flex items-center gap-1 transition-colors">
          <Pencil className="w-3 h-3" /> Tambah catatan
        </Button>
      )}
    </div>
  );
}

'use client';

import React, { useRef } from 'react';
import { useModalBehavior } from '@/lib/hooks/useModalBehavior';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Newspaper, ExternalLink } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';
import { Button as PrimitiveButton } from '@/components/ui/Button';

export interface StockNewsItem {
  title: string;
  link?: string;
  source?: string;
  sentiment?: string;
  reason?: string;
  pubDate?: string;
}

interface StockNewsModalProps {
  open: boolean;
  onClose: () => void;
  symbol: string;
  items: StockNewsItem[];
}

function formatWaktu(
  pubDate: string | undefined,
  language: 'id' | 'en',
  t: (path: string, params?: Record<string, string | number>) => string
): string {
  if (!pubDate) return '';
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return '';
  const menit = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (menit < 60) return t('newsPage.timeMinutesAgo', { count: Math.max(1, menit) });
  if (menit < 1440) return t('newsPage.timeHoursAgo', { count: Math.floor(menit / 60) });
  return d.toLocaleDateString(language === 'en' ? 'en-US' : 'id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });
}

function gayaSentimen(sentiment?: string, language?: 'id' | 'en'): { label: string; kelas: string } {
  const isEn = language === 'en';
  if (sentiment === 'POSITIF') {
    return { label: isEn ? 'BULLISH' : 'POSITIF', kelas: 'bg-tv-green/15 text-tv-green' };
  }
  if (sentiment === 'NEGATIF') {
    return { label: isEn ? 'CAUTION' : 'NEGATIF', kelas: 'bg-tv-red/15 text-tv-red' };
  }
  return { label: isEn ? 'NEUTRAL' : 'NETRAL', kelas: 'bg-tv-hover text-tv-muted' };
}

export default function StockNewsModal({ open, onClose, symbol, items }: StockNewsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { t, language } = useLanguage();

  useModalBehavior({ open, onClose, containerRef: modalRef });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('stockNewsModal.title', { symbol })}
            className="relative w-full max-w-lg bg-tv-bg border border-tv-border rounded-xl shadow-2 p-6 max-h-[85vh] overflow-y-auto custom-scrollbar"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <PrimitiveButton variant="bare" size="none"
              onClick={onClose}
              className="absolute top-4 right-4 text-tv-muted hover:text-tv-text transition-colors"
              aria-label={t('stockNewsModal.close')}
            >
              <X className="w-5 h-5" />
            </PrimitiveButton>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-md bg-tv-blue/15 flex items-center justify-center text-tv-blue shrink-0">
                <Newspaper className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading text-lg font-bold text-tv-text">
                  {t('stockNewsModal.title', { symbol })}
                </h3>
                <p className="text-xs text-tv-muted">
                  {items.length > 0
                    ? t('stockNewsModal.subtitleCount', { count: items.length })
                    : t('stockNewsModal.subtitleEmpty')}
                </p>
              </div>
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-tv-muted py-6 text-center">
                {t('stockNewsModal.emptyText')}
              </p>
            ) : (
              <div className="space-y-3">
                {items.map((n, idx) => {
                  const s = gayaSentimen(n.sentiment, language);
                  return (
                    <div
                      key={n.link || `${n.title}-${idx}`}
                      className="border border-tv-border rounded-lg p-3 hover:border-tv-borderLight transition-colors"
                    >
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold mb-2 ${s.kelas}`}>
                        {s.label}
                      </span>
                      {n.link ? (
                        <a
                          href={n.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-sm font-medium text-tv-text hover:text-tv-blue transition-colors leading-snug group"
                        >
                          {n.title}
                          <ExternalLink className="inline w-3 h-3 ml-1 opacity-0 group-hover:opacity-60 transition-opacity" />
                        </a>
                      ) : (
                        <p className="text-sm font-medium text-tv-text leading-snug">{n.title}</p>
                      )}
                      <p className="text-xs text-tv-muted mt-1">
                        {[n.source, formatWaktu(n.pubDate, language, t), n.reason].filter(Boolean).join(' • ')}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[10px] text-tv-muted mt-5">
              {t('stockNewsModal.sentimentDisclaimer')}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

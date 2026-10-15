'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight, LogIn, RefreshCw, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { apiRequest, isApiClientError } from '@/shared/http/api-client';
import { useLanguage } from '@/lib/i18n';

interface DashboardAiBriefingCardProps {
  changePct?: number | null;
}

export function DashboardAiBriefingCard({ changePct }: DashboardAiBriefingCardProps) {
  const { language } = useLanguage();
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBriefing = useCallback(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    setUnauthenticated(false);

    const indices = typeof changePct === 'number' && Number.isFinite(changePct)
      ? [{ name: 'IHSG', changePct }]
      : [];

    apiRequest<{ briefing?: string }>('/api/ai-briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        indices,
        lang: language,
      }),
    })
      .then((res) => {
        if (isMounted) {
          if (res?.briefing) {
            setBriefing(res.briefing);
          }
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          if (isApiClientError(err) && err.code === 'UNAUTHENTICATED') {
            setUnauthenticated(true);
          } else {
            setError(isApiClientError(err) ? err.message : 'Briefing pasar sementara belum tersedia.');
          }
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [changePct, language]);

  useEffect(() => {
    const cleanup = loadBriefing();
    return cleanup;
  }, [loadBriefing]);

  return (
    <Card
      padding="none"
      radius="2xl"
      elevation="md"
      highlight={false}
      overflow="visible"
      className="w-full border-white/[0.075] p-5 md:p-6"
    >
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tv-purple/15 border border-tv-purple/30 text-tv-purple">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">AI Market Pulse Briefing</h2>
              <Badge variant="info" size="sm">LensAI</Badge>
            </div>
            <p className="text-xs text-tv-muted">
              Ringkasan sentimen & sinyal makro harian IHSG
            </p>
          </div>
        </div>

        {!loading && (
          <Button
            variant="bare"
            size="none"
            type="button"
            onClick={loadBriefing}
            className="p-1.5 text-tv-muted hover:text-white rounded-lg hover:bg-white/[0.04] transition-colors"
            title="Segarkan briefing"
            aria-label="Segarkan briefing AI pasar IHSG"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2.5 py-2">
            <div className="h-3.5 w-5/6 bg-white/[0.06] rounded animate-pulse" />
            <div className="h-3.5 w-3/4 bg-white/[0.06] rounded animate-pulse" />
          </div>
        ) : unauthenticated ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2 text-xs text-tv-muted">
            <span>Masuk ke akun SahamLens untuk membuka narasi AI briefing dan sinyal harian pasar.</span>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-tv-blue hover:text-white font-semibold transition-colors shrink-0"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Login Akun</span>
            </Link>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-xs text-tv-muted py-2">
            <AlertCircle className="h-4 w-4 text-tv-yellow shrink-0" />
            <span>{error}</span>
          </div>
        ) : briefing ? (
          <div className="space-y-3">
            <p className="text-sm text-tv-text leading-relaxed font-sans">
              {briefing}
            </p>
            <div className="flex items-center justify-end">
              <Link
                href="/breakout-radar"
                className="inline-flex items-center gap-1 text-xs text-tv-blue hover:text-white font-semibold transition-colors"
              >
                <span>Lihat Sinyal Radar Lengkap</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-xs text-tv-muted py-2">Belum ada rangkuman briefing untuk sesi ini.</p>
        )}
      </div>
    </Card>
  );
}

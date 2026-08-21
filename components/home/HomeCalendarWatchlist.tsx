'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Eye, Filter, Flame } from 'lucide-react';
import { AnimatedNumber, Badge, Card, EmptyState, SectionHeader, Skeleton, TickerAvatar } from '@/components/ui';
import { fadeUp, staggerContainer } from '@/lib/motion';
import { useLanguage } from '@/lib/i18n';
import type { CalendarEventPreview } from '@/components/home/useHomeWorkspaceData';

interface HomeCalendarWatchlistProps {
  calendarEvents: CalendarEventPreview[] | null;
  watchlistCount: number | null;
  watchlistPreview: { symbol: string }[];
}

export default function HomeCalendarWatchlist({
  calendarEvents,
  watchlistCount,
  watchlistPreview,
}: HomeCalendarWatchlistProps) {
  const { t, language } = useLanguage();

  return (
    <>
      <motion.div initial="hidden" animate="show" variants={staggerContainer} className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <motion.div variants={fadeUp}>
          <section className="space-y-3">
            <SectionHeader
              eyebrow="Agenda"
              title={t('calendar.title')}
              action={<Link href="/calendar" className="lens-meta text-tv-blue hover:underline">{t('calendar.viewAll')}</Link>}
            />
            {calendarEvents === null ? (
              <div className="space-y-2">
                {[0, 1].map((index) => <Skeleton key={index} className="h-10 w-full" />)}
              </div>
            ) : calendarEvents.length === 0 ? (
              <EmptyState
                illustration="empty"
                title={t('calendar.emptyTitle')}
                description={t('calendar.emptyDesc')}
              />
            ) : (
              <div className="space-y-2">
                {calendarEvents.map((event, index) => (
                  <motion.div
                    key={`${event.symbol}-${event.date}-${index}`}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.995 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  >
                    <Link
                      href={`/technical/${event.symbol}.JK`}
                      className="flex items-center gap-3 bg-tv-bg/50 border border-tv-border rounded-md px-3 py-2 hover:border-tv-borderLight hover:bg-tv-hover/40 transition-colors"
                    >
                      <TickerAvatar symbol={event.symbol} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-number text-sm font-bold text-white">{event.symbol.replace(/\.JK$/i, '')}</span>
                          <Badge variant={event.type === 'DIVIDEND' ? 'success' : 'info'}>
                            {event.type === 'DIVIDEND' ? t('calendar.dividendType') : t('calendar.earningsType')}
                          </Badge>
                        </div>
                        <div className="lens-meta text-tv-muted truncate">{event.title}</div>
                      </div>
                      <span className="lens-meta text-tv-muted font-number shrink-0">
                        {new Date(event.date).toLocaleDateString(language === 'en' ? 'en-US' : 'id-ID', { day: 'numeric', month: 'short' })}
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </section>
        </motion.div>

        <motion.div variants={fadeUp}>
          <section className="space-y-3">
            <SectionHeader
              eyebrow="LensWatch"
              title="Saham Dipantau"
              action={<Link href="/watchlist" className="lens-meta text-tv-blue hover:underline">Lihat semua</Link>}
            />
            <div className="min-h-[300px] flex flex-col justify-center">
              {watchlistCount === null ? (
                <Skeleton className="h-11 w-full" />
              ) : watchlistCount === -1 ? (
                <EmptyState
                  illustration="locked"
                  title="Masuk untuk melihat watchlist"
                  description="Watchlist tersimpan di akunmu. Masuk untuk melihat saham dan alert yang sedang dipantau."
                  action={{ label: 'Masuk', onClick: () => { window.location.href = '/login?next=%2F'; } }}
                />
              ) : watchlistCount === 0 ? (
                <EmptyState
                  illustration="collecting"
                  title="Belum ada saham di watchlist"
                  description="Tambahkan saham untuk mulai memantau harga & alert."
                  progress={{ current: 0, total: 5, unit: 'saham', label: 'Watchlist terisi' }}
                  action={{ label: 'Tambah Watchlist', onClick: () => { window.location.href = '/watchlist'; } }}
                />
              ) : (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex gap-2">
                    {watchlistPreview.map((item) => (
                      <Link
                        key={item.symbol}
                        href={`/technical/${item.symbol}`}
                        className="flex items-center gap-2 font-number text-xs font-bold text-white bg-tv-bg/50 border border-tv-border rounded-md pl-1.5 pr-2.5 py-1.5 hover:border-tv-borderLight hover:bg-tv-hover/40 transition-colors"
                      >
                        <TickerAvatar symbol={item.symbol} size="sm" className="!w-5 !h-5 !lens-meta" />
                        {item.symbol.replace('.JK', '')}
                      </Link>
                    ))}
                  </div>
                  <span className="text-xs text-tv-muted">
                    <AnimatedNumber value={watchlistCount} className="font-number font-semibold text-tv-text" /> saham dipantau
                  </span>
                </div>
              )}
            </div>
          </section>
        </motion.div>
      </motion.div>

      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <Card hoverable className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-tv-purple/10 border border-tv-purple/25 text-tv-purple flex items-center justify-center">
              <Filter className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-heading text-sm font-bold text-white">LensScanner</h3>
              <p className="text-xs text-tv-muted">Filter saham multi-faktor sesuai profil risiko Anda</p>
            </div>
          </div>
          <Link href="/screener" className="shrink-0 px-3 py-1.5 rounded-md bg-tv-blue hover:bg-tv-blueHover text-white text-xs font-semibold transition-colors">
            Buka LensScanner
          </Link>
        </Card>
      </motion.div>
    </>
  );
}

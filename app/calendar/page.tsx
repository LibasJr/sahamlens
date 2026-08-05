'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Briefcase,
  Coins,
  Loader2,
  Menu
} from 'lucide-react';
import PaywallModal from '@/components/PaywallModal';
import { PageContainer, Skeleton, EmptyState, LoadingFact, TickerAvatar } from '@/components/ui';

const TYPE_LABEL: Record<EventType, string> = {
  DIVIDEND: 'Dividen',
  EARNINGS: 'Earnings',
};

// Titik penanda di grid dulu SELALU kuning, apa pun jenis eventnya - dividen dan
// rilis laporan tidak bisa dibedakan tanpa mengklik tanggalnya satu per satu.
const TYPE_DOT: Record<EventType, string> = {
  DIVIDEND: 'bg-tv-green',
  EARNINGS: 'bg-tv-blue',
};

const TYPE_BADGE: Record<EventType, string> = {
  DIVIDEND: 'bg-tv-green/10 text-tv-green border-tv-green/25',
  EARNINGS: 'bg-tv-blue/10 text-tv-blue border-tv-blue/25',
};

type EventType = 'DIVIDEND' | 'EARNINGS';

interface CalendarEvent {
  symbol: string;
  type: EventType;
  title: string;
  description: string;
}

const TABS = [
  { id: 'ALL', label: 'Semua', icon: CalendarIcon },
  { id: 'DIVIDEND', label: 'Dividen', icon: Coins },
  { id: 'EARNINGS', label: 'Earnings', icon: Briefcase },
];

export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const [currentDate, setCurrentDate] = useState(today);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [activeTab, setActiveTab] = useState('ALL');
  const [calendarData, setCalendarData] = useState<Record<string, CalendarEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const loadCalendar = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/calendar')
      .then((res) => {
        if (res.status === 401) { setShowLoginPrompt(true); return null; }
        return res.json().then((data) => ({ ok: res.ok, data }));
      })
      .then((result) => {
        if (!result) return;
        const { ok, data } = result;
        if (!ok) { setError(data?.error || 'Gagal memuat kalender'); return; }
        setCalendarData(data.events || {});
      })
      .catch(() => setError('Gagal memuat kalender'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  // Format YYYY-MM-DD
  const formatDate = (d: Date) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  // BUG FIX (2026-08-06): daftar dependensi useMemo ini sebelumnya hanya [activeTab],
  // padahal isinya membaca `calendarData`. Saat data selesai di-fetch, setCalendarData
  // memicu render ulang TAPI activeTab tidak berubah, jadi useMemo mengembalikan hasil
  // lama - objek kosong dari render pertama. Akibatnya kalender tampil TANPA SATU PUN
  // event setelah dimuat; event baru muncul kalau pengguna kebetulan mengganti tab
  // (yang mengubah dependensinya) lalu kembali. Halaman terlihat "tidak ada agenda"
  // padahal datanya sudah ada di memori.
  const filteredData = useMemo(() => {
    const data: Record<string, CalendarEvent[]> = {};
    Object.entries(calendarData).forEach(([dateStr, events]) => {
      const typedEvents = events as CalendarEvent[];
      const filtered = typedEvents.filter(e => activeTab === 'ALL' || e.type === activeTab);
      if (filtered.length > 0) {
        data[dateStr] = filtered;
      }
    });
    return data;
  }, [activeTab, calendarData]);

  const renderCalendarGrid = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const days = [];
    const weekdays = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

    // Header
    weekdays.forEach(day => {
      days.push(
        <div key={`h-${day}`} className="text-center font-bold text-xs text-tv-muted py-2">
          {day}
        </div>
      );
    });

    // Empty slots
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="p-2"></div>);
    }

    // Days
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      const dateStr = formatDate(d);
      const dayEvents = filteredData[dateStr] || [];
      const isSelected = formatDate(selectedDate) === dateStr;
      const isToday = formatDate(today) === dateStr;

      // Satu titik per JENIS event yang ada di tanggal itu (bukan satu titik kuning
      // seragam), jadi sekilas pandang sudah kelihatan hari mana yang dividen dan
      // mana yang rilis laporan - tanpa perlu mengklik tanggalnya satu per satu.
      const types = Array.from(new Set(dayEvents.map((e) => e.type)));

      days.push(
        <button
          key={`day-${i}`}
          onClick={() => setSelectedDate(d)}
          title={dayEvents.length > 0
            ? `${dayEvents.length} agenda: ${types.map((t) => TYPE_LABEL[t]).join(', ')}`
            : undefined}
          className={`
            relative flex flex-col items-center justify-center p-1 sm:p-2 h-9 w-9 sm:h-12 sm:w-12 rounded-md mx-auto font-number text-xs sm:text-sm transition-colors
            ${isSelected ? 'bg-tv-blue text-white font-bold' : 'text-tv-text hover:bg-tv-hover'}
            ${isToday && !isSelected ? 'border border-tv-blue text-tv-blue' : ''}
          `}
        >
          <span>{i}</span>
          {types.length > 0 && (
            <div className="absolute bottom-1.5 flex gap-0.5">
              {types.map((t) => (
                <span key={t} className={`w-1.5 h-1.5 rounded-full ${TYPE_DOT[t]}`} />
              ))}
            </div>
          )}
        </button>
      );
    }

    return <div className="grid grid-cols-7 gap-1">{days}</div>;
  };

  const selectedDateStr = formatDate(selectedDate);
  const selectedEvents = filteredData[selectedDateStr] || [];

  // Rekap agenda pada bulan yang sedang ditampilkan (mengikuti filter tab aktif).
  const monthSummary = useMemo(() => {
    const prefix = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
    const events = Object.entries(filteredData)
      .filter(([dateStr]) => dateStr.startsWith(prefix))
      .flatMap(([, list]) => list);
    if (events.length === 0) return 'Tidak ada agenda pada bulan ini';
    const dividen = events.filter((e) => e.type === 'DIVIDEND').length;
    const earnings = events.filter((e) => e.type === 'EARNINGS').length;
    const parts = [];
    if (dividen > 0) parts.push(`${dividen} dividen`);
    if (earnings > 0) parts.push(`${earnings} earnings`);
    return `${events.length} agenda bulan ini · ${parts.join(', ')}`;
  }, [filteredData, currentDate]);

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <header className="bg-tv-surface border-b border-tv-border px-6 py-4 sticky top-0 z-20 shadow-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
            className="md:hidden p-2 -ml-2 text-tv-muted hover:text-white rounded-lg hover:bg-white/5"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="p-2 rounded-md bg-tv-blue text-white">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-lg text-tv-text tracking-tight">Corporate Calendar</h2>
            <p className="text-xs text-tv-muted">Jadwal Dividen & Rilis Laporan Keuangan (Yahoo Finance)</p>
          </div>
        </div>
      </header>

      <PageContainer className="p-6">
        {error && (
          <div className="bg-tv-card border border-tv-red/30 rounded-lg mb-6">
            {/* Sebelumnya cuma satu baris teks merah tanpa tombol apa pun. */}
            <EmptyState
              illustration="empty"
              title="Kalender gagal dimuat"
              description={`${error}. Kalender ini mengambil jadwal dari sumber harga yang sama dengan halaman lain - kegagalan di sini biasanya bersifat sementara.`}
              action={{ label: 'Coba lagi', onClick: loadCalendar }}
            />
          </div>
        )}

        {/* Tabs - `custom-scrollbar` dilepas: tidak ada blok <style> yang
            mendefinisikannya di file ini, jadi selama ini inert. */}
        <div className="flex overflow-x-auto gap-2 mb-8 pb-2">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm whitespace-nowrap transition-colors border
                  ${isActive
                    ? 'bg-tv-purple/20 text-tv-purple border-tv-purple/50'
                    : 'bg-tv-card text-tv-muted border-tv-border hover:bg-tv-hover'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Calendar Section */}
          <div className="lg:col-span-2">
            <div className="bg-tv-card border border-tv-border rounded-lg p-6 shadow-1">
              <div className="flex justify-between items-center mb-6 border-b border-tv-border pb-4">
                <div>
                  <h3 className="font-heading text-lg font-bold text-tv-text">
                    {currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                  </h3>
                  {/* Ringkasan bulan: tanpa ini, satu-satunya cara mengetahui bulan ini
                      ramai atau kosong adalah memindai 30 kotak dengan mata. */}
                  <p className="text-[11px] text-tv-muted mt-0.5">
                    {loading ? 'memuat agenda…' : monthSummary}
                  </p>
                </div>
                <div className="flex gap-2">
                  {/* Setelah beberapa kali klik maju/mundur, tidak ada jalan kembali ke
                      bulan ini selain menghitung mundur sendiri. */}
                  <button
                    onClick={() => { setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(today); }}
                    className="px-3 py-2 rounded-md bg-tv-bg border border-tv-border text-xs font-semibold text-tv-muted hover:text-tv-text transition-colors"
                  >
                    Hari ini
                  </button>
                  <button onClick={prevMonth} aria-label="Bulan sebelumnya" className="p-2 rounded-md bg-tv-bg border border-tv-border text-tv-muted hover:text-tv-text transition-colors">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button onClick={nextMonth} aria-label="Bulan berikutnya" className="p-2 rounded-md bg-tv-bg border border-tv-border text-tv-muted hover:text-tv-text transition-colors">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-7 gap-1">
                    {[...Array(35)].map((_, i) => <Skeleton key={i} className="h-9 sm:h-12 w-9 sm:w-12 mx-auto" />)}
                  </div>
                  <LoadingFact />
                </div>
              ) : (
                <>
                  {renderCalendarGrid()}
                  {/* Legenda warna titik - tanpa ini, dua warna baru di grid tidak
                      punya keterangan apa pun. */}
                  <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-tv-border pt-3 text-[11px] text-tv-muted">
                    <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-tv-green" /> Dividen</span>
                    <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-tv-blue" /> Earnings</span>
                    <span className="ml-auto">Cakupan terbatas Dividen &amp; Earnings - RUPS dan stock split tidak tersedia di sumber data ini.</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Event List Section */}
          <div>
            <div className="bg-tv-card border border-tv-border rounded-lg p-6 shadow-1 sticky top-[100px]">
              <h3 className="font-heading text-base font-bold text-tv-text flex items-center justify-between mb-4 border-b border-tv-border pb-3">
                <span>Event pada {selectedDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                <span className="text-xs bg-tv-hover text-tv-muted px-2 py-1 rounded font-number">
                  {selectedEvents.length} Event
                </span>
              </h3>

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                {loading ? (
                  <>{[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</>
                ) : selectedEvents.length > 0 ? (
                  selectedEvents.map((event, idx) => (
                    <a
                      key={idx}
                      href={`/technical/${event.symbol.replace('.JK', '')}.JK`}
                      className="block p-4 rounded-lg bg-tv-bg border border-tv-border hover:border-tv-borderLight hover:bg-tv-hover/40 transition-colors"
                    >
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <span className="flex items-center gap-2 font-bold text-tv-text font-number">
                          <TickerAvatar symbol={event.symbol} size="sm" />
                          {event.symbol.replace('.JK', '')}
                        </span>
                        {/* Badge dulu menampilkan nilai mentah "DIVIDEND"/"EARNINGS"
                            dengan satu warna ungu untuk keduanya. Sekarang berlabel
                            Indonesia dan berwarna sesuai jenisnya, konsisten dengan
                            titik penanda di grid. */}
                        <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded border ${TYPE_BADGE[event.type]}`}>
                          {TYPE_LABEL[event.type]}
                        </span>
                      </div>
                      <h4 className="text-sm text-tv-text font-bold mb-1">{event.title}</h4>
                      <p className="text-xs text-tv-muted">{event.description}</p>
                    </a>
                  ))
                ) : (
                  <EmptyState
                    illustration="empty"
                    title="Tidak ada agenda pada tanggal ini"
                    description={
                      activeTab === 'ALL'
                        ? 'Pilih tanggal lain yang bertitik di kalender - hanya tanggal bertitik yang punya agenda.'
                        : `Filter aktif: ${TABS.find((t) => t.id === activeTab)?.label}. Tanggal ini mungkin punya agenda jenis lain - coba tab "Semua".`
                    }
                  />
                )}
              </div>
            </div>
          </div>

        </div>
      </PageContainer>
      <PaywallModal
        open={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        title="Daftar Dulu untuk Lihat Kalender"
        body="Corporate Calendar butuh akun (gratis) - daftar sekarang, dapat trial 7 hari akses penuh sebelum diminta upgrade."
        ctaHref="/signup"
        ctaLabel="Daftar Gratis"
        secondaryLabel="Nanti"
      />
    </div>
  );
}

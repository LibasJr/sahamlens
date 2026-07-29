'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Briefcase, 
  Coins, 
  Users, 
  Building 
} from 'lucide-react';
import calendarData from '@/data/calendar.json';

type EventType = 'DIVIDEND' | 'EARNINGS' | 'RUPS' | 'CORP_ACTION';

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
  { id: 'RUPS', label: 'RUPS', icon: Users },
  { id: 'CORP_ACTION', label: 'Corp Action', icon: Building },
];

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 6, 28)); // July 28, 2026 (Mock "Today")
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(2026, 6, 28));
  const [activeTab, setActiveTab] = useState('ALL');
  
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
  }, [activeTab]);

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
        <div key={`h-${day}`} className="text-center font-bold text-xs text-gray-500 py-2">
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
      const hasEvents = !!filteredData[dateStr];
      const isSelected = formatDate(selectedDate) === dateStr;
      const isToday = formatDate(new Date(2026, 6, 28)) === dateStr; // Mock "Today"

      days.push(
        <button
          key={`day-${i}`}
          onClick={() => setSelectedDate(d)}
          className={`
            relative flex flex-col items-center justify-center p-2 h-12 w-12 rounded-lg mx-auto font-mono text-sm transition-all
            ${isSelected ? 'bg-blue-600 text-white font-bold' : 'text-gray-300 hover:bg-[#1e293b]'}
            ${isToday && !isSelected ? 'border border-blue-500 text-blue-400' : ''}
          `}
        >
          <span>{i}</span>
          {hasEvents && (
            <div className="absolute bottom-1.5 flex gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>
            </div>
          )}
        </button>
      );
    }

    return <div className="grid grid-cols-7 gap-1">{days}</div>;
  };

  const selectedDateStr = formatDate(selectedDate);
  const selectedEvents = filteredData[selectedDateStr] || [];

  return (
    <div className="flex-1 flex flex-col bg-[#0f172a] min-h-screen">
      <header className="bg-[#131c2e] border-b border-[#1e293b] px-6 py-4 sticky top-0 z-20 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-purple-500/10 border border-purple-500/30 text-purple-400">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-white tracking-tight">Corporate Calendar</h2>
            <p className="text-xs text-gray-500 font-mono">Jadwal Dividen, RUPS, & Aksi Korporasi</p>
          </div>
        </div>
      </header>

      <div className="p-6 max-w-[1600px] mx-auto w-full">
        {/* Tabs */}
        <div className="flex overflow-x-auto gap-2 mb-8 pb-2 custom-scrollbar">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-sm whitespace-nowrap transition-colors border
                  ${isActive 
                    ? 'bg-purple-600/20 text-purple-400 border-purple-500/50' 
                    : 'bg-[#131c2e] text-gray-400 border-[#1e293b] hover:bg-[#1e293b]'
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
            <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-6 shadow-lg">
              <div className="flex justify-between items-center mb-6 border-b border-[#1e293b] pb-4">
                <h3 className="text-lg font-bold text-white font-mono">
                  {currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                </h3>
                <div className="flex gap-2">
                  <button onClick={prevMonth} className="p-2 rounded-lg bg-[#0f172a] border border-[#1e293b] text-gray-400 hover:text-white transition-colors">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button onClick={nextMonth} className="p-2 rounded-lg bg-[#0f172a] border border-[#1e293b] text-gray-400 hover:text-white transition-colors">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {renderCalendarGrid()}
            </div>
          </div>

          {/* Event List Section */}
          <div>
            <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-6 shadow-lg sticky top-[100px]">
              <h3 className="text-base font-bold text-white flex items-center justify-between mb-4 border-b border-[#1e293b] pb-3">
                <span>Event pada {selectedDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                <span className="text-xs bg-[#1e293b] text-gray-400 px-2 py-1 rounded font-mono">
                  {selectedEvents.length} Event
                </span>
              </h3>

              <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                {selectedEvents.length > 0 ? (
                  selectedEvents.map((event, idx) => (
                    <div key={idx} className="p-4 rounded-lg bg-[#0f172a] border border-[#1e293b] hover:border-purple-500/30 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-white font-mono">{event.symbol}</span>
                        <span className="text-[10px] font-bold px-2 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          {event.type}
                        </span>
                      </div>
                      <h4 className="text-sm text-gray-200 font-bold mb-1">{event.title}</h4>
                      <p className="text-xs text-gray-400">{event.description}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-gray-500 font-mono text-sm">
                    <CalendarIcon className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    Tidak ada agenda corporate action<br/>pada tanggal ini.
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

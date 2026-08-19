'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Bell, Volume2, VolumeX, Check, Sparkles, AlertTriangle, Info, ExternalLink, X, ShieldAlert, CheckCheck } from 'lucide-react';
import {
  getNotifications,
  getNotificationPrefs,
  saveNotificationPrefs,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  clearAllNotifications,
  requestBrowserNotificationPermission,
  addNotification,
  playNotificationChime,
  type SahamLensNotification,
  type NotificationPrefs,
} from '@/lib/notifications/notificationManager';
import { useLanguage } from '@/lib/i18n';
import { Button } from '@/components/ui/Button';

interface NotificationCenterProps {
  className?: string;
}

export default function NotificationCenter({ className = '' }: NotificationCenterProps) {
  const { t, language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<SahamLensNotification[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs>(getNotificationPrefs());
  const [browserPermission, setBrowserPermission] = useState<string>('default');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const refreshNotifs = () => {
    setNotifications(getNotifications());
    setPrefs(getNotificationPrefs());
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserPermission(Notification.permission);
    }
  };

  useEffect(() => {
    refreshNotifs();

    const handleUpdated = () => refreshNotifs();
    window.addEventListener('sahamlens-notifications-updated', handleUpdated);
    window.addEventListener('sahamlens-notif-prefs-changed', handleUpdated);

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('sahamlens-notifications-updated', handleUpdated);
      window.removeEventListener('sahamlens-notif-prefs-changed', handleUpdated);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleToggleSound = () => {
    const nextSound = !prefs.soundEnabled;
    saveNotificationPrefs({ soundEnabled: nextSound });
    setPrefs((p) => ({ ...p, soundEnabled: nextSound }));
    if (nextSound) {
      playNotificationChime();
    }
  };

  const handleRequestPush = async () => {
    const granted = await requestBrowserNotificationPermission();
    if (granted) {
      setBrowserPermission('granted');
      setPrefs((p) => ({ ...p, browserPushEnabled: true }));
      addNotification({
        title: language === 'id' ? '🔔 Notifikasi Browser Aktif' : '🔔 Browser Notifications Enabled',
        body: language === 'id' ? 'Izin browser aktif. Alert hanya akan muncul jika fitur SahamLens yang terhubung benar-benar mengirim notifikasi.' : 'Browser permission is active. Alerts appear only when a connected SahamLens feature actually emits a notification.',
        category: 'system',
      });
    } else {
      setBrowserPermission('denied');
    }
  };

  const handleTestAlert = () => {
    addNotification({
      title: language === 'id' ? '🎯 Test Alert SahamLens' : '🎯 SahamLens Test Alert',
      body: language === 'id' ? 'Sistem notifikasi dan audio chime berfungsi normal & optimal.' : 'Notification system and audio chime are functioning optimally.',
      category: 'signal',
      symbol: 'BBCA',
      link: '/breakout-radar',
    });
  };

  const formatTimeAgo = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSec < 60) return language === 'id' ? 'Baru saja' : 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ${language === 'id' ? 'lalu' : 'ago'}`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}j ${language === 'id' ? 'lalu' : 'ago'}`;
    return `${Math.floor(diffSec / 86400)}h ${language === 'id' ? 'lalu' : 'ago'}`;
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={language === 'id' ? 'Pusat Notifikasi & Alert' : 'Notification & Alert Center'}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl text-tv-muted transition-all duration-150 hover:bg-white/[0.06] hover:text-white active:scale-95"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-tv-green px-1 font-number text-[10px] leading-none font-extrabold text-black shadow-[0_0_8px_rgba(35,196,131,0.9)]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Backdrop for Mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs sm:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Solid Opaque Dropdown Modal */}
      {isOpen && (
        <div className="fixed inset-x-3.5 top-16 z-50 rounded-2xl border border-slate-700 bg-[#0d1522] p-4 text-white shadow-[0_20px_60px_rgba(0,0,0,0.9)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[380px] animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="font-heading text-sm font-bold text-white">
                {language === 'id' ? 'Notifikasi & Alert' : 'Notifications & Alerts'}
              </span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-tv-green/20 px-2 py-0.5 text-[11px] font-bold text-tv-green border border-tv-green/30">
                  {unreadCount} {language === 'id' ? 'baru' : 'new'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {/* Sound Toggle */}
              <button
                type="button"
                onClick={handleToggleSound}
                title={prefs.soundEnabled ? (language === 'id' ? 'Suara Aktif' : 'Sound On') : (language === 'id' ? 'Suara Nonaktif' : 'Sound Muted')}
                aria-label={language === 'id' ? 'Suara notifikasi' : 'Notification sound'}
                aria-pressed={prefs.soundEnabled}
                className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${
                  prefs.soundEnabled
                    ? 'border-tv-blue/50 bg-tv-blue/20 text-tv-blue'
                    : 'border-slate-700 bg-slate-800 text-slate-400'
                }`}
              >
                {prefs.soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label={language === 'id' ? 'Tutup pusat notifikasi' : 'Close notification center'}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Browser Permission Banner (if not yet granted) */}
          {browserPermission !== 'granted' && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-tv-blue/40 bg-tv-blue/15 p-2.5 text-xs text-tv-blue">
              <span className="leading-snug font-medium">
                {language === 'id' ? 'Aktifkan notifikasi browser untuk alert yang benar-benar dipicu fitur SahamLens.' : 'Enable browser notifications for alerts actually emitted by SahamLens features.'}
              </span>
              <Button
                size="sm"
                type="button"
                onClick={handleRequestPush}
                className="shrink-0 shadow-sm"
              >
                {language === 'id' ? 'Izinkan' : 'Enable'}
              </Button>
            </div>
          )}

          {/* Notification List - Solid Opaque Cards */}
          <div className="mt-3 max-h-[320px] space-y-2.5 overflow-y-auto pr-1">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                {language === 'id' ? 'Belum ada notifikasi baru.' : 'No new notifications.'}
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => markNotificationAsRead(notif.id)}
                  className={`group relative rounded-xl border p-3 transition-all duration-150 cursor-pointer ${
                    notif.read
                      ? 'border-slate-800 bg-[#111a28] opacity-70 hover:opacity-100'
                      : 'border-slate-700 bg-[#142032] shadow-sm hover:border-tv-blue/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {!notif.read && <span className="h-2 w-2 shrink-0 rounded-full bg-tv-green shadow-[0_0_6px_rgba(35,196,131,0.8)]" />}
                        <h4 className="font-heading text-xs font-bold text-white truncate">{notif.title}</h4>
                      </div>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-slate-300">{notif.body}</p>
                      <div className="mt-2.5 flex items-center justify-between text-[10.5px] text-slate-400">
                        <span className="font-medium">{formatTimeAgo(notif.timestamp)}</span>
                        {notif.link && (
                          <Link
                            href={notif.link}
                            onClick={() => setIsOpen(false)}
                            className="flex items-center gap-1 font-bold text-tv-blue hover:text-white transition-colors"
                          >
                            <span>{language === 'id' ? 'Buka Analisis' : 'View Analysis'}</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Controls */}
          <div className="mt-3 flex items-center justify-between border-t border-slate-700/80 pt-3 text-[11px]">
            <button
              type="button"
              onClick={handleTestAlert}
              className="font-semibold text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5 text-tv-gold" />
              <span>Test Alert</span>
            </button>

            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllNotificationsAsRead}
                  className="font-bold text-tv-blue hover:underline flex items-center gap-1"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>{language === 'id' ? 'Baca Semua' : 'Mark all read'}</span>
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllNotifications}
                  className="font-medium text-slate-400 hover:text-tv-red transition-colors"
                >
                  {language === 'id' ? 'Hapus' : 'Clear'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

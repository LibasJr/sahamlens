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
        body: language === 'id' ? 'Anda akan menerima pemberitahuan langsung saat sinyal saham terdeteksi.' : 'You will receive instant alerts when stock signals trigger.',
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
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-tv-green px-1 font-number text-[10px] font-extrabold text-black shadow-[0_0_8px_rgba(35,196,131,0.8)]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute right-0 top-11 z-50 w-[340px] sm:w-[380px] rounded-2xl border border-tv-border bg-tv-card/98 p-4 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-tv-border/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="font-heading text-sm font-bold text-tv-text">
                {language === 'id' ? 'Notifikasi & Alert' : 'Notifications & Alerts'}
              </span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-tv-green/15 px-2 py-0.5 text-[11px] font-bold text-tv-green">
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
                className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${
                  prefs.soundEnabled
                    ? 'border-tv-blue/30 bg-tv-blue/10 text-tv-blue'
                    : 'border-tv-border bg-tv-hover text-tv-muted'
                }`}
              >
                {prefs.soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-tv-muted hover:bg-tv-hover hover:text-tv-text transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Browser Permission Banner (if not yet granted) */}
          {browserPermission !== 'granted' && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-tv-blue/30 bg-tv-blue/10 p-2.5 text-xs text-tv-blue">
              <span className="leading-snug">
                {language === 'id' ? 'Aktifkan notifikasi pop-up saat ada sinyal baru.' : 'Enable pop-up alerts for new signals.'}
              </span>
              <button
                type="button"
                onClick={handleRequestPush}
                className="shrink-0 rounded-lg bg-tv-blue px-2.5 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-tv-blueHover"
              >
                {language === 'id' ? 'Izinkan' : 'Enable'}
              </button>
            </div>
          )}

          {/* Notification List */}
          <div className="mt-3 max-h-[300px] space-y-2 overflow-y-auto pr-1">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-tv-muted">
                {language === 'id' ? 'Belum ada notifikasi baru.' : 'No new notifications.'}
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => markNotificationAsRead(notif.id)}
                  className={`group relative rounded-xl border p-3 transition-all duration-150 ${
                    notif.read
                      ? 'border-tv-border/50 bg-tv-bg/40 opacity-75 hover:opacity-100'
                      : 'border-tv-blue/30 bg-tv-cardAlt/80 shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {!notif.read && <span className="h-2 w-2 shrink-0 rounded-full bg-tv-green" />}
                        <h4 className="font-heading text-xs font-bold text-tv-text truncate">{notif.title}</h4>
                      </div>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-tv-muted">{notif.body}</p>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-tv-muted/80">
                        <span className="font-medium">{formatTimeAgo(notif.timestamp)}</span>
                        {notif.link && (
                          <Link
                            href={notif.link}
                            onClick={() => setIsOpen(false)}
                            className="flex items-center gap-1 font-semibold text-tv-blue hover:underline"
                          >
                            <span>{language === 'id' ? 'Buka Analisis' : 'View Analysis'}</span>
                            <ExternalLink className="h-2.5 w-2.5" />
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
          <div className="mt-3 flex items-center justify-between border-t border-tv-border/80 pt-3 text-[11px]">
            <button
              type="button"
              onClick={handleTestAlert}
              className="font-medium text-tv-muted hover:text-tv-text transition-colors flex items-center gap-1"
            >
              <Sparkles className="h-3 w-3 text-tv-gold" />
              <span>{language === 'id' ? 'Test Alert' : 'Test Alert'}</span>
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
                  className="font-medium text-tv-muted hover:text-tv-red transition-colors"
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

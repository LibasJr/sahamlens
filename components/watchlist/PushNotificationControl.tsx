'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { BellOff, BellRing, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { apiRequest } from '@/shared/http/api-client';

type PushConfig = {
  configured: boolean;
  publicKey: string | null;
};

type PushState = 'checking' | 'unsupported' | 'unconfigured' | 'disabled' | 'enabled' | 'blocked';

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function supportsPush(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

function isIosNotStandalone(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
}

async function registerWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  return registration;
}

async function persistSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Browser tidak memberikan push subscription yang lengkap');
  }
  await apiRequest('/api/notifications/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
}

export function PushNotificationControl() {
  const [state, setState] = useState<PushState>('checking');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const syncState = useCallback(async (autoSubscribe = true) => {
    if (!supportsPush()) {
      setState('unsupported');
      return;
    }
    if (isIosNotStandalone()) {
      setState('unsupported');
      setHint('Di iPhone, tambahkan SahamLens ke Home Screen dulu.');
      return;
    }

    try {
      const config = await apiRequest<PushConfig>('/api/notifications/push');
      if (!config.configured || !config.publicKey) {
        setState('unconfigured');
        setHint('Web Push belum dikonfigurasi di server.');
        return;
      }
      if (Notification.permission === 'denied') {
        setState('blocked');
        setHint('Izin notifikasi diblokir di browser.');
        return;
      }

      const registration = await registerWorker();
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription && autoSubscribe && Notification.permission === 'granted') {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(config.publicKey),
        });
      }

      if (subscription) {
        await persistSubscription(subscription);
        setState('enabled');
        setHint(null);
      } else {
        setState('disabled');
        setHint(null);
      }
    } catch (error) {
      console.error('Failed to sync Web Push state', error);
      setState('disabled');
      setHint('Status notifikasi belum bisa disinkronkan.');
    }
  }, []);

  useEffect(() => {
    void syncState();
    const onFocus = () => void syncState();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void syncState();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [syncState]);

  const enable = async () => {
    setBusy(true);
    setHint(null);
    try {
      const config = await apiRequest<PushConfig>('/api/notifications/push');
      if (!config.configured || !config.publicKey) {
        setState('unconfigured');
        setHint('Web Push belum dikonfigurasi di server.');
        return;
      }
      if (isIosNotStandalone()) {
        setState('unsupported');
        setHint('Di iPhone, pilih Share → Add to Home Screen, lalu buka SahamLens dari ikon Home Screen.');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'disabled');
        setHint(permission === 'denied' ? 'Izin notifikasi diblokir di browser.' : 'Izin notifikasi belum diberikan.');
        return;
      }

      const registration = await registerWorker();
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(config.publicKey),
      });
      await persistSubscription(subscription);
      setState('enabled');
      setHint('Notifikasi HP aktif untuk LensAlert.');
    } catch (error) {
      console.error('Failed to enable Web Push', error);
      setState('disabled');
      setHint('Gagal mengaktifkan notifikasi HP. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setHint(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await apiRequest('/api/notifications/push', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState('disabled');
      setHint('Notifikasi HP dinonaktifkan di perangkat ini.');
    } catch (error) {
      console.error('Failed to disable Web Push', error);
      setHint('Gagal menonaktifkan notifikasi HP. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  const enabled = state === 'enabled';
  const unavailable = state === 'unsupported' || state === 'unconfigured';
  const label = state === 'checking'
    ? 'Cek Notifikasi'
    : enabled
      ? 'Notifikasi HP Aktif'
      : state === 'blocked'
        ? 'Notifikasi Diblokir'
        : 'Aktifkan Notifikasi HP';

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="bare"
        size="none"
        onClick={enabled ? disable : enable}
        disabled={busy || state === 'checking' || unavailable || state === 'blocked'}
        className="bg-white/5 border border-white/10 hover:bg-white/10 px-4 py-2 rounded-full text-white flex items-center gap-2 transition-colors disabled:opacity-50 text-xs font-semibold"
        aria-pressed={enabled}
      >
        {busy || state === 'checking'
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : enabled
            ? <BellRing className="w-3.5 h-3.5" />
            : <BellOff className="w-3.5 h-3.5" />}
        {label}
      </Button>
      {hint ? <span className="max-w-[260px] text-right text-[10px] leading-4 text-white/45">{hint}</span> : null}
    </div>
  );
}

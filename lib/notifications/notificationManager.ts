'use client';

export interface SahamLensNotification {
  id: string;
  title: string;
  body: string;
  category: 'signal' | 'market' | 'watchlist' | 'system';
  symbol?: string;
  timestamp: string;
  read: boolean;
  link?: string;
}

const STORAGE_KEY = 'sahamlens_notifications_v1';
const PREFS_KEY = 'sahamlens_notif_prefs_v1';

export interface NotificationPrefs {
  browserPushEnabled: boolean;
  soundEnabled: boolean;
  priceAlerts: boolean;
  marketOpenCloseAlerts: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  browserPushEnabled: false,
  soundEnabled: true,
  priceAlerts: true,
  marketOpenCloseAlerts: true,
};

const INITIAL_DEMO_NOTIFICATIONS: SahamLensNotification[] = [
  {
    id: 'notif-1',
    title: '🎯 Sinyal Breakout Terdeteksi',
    body: 'BBCA menembus resistensi dinamis dengan akumulasi broker signifikan. Target TP1: 10.450',
    category: 'signal',
    symbol: 'BBCA',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    read: false,
    link: '/technical/BBCA.JK',
  },
  {
    id: 'notif-2',
    title: '🔔 Bursa Efek Indonesia (IDX) Aktif',
    body: 'Sesi perdagangan pagi telah resmi dibuka. Pantau pergerakan harga likuid di LensMarket.',
    category: 'market',
    timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    read: false,
    link: '/market-pulse',
  },
  {
    id: 'notif-3',
    title: '💡 Evaluasi Nilai Wajar DCF',
    body: 'Emiten BMRI dan BBRI masuk kategori Undervalued dengan Margin of Safety > 20%.',
    category: 'watchlist',
    symbol: 'BMRI',
    timestamp: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    read: true,
    link: '/dcf',
  },
];

export function getNotificationPrefs(): NotificationPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const saved = localStorage.getItem(PREFS_KEY);
    return saved ? { ...DEFAULT_PREFS, ...JSON.parse(saved) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveNotificationPrefs(prefs: Partial<NotificationPrefs>): NotificationPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const current = getNotificationPrefs();
    const updated = { ...current, ...prefs };
    localStorage.setItem(PREFS_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('sahamlens-notif-prefs-changed', { detail: updated }));
    return updated;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function getNotifications(): SahamLensNotification[] {
  if (typeof window === 'undefined') return INITIAL_DEMO_NOTIFICATIONS;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DEMO_NOTIFICATIONS));
      return INITIAL_DEMO_NOTIFICATIONS;
    }
    return JSON.parse(saved);
  } catch {
    return INITIAL_DEMO_NOTIFICATIONS;
  }
}

export function saveNotifications(notifs: SahamLensNotification[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs.slice(0, 30)));
    window.dispatchEvent(new CustomEvent('sahamlens-notifications-updated', { detail: notifs }));
  } catch {}
}

export function addNotification(notif: Omit<SahamLensNotification, 'id' | 'timestamp' | 'read'>): SahamLensNotification {
  const current = getNotifications();
  const newNotif: SahamLensNotification = {
    ...notif,
    id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toISOString(),
    read: false,
  };
  const updated = [newNotif, ...current];
  saveNotifications(updated);

  const prefs = getNotificationPrefs();
  if (prefs.soundEnabled) {
    playNotificationChime();
  }
  if (prefs.browserPushEnabled && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(newNotif.title, {
        body: newNotif.body,
        icon: '/icon-pwa-192.png?v=5',
        badge: '/favicon.ico?v=5',
      });
    } catch {}
  }

  return newNotif;
}

export function markNotificationAsRead(id: string): void {
  const current = getNotifications();
  const updated = current.map((n) => (n.id === id ? { ...n, read: true } : n));
  saveNotifications(updated);
}

export function markAllNotificationsAsRead(): void {
  const current = getNotifications();
  const updated = current.map((n) => ({ ...n, read: true }));
  saveNotifications(updated);
}

export function clearAllNotifications(): void {
  saveNotifications([]);
}

/**
 * Web Audio API synthesizer for pleasant, lightweight notification chime.
 * Uses 0 external audio files, zero network bandwidth, 100% reliable.
 */
export function playNotificationChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Tone 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.08, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Tone 2: 880 Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.08);
    gain2.gain.setValueAtTime(0.1, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.45);
  } catch {}
}

/**
 * Request native browser notification permission
 */
export async function requestBrowserNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  try {
    const permission = await Notification.requestPermission();
    const isGranted = permission === 'granted';
    saveNotificationPrefs({ browserPushEnabled: isGranted });
    return isGranted;
  } catch {
    return false;
  }
}

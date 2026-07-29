'use client';

import React, { useEffect, useRef, useState } from 'react';
import { refreshAdminStatus } from '@/lib/limits';

interface TelegramUser {
  id: string;
  name: string;
  username: string | null;
}

function readUserCookie(): TelegramUser | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )sahamlens_user=([^;]*)/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

// Sengaja gak ada fallback hardcode - kalau env var ini belum di-set (bot belum didaftarkan ke
// domain lewat @BotFather /setdomain), widget-nya gak usah dicoba render sama sekali daripada
// nampilin teks error mentah "Bot domain invalid" dari script Telegram di semua halaman.
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

export default function TelegramLogin() {
  const widgetRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setUser(readUserCookie());
    refreshAdminStatus().then(setIsAdmin);
  }, []);

  // Widget resmi Telegram cuma bisa jalan kalau domain halaman ini terdaftar di BotFather
  // (/setdomain) - tidak akan render apa pun kalau diakses dari localhost tanpa domain publik.
  useEffect(() => {
    if (user || !widgetRef.current || !BOT_USERNAME) return;
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', BOT_USERNAME);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-auth-url', '/api/auth/telegram');
    script.setAttribute('data-request-access', 'write');
    widgetRef.current.appendChild(script);
    return () => {
      if (widgetRef.current) widgetRef.current.innerHTML = '';
    };
  }, [user]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
  };

  if (isAdmin) {
    return (
      <div className="flex items-center gap-2">
        <span className="px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-mono font-bold whitespace-nowrap">
          {user?.name || 'Admin'} • ADMIN • UNLIMITED
        </span>
        <button
          onClick={handleLogout}
          className="px-3 py-1.5 rounded-lg bg-tv-hover border border-tv-border text-gray-400 hover:text-tv-red hover:border-tv-red/50 text-xs font-mono font-bold whitespace-nowrap transition-colors"
        >
          Logout
        </button>
      </div>
    );
  }

  // Sudah login Telegram tapi bukan admin - tetap kena kuota free-tier biasa,
  // jumlah sisanya sudah ditampilkan Header lewat badge "Sisa analisa gratis" (lib/limits.ts).
  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-mono font-bold whitespace-nowrap">
          {user.name} • Free
        </span>
        <button
          onClick={handleLogout}
          className="px-3 py-1.5 rounded-lg bg-tv-hover border border-tv-border text-gray-400 hover:text-tv-red hover:border-tv-red/50 text-xs font-mono font-bold whitespace-nowrap transition-colors"
        >
          Logout
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div ref={widgetRef} />
      {/* Dev backdoor for localhost since widget might not render */}
      {process.env.NODE_ENV === 'development' && (
        <button 
          onClick={() => {
            document.cookie = `sahamlens_user=${encodeURIComponent(JSON.stringify({id:"660211525",name:"Admin (Dev)",username:"admin_dev"}))}; path=/`;
            document.cookie = "role=admin; path=/";
            document.cookie = "saham_admin=true; path=/";
            window.location.reload();
          }}
          className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 text-xs font-mono font-bold whitespace-nowrap hover:bg-purple-500/20"
        >
          Dev: Force Admin
        </button>
      )}
    </div>
  );
}

import '../../app/globals.css';
import localFont from 'next/font/local';
import React from 'react';
import AppShell from '@/components/AppShell';
import NativeFetchBridge from './native-fetch-bridge';
import NativeNavigationBridge from './native-navigation-bridge';
import DesktopChrome from './desktop-chrome';

const inter = localFont({
  src: [
    { path: '../../app/fonts/inter-latin-wght-normal.woff2', weight: '100 900', style: 'normal' },
    { path: '../../app/fonts/inter-latin-wght-italic.woff2', weight: '100 900', style: 'italic' },
  ],
  variable: '--font-inter-src',
  display: 'swap',
  fallback: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
});

const jetbrainsMono = localFont({
  src: [{ path: '../../app/fonts/jetbrains-mono-latin-wght-normal.woff2', weight: '100 800', style: 'normal' }],
  variable: '--font-jetbrains-mono-src',
  display: 'swap',
  fallback: ['Consolas', 'Menlo', 'Liberation Mono', 'monospace'],
});

const bootScript = `(function(){var d=document.documentElement;try{var saved=localStorage.getItem('sahamlens_theme');var system=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var theme=saved==='light'||saved==='dark'?saved:system;d.classList.add(theme);d.style.colorScheme=theme;}catch(e){d.classList.add('dark');}try{var lang=localStorage.getItem('sahamlens_lang');if(lang==='en'||lang==='id')d.lang=lang;}catch(e){}})()`;

export default function DesktopRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: bootScript }} /></head>
      <body className={`${inter.className} bg-tv-bg text-tv-text antialiased min-h-screen relative selection:bg-tv-blue/25`}>
        <NativeFetchBridge />
        <NativeNavigationBridge />
        <DesktopChrome>
          <AppShell>{children}</AppShell>
        </DesktopChrome>
      </body>
    </html>
  );
}

'use client';

import { invoke } from '@tauri-apps/api/core';

const API_ORIGIN = 'https://sahamlens.id';
const LEGACY_SECRET_KEY = ['sahamlens.pro.', 'token'].join('');
const LEGACY_USER_KEY = 'sahamlens.pro.user';

type NativeResponse = {
  status: number;
  body: string;
  ok: boolean;
  headers: Record<string, string>;
};

declare global {
  interface Window {
    __SAHAMLENS_NATIVE_FETCH_INSTALLED__?: boolean;
  }
}

function apiEndpoint(request: Request): string | null {
  const url = new URL(request.url);
  const isBundledOrigin = url.origin === window.location.origin;
  if ((isBundledOrigin || url.origin === API_ORIGIN) && url.pathname.startsWith('/api/')) {
    return `${url.pathname}${url.search}`;
  }
  return null;
}

function requestFrom(input: RequestInfo | URL, init?: RequestInit): Request {
  if (input instanceof Request) return new Request(input, init);
  return new Request(new URL(String(input), window.location.href), init);
}

function headersFrom(request: Request): Record<string, string> {
  return Object.fromEntries(request.headers.entries());
}

function clearLegacyDesktopSession(): void {
  localStorage.removeItem(LEGACY_SECRET_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
}

function installNativeFetch(): void {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window) || window.__SAHAMLENS_NATIVE_FETCH_INSTALLED__) return;

  const browserFetch = window.fetch.bind(window);
  clearLegacyDesktopSession();
  window.__SAHAMLENS_NATIVE_FETCH_INSTALLED__ = true;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = requestFrom(input, init);
    const endpoint = apiEndpoint(request);
    if (!endpoint) return browserFetch(request);

    const method = request.method.toUpperCase();
    const body = method === 'GET' || method === 'HEAD' ? undefined : await request.clone().text();
    const headers = headersFrom(request);
    let result: NativeResponse;

    if (endpoint === '/api/auth/login') {
      result = await invoke<NativeResponse>('native_login', { body: body ?? '', headers });
    } else if (endpoint === '/api/auth/logout') {
      result = await invoke<NativeResponse>('native_logout', { headers });
    } else {
      result = await invoke<NativeResponse>('native_api_request', {
        endpoint,
        method,
        body,
        headers,
      });
    }

    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    });
  };
}

installNativeFetch();

export default function NativeFetchBridge() {
  return null;
}

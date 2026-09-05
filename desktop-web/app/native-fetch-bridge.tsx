'use client';

import { invoke } from '@tauri-apps/api/core';

const API_ORIGIN = 'https://sahamlens.id';
const TOKEN_STORAGE_KEY = 'sahamlens.pro.token';
const USER_STORAGE_KEY = 'sahamlens.pro.user';

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

function saveDesktopLogin(body: string): void {
  try {
    const data = JSON.parse(body);
    if (!data?.success || typeof data.token !== 'string') return;
    localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ email: data.email, role: data.role }));
  } catch {
    // A malformed successful login response is handled by the normal API client.
  }
}

function installNativeFetch(): void {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window) || window.__SAHAMLENS_NATIVE_FETCH_INSTALLED__) return;

  const browserFetch = window.fetch.bind(window);
  window.__SAHAMLENS_NATIVE_FETCH_INSTALLED__ = true;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = requestFrom(input, init);
    const endpoint = apiEndpoint(request);
    if (!endpoint) return browserFetch(request);

    const loginRequest = endpoint === '/api/auth/login';
    const nativeEndpoint = loginRequest ? '/api/auth/desktop/login' : endpoint;
    const method = request.method.toUpperCase();
    const body = method === 'GET' || method === 'HEAD' ? undefined : await request.clone().text();
    const token = localStorage.getItem(TOKEN_STORAGE_KEY) || undefined;
    const result = await invoke<NativeResponse>('native_api_request', {
      endpoint: nativeEndpoint,
      method,
      body,
      token,
      headers: headersFrom(request),
    });

    if (loginRequest && result.ok) saveDesktopLogin(result.body);
    if (endpoint === '/api/auth/logout' || (endpoint === '/api/auth/me' && result.status === 401)) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
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

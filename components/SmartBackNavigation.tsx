'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthUser } from '@/lib/hooks/useAuthUser';

const STACK_KEY = 'sahamlens.internal-history.v1';
const BASE_STATE_KEY = '__sahamlensBackBase';
const GUARD_STATE_KEY = '__sahamlensBackGuard';
const MAX_STACK = 50;

function currentRoute() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function readStack(): string[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STACK_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function writeStack(stack: string[]) {
  try {
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-MAX_STACK)));
  } catch {
    // sessionStorage can be unavailable in hardened/private browser modes.
  }
}

function isSameOriginReferrer() {
  if (!document.referrer) return false;
  try {
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Makes Android/browser Back behave like an app without hijacking normal
 * SahamLens navigation:
 * - internal SahamLens history -> native browser back
 * - direct/deep-link entry with no internal history -> /home when logged in,
 *   otherwise public landing page /
 *
 * A same-URL sentinel is only inserted for a true direct entry. That gives the
 * browser one local history entry to pop before it would leave SahamLens, so we
 * can apply the safe fallback without trapping ordinary internal navigation.
 */
export default function SmartBackNavigation() {
  const pathname = usePathname();
  const { loading, user } = useAuthUser();
  const authRef = useRef({ loading, user });
  const initializedRef = useRef(false);

  useEffect(() => {
    authRef.current = { loading, user };
  }, [loading, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const route = currentRoute();
    const stack = readStack();

    if (!initializedRef.current) {
      initializedRef.current = true;

      if (stack.length === 0) {
        writeStack([route]);

        // Only guard a genuine external/direct entry. Existing internal browser
        // history is allowed to behave normally.
        if (!isSameOriginReferrer() && !(history.state && history.state[GUARD_STATE_KEY])) {
          history.replaceState(
            { ...(history.state || {}), [BASE_STATE_KEY]: true },
            '',
            window.location.href,
          );
          history.pushState(
            { ...(history.state || {}), [GUARD_STATE_KEY]: true },
            '',
            window.location.href,
          );
        }
      }
      return;
    }

    const latest = readStack();
    if (latest[latest.length - 1] !== route) {
      writeStack([...latest, route]);
    }
  }, [pathname]);

  useEffect(() => {
    const onPopState = () => {
      const route = currentRoute();
      const stack = readStack();

      if (stack.length > 1) {
        const previous = stack[stack.length - 2];
        if (route === previous) {
          writeStack(stack.slice(0, -1));
          return;
        }

        // Covers multi-step browser history jumps while keeping the stack in
        // sync with the route that the browser actually restored.
        const priorIndex = stack.lastIndexOf(route, stack.length - 2);
        if (priorIndex >= 0) {
          writeStack(stack.slice(0, priorIndex + 1));
          return;
        }
      }

      // No SahamLens route remains behind the current page. Prevent a direct
      // deep-link Back from throwing the user out of the product.
      const fallback = authRef.current.user ? '/home' : '/';
      writeStack([fallback]);

      if (`${window.location.pathname}${window.location.search}` !== fallback) {
        window.location.replace(fallback);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return null;
}

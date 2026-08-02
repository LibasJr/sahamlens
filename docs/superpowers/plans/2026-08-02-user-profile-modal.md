# Modal Detail Profil User + User Aktif untuk Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking the username in the Sidebar footer opens a modal showing the logged-in user's profile (email, role, verification/Pro/trial status, member-since date) — and, only when their account role is `admin`, an additional "User Aktif Sekarang" section listing currently-active sessions.

**Architecture:** One new backend endpoint (`GET /api/user/profile`) reuses two functions that already exist (`getUserById` for the account row, `getActiveUsers` for presence) and combines them behind a single session check. One new frontend modal component fetches that endpoint on open; `Sidebar.tsx`'s previously-static footer name becomes a button that opens it.

**Tech Stack:** Next.js 14 App Router, TypeScript, Vitest, existing `modules/user` controller/`HttpResult` pattern, existing `shared/auth/presence.ts`.

## Global Constraints

- No new database columns — only fields already in the `users` table (`modules/user/types/user.types.ts`'s `User` interface: `email`, `role`, `is_verified`, `is_pro`, `created_at`, `trial_ends_at`) are shown.
- Admin section is gated by `session.role === 'admin'` (the account's own role, same check style as `checkProAccess`) — NOT the separate `isAdminServer()`/`ADMIN_COOKIE` system used by the pre-existing `/admin` page. Do not touch `app/admin/*` or `modules/user/service/admin.service.ts` in this plan.
- `getActiveUsers()` (`shared/auth/presence.ts`, already exists, already degrades to `[]` when Redis is unavailable) must be called AS-IS, not modified.
- Modal only, no new page/route for viewing the profile — matches the existing `PaywallModal.tsx` interaction style (overlay + panel, Escape to close, focus trap).
- Vitest resolves `@/*` (fixed in an earlier plan, `vitest.config.ts` at repo root) — but files INSIDE `modules/user/` already use relative imports in their own tests (see `modules/user/service/__tests__/auth.service.test.ts`); keep that same relative style for the new controller test, since it lives in the same module.

---

### Task 1: `GET /api/user/profile` endpoint

**Files:**
- Modify: `modules/user/controller/auth.controller.ts`
- Modify: `modules/user/index.ts`
- Create: `app/api/user/profile/route.ts`
- Test: `modules/user/controller/__tests__/auth.controller.test.ts` (new file)

**Interfaces:**
- Consumes: `getSession()` (`shared/auth/session.ts`, already imported in this controller file), `getUserById(id: string): Promise<User | null>` (`modules/user/repository/user.repository.ts`, already exists), `getActiveUsers(): Promise<PresenceEntry[]>` (`shared/auth/presence.ts`, already exists — `PresenceEntry = { id: string; email: string; role: string; lastSeen: string }`).
- Produces: `handleGetProfile(): Promise<HttpResult>`, exported from `modules/user`. Response body on success: `{ email: string; role: string; isPro: boolean; isVerified: boolean; trialEndsAt: string | null; createdAt: string; activeUsers?: PresenceEntry[] }` (`activeUsers` present only when `role === 'admin'`). Task 2's frontend modal fetches `GET /api/user/profile` and reads exactly these field names.

- [ ] **Step 1: Write the failing test**

Create `modules/user/controller/__tests__/auth.controller.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Path relatif terhadap file test ini (modules/user/controller/__tests__/) - pola
// sama dengan modules/user/service/__tests__/auth.service.test.ts, module ini
// butuh JWT_SECRET_KEY/DATABASE_URL nyata kalau tidak di-mock dulu.
vi.mock('../../../../shared/auth/session', () => ({
  getSession: vi.fn(),
}));
vi.mock('../../repository/user.repository', () => ({
  getUserById: vi.fn(),
}));
vi.mock('../../../../shared/auth/presence', () => ({
  getActiveUsers: vi.fn(),
}));

import { handleGetProfile } from '../auth.controller';
import { getSession } from '../../../../shared/auth/session';
import { getUserById } from '../../repository/user.repository';
import { getActiveUsers } from '../../../../shared/auth/presence';
import type { User } from '../../types/user.types';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'user@test.com',
    password_hash: 'hash',
    role: 'free',
    is_verified: true,
    is_pro: false,
    created_at: '2026-01-15T00:00:00.000Z',
    trial_ends_at: null,
    demo_ends_at: null,
    verification_code: null,
    verification_code_expires: null,
    reset_code: null,
    reset_code_expires: null,
    ...overrides,
  };
}

describe('handleGetProfile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tanpa sesi -> 401', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const result = await handleGetProfile();

    expect(result.status).toBe(401);
    expect(getUserById).not.toHaveBeenCalled();
  });

  it('sesi ada tapi user sudah terhapus dari database -> 401', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'user-1', email: 'user@test.com', role: 'free', is_pro: false, trial_ends_at: null });
    vi.mocked(getUserById).mockResolvedValue(null);

    const result = await handleGetProfile();

    expect(result.status).toBe(401);
  });

  it('user biasa (bukan admin) -> 200 tanpa field activeUsers, getActiveUsers tidak dipanggil', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'user-1', email: 'user@test.com', role: 'free', is_pro: false, trial_ends_at: null });
    vi.mocked(getUserById).mockResolvedValue(makeUser({ role: 'free', is_pro: true, trial_ends_at: '2026-12-31T00:00:00.000Z' }));

    const result = await handleGetProfile();

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      email: 'user@test.com',
      role: 'free',
      isPro: true,
      isVerified: true,
      trialEndsAt: '2026-12-31T00:00:00.000Z',
      createdAt: '2026-01-15T00:00:00.000Z',
    });
    expect(getActiveUsers).not.toHaveBeenCalled();
  });

  it('user admin -> 200 DENGAN field activeUsers dari getActiveUsers', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'user-2', email: 'admin@test.com', role: 'admin', is_pro: true, trial_ends_at: null });
    vi.mocked(getUserById).mockResolvedValue(makeUser({ id: 'user-2', email: 'admin@test.com', role: 'admin' }));
    const activeList = [{ id: 'user-2', email: 'admin@test.com', role: 'admin', lastSeen: '2026-08-02T10:00:00.000Z' }];
    vi.mocked(getActiveUsers).mockResolvedValue(activeList);

    const result = await handleGetProfile();

    expect(result.status).toBe(200);
    expect((result.body as any).activeUsers).toEqual(activeList);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run modules/user/controller/__tests__/auth.controller.test.ts`
Expected: FAIL — `handleGetProfile` is not exported from `../auth.controller` yet.

- [ ] **Step 3: Add `handleGetProfile` to the controller**

Modify `modules/user/controller/auth.controller.ts` — add these two imports to the existing import block at the top of the file:

```typescript
import { getUserById } from '../repository/user.repository';
import { getActiveUsers } from '../../../shared/auth/presence';
```

Then add this function at the end of the file, after the existing `handleMe`:

```typescript
export async function handleGetProfile(): Promise<HttpResult> {
  const session = await getSession();
  if (!session) return { status: 401, body: { error: 'Belum login' } };

  const user = await getUserById(session.id);
  if (!user) return { status: 401, body: { error: 'Belum login' } };

  const body: Record<string, unknown> = {
    email: user.email,
    role: user.role,
    isPro: user.is_pro,
    isVerified: user.is_verified,
    trialEndsAt: user.trial_ends_at,
    createdAt: user.created_at,
  };

  if (user.role === 'admin') {
    body.activeUsers = await getActiveUsers();
  }

  return { status: 200, body };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run modules/user/controller/__tests__/auth.controller.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Export from the module's public API**

Modify `modules/user/index.ts` — change the `handleMe` export line to also export `handleGetProfile`:

```typescript
export {
  handleLogin,
  handleSignup,
  handleVerify,
  handleForgotPassword,
  handleResetPassword,
  handleLogout,
  handleMe,
  handleGetProfile,
} from './controller/auth.controller';
```

- [ ] **Step 6: Create the route**

Create `app/api/user/profile/route.ts`:

```typescript
import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { handleGetProfile } from '@/modules/user';

export async function GET() {
  return runController(async () => handleGetProfile());
}
```

- [ ] **Step 7: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Run the full test suite (regression check)**

Run: `npx vitest run`
Expected: all tests pass, count is the pre-existing baseline plus the 4 new tests in this task.

- [ ] **Step 9: Commit**

```bash
git add modules/user/controller/auth.controller.ts modules/user/controller/__tests__/auth.controller.test.ts modules/user/index.ts app/api/user/profile/route.ts
git commit -m "feat: tambah endpoint GET /api/user/profile (detail profil + user aktif untuk admin)"
```

---

### Task 2: `UserProfileModal` component + wire up in `Sidebar.tsx`

**Files:**
- Create: `components/UserProfileModal.tsx`
- Modify: `components/Sidebar.tsx`

**Interfaces:**
- Consumes: `GET /api/user/profile` (Task 1's output) — response shape `{ email, role, isPro, isVerified, trialEndsAt, createdAt, activeUsers? }`.

- [ ] **Step 1: Create the modal component**

Create `components/UserProfileModal.tsx`:

```tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, User, ShieldCheck, Users, Loader2 } from 'lucide-react';

interface ProfileData {
  email: string;
  role: string;
  isPro: boolean;
  isVerified: boolean;
  trialEndsAt: string | null;
  createdAt: string;
  activeUsers?: { id: string; email: string; role: string; lastSeen: string }[];
}

interface UserProfileModalProps {
  open: boolean;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 1) return 'baru saja';
  if (minutes === 1) return '1 menit lalu';
  return `${minutes} menit lalu`;
}

// Struktur overlay/panel sama dengan components/PaywallModal.tsx (focus trap, Escape
// untuk tutup) - kontennya beda (info profil, bukan ajakan upgrade/daftar) jadi
// komponen terpisah, bukan reuse PaywallModal yang props-nya spesifik untuk paywall.
export default function UserProfileModal({ open, onClose }: UserProfileModalProps) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch('/api/user/profile')
      .then((res) => {
        if (res.status === 401) {
          onClose();
          return null;
        }
        return res.json();
      })
      .then((json) => { if (json) setData(json); })
      .catch(() => setError('Gagal memuat profil'))
      .finally(() => setLoading(false));
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const container = modalRef.current;
      if (!container) return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      ).filter((el) => !el.hasAttribute('disabled'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Detail Profil"
            className="relative w-full max-w-md bg-tv-bg border border-tv-blue/40 rounded-xl shadow-2 p-6 overflow-hidden max-h-[85vh] overflow-y-auto"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-tv-muted hover:text-tv-text transition-colors"
              aria-label="Tutup"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-lg bg-tv-blue flex items-center justify-center mb-4">
              <User className="w-6 h-6 text-white" />
            </div>

            <h3 className="font-heading text-xl font-bold text-tv-text mb-4">Detail Profil</h3>

            {loading && (
              <div className="flex items-center gap-2 text-sm text-tv-muted py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Memuat profil...
              </div>
            )}

            {error && !loading && (
              <div className="text-sm text-tv-red py-4">{error}</div>
            )}

            {data && !loading && (
              <>
                <div className="space-y-3 mb-5">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-tv-muted">Email</span>
                    <span className="text-tv-text font-medium">{data.email}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-tv-muted">Role</span>
                    <span className="text-tv-text font-medium uppercase">{data.role}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-tv-muted">Status Verifikasi</span>
                    <span className={`flex items-center gap-1 font-medium ${data.isVerified ? 'text-tv-green' : 'text-tv-yellow'}`}>
                      <ShieldCheck className="w-3.5 h-3.5" /> {data.isVerified ? 'Terverifikasi' : 'Belum Terverifikasi'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-tv-muted">Status Akun</span>
                    <span className="text-tv-text font-medium">{data.isPro ? 'Pro' : 'Free'}</span>
                  </div>
                  {data.trialEndsAt && new Date(data.trialEndsAt) > new Date() && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-tv-muted">Trial Berakhir</span>
                      <span className="text-tv-text font-medium">{formatDate(data.trialEndsAt)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-tv-muted">Bergabung Sejak</span>
                    <span className="text-tv-text font-medium">{formatDate(data.createdAt)}</span>
                  </div>
                </div>

                {data.activeUsers && (
                  <div className="border-t border-tv-border pt-4">
                    <h4 className="font-heading text-sm font-bold text-tv-text flex items-center gap-2 mb-3">
                      <Users className="w-4 h-4 text-tv-blue" /> User Aktif Sekarang ({data.activeUsers.length})
                    </h4>
                    {data.activeUsers.length === 0 ? (
                      <p className="text-xs text-tv-muted">Tidak ada user lain yang aktif saat ini.</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                        {data.activeUsers.map((u) => (
                          <div key={u.id} className="flex items-center justify-between text-xs bg-tv-card border border-tv-border rounded-md px-3 py-2">
                            <div className="min-w-0">
                              <div className="text-tv-text font-medium truncate">{u.email}</div>
                              <div className="text-tv-muted uppercase text-[10px]">{u.role}</div>
                            </div>
                            <span className="text-tv-muted shrink-0 ml-2">{timeAgo(u.lastSeen)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Wire it into `Sidebar.tsx`**

Modify `components/Sidebar.tsx`. Add the import at the top (after the existing `pickTrendingTicker, getTickerName` import):

```typescript
import UserProfileModal from './UserProfileModal';
```

Add new state right after the existing `councilTicker` state declaration:

```typescript
  const [showProfileModal, setShowProfileModal] = useState(false);
```

Replace the footer user block:

```typescript
          {user && (
            <div className={`flex items-center gap-2 rounded-lg bg-white/[0.03] ${isCollapsed ? 'md:justify-center md:px-0 px-2.5' : 'px-2.5'} py-2`}>
              <div className="w-7 h-7 rounded-full bg-tv-blue/15 text-tv-blue flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5" />
              </div>
              <div className={`flex-1 min-w-0 ${isCollapsed ? 'md:hidden' : ''}`}>
                <p className="text-xs font-medium text-white truncate">{user.email?.split('@')[0]}</p>
                <p className="text-[9px] uppercase tracking-wide text-white/35">{user.role}</p>
              </div>
              <button
                onClick={handleLogout}
                title="Logout"
                className={`shrink-0 p-1.5 rounded-md text-white/40 hover:text-tv-red hover:bg-tv-red/10 transition-colors ${isCollapsed ? 'md:hidden' : ''}`}
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
```

with:

```typescript
          {user && (
            <div className={`flex items-center gap-2 rounded-lg bg-white/[0.03] ${isCollapsed ? 'md:justify-center md:px-0 px-2.5' : 'px-2.5'} py-2`}>
              <button
                type="button"
                onClick={() => setShowProfileModal(true)}
                title="Lihat detail profil"
                className={`flex items-center gap-2 flex-1 min-w-0 text-left rounded-md transition-colors hover:bg-white/[0.04] ${isCollapsed ? 'justify-center' : ''}`}
              >
                <div className="w-7 h-7 rounded-full bg-tv-blue/15 text-tv-blue flex items-center justify-center shrink-0">
                  <User className="w-3.5 h-3.5" />
                </div>
                <div className={`flex-1 min-w-0 ${isCollapsed ? 'md:hidden' : ''}`}>
                  <p className="text-xs font-medium text-white truncate">{user.email?.split('@')[0]}</p>
                  <p className="text-[9px] uppercase tracking-wide text-white/35">{user.role}</p>
                </div>
              </button>
              <button
                onClick={handleLogout}
                title="Logout"
                className={`shrink-0 p-1.5 rounded-md text-white/40 hover:text-tv-red hover:bg-tv-red/10 transition-colors ${isCollapsed ? 'md:hidden' : ''}`}
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
```

(The logout `<button>` stays a separate sibling element with its own `onClick` — clicking it never bubbles into the new profile button, so logout behavior is unchanged.)

Finally, render the modal right before the closing `</aside>` tag (after the existing footer `<div>` block, still inside `<aside>...</aside>`):

```typescript
        </div>
      </aside>
      <UserProfileModal open={showProfileModal} onClose={() => setShowProfileModal(false)} />
    </>
  );
}
```

(This replaces the existing ending `</div>\n      </aside>\n    </>\n  );\n}` — the `<UserProfileModal>` line is new, everything else in this snippet already exists at the end of the file.)

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Run the full test suite (regression check)**

Run: `npx vitest run`
Expected: all tests pass, same count as after Task 1 (this task adds no automated tests — no frontend test convention exists in this codebase, per Global Constraints/spec).

- [ ] **Step 5: Manual browser verification**

Start the dev server if not already running (`npm run dev`), then in a browser:
1. Log in as a non-admin user, open any page with the Sidebar. Click the username in the footer — modal opens showing email, role, verification status, Pro/Free, member-since date. No "User Aktif Sekarang" section appears.
2. Click the logout icon next to the name — confirm it still logs out normally (didn't get swallowed by the new button).
3. Log in as a user whose `role` is `admin`. Click the username — modal now also shows "User Aktif Sekarang" with at least your own session listed (since visiting any page just called `getSession()` → `touchPresence()`).
4. Press Escape while the modal is open — confirm it closes.
5. Resize to mobile width — confirm the modal doesn't overflow the screen (the `max-h-[85vh] overflow-y-auto` on the panel).

- [ ] **Step 6: Commit**

```bash
git add components/UserProfileModal.tsx components/Sidebar.tsx
git commit -m "feat: tambah modal detail profil (klik nama di Sidebar) + section User Aktif untuk admin"
```

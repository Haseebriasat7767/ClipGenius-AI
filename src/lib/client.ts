'use client';

/** Client-side API helper + session hook. */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ApiErrorBody {
  code: string;
  message: string;
  [k: string]: unknown;
}

export class ApiClientError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/* ------------------------------------------------------------------ *
 * Bearer-token fallback.
 * Embedded previews render the app inside a cross-site iframe where the
 * browser blocks cookies. We mirror the session JWT in localStorage and send
 * it as an Authorization bearer so login works in every context. The HttpOnly
 * cookie remains the primary session mechanism for normal top-level use.
 * ------------------------------------------------------------------ */
const TOKEN_KEY = 'cg_session_token';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) — cookie path still works */
  }
}

/** Media/file URL that works even when cookies are blocked (?t= bearer). */
export function mediaUrl(storageKey: string | null | undefined): string {
  if (!storageKey) return '';
  const token = getAuthToken();
  return token
    ? `/api/media/${storageKey}?t=${encodeURIComponent(token)}`
    : `/api/media/${storageKey}`;
}

export function downloadUrl(clipId: string): string {
  const token = getAuthToken();
  return token
    ? `/api/clips/${clipId}/download?t=${encodeURIComponent(token)}`
    : `/api/clips/${clipId}/download`;
}

export async function api<T = unknown>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const token = getAuthToken();
  const method = (init?.method ?? 'GET').toUpperCase();
  const baseHeaders = {
    ...(init?.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers ?? {}),
  };
  const body = init?.json !== undefined ? JSON.stringify(init.json) : init?.body;
  const timeoutSignal =
    init?.signal ?? (typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(30_000) : undefined);

  let res: Response;
  try {
    res = await fetch(path, { ...init, signal: timeoutSignal, headers: baseHeaders, body });
  } catch (err) {
    // POST failed at transport level. Some embedded-preview proxies filter
    // POST; retry once as PUT (auth routes accept PUT as an alias).
    if (method === 'POST') {
      try {
        res = await fetch(path, {
          ...init,
          method: 'PUT',
          signal: timeoutSignal,
          headers: { ...baseHeaders, 'X-HTTP-Method-Override': 'POST' },
          body,
        });
      } catch {
        res = undefined as unknown as Response;
      }
    } else {
      res = undefined as unknown as Response;
    }
    if (!res) {
      // Surface a real, actionable error message instead of a generic one.
      const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
      throw new ApiClientError(
        0,
        timedOut ? 'timeout' : 'network',
        timedOut
          ? 'The server took too long to respond. Please try again.'
          : 'Could not reach the server. If the preview is waking up, wait a few seconds and try again.',
      );
    }
  }
  let payload: { ok: boolean; data?: T & { token?: string }; error?: ApiErrorBody } | null = null;
  try {
    payload = await res.json();
  } catch {
    throw new ApiClientError(res.status, 'bad_response', `Unexpected server response (${res.status})`);
  }
  if (!res.ok || !payload?.ok) {
    throw new ApiClientError(
      res.status,
      payload?.error?.code ?? 'error',
      payload?.error?.message ?? `Request failed (${res.status})`,
    );
  }
  // Persist the session token returned by login/register; drop it on logout.
  if (path === '/api/auth/login' || path === '/api/auth/register') {
    const t = (payload.data as { token?: string } | undefined)?.token;
    if (t) setAuthToken(t);
  } else if (path === '/api/auth/logout') {
    setAuthToken(null);
  }
  return payload.data as T;
}

/**
 * Quick transport probe used to explain network failures on auth forms:
 * can we reach the server at all, and do GET/POST survive the trip?
 */
export async function probeConnectivity(): Promise<string> {
  const probe = async (method: string): Promise<string> => {
    try {
      const r = await fetch('/api/system-status', {
        method,
        cache: 'no-store',
        ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}),
      });
      return `${method} ${r.status}`;
    } catch {
      return `${method} rejected`;
    }
  };
  return `[Diagnostics: ${await probe('GET')}, ${await probe('POST')}]`;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  plan: 'free' | 'creator' | 'pro' | 'agency';
}

export interface PlanInfo {
  id: string;
  name: string;
  priceMonthly: number;
  clipsPerMonth: number;
  maxProjectsPerMonth: number;
  maxSourceMinutes: number;
  maxUploadMb: number;
  exportMaxHeight: number;
  watermark: boolean;
  priorityQueue: boolean;
  features: string[];
}

export interface UsageInfo {
  clips_generated: number;
  minutes_processed: number;
  renders: number;
  storage_bytes: number;
  projects_this_month: number;
}

export function useSession() {
  const [state, setState] = useState<{
    user: SessionUser | null;
    plan: PlanInfo | null;
    usage: UsageInfo | null;
    loading: boolean;
  }>({ user: null, plan: null, usage: null, loading: true });

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ user: SessionUser | null; plan?: PlanInfo; usage?: UsageInfo }>('/api/auth/me');
      setState({
        user: data.user,
        plan: data.plan ?? null,
        usage: data.usage ?? null,
        loading: false,
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}

/** Poll an async resource while `active`. */
export function usePolling<T>(fn: () => Promise<T>, ms: number, active: boolean): T | null {
  const [data, setData] = useState<T | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const tick = async () => {
      try {
        const result = await fnRef.current();
        if (alive) setData(result);
      } catch {
        /* transient polling errors are fine */
      }
    };
    tick();
    const timer = setInterval(tick, ms);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [ms, active]);

  return data;
}

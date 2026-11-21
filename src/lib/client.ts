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

export async function api<T = unknown>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  let payload: { ok: boolean; data?: T; error?: ApiErrorBody } | null = null;
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
  return payload.data as T;
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

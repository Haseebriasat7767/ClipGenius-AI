'use client';

/**
 * Core UI primitives — dark premium design system.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { X, CheckCircle2, AlertTriangle, Info, Loader2 } from 'lucide-react';

export function cn(...inputs: Array<string | undefined | null | false>): string {
  return twMerge(clsx(inputs));
}

/* ------------------------------------------------------------------ Button */

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}) {
  const sizes = {
    sm: 'px-3.5 py-2 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-7 py-3.5 text-base',
  };
  return (
    <button
      className={cn(
        variant === 'primary' && 'btn-primary',
        variant === 'secondary' && 'btn-secondary',
        variant === 'danger' && 'btn-danger',
        variant === 'ghost' &&
          'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50',
        sizes[size],
        className,
      )}
      disabled={props.disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({
  className,
  children,
  hover,
  padding = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean; padding?: boolean }) {
  return (
    <div
      className={cn('card', padding !== false && 'p-6', hover && 'card-hover cursor-pointer', className)}
      {...props}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------- Input */

export function Input({
  className,
  label,
  hint,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="w-full">
      {label && <label className="label">{label}</label>}
      <input className={cn('input-base', error && 'border-danger/60', className)} {...props} />
      {hint && !error && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function Textarea({
  className,
  label,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <div className="w-full">
      {label && <label className="label">{label}</label>}
      <textarea className={cn('input-base min-h-[90px] resize-y', className)} {...props} />
    </div>
  );
}

export function Select({
  className,
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <div className="w-full">
      {label && <label className="label">{label}</label>}
      <select className={cn('input-base appearance-none cursor-pointer', className)} {...props}>
        {children}
      </select>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 rounded-xl border border-white/[0.07] bg-ink-900/50 px-4 py-3 text-left transition hover:border-white/15"
    >
      <span>
        <span className="block text-sm font-medium text-gray-100">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-gray-500">{description}</span>}
      </span>
      <span
        className={cn(
          'mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors',
          checked ? 'bg-brand-500' : 'bg-white/10',
        )}
      >
        <span
          className={cn(
            'h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ Badge */

export function Badge({
  children,
  color = 'default',
  className,
}: {
  children: React.ReactNode;
  color?: 'default' | 'green' | 'yellow' | 'red' | 'purple' | 'blue';
  className?: string;
}) {
  const colors = {
    default: 'border-white/10 bg-white/[0.06] text-gray-300',
    green: 'border-success/30 bg-success/10 text-success',
    yellow: 'border-warning/30 bg-warning/10 text-warning',
    red: 'border-danger/30 bg-danger/10 text-danger',
    purple: 'border-brand-400/30 bg-brand-400/10 text-brand-300',
    blue: 'border-accent-400/30 bg-accent-400/10 text-accent-300',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
        colors[color],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- Progress */

export function Progress({
  value,
  className,
  color = 'brand',
}: {
  value: number;
  className?: string;
  color?: 'brand' | 'green' | 'red';
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-white/[0.08]', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-all duration-700',
          color === 'brand' && 'bg-brand-gradient',
          color === 'green' && 'bg-success',
          color === 'red' && 'bg-danger',
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand-300', className)} />;
}

/* ------------------------------------------------------------------ Modal */

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative w-full max-w-lg animate-fade-up p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Toast */

type ToastItem = { id: number; kind: 'success' | 'error' | 'info'; text: string };
const ToastCtx = createContext<{ push: (kind: ToastItem['kind'], text: string) => void }>({
  push: () => {},
});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((kind: ToastItem['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 5200);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex w-[min(380px,90vw)] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'card pointer-events-auto flex items-start gap-3 p-4 animate-fade-up',
              t.kind === 'success' && 'border-success/40',
              t.kind === 'error' && 'border-danger/40',
            )}
          >
            {t.kind === 'success' && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />}
            {t.kind === 'error' && <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />}
            {t.kind === 'info' && <Info className="mt-0.5 h-5 w-5 shrink-0 text-accent-300" />}
            <p className="text-sm text-gray-200">{t.text}</p>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------------------------------------------- Tabs */

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-white/[0.07] bg-ink-900/60 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'flex-1 rounded-lg px-4 py-2 text-sm font-medium transition',
            active === t.id
              ? 'bg-brand-gradient text-white shadow-glow'
              : 'text-gray-400 hover:bg-white/[0.05] hover:text-gray-200',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

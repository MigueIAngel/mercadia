'use client';

import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useToasts } from '@/lib/toast';

const styles = {
  success: { icon: CheckCircle2, color: 'text-emerald-500', bar: 'bg-emerald-500' },
  error: { icon: XCircle, color: 'text-rose-500', bar: 'bg-rose-500' },
  info: { icon: Info, color: 'text-sky-500', bar: 'bg-sky-500' },
};

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 sm:top-20 sm:bottom-auto"
    >
      {toasts.map((t) => {
        const { icon: Icon, color, bar } = styles[t.kind];
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto relative flex animate-slide-in-right items-start gap-3 overflow-hidden rounded-2xl bg-white p-4 pr-10 shadow-xl ring-1 ring-stone-200"
          >
            <Icon className={`h-5 w-5 shrink-0 ${color}`} />
            <p className="text-sm">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="absolute top-3 right-3 rounded-full p-1 text-stone-400 hover:bg-stone-100"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
            <span
              className={`absolute bottom-0 left-0 h-0.5 w-full origin-left ${bar}`}
              style={{
                animation: `toast-timer ${t.kind === 'error' ? 6 : 3.5}s linear forwards`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

/**
 * Thin bar at the top while the next page loads: it starts when an internal link is clicked
 * and completes when the URL changes (the App Router has no navigation events).
 */
function Bar() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = (e.target as Element).closest?.('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      clearTimeout(timer.current);
      setState('loading');
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    setState((s) => (s === 'loading' ? 'done' : s));
    timer.current = setTimeout(() => setState('idle'), 450);
    return () => clearTimeout(timer.current);
  }, [pathname, search]);

  if (state === 'idle') return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5">
      <div
        className="h-full bg-gradient-to-r from-accent-500 via-amber-400 to-accent-600 shadow-[0_0_10px_var(--color-accent-500)]"
        style={
          state === 'loading'
            ? { animation: 'nav-progress 8s cubic-bezier(0.1, 0.8, 0.2, 1) forwards' }
            : { width: '100%', opacity: 0, transition: 'opacity 0.3s ease 0.15s' }
        }
      />
    </div>
  );
}

export function NavigationProgress() {
  return (
    <Suspense>
      <Bar />
    </Suspense>
  );
}

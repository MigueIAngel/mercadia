'use client';

import { useEffect, useRef } from 'react';

/**
 * Fades its content in when it scrolls into view (once). `delay` staggers siblings.
 * Without JavaScript the CSS never hides anything because the attribute is set on mount.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li';
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Already visible on first paint: show without hiding it first (no flash).
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      el.dataset.reveal = 'shown';
      el.animate?.(
        [
          { opacity: 0, transform: 'translateY(16px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 500, delay, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' },
      );
      return;
    }
    el.dataset.reveal = 'hidden';
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.dataset.reveal = 'shown';
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);
  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={className}
      style={{ '--reveal-delay': `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}

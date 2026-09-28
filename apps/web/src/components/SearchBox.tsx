'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';

interface Suggestion {
  slug: string;
  title: string;
  image?: string;
}

/** Search box with debounced autocomplete (Atlas Search on the catalog service). */
export function SearchBox({ initial = '' }: { initial?: string }) {
  const t = useTranslations('nav');
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setItems([]);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/bff/products/suggest?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (res.ok) setItems(await res.json());
      } catch {
        /* aborted */
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setOpen(false);
    if (active >= 0 && items[active]) return router.push(`/p/${items[active].slug}`);
    router.push(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/search');
  };

  return (
    <form ref={box} onSubmit={submit} role="search" className="relative w-full">
      <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-stone-400" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, items.length - 1));
          if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, -1));
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={t('search')}
        aria-label={t('search')}
        aria-expanded={open && items.length > 0}
        aria-controls="search-suggestions"
        role="combobox"
        className="w-full rounded-full border border-stone-300 bg-white py-2.5 pr-4 pl-10 text-sm outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
      />
      {open && items.length > 0 && (
        <ul
          id="search-suggestions"
          role="listbox"
          className="absolute z-40 mt-2 w-full overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-stone-200"
        >
          {items.map((item, i) => (
            <li key={item.slug} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  router.push(`/p/${item.slug}`);
                }}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-stone-50 ${i === active ? 'bg-stone-100' : ''}`}
              >
                {item.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image}
                    alt=""
                    className="h-9 w-9 rounded-lg bg-stone-100 object-contain"
                  />
                )}
                <span className="line-clamp-1">{item.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

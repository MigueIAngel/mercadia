'use client';

import clsx from 'clsx';
import { Link, usePathname } from '@/i18n/navigation';

/** Side menu of the seller center; the current section is highlighted. */
export function SellerNav({ links }: { links: (readonly [string, string])[] }) {
  const pathname = usePathname();
  // The most specific link that matches wins (/seller/products/new over /seller/products).
  const active = links
    .map(([href]) => href)
    .filter((href) => pathname === href || (href !== '/seller' && pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0];
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col">
      {links.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className={clsx(
            'relative rounded-xl px-3 py-2 text-sm whitespace-nowrap transition-all',
            href === active
              ? 'bg-white font-semibold text-ink shadow-sm ring-1 ring-stone-200 lg:pl-5'
              : 'text-stone-600 hover:bg-white/70 hover:text-ink lg:hover:pl-4',
          )}
        >
          {href === active && (
            <span className="absolute top-1/2 left-2 hidden h-4 w-1 -translate-y-1/2 animate-scale-in rounded-full bg-accent-500 lg:block" />
          )}
          {label}
        </Link>
      ))}
    </nav>
  );
}

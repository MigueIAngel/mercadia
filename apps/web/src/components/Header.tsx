import { ShoppingCart } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { api, currency, session } from '@/lib/api';
import type { Category } from '@/lib/types';
import { AccountMenu } from './AccountMenu';
import { CurrencySwitch, LanguageSwitch } from './Preferences';
import { SearchBox } from './SearchBox';

export async function Header() {
  const t = await getTranslations('nav');
  const locale = (await getLocale()) as 'es' | 'en';
  const [user, cur, categories, cart] = await Promise.all([
    session(),
    currency(),
    api<Category[]>('/categories', { auth: false, revalidate: 300 }).catch(() => [] as Category[]),
    api<{ count: number }>('/cart/count').catch(() => ({ count: 0 })),
  ]);

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-display text-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className="h-9 w-9" />
          <span className="hidden sm:inline">Mercadia</span>
        </Link>
        <div className="flex-1">
          <SearchBox />
        </div>
        <nav className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">
            <CurrencySwitch current={cur} />
            <LanguageSwitch />
          </div>
          <Link
            href="/cart"
            className="relative rounded-full p-2 hover:bg-stone-100"
            aria-label={t('cart')}
          >
            <ShoppingCart className="h-5 w-5" />
            {cart.count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-white">
                {cart.count}
              </span>
            )}
          </Link>
          {user ? (
            <AccountMenu name={user.name} roles={user.roles} />
          ) : (
            <Link href="/login" className="btn-primary px-4 py-2">
              {t('login')}
            </Link>
          )}
        </nav>
      </div>
      <div className="mx-auto hidden max-w-7xl gap-5 overflow-x-auto px-4 pb-2.5 text-sm text-stone-600 md:flex">
        {categories.map((c) => (
          <Link
            key={c.slug}
            href={`/search?category=${c.slug}`}
            className="whitespace-nowrap hover:text-ink"
          >
            {c.name[locale]}
          </Link>
        ))}
        <Link
          href="/search?onSale=true"
          className="font-semibold whitespace-nowrap text-accent-600"
        >
          {t('deals')}
        </Link>
        <Link href="/sell" className="ml-auto whitespace-nowrap hover:text-ink">
          {t('sell')}
        </Link>
      </div>
    </header>
  );
}

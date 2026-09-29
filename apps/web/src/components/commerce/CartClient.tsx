'use client';

import { Minus, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import type { Currency } from '@mercadia/contracts';
import { Link, useRouter } from '@/i18n/navigation';
import { call } from '@/lib/client';
import { money } from '@/lib/format';
import type { CartView } from '@/lib/types';

export function CartClient({ currency, signedIn }: { currency: Currency; signedIn: boolean }) {
  const t = useTranslations('cart');
  const locale = useLocale();
  const router = useRouter();
  const [cart, setCart] = useState<CartView | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(
    async () => setCart(await call<CartView>(`/api/bff/cart?currency=${currency}`)),
    [currency],
  );
  useEffect(() => void load().catch((e) => setError(e.message)), [load]);

  const update = async (sku: string, quantity: number) => {
    setError('');
    try {
      if (quantity <= 0)
        await call(`/api/bff/cart/items/${encodeURIComponent(sku)}`, { method: 'DELETE' });
      else
        await call(`/api/bff/cart/items/${encodeURIComponent(sku)}`, {
          method: 'PATCH',
          body: { quantity },
        });
      await load();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!cart)
    return (
      <div className="space-y-3" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-28 rounded-3xl" />
        ))}
      </div>
    );
  if (cart.count === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-stone-600">{t('empty')}</p>
        <Link href="/search" className="btn-primary mt-4">
          {t('keepShopping')}
        </Link>
      </div>
    );
  }
  const fmt = (n: number) => money(n, cart.currency, locale);
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        {cart.unavailable.length > 0 && (
          <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
            {t('unavailable')}
          </p>
        )}
        {cart.stores.map((store) => (
          <section key={store.storeId} className="card p-5">
            <p className="mb-3 text-sm font-semibold text-stone-500">
              {t('soldBy', { store: store.storeName })}
            </p>
            <ul className="divide-y divide-stone-100">
              {store.lines.map((line) => (
                <li key={line.sku} className="flex gap-4 py-3">
                  <div className="h-20 w-20 shrink-0 rounded-2xl bg-stone-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {line.image && (
                      <img src={line.image} alt="" className="h-full w-full object-contain p-2" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-medium">{line.title}</p>
                    {Object.keys(line.options).length > 0 && (
                      <p className="text-xs text-stone-500">
                        {Object.entries(line.options)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' · ')}
                      </p>
                    )}
                    {!line.available && (
                      <p className="text-xs text-rose-600">Stock: {line.stock}</p>
                    )}
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex items-center rounded-full border border-stone-300 bg-white">
                        <button
                          type="button"
                          aria-label="-"
                          className="p-2"
                          onClick={() => update(line.sku, line.quantity - 1)}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm font-semibold">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label="+"
                          className="p-2"
                          onClick={() => update(line.sku, line.quantity + 1)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => update(line.sku, 0)}
                        className="flex items-center gap-1 text-xs text-stone-500 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {t('remove')}
                      </button>
                    </div>
                  </div>
                  <p className="font-semibold whitespace-nowrap">{fmt(line.total)}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <aside className="card h-fit space-y-3 p-5 lg:sticky lg:top-28">
        <div className="flex justify-between text-lg font-semibold">
          <span>{t('subtotal')}</span>
          <span>{fmt(cart.subtotal)}</span>
        </div>
        <p className="text-xs text-stone-500">{t('ivaIncluded', { amount: fmt(cart.tax) })}</p>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <Link
          href={signedIn ? '/checkout' : '/login?next=/checkout'}
          className="btn-accent w-full py-3"
        >
          {t('checkout')}
        </Link>
      </aside>
    </div>
  );
}

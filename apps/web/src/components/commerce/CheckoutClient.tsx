'use client';

import { MapPin } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import type { Currency } from '@mercadia/contracts';
import { useRouter } from '@/i18n/navigation';
import { call } from '@/lib/client';
import { money } from '@/lib/format';
import type { Address, CartView } from '@/lib/types';

const FIELDS = ['label', 'fullName', 'phone', 'line1', 'line2', 'city', 'department'] as const;

export function CheckoutClient({ currency }: { currency: Currency }) {
  const t = useTranslations('checkout');
  const locale = useLocale();
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [adding, setAdding] = useState(false);
  const [quote, setQuote] = useState<CartView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadAddresses = useCallback(async () => {
    const list = await call<Address[]>('/api/bff/addresses');
    setAddresses(list);
    setAdding(list.length === 0);
    setSelected((s) => s || list.find((a) => a.isDefault)?.id || list[0]?.id || '');
  }, []);
  useEffect(() => void loadAddresses().catch((e) => setError(e.message)), [loadAddresses]);

  const address = addresses.find((a) => a.id === selected);
  const payload = address && {
    currency,
    address: {
      fullName: address.fullName,
      phone: address.phone,
      line1: address.line1,
      ...(address.line2 && { line2: address.line2 }),
      city: address.city,
      department: address.department,
      country: 'CO',
    },
  };

  useEffect(() => {
    if (!payload) return;
    call<CartView>('/api/bff/checkout/quote', { body: payload }).then(setQuote, (e) =>
      setError(e.message),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, currency]);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    try {
      const form = Object.fromEntries(new FormData(e.currentTarget));
      const created = await call<Address>('/api/bff/addresses', {
        body: { ...form, country: 'CO', line2: form.line2 || undefined },
      });
      await loadAddresses();
      setSelected(created.id);
      setAdding(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const place = async () => {
    if (!payload) return;
    setBusy(true);
    setError('');
    try {
      const order = await call<{ id: string }>('/api/bff/checkout', { body: payload });
      router.push(`/pay/${order.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const fmt = (n: number) => money(n, currency, locale);
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <section className="card space-y-4 p-6">
        <h2 className="text-lg font-semibold">{t('address')}</h2>
        {addresses.map((a) => (
          <label
            key={a.id}
            className={`flex cursor-pointer gap-3 rounded-2xl p-4 ring-1 ${a.id === selected ? 'bg-accent-50 ring-accent-500' : 'ring-stone-200'}`}
          >
            <input
              type="radio"
              name="address"
              checked={a.id === selected}
              onChange={() => setSelected(a.id)}
              className="mt-1 accent-orange-500"
            />
            <span className="text-sm">
              <span className="flex items-center gap-1 font-semibold">
                <MapPin className="h-4 w-4" /> {a.label}
              </span>
              <span className="block">
                {a.fullName} · {a.phone}
              </span>
              <span className="block text-stone-600">
                {a.line1}
                {a.line2 && `, ${a.line2}`} — {a.city}, {a.department}
              </span>
            </span>
          </label>
        ))}
        {adding ? (
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f} className={f === 'line1' || f === 'line2' ? 'sm:col-span-2' : ''}>
                <label className="label" htmlFor={f}>
                  {t(f)}
                </label>
                <input
                  id={f}
                  name={f}
                  required={f !== 'line2'}
                  defaultValue={f === 'label' ? 'Casa' : undefined}
                  className="field"
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <button className="btn-primary">{t('save')}</button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="btn-outline">
            + {t('newAddress')}
          </button>
        )}
      </section>

      <aside className="card h-fit space-y-4 p-6 lg:sticky lg:top-28">
        <h2 className="text-lg font-semibold">{t('summary')}</h2>
        {!quote ? (
          <p className="text-sm text-stone-500">{t('chooseAddress')}</p>
        ) : (
          <>
            {quote.stores.map((s) => (
              <div key={s.storeId} className="border-b border-stone-100 pb-3 text-sm">
                <p className="font-semibold">{s.storeName}</p>
                <p className="flex justify-between text-stone-600">
                  <span>{s.lines.reduce((n, l) => n + l.quantity, 0)} × …</span>
                  <span>{fmt(s.subtotal)}</span>
                </p>
                <p className="flex justify-between text-stone-600">
                  <span>
                    {t('shipping')} · {t('eta', { days: s.etaDays ?? 5 })}
                  </span>
                  <span>{s.shipping ? fmt(s.shipping) : t('free')}</span>
                </p>
              </div>
            ))}
            <p className="flex justify-between text-xl font-bold">
              <span>{t('total')}</span>
              <span>{fmt(quote.total ?? quote.subtotal)}</span>
            </p>
          </>
        )}
        {error && (
          <p className="text-sm text-rose-600" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={!quote || busy}
          onClick={place}
          className="btn-accent w-full py-3"
        >
          {busy ? t('placing') : t('place')}
        </button>
      </aside>
    </div>
  );
}

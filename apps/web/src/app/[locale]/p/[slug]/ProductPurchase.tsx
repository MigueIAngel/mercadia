'use client';

import { Check, Minus, Plus, ShoppingCart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import type { Variant } from '@/lib/types';
import { toast } from '@/lib/toast';
import { Spinner } from '@/components/ui/Spinner';

interface Props {
  productId: string;
  options: { name: string; values: string[] }[];
  variants: Variant[];
}

/** Variant picker + quantity + add to cart (the cart lives in the orders service). */
export function ProductPurchase({ productId, options, variants }: Props) {
  const t = useTranslations('product');
  const router = useRouter();
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      options.map((o) => [
        o.name,
        variants.find((v) => v.stock > 0)?.options[o.name] ?? o.values[0],
      ]),
    ),
  );
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState<'idle' | 'busy' | 'added' | 'error'>('idle');
  const [error, setError] = useState('');

  const variant = useMemo(
    () =>
      variants.find((v) => options.every((o) => v.options[o.name] === selected[o.name])) ??
      variants[0],
    [variants, options, selected],
  );
  const stock = variant?.stock ?? 0;
  const label = (name: string) =>
    ['size', 'color'].includes(name) ? t(`option.${name}` as 'option.size') : name;

  const add = async (goToCart: boolean) => {
    setState('busy');
    setError('');
    const res = await fetch('/api/bff/cart/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, sku: variant.sku, quantity }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? 'Error');
      setState('error');
      return;
    }
    setState('added');
    if (!goToCart) toast.success(t('addedToast', { quantity }));
    router.refresh();
    if (goToCart) router.push('/cart');
    else setTimeout(() => setState('idle'), 2000);
  };

  return (
    <div className="space-y-5">
      {options.map((option) => (
        <fieldset key={option.name}>
          <legend className="mb-2 text-sm font-medium">
            {t('chooseOption', { name: label(option.name) })}
          </legend>
          <div className="flex flex-wrap gap-2">
            {option.values.map((value) => {
              const available = variants.some(
                (v) => v.options[option.name] === value && v.stock > 0,
              );
              const active = selected[option.name] === value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!available}
                  onClick={() => setSelected((s) => ({ ...s, [option.name]: value }))}
                  className={`min-w-12 rounded-xl border px-3 py-2 text-sm font-medium transition active:scale-95 ${
                    active
                      ? 'border-ink bg-ink text-white shadow-md'
                      : 'border-stone-300 bg-white hover:border-ink'
                  } disabled:cursor-not-allowed disabled:opacity-40 disabled:line-through`}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <p
        className={`text-sm font-medium ${stock === 0 ? 'text-rose-600' : stock <= 5 ? 'text-amber-600' : 'text-emerald-700'}`}
      >
        {stock === 0
          ? t('outOfStock')
          : stock <= 5
            ? t('lowStock', { count: stock })
            : t('inStock', { count: stock })}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-full border border-stone-300 bg-white">
          <button
            type="button"
            aria-label="-"
            className="p-3"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          >
            <Minus className="h-4 w-4" />
          </button>
          <span
            key={quantity}
            className="w-8 animate-pop text-center font-semibold"
            aria-live="polite"
          >
            {quantity}
          </span>
          <button
            type="button"
            aria-label="+"
            className="p-3"
            onClick={() => setQuantity((q) => Math.min(Math.max(1, stock), q + 1))}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          disabled={stock === 0 || state === 'busy'}
          onClick={() => add(false)}
          className={`btn-primary group flex-1 py-3 ${state === 'added' ? '!bg-emerald-600' : ''}`}
        >
          {state === 'busy' ? (
            <Spinner />
          ) : state === 'added' ? (
            <Check className="h-4 w-4 animate-pop" />
          ) : (
            <ShoppingCart className="h-4 w-4 transition-transform group-hover:-rotate-12" />
          )}
          {state === 'added' ? t('added') : t('addToCart')}
        </button>
        <button
          type="button"
          disabled={stock === 0 || state === 'busy'}
          onClick={() => add(true)}
          className="btn-accent py-3"
        >
          {t('buyNow')}
        </button>
      </div>
      {state === 'error' && <p className="animate-shake text-sm text-rose-600">{error}</p>}
    </div>
  );
}

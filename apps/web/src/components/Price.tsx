import type { Currency } from '@mercadia/contracts';
import { discountPercent, money } from '@/lib/format';

export function Price({
  amount,
  compareAt,
  currency,
  locale,
  size = 'md',
}: {
  amount: number;
  compareAt?: number | null;
  currency: Currency;
  locale: string;
  size?: 'md' | 'lg';
}) {
  const off = discountPercent(amount, compareAt ?? null);
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span className={size === 'lg' ? 'text-3xl font-bold' : 'text-lg font-bold'}>
        {money(amount, currency, locale)}
      </span>
      {off > 0 && (
        <>
          <span className="text-sm text-stone-400 line-through">
            {money(compareAt!, currency, locale)}
          </span>
          <span className="text-sm font-semibold text-emerald-600">-{off}%</span>
        </>
      )}
    </p>
  );
}

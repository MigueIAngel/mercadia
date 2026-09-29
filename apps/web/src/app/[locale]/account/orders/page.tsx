import { getLocale, getTranslations } from 'next-intl/server';
import { StatusPill } from '@/components/commerce/StatusPill';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { requireUser } from '@/lib/guard';
import type { OrderView } from '@/lib/types';

type OrderRow = OrderView & { items: { title: string; image: string | null; quantity: number }[] };

export default async function MyOrders() {
  await requireUser('/account/orders');
  const t = await getTranslations('orders');
  const locale = await getLocale();
  const orders = await api<OrderRow[]>('/orders');
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-10">
      <h1 className="font-display text-4xl">{t('title')}</h1>
      {orders.length === 0 && <p className="card p-8 text-center text-stone-500">{t('empty')}</p>}
      {orders.map((o) => (
        <Link
          key={o.id}
          href={`/account/orders/${o.id}`}
          className="card flex items-center gap-4 p-4 hover:shadow-md"
        >
          <div className="flex -space-x-3">
            {o.items.slice(0, 3).map((i, k) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={k}
                src={i.image ?? ''}
                alt=""
                className="h-14 w-14 rounded-2xl bg-stone-100 object-contain p-1 ring-2 ring-white"
              />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t('order', { number: o.number })}</p>
            <p className="truncate text-sm text-stone-500">
              {o.items.map((i) => i.title).join(', ')}
            </p>
            <p className="text-xs text-stone-400">
              {t('placedOn', { date: dateTime(o.createdAt, locale) })}
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{money(o.total, o.currency, locale)}</p>
            <StatusPill status={o.status} />
          </div>
        </Link>
      ))}
    </div>
  );
}

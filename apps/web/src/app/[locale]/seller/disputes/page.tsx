import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import type { DisputeView } from '@/lib/types';

export default async function SellerDisputes() {
  const t = await getTranslations('disputes');
  const to = await getTranslations('orders');
  const locale = await getLocale();
  const list = await api<DisputeView[]>('/disputes?as=seller');
  return (
    <div className="space-y-3">
      <h1 className="font-display text-3xl">{t('title')}</h1>
      {list.length === 0 && <p className="card p-8 text-center text-stone-500">{t('empty')}</p>}
      {list.map((d) => (
        <Link
          key={d.id}
          href={`/account/disputes/${d.id}`}
          className="card flex flex-wrap items-center justify-between gap-2 p-4 hover:shadow-md"
        >
          <span>
            <span className="font-semibold">{to(`reasons.${d.reason}` as 'reasons.damaged')}</span>
            <span className="block text-sm text-stone-500 line-clamp-1">{d.description}</span>
          </span>
          <span className="text-right text-sm">
            <span className="block font-semibold">
              {money(d.requestedAmount, d.currency, locale)}
            </span>
            <span className="block text-stone-500">
              {t(`status.${d.status}`)} · {dateTime(d.createdAt, locale)}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

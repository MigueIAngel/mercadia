import { getLocale, getTranslations } from 'next-intl/server';
import type { SellerProduct } from '@/components/seller/types';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import type { CurrentUser } from '@/lib/types';

export default async function SellerDashboard() {
  const t = await getTranslations('seller');
  const locale = await getLocale();
  const [me, products, sales] = await Promise.all([
    api<CurrentUser>('/users/me'),
    api<SellerProduct[]>('/seller/products'),
    api<{
      days: { day: string; revenueCop: number; orders: number }[];
      revenue30d: number;
      orders30d: number;
      toShip: number;
    }>('/seller/sales').catch(() => null),
  ]);
  const peak = Math.max(1, ...(sales?.days.map((d) => d.revenueCop) ?? [1]));
  const stats = [
    [t('stats.products'), products.length],
    [t('stats.active'), products.filter((p) => p.status === 'active').length],
    [t('stats.units'), products.reduce((n, p) => n + p.totalStock, 0)],
    [t('stats.sold'), products.reduce((n, p) => n + p.salesCount, 0)],
  ] as const;
  const low = products.filter((p) => p.lowStock && p.status === 'active');
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">{me.store?.name}</h1>
        <div className="flex gap-2">
          <Link href={`/s/${me.store?.slug}`} className="btn-outline">
            {t('viewStore')}
          </Link>
          <Link href="/seller/products/new" className="btn-accent">
            {t('newProduct')}
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="card p-5">
            <p className="text-sm text-stone-500">{label}</p>
            <p className="mt-1 text-3xl font-bold">{new Intl.NumberFormat(locale).format(value)}</p>
          </div>
        ))}
      </div>
      {sales && (
        <section className="card p-5">
          <div className="mb-4 flex flex-wrap gap-6">
            <p>
              <span className="block text-sm text-stone-500">{t('sales30')}</span>
              <span className="text-2xl font-bold">{money(sales.revenue30d, 'COP', locale)}</span>
            </p>
            <p>
              <span className="block text-sm text-stone-500">{t('orders30')}</span>
              <span className="text-2xl font-bold">{sales.orders30d}</span>
            </p>
            <p>
              <span className="block text-sm text-stone-500">{t('toShip')}</span>
              <span className="text-2xl font-bold text-accent-600">{sales.toShip}</span>
            </p>
          </div>
          <div className="flex h-32 items-end gap-1" role="img" aria-label={t('sales30')}>
            {sales.days.map((d) => (
              <div
                key={d.day}
                title={`${d.day}: ${money(d.revenueCop, 'COP', locale)}`}
                className="flex-1 rounded-t bg-accent-500/80 hover:bg-accent-600"
                style={{ height: `${Math.max(4, (d.revenueCop / peak) * 100)}%` }}
              />
            ))}
          </div>
        </section>
      )}
      {low.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 font-semibold text-amber-700">{t('lowStock')}</h2>
          <ul className="divide-y divide-stone-100 text-sm">
            {low.map((p) => (
              <li key={p.id} className="flex justify-between py-2">
                <Link href={`/seller/products/${p.id}`} className="hover:underline">
                  {p.title}
                </Link>
                <span className="font-semibold">{p.totalStock}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

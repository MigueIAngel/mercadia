import { getLocale, getTranslations } from 'next-intl/server';
import type { SellerProduct } from '@/components/seller/types';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import type { CurrentUser } from '@/lib/types';

export default async function SellerDashboard() {
  const t = await getTranslations('seller');
  const locale = await getLocale();
  const [me, products] = await Promise.all([
    api<CurrentUser>('/users/me'),
    api<SellerProduct[]>('/seller/products'),
  ]);
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

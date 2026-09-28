import { getLocale, getTranslations } from 'next-intl/server';
import type { SellerProduct } from '@/components/seller/types';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { money } from '@/lib/format';

const BADGE = {
  draft: 'bg-stone-100 text-stone-600',
  active: 'bg-emerald-50 text-emerald-700',
  archived: 'bg-stone-100 text-stone-400',
  blocked: 'bg-rose-50 text-rose-700',
};

export default async function SellerProducts() {
  const t = await getTranslations('seller');
  const locale = await getLocale();
  const products = await api<SellerProduct[]>('/seller/products');
  if (products.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-stone-500">{t('empty')}</p>
        <Link href="/seller/products/new" className="btn-accent mt-4">
          {t('newProduct')}
        </Link>
      </div>
    );
  }
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-stone-200 text-left text-stone-500">
          <tr>
            <th className="p-3">{t('products')}</th>
            <th className="p-3">{t('price')}</th>
            <th className="p-3">{t('stock')}</th>
            <th className="p-3">{t('sales')}</th>
            <th className="p-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {products.map((p) => (
            <tr key={p.id}>
              <td className="p-3">
                <Link
                  href={`/seller/products/${p.id}`}
                  className="flex items-center gap-3 hover:underline"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.image && (
                    <img
                      src={p.image}
                      alt=""
                      className="h-10 w-10 rounded-lg bg-stone-100 object-contain"
                    />
                  )}
                  <span className="line-clamp-1">{p.title}</span>
                </Link>
              </td>
              <td className="p-3 whitespace-nowrap">{money(p.price, p.currency, locale)}</td>
              <td className={`p-3 ${p.lowStock ? 'font-semibold text-amber-700' : ''}`}>
                {p.totalStock}
              </td>
              <td className="p-3">{p.salesCount}</td>
              <td className="p-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE[p.status]}`}
                >
                  {t(`status.${p.status}`)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

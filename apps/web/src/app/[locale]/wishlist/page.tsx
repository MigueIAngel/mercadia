import { TrendingDown } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ProductCard, ProductGrid } from '@/components/ProductCard';
import { WishlistRemove } from '@/components/WishlistRemove';
import { Link } from '@/i18n/navigation';
import { api, currency } from '@/lib/api';
import { requireUser } from '@/lib/guard';
import type { ProductSummary } from '@/lib/types';

interface SavedItem {
  productId: string;
  savedAt: string;
  dropPercent: number;
  product: ProductSummary | null;
}

export async function generateMetadata() {
  const t = await getTranslations('wishlist');
  return { title: t('title') };
}

export default async function WishlistPage() {
  await requireUser('/wishlist');
  const t = await getTranslations('wishlist');
  const items = await api<SavedItem[]>(`/wishlist?currency=${await currency()}`);
  const available = items.filter((i) => i.product);
  const drops = available.filter((i) => i.dropPercent > 0).length;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="font-display text-3xl">{t('title')}</h1>
      <p className="mt-1 text-sm text-stone-500">
        {t('count', { count: available.length })}
        {drops > 0 && ` · ${t('drops', { count: drops })}`}
      </p>
      {available.length === 0 ? (
        <div className="card mt-6 p-10 text-center">
          <p className="text-stone-500">{t('empty')}</p>
          <Link href="/search" className="btn-primary mt-4 px-5 py-2">
            {t('explore')}
          </Link>
        </div>
      ) : (
        <div className="mt-6">
          <ProductGrid>
            {available.map((item) => (
              <div key={item.productId} className="flex flex-col gap-2">
                <div className="flex min-h-8 items-center justify-between gap-2">
                  {item.dropPercent > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">
                      <TrendingDown className="h-3.5 w-3.5" />
                      {t('dropped', { percent: item.dropPercent })}
                    </span>
                  ) : (
                    <span />
                  )}
                  <WishlistRemove productId={item.productId} />
                </div>
                <ProductCard product={item.product!} />
              </div>
            ))}
          </ProductGrid>
        </div>
      )}
    </div>
  );
}

import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { ProductSummary } from '@/lib/types';
import { ProductCard, ProductGrid } from './ProductCard';

export async function ProductRail({
  title,
  items,
  href,
}: {
  title: string;
  items: ProductSummary[];
  href: string;
}) {
  const t = await getTranslations('home');
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-5 flex items-end justify-between gap-4">
        <h2 className="font-display text-3xl">{title}</h2>
        <Link href={href} className="text-sm font-semibold text-accent-600 hover:underline">
          {t('seeAll')} →
        </Link>
      </div>
      <ProductGrid>
        {items.slice(0, 8).map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </ProductGrid>
    </section>
  );
}

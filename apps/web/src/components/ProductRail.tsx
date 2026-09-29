import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { ProductSummary } from '@/lib/types';
import { ProductCard, ProductGrid } from './ProductCard';
import { Reveal } from './ui/Reveal';

export async function ProductRail({
  title,
  items,
  href,
}: {
  title: string;
  items: ProductSummary[];
  href?: string;
}) {
  const t = await getTranslations('home');
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-10">
      <Reveal className="mb-5 flex items-end justify-between gap-4">
        <h2 className="font-display text-3xl">{title}</h2>
        {href && (
          <Link
            href={href}
            className="group text-sm font-semibold text-accent-600 hover:text-accent-700"
          >
            {t('seeAll')}{' '}
            <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
          </Link>
        )}
      </Reveal>
      <ProductGrid>
        {items.slice(0, 8).map((p, i) => (
          <Reveal key={p.id} delay={(i % 4) * 70} className="h-full">
            <ProductCard product={p} />
          </Reveal>
        ))}
      </ProductGrid>
    </section>
  );
}

import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { discountPercent } from '@/lib/format';
import type { ProductSummary } from '@/lib/types';
import { Price } from './Price';
import { Rating } from './Rating';

/** Recycled from Shopfront (layout, hover lift, discount badge), now server-rendered. */
export async function ProductCard({
  product,
  priority = false,
}: {
  product: ProductSummary;
  priority?: boolean;
}) {
  const t = await getTranslations('product');
  const locale = await getLocale();
  const off = discountPercent(product.price, product.compareAt);
  const href = `/p/${product.slug}`;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-200 transition hover:-translate-y-1 hover:shadow-xl">
      <Link href={href} className="relative block aspect-square bg-stone-100">
        {product.image && (
          <Image
            src={product.image}
            alt={product.title}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            priority={priority}
            className="object-contain p-6 transition duration-300 group-hover:scale-105"
          />
        )}
        {off > 0 && (
          <span className="absolute top-3 left-3 rounded-full bg-accent-500 px-2.5 py-1 text-xs font-bold text-white">
            {t('off', { percent: off })}
          </span>
        )}
        {!product.inStock && (
          <span className="absolute top-3 right-3 rounded-full bg-ink/80 px-2.5 py-1 text-xs font-bold text-white">
            {t('outOfStock')}
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="truncate text-xs font-medium tracking-wide text-stone-500 uppercase">
          {product.brand ?? product.store.name}
        </p>
        <h3 className="line-clamp-2 font-medium">
          <Link href={href} className="hover:underline">
            {product.title}
          </Link>
        </h3>
        <Rating value={product.rating.avg} count={product.rating.count} />
        <div className="mt-auto pt-2">
          <Price
            amount={product.price}
            compareAt={product.compareAt}
            currency={product.currency}
            locale={locale}
          />
          <Link
            href={`/s/${product.store.slug}`}
            className="mt-1 block truncate text-xs text-stone-500 hover:text-ink"
          >
            {product.store.name}
          </Link>
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}

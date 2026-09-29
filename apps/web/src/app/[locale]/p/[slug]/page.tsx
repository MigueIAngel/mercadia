import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Price } from '@/components/Price';
import { ProductCard, ProductGrid } from '@/components/ProductCard';
import { Rating } from '@/components/Rating';
import { Link } from '@/i18n/navigation';
import { api, ApiError, currency, session } from '@/lib/api';
import type { ProductDetail, ProductSummary } from '@/lib/types';
import { Gallery } from './Gallery';
import { ProductPurchase } from './ProductPurchase';
import { ProductSocial } from './ProductSocial';
import { Reviews, type ReviewPage } from './Reviews';

async function load(slug: string) {
  try {
    return await api<ProductDetail>(`/products/${slug}?currency=${await currency()}`, {
      auth: false,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/p/[slug]'>): Promise<Metadata> {
  const product = await load((await params).slug);
  return {
    title: product.title,
    description: product.description.slice(0, 160),
    openGraph: { images: product.images.slice(0, 1) },
  };
}

export default async function ProductPage({ params }: PageProps<'/[locale]/p/[slug]'>) {
  const { slug } = await params;
  const product = await load(slug);
  const t = await getTranslations('product');
  const locale = await getLocale();
  const emptyReviews: ReviewPage = {
    summary: { avg: 0, count: 0, distribution: [0, 0, 0, 0, 0] },
    items: [],
    page: 1,
  };
  const [related, reviews, user] = await Promise.all([
    // Semantic neighbours from the AI service; the catalog's same-category list as fallback.
    api<{ items: ProductSummary[] }>(
      `/ai/similar/${product.id}?currency=${product.currency}&limit=4`,
      {
        auth: false,
        revalidate: 300,
      },
    )
      .then((r) => (r.items.length ? r.items : Promise.reject(new Error('empty'))))
      .catch(() =>
        api<ProductSummary[]>(`/products/${slug}/related?currency=${product.currency}`, {
          auth: false,
        }).catch(() => []),
      ),
    api<ReviewPage>(`/reviews/products/${product.id}`, { auth: false }).catch(() => emptyReviews),
    session(),
  ]);
  const specs = product.specs;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    image: product.images,
    description: product.description,
    brand: product.brand ?? undefined,
    offers: {
      '@type': 'Offer',
      priceCurrency: product.currency,
      price: (product.price / 100).toFixed(2),
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: product.store.name },
    },
    ...(product.rating.count > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: product.rating.avg,
        reviewCount: product.rating.count,
      },
    }),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="grid gap-10 lg:grid-cols-2">
        <Gallery images={product.images} title={product.title} />
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium tracking-wide text-stone-500 uppercase">
              {product.brand ?? product.store.name}
            </p>
            <h1 className="mt-1 font-display text-4xl leading-tight">{product.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-stone-500">
              <Rating value={product.rating.avg} />
              <a href="#reviews" className="hover:text-ink hover:underline">
                {t('reviews', { count: product.rating.count })}
              </a>
              <span>·</span>
              <span>{t('sold', { count: product.salesCount })}</span>
            </div>
          </div>
          <div>
            <Price
              amount={product.price}
              compareAt={product.compareAt}
              currency={product.currency}
              locale={locale}
              size="lg"
            />
            <p className="mt-1 text-xs text-stone-500">
              {t('ivaIncluded', { rate: Math.round(product.taxRate * 100) })}
            </p>
          </div>
          <ProductPurchase
            productId={product.id}
            options={product.options}
            variants={product.variants}
          />
          <ProductSocial
            productId={product.id}
            productSlug={product.slug}
            storeId={product.store.id}
            signedIn={!!user}
            ownStore={user?.storeId === product.store.id}
          />
          <Link
            href={`/s/${product.store.slug}`}
            className="card flex items-center gap-3 p-4 hover:shadow-md"
          >
            <span
              className="grid h-12 w-12 place-items-center rounded-2xl font-display text-xl text-white"
              style={{ background: product.store.accentColor ?? '#111827' }}
            >
              {product.store.name.slice(0, 1)}
            </span>
            <span className="flex-1">
              <span className="block text-xs text-stone-500">{t('soldBy')}</span>
              <span className="block font-semibold">{product.store.name}</span>
              {product.store.city && (
                <span className="block text-xs text-stone-500">{product.store.city}</span>
              )}
            </span>
            <span className="text-sm font-semibold text-accent-600">{t('visitStore')} →</span>
          </Link>
        </div>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <section className="card p-6">
          <h2 className="mb-3 font-display text-2xl">{t('description')}</h2>
          <p className="leading-relaxed whitespace-pre-line text-stone-700">
            {product.description}
          </p>
        </section>
        <section className="card p-6">
          <h2 className="mb-3 font-display text-2xl">{t('specs')}</h2>
          <dl className="space-y-2 text-sm">
            {specs.weightGrams && (
              <div className="flex justify-between gap-4">
                <dt className="text-stone-500">{t('weight')}</dt>
                <dd>
                  {specs.weightGrams >= 1000
                    ? `${(specs.weightGrams / 1000).toFixed(1)} kg`
                    : `${specs.weightGrams} g`}
                </dd>
              </div>
            )}
            {specs.dimensionsCm && (
              <div className="flex justify-between gap-4">
                <dt className="text-stone-500">{t('dimensions')}</dt>
                <dd>
                  {specs.dimensionsCm.width} × {specs.dimensionsCm.height} ×{' '}
                  {specs.dimensionsCm.depth} cm
                </dd>
              </div>
            )}
            {(
              [
                ['warranty', specs.warranty],
                ['shipping', specs.shipping],
                ['returns', specs.returnPolicy],
              ] as const
            ).map(([key, value]) =>
              value ? (
                <div key={key} className="flex justify-between gap-4">
                  <dt className="text-stone-500">{t(key)}</dt>
                  <dd className="text-right">{value}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </section>
      </div>

      <Reviews productId={product.id} initial={reviews} signedIn={!!user} />

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-5 font-display text-3xl">{t('related')}</h2>
          <ProductGrid>
            {related.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </ProductGrid>
        </section>
      )}
    </div>
  );
}

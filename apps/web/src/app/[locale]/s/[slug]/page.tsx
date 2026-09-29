import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ProductCard, ProductGrid } from '@/components/ProductCard';
import { Rating } from '@/components/Rating';
import { api, ApiError, currency } from '@/lib/api';
import type { SearchResult, StoreSummary } from '@/lib/types';

async function loadStore(slug: string) {
  try {
    return await api<StoreSummary>(`/stores/${slug}`, { auth: false, revalidate: 60 });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/s/[slug]'>): Promise<Metadata> {
  const store = await loadStore((await params).slug);
  return { title: store.name, description: store.description };
}

export default async function StorePage({ params }: PageProps<'/[locale]/s/[slug]'>) {
  const { slug } = await params;
  const store = await loadStore(slug);
  const t = await getTranslations('store');
  const locale = await getLocale();
  const [products, reputation] = await Promise.all([
    api<SearchResult>(`/products?store=${slug}&limit=48&currency=${await currency()}`, {
      auth: false,
    }),
    api<{ avg: number; count: number; replyRate: number }>(`/reputation/stores/${store.id}`, {
      auth: false,
      revalidate: 60,
    }).catch(() => null),
  ]);
  return (
    <div>
      <section
        className="border-b border-stone-200"
        style={{ background: `linear-gradient(120deg, ${store.accentColor}22, transparent 60%)` }}
      >
        <div className="mx-auto flex max-w-7xl items-center gap-5 px-4 py-10">
          <span
            className="grid h-20 w-20 place-items-center rounded-3xl font-display text-4xl text-white shadow-lg"
            style={{ background: store.accentColor }}
          >
            {store.name.slice(0, 1)}
          </span>
          <div>
            <h1 className="font-display text-4xl">{store.name}</h1>
            <p className="mt-1 text-stone-600">{store.description}</p>
            <p className="mt-1 text-sm text-stone-500">
              {store.city}
              {store.ownerName && ` · ${t('by', { name: store.ownerName })}`}
              {store.createdAt &&
                ` · ${t('since', { date: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(store.createdAt)) })}`}
            </p>
            {reputation && reputation.count > 0 && (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <Rating value={reputation.avg} count={reputation.count} />
                <span className="text-stone-500">
                  {t('replyRate', { percent: Math.round(reputation.replyRate * 100) })}
                </span>
              </p>
            )}
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h2 className="mb-5 font-display text-2xl">
          {t('products')} ({products.total})
        </h2>
        <ProductGrid>
          {products.items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </ProductGrid>
      </div>
    </div>
  );
}

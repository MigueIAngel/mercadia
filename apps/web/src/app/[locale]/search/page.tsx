import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { ProductCard, ProductGrid } from '@/components/ProductCard';
import { Link } from '@/i18n/navigation';
import { api, currency } from '@/lib/api';
import type { Category, SearchResult } from '@/lib/types';

type Params = Record<string, string | undefined>;
const FILTER_KEYS = [
  'q',
  'category',
  'subcategory',
  'store',
  'brand',
  'minPrice',
  'maxPrice',
  'onSale',
  'inStock',
  'sort',
];

function href(params: Params, patch: Params) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({
    ...params,
    ...patch,
    ...(!('page' in patch) && { page: undefined }),
  })) {
    if (v) next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `/search?${qs}` : '/search';
}

export async function generateMetadata({
  searchParams,
}: PageProps<'/[locale]/search'>): Promise<Metadata> {
  const q = (await searchParams).q;
  const t = await getTranslations('search');
  return { title: typeof q === 'string' ? t('resultsFor', { q }) : t('title') };
}

export default async function SearchPage({ searchParams }: PageProps<'/[locale]/search'>) {
  const raw = await searchParams;
  const params: Params = Object.fromEntries(
    FILTER_KEYS.concat('page').map((k) => [
      k,
      typeof raw[k] === 'string' ? (raw[k] as string) : undefined,
    ]),
  );
  const t = await getTranslations('search');
  const locale = (await getLocale()) as 'es' | 'en';
  const cur = await currency();

  const query = new URLSearchParams({ currency: cur, limit: '24' });
  for (const [k, v] of Object.entries(params)) if (v) query.set(k, v);
  const [result, categories] = await Promise.all([
    api<SearchResult>(`/products?${query}`, { auth: false }),
    api<Category[]>('/categories', { auth: false, revalidate: 300 }),
  ]);
  const activeCategory = categories.find((c) => c.slug === params.category);
  const hasFilters = FILTER_KEYS.some((k) => k !== 'sort' && params[k]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">
            {params.q
              ? t('resultsFor', { q: params.q })
              : (activeCategory?.name[locale] ?? t('title'))}
          </h1>
          <p className="text-sm text-stone-500">{t('count', { count: result.total })}</p>
        </div>
        <form className="flex items-center gap-2 text-sm" action={`/${locale}/search`}>
          {Object.entries(params).map(([k, v]) =>
            v && k !== 'sort' && k !== 'page' ? (
              <input key={k} type="hidden" name={k} value={v} />
            ) : null,
          )}
          <label htmlFor="sort" className="text-stone-500">
            {t('sort')}
          </label>
          <select
            id="sort"
            name="sort"
            defaultValue={params.sort ?? (params.q ? 'relevance' : 'bestselling')}
            className="field w-auto py-2"
          >
            {(
              ['relevance', 'bestselling', 'newest', 'price_asc', 'price_desc', 'rating'] as const
            ).map((s) => (
              <option key={s} value={s}>
                {t(`sorts.${s}`)}
              </option>
            ))}
          </select>
          <button className="btn-outline py-2">{t('apply')}</button>
        </form>
      </div>

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-6 text-sm">
          <div>
            <h2 className="mb-2 font-semibold">{t('category')}</h2>
            <ul className="space-y-1">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={href(params, { category: c.slug, subcategory: undefined })}
                    className={
                      c.slug === params.category
                        ? 'font-semibold text-accent-600'
                        : 'hover:underline'
                    }
                  >
                    {c.name[locale]} <span className="text-stone-400">({c.count})</span>
                  </Link>
                  {c.slug === params.category && (
                    <ul className="mt-1 ml-3 space-y-1">
                      {c.subcategories.map((s) => (
                        <li key={s.slug}>
                          <Link
                            href={href(params, { subcategory: s.slug })}
                            className={
                              s.slug === params.subcategory
                                ? 'font-semibold text-accent-600'
                                : 'text-stone-600 hover:underline'
                            }
                          >
                            {s.name[locale]} ({s.count})
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <form action={`/${locale}/search`} className="space-y-2">
            {Object.entries(params).map(([k, v]) =>
              v && !['minPrice', 'maxPrice', 'page'].includes(k) ? (
                <input key={k} type="hidden" name={k} value={v} />
              ) : null,
            )}
            <h2 className="font-semibold">
              {t('price')} ({cur})
            </h2>
            <div className="flex gap-2">
              <input
                name="minPrice"
                type="number"
                min={0}
                defaultValue={params.minPrice}
                placeholder={t('min')}
                className="field px-3 py-2"
              />
              <input
                name="maxPrice"
                type="number"
                min={0}
                defaultValue={params.maxPrice}
                placeholder={t('max')}
                className="field px-3 py-2"
              />
            </div>
            <button className="btn-outline w-full py-2">{t('apply')}</button>
          </form>

          <div className="space-y-2">
            <Link
              href={href(params, { onSale: params.onSale ? undefined : 'true' })}
              className="flex items-center gap-2"
            >
              <span
                className={`h-4 w-4 rounded border ${params.onSale ? 'border-ink bg-ink' : 'border-stone-300 bg-white'}`}
              />
              {t('onSale')}
            </Link>
            <Link
              href={href(params, { inStock: params.inStock ? undefined : 'true' })}
              className="flex items-center gap-2"
            >
              <span
                className={`h-4 w-4 rounded border ${params.inStock ? 'border-ink bg-ink' : 'border-stone-300 bg-white'}`}
              />
              {t('inStock')}
            </Link>
          </div>

          {result.facets.brands.length > 0 && (
            <div>
              <h2 className="mb-2 font-semibold">{t('brand')}</h2>
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {result.facets.brands.map((b) => (
                  <li key={b.name}>
                    <Link
                      href={href(params, { brand: params.brand === b.name ? undefined : b.name })}
                      className={
                        params.brand === b.name
                          ? 'font-semibold text-accent-600'
                          : 'hover:underline'
                      }
                    >
                      {b.name} <span className="text-stone-400">({b.count})</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasFilters && (
            <Link
              href={params.q ? `/search?q=${encodeURIComponent(params.q)}` : '/search'}
              className="block text-accent-600 hover:underline"
            >
              {t('clear')}
            </Link>
          )}
        </aside>

        <section>
          {result.items.length === 0 ? (
            <p className="card p-10 text-center text-stone-500">{t('noResults')}</p>
          ) : (
            <ProductGrid>
              {result.items.map((p, i) => (
                <ProductCard key={p.id} product={p} priority={i < 4} />
              ))}
            </ProductGrid>
          )}
          {result.pages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-3 text-sm">
              {result.page > 1 && (
                <Link
                  href={href(params, { page: String(result.page - 1) })}
                  className="btn-outline py-2"
                >
                  ← {t('prev')}
                </Link>
              )}
              <span className="text-stone-500">
                {t('page', { page: result.page, pages: result.pages })}
              </span>
              {result.page < result.pages && (
                <Link
                  href={href(params, { page: String(result.page + 1) })}
                  className="btn-outline py-2"
                >
                  {t('next')} →
                </Link>
              )}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}

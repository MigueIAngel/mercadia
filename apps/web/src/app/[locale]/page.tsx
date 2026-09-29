import { PackageCheck, ShieldCheck, Truck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ProductRail } from '@/components/ProductRail';
import { CountUp } from '@/components/ui/CountUp';
import { Reveal } from '@/components/ui/Reveal';
import { Link } from '@/i18n/navigation';
import { api, currency, session } from '@/lib/api';
import type { HomeData, ProductSummary } from '@/lib/types';

export default async function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = (await params) as { locale: 'es' | 'en' };
  const t = await getTranslations('home');
  const cur = await currency();
  const home = await api<HomeData>(`/storefront/home?currency=${cur}`, {
    auth: false,
    revalidate: 60,
  }).catch(() => null);
  // Signed-in shoppers get picks based on their wishlist and purchases (AI service).
  const forYou = (await session())
    ? await api<{ basedOn: number; items: ProductSummary[] }>(`/ai/recommendations?currency=${cur}`)
        .then((r) => (r.basedOn > 0 ? r.items : []))
        .catch(() => [])
    : [];

  const perks = [
    { icon: ShieldCheck, title: t('perks.secure'), text: t('perks.secureText') },
    { icon: Truck, title: t('perks.shipping'), text: t('perks.shippingText') },
    { icon: PackageCheck, title: t('perks.returns'), text: t('perks.returnsText') },
  ];

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-stone-200 bg-[linear-gradient(120deg,var(--color-accent-50),var(--color-cream),#fef3c7,var(--color-cream))] bg-[length:300%_300%] animate-gradient">
        {/* Soft moving blobs behind the hero. */}
        <span className="absolute -top-24 -left-20 -z-10 h-80 w-80 animate-float rounded-full bg-accent-500/15 blur-3xl" />
        <span className="absolute -right-10 bottom-0 -z-10 h-72 w-72 animate-[float_8s_ease-in-out_infinite_reverse] rounded-full bg-amber-300/25 blur-3xl" />
        <span className="absolute top-10 right-1/3 -z-10 h-40 w-40 animate-[float_7s_1s_ease-in-out_infinite] rounded-full bg-sky-300/20 blur-2xl" />
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <h1 className="animate-fade-up font-display text-4xl leading-tight sm:text-6xl">
              {t('heroTitle')}
            </h1>
            <p className="mt-5 max-w-xl animate-[fade-up_0.6s_0.12s_both] text-lg text-stone-600">
              {t('heroSubtitle')}
            </p>
            <div className="mt-8 flex animate-[fade-up_0.6s_0.24s_both] flex-wrap gap-3">
              <Link
                href="/search"
                className="btn-accent group px-6 py-3 shadow-lg shadow-accent-500/25 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-accent-500/30"
              >
                {t('heroCta')}
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <Link href="/sell" className="btn-outline px-6 py-3 hover:-translate-y-0.5">
                {t('heroSell')}
              </Link>
            </div>
          </div>
          <ul className="grid gap-3">
            {perks.map(({ icon: Icon, title, text }, i) => (
              <li
                key={title}
                className="card group flex animate-slide-in-right gap-4 p-5 transition hover:-translate-x-1 hover:shadow-md"
                style={{ animationDelay: `${200 + i * 120}ms` }}
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-50 transition group-hover:scale-110 group-hover:rotate-6">
                  <Icon className="h-6 w-6 text-accent-600" />
                </span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-stone-600">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {home && (
        <>
          <section className="border-b border-stone-200 bg-ink text-white">
            <dl className="mx-auto grid max-w-7xl grid-cols-3 gap-4 px-4 py-6 text-center">
              {[
                [home.categories.reduce((n, c) => n + c.count, 0), t('stats.products')],
                [home.stores.length, t('stats.stores')],
                [home.categories.length, t('stats.categories')],
              ].map(([value, label]) => (
                <div key={label} className="flex flex-col-reverse">
                  <dt className="text-xs text-stone-400 sm:text-sm">{label}</dt>
                  <dd className="font-display text-3xl text-accent-500 sm:text-4xl">
                    <CountUp value={Number(value)} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="mx-auto max-w-7xl px-4 pt-10">
            <Reveal>
              <h2 className="mb-5 font-display text-3xl">{t('shopByCategory')}</h2>
            </Reveal>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {home.categories.map((c, i) => (
                <Reveal key={c.slug} delay={i * 50}>
                  <Link
                    href={`/search?category=${c.slug}`}
                    className="card group flex items-center gap-3 p-4 transition hover:-translate-y-1 hover:shadow-lg hover:ring-accent-500/40"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent-50 text-accent-600 transition duration-300 group-hover:scale-110 group-hover:-rotate-6 group-hover:bg-accent-500 group-hover:text-white">
                      <CategoryIcon name={c.icon} className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block font-semibold">{c.name[locale]}</span>
                      <span className="text-xs text-stone-500">
                        {t('products', { count: c.count })}
                      </span>
                    </span>
                  </Link>
                </Reveal>
              ))}
            </div>
          </section>
          {forYou.length > 0 && <ProductRail title={t('forYou')} items={forYou} />}
          <ProductRail title={t('deals')} items={home.deals} href="/search?onSale=true" />
          <ProductRail
            title={t('bestSellers')}
            items={home.bestSellers}
            href="/search?sort=bestselling"
          />
          <section className="mx-auto max-w-7xl px-4 py-10">
            <Reveal>
              <h2 className="mb-5 font-display text-3xl">{t('stores')}</h2>
            </Reveal>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {home.stores.slice(0, 8).map((s, i) => (
                <Reveal key={s.id} delay={i * 60}>
                  <Link
                    href={`/s/${s.slug}`}
                    className="card group flex items-center gap-3 p-4 transition hover:-translate-y-1 hover:shadow-lg"
                  >
                    <span
                      className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl font-display text-xl text-white transition duration-300 group-hover:scale-110 group-hover:rotate-3"
                      style={{ background: s.accentColor }}
                    >
                      {s.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{s.name}</span>
                      <span className="block truncate text-xs text-stone-500">{s.city}</span>
                    </span>
                  </Link>
                </Reveal>
              ))}
            </div>
          </section>
          <ProductRail
            title={t('newArrivals')}
            items={home.newArrivals}
            href="/search?sort=newest"
          />
          <ProductRail title={t('topRated')} items={home.topRated} href="/search?sort=rating" />
        </>
      )}
    </>
  );
}

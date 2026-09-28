import { PackageCheck, ShieldCheck, Truck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ProductRail } from '@/components/ProductRail';
import { Link } from '@/i18n/navigation';
import { api, currency } from '@/lib/api';
import type { HomeData } from '@/lib/types';

export default async function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = (await params) as { locale: 'es' | 'en' };
  const t = await getTranslations('home');
  const cur = await currency();
  const home = await api<HomeData>(`/storefront/home?currency=${cur}`, {
    auth: false,
    revalidate: 60,
  }).catch(() => null);

  const perks = [
    { icon: ShieldCheck, title: t('perks.secure'), text: t('perks.secureText') },
    { icon: Truck, title: t('perks.shipping'), text: t('perks.shippingText') },
    { icon: PackageCheck, title: t('perks.returns'), text: t('perks.returnsText') },
  ];

  return (
    <>
      <section className="border-b border-stone-200 bg-gradient-to-br from-accent-50 via-cream to-cream">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <h1 className="font-display text-4xl leading-tight sm:text-6xl">{t('heroTitle')}</h1>
            <p className="mt-5 max-w-xl text-lg text-stone-600">{t('heroSubtitle')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/search" className="btn-accent px-6 py-3">
                {t('heroCta')}
              </Link>
              <Link href="/sell" className="btn-outline px-6 py-3">
                {t('heroSell')}
              </Link>
            </div>
          </div>
          <ul className="grid gap-3">
            {perks.map(({ icon: Icon, title, text }) => (
              <li key={title} className="card flex gap-4 p-5">
                <Icon className="h-6 w-6 shrink-0 text-accent-600" />
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
          <section className="mx-auto max-w-7xl px-4 pt-10">
            <h2 className="mb-5 font-display text-3xl">{t('shopByCategory')}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {home.categories.map((c) => (
                <Link
                  key={c.slug}
                  href={`/search?category=${c.slug}`}
                  className="card flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent-50 text-accent-600">
                    <CategoryIcon name={c.icon} className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block font-semibold">{c.name[locale]}</span>
                    <span className="text-xs text-stone-500">
                      {t('products', { count: c.count })}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
          <ProductRail title={t('deals')} items={home.deals} href="/search?onSale=true" />
          <ProductRail
            title={t('bestSellers')}
            items={home.bestSellers}
            href="/search?sort=bestselling"
          />
          <section className="mx-auto max-w-7xl px-4 py-10">
            <h2 className="mb-5 font-display text-3xl">{t('stores')}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {home.stores.slice(0, 8).map((s) => (
                <Link
                  key={s.id}
                  href={`/s/${s.slug}`}
                  className="card flex items-center gap-3 p-4 hover:shadow-md"
                >
                  <span
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl font-display text-xl text-white"
                    style={{ background: s.accentColor }}
                  >
                    {s.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{s.name}</span>
                    <span className="block truncate text-xs text-stone-500">{s.city}</span>
                  </span>
                </Link>
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

import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/guard';

export default async function SellerLayout({ children }: LayoutProps<'/[locale]/seller'>) {
  await requireUser('/seller', 'seller');
  const t = await getTranslations('seller');
  const links = [
    ['/seller', t('dashboard')],
    ['/seller/products', t('products')],
    ['/seller/products/new', t('newProduct')],
  ] as const;
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[220px_1fr]">
      <aside>
        <p className="mb-3 font-display text-2xl">{t('title')}</p>
        <nav className="flex gap-2 overflow-x-auto lg:flex-col">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-xl px-3 py-2 text-sm whitespace-nowrap hover:bg-white"
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <div>{children}</div>
    </div>
  );
}

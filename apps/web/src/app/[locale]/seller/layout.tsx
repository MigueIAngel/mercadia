import { getTranslations } from 'next-intl/server';
import { SellerNav } from '@/components/seller/SellerNav';
import { requireUser } from '@/lib/guard';

export default async function SellerLayout({ children }: LayoutProps<'/[locale]/seller'>) {
  await requireUser('/seller', 'seller');
  const t = await getTranslations('seller');
  const links = [
    ['/seller', t('dashboard')],
    ['/seller/products', t('products')],
    ['/seller/products/new', t('newProduct')],
    ['/seller/orders', t('orders')],
    ['/seller/payouts', t('payouts')],
    ['/seller/disputes', t('disputes')],
    ['/seller/reviews', t('reviews')],
    ['/messages', t('messages')],
  ] as const;
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[220px_1fr]">
      <aside>
        <p className="mb-3 font-display text-2xl">{t('title')}</p>
        <SellerNav links={[...links]} />
      </aside>
      <div className="min-w-0 animate-fade-up">{children}</div>
    </div>
  );
}

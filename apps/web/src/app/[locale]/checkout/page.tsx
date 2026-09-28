import { getTranslations } from 'next-intl/server';
import { CheckoutClient } from '@/components/commerce/CheckoutClient';
import { currency } from '@/lib/api';
import { requireUser } from '@/lib/guard';

export default async function CheckoutPage() {
  await requireUser('/checkout');
  const t = await getTranslations('checkout');
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 font-display text-4xl">{t('title')}</h1>
      <CheckoutClient currency={await currency()} />
    </div>
  );
}

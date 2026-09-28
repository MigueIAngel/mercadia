import { getTranslations } from 'next-intl/server';
import { CartClient } from '@/components/commerce/CartClient';
import { currency, session } from '@/lib/api';

export default async function CartPage() {
  const t = await getTranslations('cart');
  const [cur, user] = await Promise.all([currency(), session()]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 font-display text-4xl">{t('title')}</h1>
      <CartClient currency={cur} signedIn={Boolean(user)} />
    </div>
  );
}

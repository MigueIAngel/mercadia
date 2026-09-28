import { getTranslations } from 'next-intl/server';
import { OpenStoreForm } from '@/components/OpenStoreForm';
import { Link, redirect } from '@/i18n/navigation';
import { session } from '@/lib/api';
import { getLocale } from 'next-intl/server';

export default async function SellPage() {
  const t = await getTranslations('sell');
  const user = await session();
  if (user?.roles.includes('seller')) redirect({ href: '/seller', locale: await getLocale() });
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-4xl">{t('title')}</h1>
      <p className="mt-3 text-stone-600">{t('subtitle')}</p>
      <div className="card mt-8 p-8">
        {user ? (
          <OpenStoreForm />
        ) : (
          <p className="text-stone-600">
            {t('loginFirst')}{' '}
            <Link
              href="/login?next=/sell"
              className="font-semibold text-accent-600 hover:underline"
            >
              →
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

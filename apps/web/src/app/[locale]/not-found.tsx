import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function NotFound() {
  const t = await getTranslations('common');
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="font-display text-7xl">404</p>
      <p className="mt-4 text-stone-600">{t('notFound')}</p>
      <Link href="/" className="btn-primary mt-8">
        Mercadia
      </Link>
    </div>
  );
}

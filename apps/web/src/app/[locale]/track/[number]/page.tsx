import { getTranslations } from 'next-intl/server';
import { Tracking } from '@/components/commerce/Tracking';
import { api } from '@/lib/api';
import type { TrackingView } from '@/lib/types';

export default async function TrackPage({ params }: PageProps<'/[locale]/track/[number]'>) {
  const { number } = await params;
  const t = await getTranslations('tracking');
  const tracking = await api<TrackingView>(`/shipments/track/${encodeURIComponent(number)}`, {
    auth: false,
  }).catch(() => null);
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-4xl">{t('title')}</h1>
      <p className="mt-1 font-mono text-stone-500">{number}</p>
      <div className="card mt-6 p-6">
        {tracking ? (
          <Tracking tracking={tracking} />
        ) : (
          <p className="text-stone-500">{t('notFound')}</p>
        )}
      </div>
    </div>
  );
}

import { getLocale, getTranslations } from 'next-intl/server';
import { dateTime } from '@/lib/format';
import type { TrackingView } from '@/lib/types';

const STEPS = ['label_created', 'in_transit', 'out_for_delivery', 'delivered'] as const;

export async function Tracking({ tracking }: { tracking: TrackingView }) {
  const t = await getTranslations('tracking');
  const locale = await getLocale();
  const reached = STEPS.indexOf(tracking.status as (typeof STEPS)[number]);
  return (
    <div className="space-y-4">
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((step, i) => (
          <li key={step} className="text-center text-xs">
            <span
              className={`mx-auto block h-2 rounded-full ${i <= reached ? 'bg-emerald-500' : 'bg-stone-200'}`}
            />
            <span className={`mt-1 block ${i <= reached ? 'font-semibold' : 'text-stone-400'}`}>
              {t(`steps.${step}`)}
            </span>
          </li>
        ))}
      </ol>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-stone-500">{t('carrier')}</dt>
          <dd>{tracking.carrier}</dd>
        </div>
        <div>
          <dt className="text-stone-500">{t('from')}</dt>
          <dd>{tracking.origin}</dd>
        </div>
        <div>
          <dt className="text-stone-500">{t('to')}</dt>
          <dd>{tracking.destinationCity}</dd>
        </div>
        <div>
          <dt className="text-stone-500">{t('estimated')}</dt>
          <dd>
            {dateTime(tracking.deliveredAt ?? tracking.estimatedDelivery, locale).split(',')[0]}
          </dd>
        </div>
      </dl>
      <ul className="space-y-1 border-l-2 border-stone-200 pl-4 text-sm">
        {[...tracking.events].reverse().map((e) => (
          <li key={`${e.status}-${e.at}`}>
            <span className="font-medium">{t(`steps.${e.status}` as 'steps.delivered')}</span> ·{' '}
            {e.location} <span className="text-stone-500">· {dateTime(e.at, locale)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

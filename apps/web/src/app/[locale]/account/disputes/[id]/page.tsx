import { getLocale, getTranslations } from 'next-intl/server';
import { DisputeThread } from '@/components/commerce/DisputeThread';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { requireUser } from '@/lib/guard';
import type { DisputeView } from '@/lib/types';

export default async function DisputePage({
  params,
}: PageProps<'/[locale]/account/disputes/[id]'>) {
  const { id } = await params;
  await requireUser(`/account/disputes/${id}`);
  const t = await getTranslations('disputes');
  const to = await getTranslations('orders');
  const locale = await getLocale();
  const dispute = await api<DisputeView>(`/disputes/${id}`);
  const fmt = (n: number) => money(n, dispute.currency, locale);
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div>
        <p className="text-sm text-stone-500">
          {to(`reasons.${dispute.reason}` as 'reasons.damaged')}
        </p>
        <h1 className="font-display text-3xl">{t(`status.${dispute.status}`)}</h1>
        <p className="mt-1 text-sm text-stone-600">
          {t('requested', { amount: fmt(dispute.requestedAmount) })}
          {dispute.refundAmount !== null &&
            ` · ${t('refunded', { amount: fmt(dispute.refundAmount) })}`}
          {dispute.resolution && ` · ${t(`resolution.${dispute.resolution}`)}`}
        </p>
        {dispute.status === 'open' && (
          <p className="text-xs text-stone-500">
            {t('deadline', { date: dateTime(dispute.sellerDeadline, locale) })}
          </p>
        )}
        {dispute.viewerRole === 'buyer' && (
          <Link
            href={`/account/orders/${dispute.orderId}`}
            className="text-sm text-accent-600 hover:underline"
          >
            ← {to('order', { number: '' }).trim()}
          </Link>
        )}
      </div>
      <div className="card p-6">
        <DisputeThread dispute={dispute} />
      </div>
    </div>
  );
}

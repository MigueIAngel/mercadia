import { getTranslations } from 'next-intl/server';

const COLORS: Record<string, string> = {
  pending_payment: 'bg-amber-50 text-amber-700',
  paid: 'bg-sky-50 text-sky-700',
  processing: 'bg-sky-50 text-sky-700',
  shipped: 'bg-indigo-50 text-indigo-700',
  delivered: 'bg-emerald-50 text-emerald-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-stone-100 text-stone-500',
  partially_refunded: 'bg-rose-50 text-rose-700',
  refunded: 'bg-rose-50 text-rose-700',
};

export async function StatusPill({ status }: { status: string }) {
  const t = await getTranslations('orders.status');
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${COLORS[status] ?? 'bg-stone-100'}`}
    >
      {t.has(status) ? t(status as 'paid') : status}
    </span>
  );
}

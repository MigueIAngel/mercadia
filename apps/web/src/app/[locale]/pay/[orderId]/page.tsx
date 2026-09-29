import { PayClient } from '@/components/commerce/PayClient';
import { redirect } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { requireUser } from '@/lib/guard';
import type { OrderView } from '@/lib/types';
import { getLocale } from 'next-intl/server';

export default async function PayPage({ params }: PageProps<'/[locale]/pay/[orderId]'>) {
  const { orderId } = await params;
  await requireUser(`/pay/${orderId}`);
  const order = await api<OrderView>(`/orders/${orderId}`);
  if (order.status !== 'pending_payment' && order.status !== 'paid') {
    redirect({ href: `/account/orders/${orderId}`, locale: await getLocale() });
  }
  return (
    <div className="px-4 py-10">
      <PayClient
        orderId={order.id}
        number={order.number}
        total={order.total}
        currency={order.currency}
      />
    </div>
  );
}

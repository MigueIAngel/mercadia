import { getLocale, getTranslations } from 'next-intl/server';
import { CancelOrderButton, DisputeForm, PayNowLink } from '@/components/commerce/OrderActions';
import { StatusPill } from '@/components/commerce/StatusPill';
import { Tracking } from '@/components/commerce/Tracking';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { requireUser } from '@/lib/guard';
import type { OrderView, TrackingView } from '@/lib/types';

export default async function OrderPage({ params }: PageProps<'/[locale]/account/orders/[id]'>) {
  const { id } = await params;
  await requireUser(`/account/orders/${id}`);
  const t = await getTranslations('orders');
  const tc = await getTranslations('checkout');
  const locale = await getLocale();
  const [order, tracking, payment] = await Promise.all([
    api<OrderView>(`/orders/${id}`),
    api<TrackingView[]>(`/shipments/orders/${id}`).catch(() => [] as TrackingView[]),
    api<{ card: { brand: string; last4: string } | null }>(`/payments/orders/${id}`).catch(
      () => null,
    ),
  ]);
  const fmt = (n: number) => money(n, order.currency, locale);
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">{t('order', { number: order.number })}</h1>
          <p className="text-sm text-stone-500">
            {t('placedOn', { date: dateTime(order.createdAt, locale) })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={order.status} />
          {order.status === 'pending_payment' && (
            <>
              <PayNowLink orderId={order.id} />
              <CancelOrderButton orderId={order.id} />
            </>
          )}
        </div>
      </div>

      {order.sellerOrders.map((so) => {
        const shipment = tracking.find((s) => s.sellerOrderId === so.id);
        return (
          <section key={so.id} className="card space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{so.storeName}</p>
              <StatusPill status={so.status} />
            </div>
            <ul className="divide-y divide-stone-100 text-sm">
              {so.lines.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {l.image && (
                    <img
                      src={l.image}
                      alt=""
                      className="h-12 w-12 rounded-xl bg-stone-100 object-contain p-1"
                    />
                  )}
                  <span className="flex-1">
                    {l.quantity} × {l.title}
                  </span>
                  <span>{fmt(l.total)}</span>
                </li>
              ))}
            </ul>
            {shipment && (
              <div className="rounded-2xl bg-stone-50 p-4">
                <p className="mb-3 text-sm font-semibold">
                  {t('tracking')} ·{' '}
                  <Link
                    href={`/track/${shipment.trackingNumber}`}
                    className="font-mono text-accent-600 hover:underline"
                  >
                    {shipment.trackingNumber}
                  </Link>
                </p>
                <Tracking tracking={shipment} />
              </div>
            )}
            {['shipped', 'delivered'].includes(so.status) && <DisputeForm sellerOrderId={so.id} />}
          </section>
        );
      })}

      <section className="card grid gap-6 p-6 sm:grid-cols-2">
        <div className="text-sm">
          <p className="font-semibold">{t('shippingTo')}</p>
          <p>{order.shippingAddress.fullName}</p>
          <p className="text-stone-600">
            {order.shippingAddress.line1}
            {order.shippingAddress.line2 && `, ${order.shippingAddress.line2}`}
          </p>
          <p className="text-stone-600">
            {order.shippingAddress.city}, {order.shippingAddress.department}
          </p>
          {payment?.card && (
            <p className="mt-3 text-stone-600">
              {t('paymentMethod', {
                brand: payment.card.brand.toUpperCase(),
                last4: payment.card.last4,
              })}
            </p>
          )}
        </div>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-500">Subtotal</dt>
            <dd>{fmt(order.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">{tc('shipping')}</dt>
            <dd>{fmt(order.shippingTotal)}</dd>
          </div>
          <div className="flex justify-between text-xs">
            <dt className="text-stone-400">IVA</dt>
            <dd className="text-stone-400">{fmt(order.taxTotal)}</dd>
          </div>
          <div className="flex justify-between pt-2 text-lg font-bold">
            <dt>Total</dt>
            <dd>{fmt(order.total)}</dd>
          </div>
        </dl>
      </section>

      <section className="card p-6">
        <p className="mb-2 font-semibold">{t('history')}</p>
        <ul className="space-y-1 text-sm">
          {order.history.map((h) => (
            <li key={h.id} className="flex justify-between gap-4">
              <span>
                <StatusPill status={h.status} /> {h.note}
              </span>
              <span className="text-stone-500">{dateTime(h.at, locale)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

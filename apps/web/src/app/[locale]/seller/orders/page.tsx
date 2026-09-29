import { getLocale, getTranslations } from 'next-intl/server';
import { StatusPill } from '@/components/commerce/StatusPill';
import { SellerOrderActions } from '@/components/seller/SellerOrderActions';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import type { OrderLineView } from '@/lib/types';

interface Row {
  id: string;
  status: string;
  total: number;
  trackingNumber: string | null;
  order: {
    id: string;
    number: number;
    buyerName: string;
    currency: 'COP' | 'USD';
    createdAt: string;
    city: string;
  };
  lines: OrderLineView[];
}

export default async function SellerOrders() {
  const t = await getTranslations('seller');
  const locale = await getLocale();
  const [rows, shipments] = await Promise.all([
    api<Row[]>('/seller/orders'),
    api<{ sellerOrderId: string; trackingNumber: string }[]>('/seller/shipments').catch(() => []),
  ]);
  if (rows.length === 0)
    return <p className="card p-8 text-center text-stone-500">{t('noOrders')}</p>;
  return (
    <div className="space-y-3">
      <h1 className="font-display text-3xl">{t('orders')}</h1>
      {rows.map((r) => {
        const shipment = shipments.find((s) => s.sellerOrderId === r.id);
        return (
          <div key={r.id} className="card space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">
                #{r.order.number} · {r.order.buyerName}
              </p>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{money(r.total, r.order.currency, locale)}</span>
                <StatusPill status={r.status} />
              </div>
            </div>
            <p className="text-sm text-stone-600">
              {r.lines.map((l) => `${l.quantity} × ${l.title}`).join(' · ')}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
              <span>
                {dateTime(r.order.createdAt, locale)} · {t('buyerCity', { city: r.order.city })}
              </span>
              {shipment && (
                <Link
                  href={`/track/${shipment.trackingNumber}`}
                  className="font-mono text-accent-600"
                >
                  {shipment.trackingNumber}
                </Link>
              )}
            </div>
            <SellerOrderActions id={r.id} status={r.status} hasShipment={Boolean(shipment)} />
          </div>
        );
      })}
    </div>
  );
}

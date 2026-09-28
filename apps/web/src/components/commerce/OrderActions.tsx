'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { call } from '@/lib/client';

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const t = useTranslations('orders');
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn-outline"
      onClick={async () => {
        await call(`/api/bff/orders/${orderId}/cancel`, { method: 'POST' });
        router.refresh();
      }}
    >
      {t('cancel')}
    </button>
  );
}

const REASONS = ['not_received', 'damaged', 'not_as_described', 'wrong_item', 'return'] as const;

export function DisputeForm({ sellerOrderId }: { sellerOrderId: string }) {
  const t = useTranslations('orders');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-rose-600 hover:underline"
      >
        {t('openDispute')}
      </button>
    );
  }
  return (
    <form
      className="space-y-3 rounded-2xl bg-rose-50/50 p-4 ring-1 ring-rose-100"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = Object.fromEntries(new FormData(e.currentTarget));
        try {
          const dispute = await call<{ id: string }>('/api/bff/disputes', {
            body: {
              sellerOrderId,
              reason: form.reason,
              description: form.description,
              ...(form.amount ? { amount: Math.round(Number(form.amount) * 100) } : {}),
            },
          });
          router.push(`/account/disputes/${dispute.id}`);
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <p className="font-semibold">{t('dispute')}</p>
      <div>
        <label className="label" htmlFor="reason">
          {t('reason')}
        </label>
        <select id="reason" name="reason" className="field">
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {t(`reasons.${r}`)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="description">
          {t('describe')}
        </label>
        <textarea
          id="description"
          name="description"
          required
          minLength={10}
          rows={3}
          className="field"
        />
      </div>
      <div>
        <label className="label" htmlFor="amount">
          {t('amount')}
        </label>
        <input id="amount" name="amount" type="number" min="1" step="0.01" className="field" />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button className="btn-primary">{t('submitDispute')}</button>
    </form>
  );
}

export function PayNowLink({ orderId }: { orderId: string }) {
  const t = useTranslations('orders');
  return (
    <Link href={`/pay/${orderId}`} className="btn-accent">
      {t('payNow')}
    </Link>
  );
}

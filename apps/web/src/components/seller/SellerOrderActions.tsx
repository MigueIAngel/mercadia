'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { call } from '@/lib/client';

export function SellerOrderActions({
  id,
  status,
  hasShipment,
}: {
  id: string;
  status: string;
  hasShipment: boolean;
}) {
  const t = useTranslations('seller');
  const router = useRouter();
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'paid' && (
        <button
          type="button"
          className="btn-outline py-1.5"
          onClick={() => run(() => call(`/api/bff/seller/orders/${id}/accept`, { method: 'POST' }))}
        >
          {t('accept')}
        </button>
      )}
      {['paid', 'processing'].includes(status) && !hasShipment && (
        <>
          <button
            type="button"
            className="btn-accent py-1.5"
            onClick={() =>
              run(() => call('/api/bff/seller/shipments', { body: { sellerOrderId: id } }))
            }
          >
            {t('ship')}
          </button>
          <button
            type="button"
            className="btn-outline py-1.5"
            onClick={() =>
              run(() =>
                call('/api/bff/seller/shipments', {
                  body: { sellerOrderId: id, service: 'express' },
                }),
              )
            }
          >
            {t('express')}
          </button>
        </>
      )}
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}

export function ConnectPayouts() {
  const t = useTranslations('seller');
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn-primary"
      onClick={async () => {
        const res = await call<{ url: string | null }>('/api/bff/seller/payouts/onboarding', {
          method: 'POST',
        });
        if (res.url) window.location.href = res.url;
        else router.refresh();
      }}
    >
      {t('connect')}
    </button>
  );
}

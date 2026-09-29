'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { call } from '@/lib/client';
import { money } from '@/lib/format';
import type { DisputeView } from '@/lib/types';

export function DisputeThread({ dispute }: { dispute: DisputeView }) {
  const t = useTranslations('disputes');
  const locale = useLocale();
  const router = useRouter();
  const [text, setText] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const fmt = (n: number) => money(n, dispute.currency, locale);

  const act = async (path: string, body: unknown) => {
    setError('');
    try {
      await call(`/api/bff${path}`, { body });
      setText('');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const closed = dispute.status === 'resolved';
  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {dispute.messages?.map((m) => (
          <li
            key={m.id}
            className={`max-w-[85%] rounded-2xl p-3 text-sm ${m.authorRole === dispute.viewerRole ? 'ml-auto bg-ink text-white' : m.authorRole === 'system' || m.authorRole === 'admin' ? 'mx-auto bg-sky-50 text-sky-900' : 'bg-white ring-1 ring-stone-200'}`}
          >
            <p className="mb-1 text-[11px] font-semibold opacity-70">
              {t(`roles.${m.authorRole}` as 'roles.buyer')}
            </p>
            {m.text}
          </li>
        ))}
      </ul>
      {!closed && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) void act(`/disputes/${dispute.id}/messages`, { text });
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('message')}
            className="field"
          />
          <button className="btn-primary">{t('send')}</button>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        {dispute.viewerRole === 'buyer' && ['open', 'seller_rejected'].includes(dispute.status) && (
          <button
            type="button"
            className="btn-outline"
            onClick={() => act(`/disputes/${dispute.id}/escalate`, {})}
          >
            {t('escalate')}
          </button>
        )}
        {dispute.viewerRole === 'seller' && dispute.status === 'open' && (
          <>
            <button
              type="button"
              className="btn-accent"
              onClick={() => act(`/disputes/${dispute.id}/respond`, { action: 'accept', text })}
            >
              {t('accept')} ({fmt(dispute.requestedAmount)})
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={() => act(`/disputes/${dispute.id}/respond`, { action: 'reject', text })}
            >
              {t('reject')}
            </button>
          </>
        )}
        {dispute.viewerRole === 'admin' && !closed && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-accent"
              onClick={() =>
                act(`/admin/disputes/${dispute.id}/resolve`, { resolution: 'refund', text })
              }
            >
              {t('resolution.refund')}
            </button>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              placeholder="$"
              className="field w-32"
            />
            <button
              type="button"
              className="btn-outline"
              onClick={() =>
                act(`/admin/disputes/${dispute.id}/resolve`, {
                  resolution: 'partial_refund',
                  amount: Math.round(Number(amount) * 100),
                  text,
                })
              }
            >
              {t('resolution.partial_refund')}
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={() =>
                act(`/admin/disputes/${dispute.id}/resolve`, { resolution: 'rejected', text })
              }
            >
              {t('resolution.rejected')}
            </button>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}

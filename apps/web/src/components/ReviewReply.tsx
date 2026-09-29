'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { call } from '@/lib/client';

/** Seller's public answer to a review (one per review). */
export function ReviewReply({ reviewId }: { reviewId: string }) {
  const t = useTranslations('reviews');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-accent-600 hover:underline"
      >
        {t('reply')}
      </button>
    );
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await call(`/api/bff/reviews/${reviewId}/reply`, { body: { text } });
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <textarea
        required
        minLength={2}
        maxLength={2000}
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('replyPlaceholder')}
        aria-label={t('reply')}
        className="field"
      />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button disabled={busy} className="btn-primary px-4 py-1.5 text-sm">
        {t('publishReply')}
      </button>
    </form>
  );
}

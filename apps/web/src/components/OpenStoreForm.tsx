'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { call } from '@/lib/client';

export function OpenStoreForm() {
  const t = useTranslations('sell');
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          await call('/api/bff/stores', {
            body: Object.fromEntries(new FormData(e.currentTarget)),
          });
          router.push('/seller');
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="label" htmlFor="name">
          {t('storeName')}
        </label>
        <input id="name" name="name" required minLength={3} maxLength={60} className="field" />
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="label" htmlFor="city">
            {t('city')}
          </label>
          <input id="city" name="city" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="accentColor">
            {t('accent')}
          </label>
          <input
            id="accentColor"
            name="accentColor"
            type="color"
            defaultValue="#f97316"
            className="h-11 w-20 rounded-xl border border-stone-300"
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="description">
          {t('description')}
        </label>
        <textarea id="description" name="description" rows={3} className="field" />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button disabled={busy} className="btn-accent w-full py-3">
        {t('submit')}
      </button>
    </form>
  );
}

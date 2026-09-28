'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { call } from '@/lib/client';

export function PasswordForm() {
  const t = useTranslations('account');
  const [status, setStatus] = useState('');
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        try {
          await call('/api/bff/users/me/password', {
            body: Object.fromEntries(new FormData(form)),
          });
          form.reset();
          setStatus(t('passwordChanged'));
        } catch (err) {
          setStatus((err as Error).message);
        }
      }}
    >
      <div>
        <label className="label" htmlFor="currentPassword">
          {t('currentPassword')}
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          className="field"
        />
      </div>
      <div>
        <label className="label" htmlFor="newPassword">
          {t('newPassword')}
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          className="field"
        />
      </div>
      <button className="btn-outline">{t('changePassword')}</button>
      {status && <p className="text-sm text-stone-600 sm:col-span-3">{status}</p>}
    </form>
  );
}

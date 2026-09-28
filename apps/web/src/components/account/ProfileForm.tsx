'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { call } from '@/lib/client';
import type { CurrentUser } from '@/lib/types';

export function ProfileForm({ user }: { user: CurrentUser }) {
  const t = useTranslations('account');
  const [status, setStatus] = useState('');
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await call('/api/bff/users/me', { method: 'PATCH', body: form });
      await call('/api/prefs', { body: { currency: form.currency } });
      setStatus(t('saved'));
    } catch (err) {
      setStatus((err as Error).message);
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="name">
          Nombre / Name
        </label>
        <input id="name" name="name" defaultValue={user.name} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="currency">
          {t('preferredCurrency')}
        </label>
        <select id="currency" name="currency" defaultValue={user.currency} className="field">
          <option value="COP">COP</option>
          <option value="USD">USD</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="locale">
          {t('language')}
        </label>
        <select id="locale" name="locale" defaultValue={user.locale} className="field">
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary">{t('save')}</button>
        {status && <span className="text-sm text-stone-600">{status}</span>}
      </div>
    </form>
  );
}

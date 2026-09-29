'use client';

import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { call } from '@/lib/client';
import { safeNext } from '@/lib/redirect';
import { Spinner } from '@/components/ui/Spinner';

const DEMO_PASSWORD = 'Mercadia2026!';

function GoogleButton() {
  const t = useTranslations('auth');
  const locale = useLocale();
  return (
    <a href={`/api/auth/google?locale=${locale}`} className="btn-outline w-full py-3">
      <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
        <path
          fill="#FFC107"
          d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
        />
        <path
          fill="#FF3D00"
          d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
        />
        <path
          fill="#4CAF50"
          d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
        />
        <path
          fill="#1976D2"
          d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
        />
      </svg>
      {t('google')}
    </a>
  );
}

function DemoAccess({ onDone }: { onDone: () => void }) {
  const t = useTranslations('auth');
  const [busy, setBusy] = useState('');
  const login = async (role: 'buyer' | 'seller' | 'admin') => {
    setBusy(role);
    try {
      await call('/api/auth/demo', { body: { role } });
      onDone();
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="rounded-2xl border border-dashed border-accent-500/60 bg-accent-50 p-4">
      <p className="text-sm font-semibold">{t('demoTitle')}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {(['buyer', 'seller', 'admin'] as const).map((role) => (
          <button
            key={role}
            type="button"
            disabled={!!busy}
            onClick={() => login(role)}
            className="btn-outline px-2 py-2"
          >
            {busy === role ? (
              <Spinner className="mx-auto" />
            ) : (
              t(`demo${role[0].toUpperCase()}${role.slice(1)}` as 'demoBuyer')
            )}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-stone-500">
        {t('demoPassword', { password: DEMO_PASSWORD })}
      </p>
    </div>
  );
}

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState(() => {
    const code = params.get('error');
    return code ? t(`errors.${code}` as 'errors.google_failed') : '';
  });
  const [busy, setBusy] = useState(false);
  const [mfaToken, setMfaToken] = useState(params.get('mfa') ?? '');

  const done = () => {
    const safe = safeNext(params.get('next'));
    router.push(safe);
    router.refresh();
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    try {
      if (mfaToken) {
        await call('/api/auth/login-2fa', { body: { mfaToken, code: String(form.code).trim() } });
        return done();
      }
      const result = await call<{ mfaRequired?: boolean; mfaToken?: string }>(`/api/auth/${mode}`, {
        body: form,
      });
      if (result.mfaRequired) return setMfaToken(result.mfaToken!);
      done();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (mfaToken) {
    return (
      <form onSubmit={submit} className="space-y-4">
        <h1 className="font-display text-3xl">{t('mfaTitle')}</h1>
        <p className="text-sm text-stone-600">{t('mfaText')}</p>
        <input
          name="code"
          autoFocus
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={9}
          placeholder="123456"
          className="field text-center text-2xl tracking-[0.4em]"
        />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button disabled={busy} className="btn-primary w-full py-3">
          {busy && <Spinner />}
          {t('verify')}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl">
        {mode === 'login' ? t('loginTitle') : t('registerTitle')}
      </h1>
      <DemoAccess onDone={done} />
      <GoogleButton />
      <p className="text-center text-xs text-stone-400 uppercase">{t('or')}</p>
      <form onSubmit={submit} className="space-y-4">
        {mode === 'register' && (
          <div>
            <label className="label" htmlFor="name">
              {t('name')}
            </label>
            <input
              id="name"
              name="name"
              required
              minLength={2}
              autoComplete="name"
              className="field"
            />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">
            {t('email')}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            {t('password')}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="field"
          />
          {mode === 'register' && (
            <p className="mt-1 text-xs text-stone-500">{t('passwordHint')}</p>
          )}
        </div>
        {error && (
          <p className="text-sm text-rose-600" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy} className="btn-primary w-full py-3">
          {busy && <Spinner />}
          {mode === 'login' ? t('submitLogin') : t('submitRegister')}
        </button>
      </form>
      <p className="text-center text-sm text-stone-600">
        {mode === 'login' ? t('noAccount') : t('haveAccount')}{' '}
        <Link
          href={mode === 'login' ? '/register' : '/login'}
          className="font-semibold text-accent-600 hover:underline"
        >
          {mode === 'login' ? t('submitRegister') : t('submitLogin')}
        </Link>
      </p>
    </div>
  );
}

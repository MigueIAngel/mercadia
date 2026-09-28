'use client';

import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { call } from '@/lib/client';

export function TwoFactorPanel({ enabled }: { enabled: boolean }) {
  const t = useTranslations('account');
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; qrCode: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setError('');
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-3 text-sm text-stone-600">
        <ShieldCheck
          className={`h-5 w-5 shrink-0 ${enabled ? 'text-emerald-600' : 'text-stone-400'}`}
        />
        {enabled ? t('twoFactorOn') : t('twoFactorOff')}
      </p>

      {codes && (
        <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="font-semibold">{t('recoveryTitle')}</p>
          <p className="text-sm text-stone-600">{t('recoveryText')}</p>
          <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
            {codes.map((c) => (
              <li
                key={c}
                className="rounded-lg bg-white px-3 py-1.5 text-center ring-1 ring-amber-200"
              >
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!enabled && !setup && !codes && (
        <button
          type="button"
          className="btn-primary"
          onClick={() =>
            run(async () => setSetup(await call('/api/bff/auth/2fa/setup', { method: 'POST' })))
          }
        >
          {t('enable2fa')}
        </button>
      )}

      {setup && (
        <div className="flex flex-wrap items-start gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={setup.qrCode}
            alt="QR"
            className="h-44 w-44 rounded-2xl ring-1 ring-stone-200"
          />
          <div className="min-w-60 flex-1 space-y-3 text-sm">
            <p>{t('scanQr')}</p>
            <p className="text-stone-500">
              {t('manualKey')}{' '}
              <code className="rounded bg-stone-100 px-1.5 py-0.5 break-all">{setup.secret}</code>
            </p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              className="field w-40 text-center tracking-widest"
            />
            <button
              type="button"
              className="btn-primary ml-2"
              onClick={() =>
                run(async () => {
                  const res = await call<{ recoveryCodes: string[] }>('/api/bff/auth/2fa/enable', {
                    body: { code },
                  });
                  setCodes(res.recoveryCodes);
                  setSetup(null);
                  setCode('');
                  router.refresh();
                })
              }
            >
              {t('confirm')}
            </button>
          </div>
        </div>
      )}

      {enabled && !codes && (
        <div className="flex items-center gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            className="field w-40 text-center tracking-widest"
          />
          <button
            type="button"
            className="btn-outline"
            onClick={() =>
              run(async () => {
                await call('/api/bff/auth/2fa/disable', { body: { code } });
                setCode('');
                router.refresh();
              })
            }
          >
            {t('disable2fa')}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}

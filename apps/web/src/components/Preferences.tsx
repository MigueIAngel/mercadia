'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter as useNextRouter } from 'next/navigation';
import { useTransition } from 'react';
import type { Currency } from '@mercadia/contracts';
import { usePathname, useRouter } from '@/i18n/navigation';

export function CurrencySwitch({ current }: { current: Currency }) {
  const t = useTranslations('nav');
  const router = useNextRouter();
  const [pending, start] = useTransition();
  return (
    <select
      aria-label={t('currency')}
      value={current}
      disabled={pending}
      onChange={async (e) => {
        await fetch('/api/prefs', {
          method: 'POST',
          body: JSON.stringify({ currency: e.target.value }),
        });
        start(() => router.refresh());
      }}
      className="rounded-full border border-stone-300 bg-white px-2 py-1 text-xs font-bold"
    >
      <option value="COP">COP $</option>
      <option value="USD">USD $</option>
    </select>
  );
}

export function LanguageSwitch() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const next = locale === 'es' ? 'en' : 'es';
  return (
    <button
      type="button"
      onClick={() => router.replace(pathname + window.location.search, { locale: next })}
      className="rounded-full border border-stone-300 px-3 py-1 text-xs font-bold hover:border-ink"
      title={t('language')}
    >
      {next.toUpperCase()}
    </button>
  );
}

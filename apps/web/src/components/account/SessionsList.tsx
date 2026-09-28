'use client';

import { Monitor } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { call } from '@/lib/client';

export interface Session {
  familyId: string;
  userAgent: string | null;
  ip: string | null;
  lastUsedAt: string;
}

const device = (ua: string | null) => {
  if (!ua) return 'Desconocido / Unknown';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'API';
  const os = /Mac OS/.test(ua)
    ? 'macOS'
    : /Windows/.test(ua)
      ? 'Windows'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return [browser, os].filter(Boolean).join(' · ');
};

export function SessionsList({
  sessions,
  dates,
}: {
  sessions: Session[];
  dates: Record<string, string>;
}) {
  const t = useTranslations('account');
  const router = useRouter();
  return (
    <ul className="divide-y divide-stone-100">
      {sessions.map((s) => (
        <li key={s.familyId} className="flex items-center gap-3 py-3 text-sm">
          <Monitor className="h-5 w-5 text-stone-400" />
          <div className="flex-1">
            <p className="font-medium">{device(s.userAgent)}</p>
            <p className="text-xs text-stone-500">
              {s.ip || '—'} · {dates[s.familyId]}
            </p>
          </div>
          <button
            type="button"
            className="btn-outline px-3 py-1.5 text-xs"
            onClick={async () => {
              await call(`/api/bff/users/me/sessions/${s.familyId}`, { method: 'DELETE' });
              router.refresh();
            }}
          >
            {t('revoke')}
          </button>
        </li>
      ))}
    </ul>
  );
}

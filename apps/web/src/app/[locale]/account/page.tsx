import { getLocale, getTranslations } from 'next-intl/server';
import { PasswordForm } from '@/components/account/PasswordForm';
import { ProfileForm } from '@/components/account/ProfileForm';
import { SessionsList, type Session } from '@/components/account/SessionsList';
import { TwoFactorPanel } from '@/components/account/TwoFactorPanel';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { requireUser } from '@/lib/guard';
import type { CurrentUser } from '@/lib/types';

interface AuditEvent {
  id: number;
  action: string;
  ip: string | null;
  createdAt: string;
}

export default async function AccountPage() {
  await requireUser('/account');
  const t = await getTranslations('account');
  const locale = await getLocale();
  const [user, sessions, log] = await Promise.all([
    api<CurrentUser>('/users/me'),
    api<Session[]>('/users/me/sessions'),
    api<AuditEvent[]>('/users/me/security-log'),
  ]);
  const section = 'card p-6 space-y-4';
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <div>
        <h1 className="font-display text-4xl">{t('title')}</h1>
        <p className="text-stone-500">{user.email}</p>
      </div>
      <section className={section}>
        <h2 className="text-lg font-semibold">{t('profile')}</h2>
        <ProfileForm user={user} />
      </section>
      <section className={section}>
        <h2 className="text-lg font-semibold">{t('twoFactor')}</h2>
        <TwoFactorPanel enabled={user.totpEnabled} />
      </section>
      <section className={section}>
        <h2 className="text-lg font-semibold">{t('changePassword')}</h2>
        <PasswordForm />
      </section>
      <section className={section}>
        <h2 className="text-lg font-semibold">{t('sessions')}</h2>
        <SessionsList
          sessions={sessions}
          dates={Object.fromEntries(
            sessions.map((s) => [s.familyId, dateTime(s.lastUsedAt, locale)]),
          )}
        />
      </section>
      <section className={section}>
        <h2 className="text-lg font-semibold">{t('securityLog')}</h2>
        <ul className="divide-y divide-stone-100 text-sm">
          {log.map((e) => (
            <li key={e.id} className="flex justify-between gap-4 py-2">
              <span
                className={
                  e.action.includes('fail') ||
                  e.action.includes('reuse') ||
                  e.action.includes('locked')
                    ? 'text-rose-600'
                    : ''
                }
              >
                {t.has(`actions.${e.action}`)
                  ? t(`actions.${e.action}` as 'actions.login')
                  : e.action}
              </span>
              <span className="text-stone-500">
                {dateTime(e.createdAt, locale)}
                {e.ip && ` · ${e.ip}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

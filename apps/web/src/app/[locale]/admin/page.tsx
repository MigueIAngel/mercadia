import { getLocale, getTranslations } from 'next-intl/server';
import { AdminAction } from '@/components/AdminAction';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import type { DisputeView } from '@/lib/types';
import { requireUser } from '@/lib/guard';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  status: string;
  totpEnabled: boolean;
  lastLoginAt: string | null;
}
interface AdminStore {
  id: string;
  name: string;
  slug: string;
  city: string;
  status: string;
  ownerEmail: string;
}
interface AdminProduct {
  id: string;
  slug: string;
  title: string;
  status: string;
  store: { name: string };
}
interface AuditEvent {
  id: number;
  action: string;
  userId: string | null;
  ip: string | null;
  createdAt: string;
}
interface Stats {
  users: number;
  sellers: number;
  twoFactor: number;
  newThisWeek: number;
}

const TABS = ['users', 'stores', 'products', 'disputes', 'audit'] as const;

export default async function AdminPage({ searchParams }: PageProps<'/[locale]/admin'>) {
  await requireUser('/admin', 'admin');
  const t = await getTranslations('admin');
  const ta = await getTranslations('account');
  const locale = await getLocale();
  const requested = (await searchParams).tab;
  const tab = TABS.find((x) => x === requested) ?? 'users';
  const [stats, sales] = await Promise.all([
    api<Stats>('/admin/stats'),
    api<{ orders: number; gmvCop: number; commissionCop: number }>('/admin/orders/stats').catch(
      () => null,
    ),
  ]);
  const cell = 'p-3';

  let content: React.ReactNode = null;
  if (tab === 'users') {
    const users = await api<AdminUser[]>('/admin/users');
    content = (
      <table className="w-full text-sm">
        <tbody className="divide-y divide-stone-100">
          {users.map((u) => (
            <tr key={u.id}>
              <td className={cell}>
                <p className="font-medium">{u.name}</p>
                <p className="text-xs text-stone-500">{u.email}</p>
              </td>
              <td className={cell}>{u.roles.join(', ')}</td>
              <td className={cell}>{u.totpEnabled ? '2FA ✓' : ''}</td>
              <td className={`${cell} text-xs text-stone-500`}>
                {u.lastLoginAt ? dateTime(u.lastLoginAt, locale) : '—'}
              </td>
              <td className={`${cell} text-right`}>
                {u.roles.includes('admin') ? null : u.status === 'active' ? (
                  <AdminAction
                    path={`/admin/users/${u.id}`}
                    body={{ status: 'suspended' }}
                    label={t('suspend')}
                    danger
                  />
                ) : (
                  <AdminAction
                    path={`/admin/users/${u.id}`}
                    body={{ status: 'active' }}
                    label={t('activate')}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else if (tab === 'stores') {
    const stores = await api<AdminStore[]>('/admin/stores');
    content = (
      <table className="w-full text-sm">
        <tbody className="divide-y divide-stone-100">
          {stores.map((s) => (
            <tr key={s.id}>
              <td className={cell}>
                <Link href={`/s/${s.slug}`} className="font-medium hover:underline">
                  {s.name}
                </Link>
                <p className="text-xs text-stone-500">{s.ownerEmail}</p>
              </td>
              <td className={cell}>{s.city}</td>
              <td className={`${cell} text-right`}>
                {s.status === 'active' ? (
                  <AdminAction
                    path={`/admin/stores/${s.id}`}
                    body={{ status: 'suspended' }}
                    label={t('suspend')}
                    danger
                  />
                ) : (
                  <AdminAction
                    path={`/admin/stores/${s.id}`}
                    body={{ status: 'active' }}
                    label={t('activate')}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else if (tab === 'products') {
    const products = await api<AdminProduct[]>('/admin/products');
    content = (
      <table className="w-full text-sm">
        <tbody className="divide-y divide-stone-100">
          {products.map((p) => (
            <tr key={p.id}>
              <td className={cell}>
                <Link href={`/p/${p.slug}`} className="font-medium hover:underline">
                  {p.title}
                </Link>
                <p className="text-xs text-stone-500">{p.store.name}</p>
              </td>
              <td className={cell}>{p.status}</td>
              <td className={`${cell} text-right`}>
                {p.status === 'blocked' ? (
                  <AdminAction
                    path={`/admin/products/${p.id}`}
                    body={{ status: 'active' }}
                    label={t('unblock')}
                  />
                ) : (
                  <AdminAction
                    path={`/admin/products/${p.id}`}
                    body={{ status: 'blocked' }}
                    label={t('block')}
                    danger
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else if (tab === 'disputes') {
    const td = await getTranslations('disputes');
    const list = await api<DisputeView[]>('/admin/disputes');
    content = (
      <table className="w-full text-sm">
        <tbody className="divide-y divide-stone-100">
          {list.map((d) => (
            <tr key={d.id}>
              <td className={cell}>
                <Link href={`/account/disputes/${d.id}`} className="font-medium hover:underline">
                  {d.reason}
                </Link>
                <p className="line-clamp-1 text-xs text-stone-500">{d.description}</p>
              </td>
              <td className={cell}>{money(d.requestedAmount, d.currency, locale)}</td>
              <td className={cell}>{td(`status.${d.status}`)}</td>
              <td className={`${cell} text-xs text-stone-500`}>{dateTime(d.createdAt, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else {
    const events = await api<AuditEvent[]>('/admin/audit');
    content = (
      <table className="w-full text-sm">
        <tbody className="divide-y divide-stone-100">
          {events.map((e) => (
            <tr key={e.id}>
              <td className={cell}>
                {ta.has(`actions.${e.action}`)
                  ? ta(`actions.${e.action}` as 'actions.login')
                  : e.action}
              </td>
              <td className={`${cell} font-mono text-xs text-stone-500`}>
                {e.userId?.slice(0, 8) ?? '—'}
              </td>
              <td className={`${cell} text-xs text-stone-500`}>{e.ip ?? ''}</td>
              <td className={`${cell} text-xs text-stone-500`}>{dateTime(e.createdAt, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <h1 className="font-display text-4xl">{t('title')}</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(['users', 'sellers', 'twoFactor', 'newThisWeek'] as const).map((k) => (
          <div key={k} className="card p-5">
            <p className="text-sm text-stone-500">{t(`stats.${k}`)}</p>
            <p className="mt-1 text-3xl font-bold">{stats[k]}</p>
          </div>
        ))}
      </div>
      {sales && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <div className="card p-5">
            <p className="text-sm text-stone-500">{t('gmv')}</p>
            <p className="mt-1 text-2xl font-bold">{money(sales.gmvCop, 'COP', locale)}</p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-stone-500">{t('commission')}</p>
            <p className="mt-1 text-2xl font-bold">{money(sales.commissionCop, 'COP', locale)}</p>
          </div>
          <div className="card p-5">
            <p className="text-sm text-stone-500">{t('orders')}</p>
            <p className="mt-1 text-2xl font-bold">{sales.orders}</p>
          </div>
        </div>
      )}
      <nav className="flex flex-wrap gap-2">
        {TABS.map((x) => (
          <Link
            key={x}
            href={`/admin?tab=${x}`}
            className={`rounded-full px-4 py-2 text-sm font-medium ${x === tab ? 'bg-ink text-white' : 'bg-white ring-1 ring-stone-200'}`}
          >
            {t(x)}
          </Link>
        ))}
      </nav>
      <section className="card overflow-x-auto">{content}</section>
    </div>
  );
}

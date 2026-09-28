import 'server-only';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { Role } from '@mercadia/contracts';
import { session } from './api';

/** Server-side page guard (the services enforce the same rules on every call). */
export async function requireUser(path: string, role?: Role) {
  const user = await session();
  const locale = await getLocale();
  if (!user) redirect({ href: `/login?next=${encodeURIComponent(path)}`, locale });
  if (role && !user!.roles.includes(role))
    redirect({ href: role === 'seller' ? '/sell' : '/', locale });
  return user!;
}

'use client';

import { ChevronDown, LogOut, Package, Shield, Store, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';

export function AccountMenu({ name, roles }: { name: string; roles: string[] }) {
  const t = useTranslations('nav');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setOpen(false);
    router.push('/');
    router.refresh();
  };

  const item = 'flex items-center gap-2 px-4 py-2 text-sm hover:bg-stone-50';
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
        aria-expanded={open}
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-xs font-bold text-white">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-28 truncate lg:inline">{name.split(' ')[0]}</span>
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-2xl bg-white py-1 shadow-xl ring-1 ring-stone-200"
          onClick={() => setOpen(false)}
        >
          <Link href="/account" className={item}>
            <User className="h-4 w-4" /> {t('account')}
          </Link>
          <Link href="/account/orders" className={item}>
            <Package className="h-4 w-4" /> {t('orders')}
          </Link>
          <Link href={roles.includes('seller') ? '/seller' : '/sell'} className={item}>
            <Store className="h-4 w-4" /> {roles.includes('seller') ? t('sellerCenter') : t('sell')}
          </Link>
          {roles.includes('admin') && (
            <Link href="/admin" className={item}>
              <Shield className="h-4 w-4" /> {t('admin')}
            </Link>
          )}
          <button
            type="button"
            onClick={logout}
            className={`${item} w-full border-t border-stone-100 text-left`}
          >
            <LogOut className="h-4 w-4" /> {t('logout')}
          </button>
        </div>
      )}
    </div>
  );
}

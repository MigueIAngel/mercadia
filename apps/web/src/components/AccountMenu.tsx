'use client';

import {
  ChevronDown,
  Heart,
  LogOut,
  MessageCircle,
  Package,
  Shield,
  Store,
  User,
  Wallet,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { Avatar } from './ui/Avatar';

export function AccountMenu({
  name,
  roles,
  picture,
}: {
  name: string;
  roles: string[];
  picture?: string;
}) {
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
        <Avatar name={name} src={picture} size={28} />
        <span className="hidden max-w-28 truncate lg:inline">{name.split(' ')[0]}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className="absolute right-0 z-40 mt-2 w-60 origin-top-right animate-scale-in overflow-hidden rounded-2xl bg-white py-1 shadow-xl ring-1 ring-stone-200"
          onClick={() => setOpen(false)}
        >
          <div className="flex items-center gap-3 border-b border-stone-100 px-4 py-3">
            <Avatar name={name} src={picture} size={40} />
            <span className="min-w-0 truncate font-semibold">{name}</span>
          </div>
          <Link href="/account" className={item}>
            <User className="h-4 w-4" /> {t('account')}
          </Link>
          <Link href="/account/orders" className={item}>
            <Package className="h-4 w-4" /> {t('orders')}
          </Link>
          <Link href="/account/payment-methods" className={item}>
            <Wallet className="h-4 w-4" /> {t('paymentMethods')}
          </Link>
          <Link href="/messages" className={item}>
            <MessageCircle className="h-4 w-4" /> {t('messages')}
          </Link>
          <Link href="/wishlist" className={item}>
            <Heart className="h-4 w-4" /> {t('wishlist')}
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

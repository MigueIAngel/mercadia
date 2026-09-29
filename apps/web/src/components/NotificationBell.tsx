'use client';

import { Bell } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { call } from '@/lib/client';
import { useRealtime } from '@/lib/realtime';
import { PanelLoader } from '@/components/ui/Spinner';

export interface AppNotification {
  _id: string;
  type: string;
  params: Record<string, string | number>;
  link: string;
  read: boolean;
  createdAt: string;
}

const KNOWN = new Set([
  'welcome',
  'order_paid',
  'new_sale',
  'order_shipped',
  'out_for_delivery',
  'order_delivered',
  'order_cancelled',
  'refund',
  'dispute_opened',
  'dispute_resolved',
  'price_drop',
  'new_message',
]);

/** Renders a notification in the reader's language from its type and params. */
export function useNotificationText() {
  const t = useTranslations('notifications.types');
  return (n: AppNotification) =>
    KNOWN.has(n.type) ? t(n.type as 'welcome', n.params) : n.type.replaceAll('_', ' ');
}

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const t = useTranslations('notifications');
  const format = useFormatter();
  const text = useNotificationText();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useRealtime<AppNotification>('notification', (n) => {
    setUnread((u) => u + 1);
    setItems((list) => (list ? [n, ...list] : list));
  });

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next) return;
    const list = await call<AppNotification[]>('/api/bff/notifications').catch(() => []);
    setItems(list);
    if (unread > 0) {
      setUnread(0);
      await call('/api/bff/notifications/read', { body: {} }).catch(() => undefined);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        className="relative rounded-full p-2 hover:bg-stone-100"
        aria-label={t('title')}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-stone-200">
          <p className="border-b border-stone-100 px-4 py-3 text-sm font-semibold">{t('title')}</p>
          <div className="max-h-96 overflow-y-auto">
            {items === null ? (
              <PanelLoader className="py-6" />
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-stone-500">{t('empty')}</p>
            ) : (
              items.map((n) => (
                <Link
                  key={n._id}
                  href={n.link || '/'}
                  onClick={() => setOpen(false)}
                  className={`block border-b border-stone-50 px-4 py-3 text-sm hover:bg-stone-50 ${n.read ? '' : 'bg-accent-50/60'}`}
                >
                  <span className="block">{text(n)}</span>
                  <span className="mt-0.5 block text-xs text-stone-500">
                    {format.relativeTime(new Date(n.createdAt))}
                  </span>
                </Link>
              ))
            )}
          </div>
          <Link
            href="/messages"
            onClick={() => setOpen(false)}
            className="block border-t border-stone-100 px-4 py-2.5 text-center text-sm font-medium text-accent-600 hover:bg-stone-50"
          >
            {t('messages')}
          </Link>
        </div>
      )}
    </div>
  );
}

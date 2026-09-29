'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { call } from '@/lib/client';
import { Spinner } from '@/components/ui/Spinner';

export function WishlistRemove({ productId }: { productId: string }) {
  const t = useTranslations('wishlist');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-label={t('remove')}
      title={t('remove')}
      onClick={async () => {
        setBusy(true);
        await call(`/api/bff/wishlist/${productId}`, { method: 'DELETE' }).catch(() => undefined);
        router.refresh();
      }}
      className="grid h-8 w-8 place-items-center rounded-full bg-white ring-1 ring-stone-200 hover:ring-ink"
    >
      {busy ? <Spinner /> : <X className="h-4 w-4" />}
    </button>
  );
}

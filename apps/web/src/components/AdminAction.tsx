'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { call } from '@/lib/client';
import { Spinner } from '@/components/ui/Spinner';

export function AdminAction({
  path,
  body,
  label,
  danger,
}: {
  path: string;
  body: unknown;
  label: string;
  danger?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await call(`/api/bff${path}`, { method: 'PATCH', body });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${danger ? 'text-rose-700 ring-rose-200 hover:bg-rose-50' : 'text-emerald-700 ring-emerald-200 hover:bg-emerald-50'} inline-flex items-center gap-1`}
    >
      {busy && <Spinner className="h-3 w-3" />}
      {label}
    </button>
  );
}

'use client';

import { Heart, MessageCircle, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { call } from '@/lib/client';

interface Props {
  productId: string;
  productSlug: string;
  storeId: string;
  signedIn: boolean;
  ownStore: boolean;
}

/** Wishlist toggle and "ask the seller" (starts or reopens a conversation about the product). */
export function ProductSocial({ productId, productSlug, storeId, signedIn, ownStore }: Props) {
  const t = useTranslations('product');
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const login = () => router.push(`/login?next=${encodeURIComponent(`/p/${productSlug}`)}`);

  useEffect(() => {
    if (!signedIn) return;
    call<string[]>('/api/bff/wishlist/ids').then(
      (ids) => setSaved(ids.includes(productId)),
      () => undefined,
    );
  }, [signedIn, productId]);

  const toggle = async () => {
    if (!signedIn) return login();
    const next = !saved;
    setSaved(next);
    try {
      if (next) await call('/api/bff/wishlist', { body: { productId } });
      else await call(`/api/bff/wishlist/${productId}`, { method: 'DELETE' });
    } catch {
      setSaved(!next);
    }
  };

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { conversation } = await call<{ conversation: { _id: string } }>(
        '/api/bff/conversations',
        { body: { storeId, productId, text } },
      );
      router.push(`/messages/${conversation._id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={saved}
          className="btn border border-stone-300 bg-white px-4 py-2 text-sm hover:border-ink"
        >
          <Heart className={`h-4 w-4 ${saved ? 'fill-rose-500 text-rose-500' : ''}`} />
          {saved ? t('saved') : t('wishlist')}
        </button>
        {!ownStore && (
          <button
            type="button"
            onClick={() => (signedIn ? setAsking((a) => !a) : login())}
            aria-expanded={asking}
            className="btn border border-stone-300 bg-white px-4 py-2 text-sm hover:border-ink"
          >
            <MessageCircle className="h-4 w-4" /> {t('askSeller')}
          </button>
        )}
      </div>
      {asking && (
        <form onSubmit={ask} className="card space-y-2 p-4">
          <label htmlFor="question" className="label">
            {t('askLabel')}
          </label>
          <textarea
            id="question"
            required
            maxLength={2000}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('askPlaceholder')}
            className="field"
          />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button disabled={busy || !text.trim()} className="btn-primary px-4 py-2 text-sm">
            <Send className="h-4 w-4" /> {t('askSend')}
          </button>
        </form>
      )}
    </div>
  );
}

'use client';

import { BadgeCheck, Store, ThumbsUp } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Rating } from '@/components/Rating';
import { call } from '@/lib/client';

export interface ReviewView {
  _id: string;
  authorName: string;
  rating: number;
  title: string;
  comment: string;
  verified: boolean;
  helpfulCount?: number;
  reply: { text: string; at: string } | null;
  createdAt: string;
}

export interface ReviewPage {
  summary: { avg: number; count: number; distribution: number[] };
  items: ReviewView[];
  page: number;
}

type Sort = 'recent' | 'helpful' | 'rating';

function ReviewForm({ productId, onCreated }: { productId: string; onCreated: () => void }) {
  const t = useTranslations('reviews');
  const [rating, setRating] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await call('/api/bff/reviews', {
        body: {
          productId,
          rating,
          title: String(form.get('title') ?? '') || undefined,
          comment: String(form.get('comment')),
        },
      });
      onCreated();
    } catch (err) {
      const message = (err as Error).message;
      setError(
        /Only buyers/.test(message)
          ? t('onlyBuyers')
          : /already/.test(message)
            ? t('already')
            : message,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl bg-stone-50 p-4">
      <fieldset>
        <legend className="label">{t('yourRating')}</legend>
        <div className="flex gap-1 text-2xl" role="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n}/5`}
              onClick={() => setRating(n)}
              className={n <= rating ? 'text-amber-500' : 'text-stone-300'}
            >
              ★
            </button>
          ))}
        </div>
      </fieldset>
      <input name="title" maxLength={120} placeholder={t('titlePlaceholder')} className="field" />
      <textarea
        name="comment"
        required
        minLength={10}
        maxLength={3000}
        rows={3}
        placeholder={t('commentPlaceholder')}
        className="field"
      />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button disabled={busy} className="btn-primary px-4 py-2 text-sm">
        {t('publish')}
      </button>
    </form>
  );
}

export function Reviews({
  productId,
  initial,
  signedIn,
}: {
  productId: string;
  initial: ReviewPage;
  signedIn: boolean;
}) {
  const t = useTranslations('reviews');
  const format = useFormatter();
  const [data, setData] = useState(initial);
  const [sort, setSort] = useState<Sort>('recent');
  const [writing, setWriting] = useState(false);
  const [voted, setVoted] = useState<Record<string, number>>({});
  const { summary } = data;

  const load = async (nextSort: Sort, page = 1) => {
    const res = await call<ReviewPage>(
      `/api/bff/reviews/products/${productId}?sort=${nextSort}&page=${page}`,
    );
    setData((d) => (page === 1 ? res : { ...res, items: [...d.items, ...res.items] }));
  };

  const vote = async (id: string) => {
    if (!signedIn || voted[id] !== undefined) return;
    const { helpful } = await call<{ helpful: number }>(`/api/bff/reviews/${id}/helpful`, {
      method: 'POST',
    });
    setVoted((v) => ({ ...v, [id]: helpful }));
  };

  return (
    <section id="reviews" className="card mt-8 scroll-mt-28 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-2xl">{t('title')}</h2>
        {signedIn && !writing && (
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="btn border border-stone-300 bg-white px-4 py-2 text-sm hover:border-ink"
          >
            {t('write')}
          </button>
        )}
      </div>

      <div className="mt-5 grid gap-8 md:grid-cols-[220px_1fr]">
        <div>
          <p className="font-display text-5xl">{summary.count ? summary.avg.toFixed(1) : '–'}</p>
          <Rating value={summary.avg} />
          <p className="mt-1 text-sm text-stone-500">{t('count', { count: summary.count })}</p>
          <ul className="mt-4 space-y-1.5">
            {[5, 4, 3, 2, 1].map((stars) => {
              const n = summary.distribution[stars - 1] ?? 0;
              const pct = summary.count ? Math.round((n / summary.count) * 100) : 0;
              return (
                <li key={stars} className="flex items-center gap-2 text-xs text-stone-500">
                  <span className="w-3">{stars}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
                    <span className="block h-full bg-amber-500" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="w-8 text-right">{pct}%</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-5">
          {writing && (
            <ReviewForm
              productId={productId}
              onCreated={() => {
                setWriting(false);
                setSort('recent');
                void load('recent');
              }}
            />
          )}
          {summary.count > 1 && (
            <label className="flex items-center gap-2 text-sm text-stone-500">
              {t('sortBy')}
              <select
                value={sort}
                onChange={(e) => {
                  const next = e.target.value as Sort;
                  setSort(next);
                  void load(next);
                }}
                className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm text-ink"
              >
                {(['recent', 'helpful', 'rating'] as const).map((s) => (
                  <option key={s} value={s}>
                    {t(`sorts.${s}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {data.items.length === 0 && <p className="text-stone-500">{t('empty')}</p>}
          {data.items.map((r) => (
            <article key={r._id} className="border-b border-stone-100 pb-5 last:border-0">
              <div className="flex flex-wrap items-center gap-2">
                <Rating value={r.rating} />
                {r.title && <h3 className="font-semibold">{r.title}</h3>}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                <span>{r.authorName}</span>
                <span>·</span>
                <time dateTime={r.createdAt}>
                  {format.dateTime(new Date(r.createdAt), { dateStyle: 'medium' })}
                </time>
                {r.verified && (
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <BadgeCheck className="h-3.5 w-3.5" /> {t('verified')}
                  </span>
                )}
              </p>
              <p className="mt-2 leading-relaxed whitespace-pre-line text-stone-700">{r.comment}</p>
              {r.reply && (
                <div className="mt-3 rounded-xl bg-stone-50 p-3 text-sm">
                  <p className="mb-1 flex items-center gap-1.5 font-semibold">
                    <Store className="h-4 w-4" /> {t('sellerReply')}
                  </p>
                  <p className="text-stone-700">{r.reply.text}</p>
                </div>
              )}
              <button
                type="button"
                onClick={() => vote(r._id)}
                disabled={!signedIn || voted[r._id] !== undefined}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-ink disabled:hover:text-stone-500"
              >
                <ThumbsUp className="h-3.5 w-3.5" />
                {t('helpful', { count: voted[r._id] ?? r.helpfulCount ?? 0 })}
              </button>
            </article>
          ))}
          {data.items.length < summary.count && (
            <button
              type="button"
              onClick={() => load(sort, data.page + 1)}
              className="btn border border-stone-300 bg-white px-4 py-2 text-sm hover:border-ink"
            >
              {t('more')}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

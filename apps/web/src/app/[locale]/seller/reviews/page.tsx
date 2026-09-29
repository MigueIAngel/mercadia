import { getLocale, getTranslations } from 'next-intl/server';
import { Rating } from '@/components/Rating';
import { ReviewReply } from '@/components/ReviewReply';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { requireUser } from '@/lib/guard';
import type { ProductSummary } from '@/lib/types';

interface StoreReview {
  _id: string;
  productId: string;
  authorName: string;
  rating: number;
  title: string;
  comment: string;
  reply: { text: string; at: string } | null;
  createdAt: string;
}

interface Reputation {
  avg: number;
  count: number;
  distribution: number[];
  replyRate: number;
}

export default async function SellerReviews() {
  const user = await requireUser('/seller/reviews', 'seller');
  const t = await getTranslations('reviews');
  const locale = await getLocale();
  const [reviews, reputation] = await Promise.all([
    api<StoreReview[]>('/seller/reviews'),
    api<Reputation>(`/reputation/stores/${user.storeId}`, { auth: false }),
  ]);
  const ids = [...new Set(reviews.map((r) => r.productId))];
  const products = ids.length
    ? await api<ProductSummary[]>('/products/by-ids', {
        method: 'POST',
        body: JSON.stringify({ ids }),
        auth: false,
      }).catch(() => [])
    : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const pending = reviews.filter((r) => !r.reply).length;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl">{t('sellerTitle')}</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-sm text-stone-500">{t('average')}</p>
          <p className="font-display text-3xl">
            {reputation.count ? reputation.avg.toFixed(1) : '–'}
          </p>
          <Rating value={reputation.avg} />
        </div>
        <div className="card p-4">
          <p className="text-sm text-stone-500">{t('total')}</p>
          <p className="font-display text-3xl">{reputation.count}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-stone-500">{t('replyRate')}</p>
          <p className="font-display text-3xl">{Math.round(reputation.replyRate * 100)}%</p>
          {pending > 0 && (
            <p className="text-xs text-amber-700">{t('pending', { count: pending })}</p>
          )}
        </div>
      </div>
      {reviews.length === 0 && <p className="card p-8 text-center text-stone-500">{t('empty')}</p>}
      {reviews.map((r) => {
        const product = byId.get(r.productId);
        return (
          <article key={r._id} className="card space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Rating value={r.rating} />
              <span className="text-xs text-stone-500">
                {r.authorName} · {dateTime(r.createdAt, locale)}
              </span>
            </div>
            {product && (
              <Link
                href={`/p/${product.slug}`}
                className="block text-xs text-stone-500 hover:underline"
              >
                {product.title}
              </Link>
            )}
            {r.title && <h2 className="font-semibold">{r.title}</h2>}
            <p className="text-sm text-stone-700">{r.comment}</p>
            {r.reply ? (
              <p className="rounded-xl bg-stone-50 p-3 text-sm">
                <span className="font-semibold">{t('sellerReply')}: </span>
                {r.reply.text}
              </p>
            ) : (
              <ReviewReply reviewId={r._id} />
            )}
          </article>
        );
      })}
    </div>
  );
}

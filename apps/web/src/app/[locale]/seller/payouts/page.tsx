import { getLocale, getTranslations } from 'next-intl/server';
import { ConnectPayouts } from '@/components/seller/SellerOrderActions';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';

interface Payouts {
  provider: string;
  payoutsEnabled: boolean;
  totals: { held: number; released: number; commission: number };
  transfers: {
    id: string;
    storeName: string;
    gross: number;
    commission: number;
    amount: number;
    currency: 'COP' | 'USD';
    status: string;
    createdAt: string;
    orderId: string;
  }[];
}

export default async function SellerPayouts() {
  const t = await getTranslations('seller');
  const locale = await getLocale();
  const data = await api<Payouts>('/seller/payouts');
  const cop = (n: number) => money(n, 'COP', locale);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">{t('payouts')}</h1>
        {data.payoutsEnabled ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
            {t('payoutsOn')} · {data.provider}
          </span>
        ) : (
          <ConnectPayouts />
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ['held', data.totals.held],
            ['released', data.totals.released],
            ['commission', data.totals.commission],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="card p-5">
            <p className="text-sm text-stone-500">{t(k)}</p>
            <p className="mt-1 text-2xl font-bold">{cop(v)}</p>
          </div>
        ))}
      </div>
      <section className="card overflow-x-auto">
        <p className="p-4 font-semibold">{t('transfers')}</p>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-stone-100">
            {data.transfers.map((tr) => (
              <tr key={tr.id}>
                <td className="p-3 text-stone-500">{dateTime(tr.createdAt, locale)}</td>
                <td className="p-3">{money(tr.gross, tr.currency, locale)}</td>
                <td className="p-3 text-stone-500">-{money(tr.commission, tr.currency, locale)}</td>
                <td className="p-3 font-semibold">{money(tr.amount, tr.currency, locale)}</td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tr.status === 'released' ? 'bg-emerald-50 text-emerald-700' : tr.status === 'held' ? 'bg-amber-50 text-amber-700' : 'bg-stone-100 text-stone-500'}`}
                  >
                    {tr.status === 'held'
                      ? t('held')
                      : tr.status === 'released'
                        ? t('released')
                        : tr.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

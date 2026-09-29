'use client';

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import clsx from 'clsx';
import { CheckCircle2, CreditCard, Lock, Plus, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type { Currency } from '@mercadia/contracts';
import { Link, useRouter } from '@/i18n/navigation';
import { call } from '@/lib/client';
import { money } from '@/lib/format';
import { BrandMark, CardFace, expiryOf, type SavedMethod } from '../payments/CardFace';
import { PaymentOverlay, type PaymentPhase } from '../payments/PaymentOverlay';
import { TestCardForm, type CardInput } from '../payments/TestCardForm';
import { Spinner } from '../ui/Spinner';

interface Payment {
  id: string;
  provider: 'stripe' | 'mock';
  status: string;
  failureReason: string | null;
  clientSecret: string | null;
  publishableKey: string | null;
  card: { brand: string; last4: string } | null;
  nextActionClientSecret?: string | null;
}

/** The wait animation stays at least this long, even when the processor answers at once. */
const MIN_PROCESSING_MS = 2400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function StripeForm({
  amount,
  onStart,
  onConfirmed,
  onError,
}: {
  amount: string;
  onStart: () => void;
  onConfirmed: () => void;
  onError: (reason: string) => void;
}) {
  const t = useTranslations('pay');
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;
        onStart();
        const result = await stripe.confirmPayment({
          elements,
          redirect: 'if_required',
          confirmParams: { return_url: window.location.href },
        });
        if (result.error) onError(result.error.decline_code ?? result.error.code ?? 'generic');
        else onConfirmed();
      }}
    >
      {!ready && <div className="skeleton h-48" />}
      <PaymentElement onReady={() => setReady(true)} />
      <button disabled={!stripe || !ready} className="btn-accent w-full py-3">
        <Lock className="h-4 w-4" /> {t('pay', { amount })}
      </button>
      <p className="text-center text-xs text-stone-500">{t('stripeNote')}</p>
    </form>
  );
}

function PaySkeleton() {
  return (
    <div className="space-y-3" aria-busy>
      <div className="skeleton h-20" />
      <div className="skeleton h-20" />
      <div className="skeleton h-12 rounded-full" />
    </div>
  );
}

export function PayClient({
  orderId,
  number,
  total,
  currency,
}: {
  orderId: string;
  number: number;
  total: number;
  currency: Currency;
}) {
  const t = useTranslations('pay');
  const locale = useLocale();
  const router = useRouter();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [methods, setMethods] = useState<SavedMethod[] | null>(null);
  const [selected, setSelected] = useState<string>('new');
  const [phase, setPhase] = useState<PaymentPhase | null>(null);
  const [error, setError] = useState('');
  const amount = money(total, currency, locale);

  useEffect(() => {
    Promise.all([
      call<Payment>('/api/bff/payments/intents', { body: { orderId } }),
      call<SavedMethod[]>('/api/bff/payments/methods').catch(() => []),
    ]).then(
      ([p, m]) => {
        setPayment(p);
        setMethods(m);
        if (m.length > 0) setSelected((m.find((x) => x.isDefault) ?? m[0]).id);
      },
      (e) => setError(e.message),
    );
  }, [orderId]);

  const stripePromise = useMemo<Promise<Stripe | null> | null>(
    () => (payment?.publishableKey ? loadStripe(payment.publishableKey) : null),
    [payment?.publishableKey],
  );

  /** A declined intent cannot be reused: retries start a new one. */
  const openPayment = async () =>
    payment && payment.status !== 'failed'
      ? payment
      : call<Payment>('/api/bff/payments/intents', { body: { orderId } });

  /** After Stripe confirms in the browser, the webhook records the result: poll for it. */
  const waitForResult = async () => {
    for (let i = 0; i < 20; i++) {
      const p = await call<Payment>(`/api/bff/payments/orders/${orderId}`);
      if (p.status !== 'requires_payment') return p;
      await sleep(1500);
    }
    return call<Payment>(`/api/bff/payments/orders/${orderId}`);
  };

  const run = async (work: () => Promise<Payment>) => {
    const started = Date.now();
    setPhase({ kind: 'processing' });
    let result: Payment | null = null;
    let reason = 'generic';
    try {
      result = await work();
      reason = result.failureReason ?? 'generic';
    } catch (err) {
      reason = (err as Error).message;
    }
    await sleep(Math.max(0, MIN_PROCESSING_MS - (Date.now() - started)));
    if (result) setPayment({ ...result, clientSecret: null });
    if (result?.status === 'succeeded') {
      const card = result.card;
      setPhase({
        kind: 'success',
        amount,
        card: card ? `${card.brand.toUpperCase()} •••• ${card.last4}` : undefined,
      });
      router.refresh();
    } else {
      setPhase({ kind: 'failed', reason });
    }
  };

  const paySaved = (methodId: string) =>
    run(async () => {
      const current = await openPayment();
      const p = await call<Payment>(`/api/bff/payments/${current.id}/pay-saved`, {
        body: { methodId },
      });
      if (p.nextActionClientSecret) {
        // 3-D Secure: Stripe shows the bank's challenge, then the webhook settles it.
        const stripe = await stripePromise;
        const { error } = (await stripe?.handleNextAction({
          clientSecret: p.nextActionClientSecret,
        })) ?? { error: undefined };
        if (error) throw new Error(error.code ?? 'authentication_required');
        return waitForResult();
      }
      return p;
    });

  const payNewTestCard = (card: CardInput, save: boolean) =>
    run(async () => {
      const current = await openPayment();
      if (save) {
        const method = await call<SavedMethod>('/api/bff/payments/methods/test-card', {
          body: card,
        });
        setMethods((m) => [...(m ?? []).filter((x) => x.id !== method.id), method]);
        return call<Payment>(`/api/bff/payments/${current.id}/pay-saved`, {
          body: { methodId: method.id },
        });
      }
      return call<Payment>(`/api/bff/payments/${current.id}/confirm-test`, { body: card });
    });

  const done = payment?.status === 'succeeded' && !phase;

  return (
    <div className="mx-auto grid max-w-4xl animate-fade-up gap-6 lg:grid-cols-[1fr_20rem]">
      <PaymentOverlay
        phase={phase}
        onSuccessPrimary={() => router.push(`/account/orders/${orderId}`)}
        onSuccessSecondary={() => router.push('/')}
        onRetry={() => setPhase(null)}
      />
      <div className="card space-y-5 p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl">{t('title', { number })}</h1>
          <CreditCard className="h-6 w-6 text-stone-400" />
        </div>
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {done ? (
          <div className="space-y-4 py-6 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 animate-pop text-emerald-500" />
            <p className="font-semibold">{t('success')}</p>
            <Link href={`/account/orders/${orderId}`} className="btn-primary">
              {t('viewOrder')}
            </Link>
          </div>
        ) : !payment || !methods ? (
          !error && <PaySkeleton />
        ) : (
          <>
            {payment.status === 'failed' && (
              <p className="animate-fade-in rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
                {t('failed', {
                  reason: t.has(`reasons.${payment.failureReason}`)
                    ? t(`reasons.${payment.failureReason}` as 'reasons.generic')
                    : (payment.failureReason ?? ''),
                })}
              </p>
            )}
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-semibold">{t('chooseMethod')}</legend>
              {methods.map((m, i) => (
                <label
                  key={m.id}
                  className={clsx(
                    'flex animate-fade-up cursor-pointer items-center gap-4 rounded-2xl border-2 p-3 transition',
                    selected === m.id
                      ? 'border-accent-500 bg-accent-50/60 shadow-sm'
                      : 'border-stone-200 hover:border-stone-300',
                  )}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <input
                    type="radio"
                    name="method"
                    checked={selected === m.id}
                    onChange={() => setSelected(m.id)}
                    className="h-4 w-4 accent-accent-500"
                  />
                  <CardFace brand={m.brand} last4={m.last4} small className="!w-20 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold capitalize">
                      {m.brand} •••• {m.last4}
                    </span>
                    <span className="text-xs text-stone-500">
                      {t('expires', { date: expiryOf(m) })}
                      {m.isDefault && ` · ${t('default')}`}
                    </span>
                  </span>
                </label>
              ))}
              <label
                className={clsx(
                  'flex cursor-pointer items-center gap-4 rounded-2xl border-2 p-3 transition',
                  selected === 'new'
                    ? 'border-accent-500 bg-accent-50/60'
                    : 'border-stone-200 hover:border-stone-300',
                )}
              >
                <input
                  type="radio"
                  name="method"
                  checked={selected === 'new'}
                  onChange={() => setSelected('new')}
                  className="h-4 w-4 accent-accent-500"
                />
                <span className="grid h-[3.15rem] w-20 shrink-0 place-items-center rounded-xl border-2 border-dashed border-stone-300 text-stone-400">
                  <Plus className="h-5 w-5" />
                </span>
                <span className="font-semibold">{t('newCard')}</span>
              </label>
            </fieldset>

            {selected !== 'new' ? (
              <button
                type="button"
                disabled={!!phase}
                onClick={() => paySaved(selected)}
                className="btn-accent w-full animate-fade-in py-3"
              >
                {phase ? <Spinner /> : <Lock className="h-4 w-4" />} {t('pay', { amount })}
              </button>
            ) : payment.provider === 'stripe' && payment.clientSecret && stripePromise ? (
              <div className="animate-fade-up">
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret: payment.clientSecret,
                    locale: locale === 'en' ? 'en' : 'es',
                    appearance: { theme: 'stripe', variables: { colorPrimary: '#f97316' } },
                  }}
                >
                  <StripeForm
                    amount={amount}
                    onStart={() => setPhase({ kind: 'processing' })}
                    onConfirmed={() => run(waitForResult)}
                    onError={(reason) => setPhase({ kind: 'failed', reason })}
                  />
                </Elements>
              </div>
            ) : payment.provider === 'stripe' ? (
              <button
                type="button"
                onClick={() =>
                  call<Payment>('/api/bff/payments/intents', { body: { orderId } }).then(setPayment)
                }
                className="btn-outline w-full"
              >
                {t('tryAgain')}
              </button>
            ) : (
              <div className="animate-fade-up">
                <TestCardForm
                  submitLabel={t('pay', { amount })}
                  busy={!!phase}
                  allowSave
                  onSubmit={payNewTestCard}
                />
              </div>
            )}
          </>
        )}
      </div>

      <aside className="card h-fit space-y-4 p-6 lg:sticky lg:top-24">
        <p className="text-sm text-stone-500">{t('amount')}</p>
        <p className="font-display text-4xl">{amount}</p>
        <ul className="space-y-3 border-t border-stone-100 pt-4 text-sm text-stone-600">
          <li className="flex gap-2">
            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" /> {t('protected')}
          </li>
          <li className="flex gap-2">
            <Lock className="h-5 w-5 shrink-0 text-emerald-600" /> {t('secure')}
          </li>
        </ul>
        <div className="flex items-center gap-3 border-t border-stone-100 pt-4 text-stone-400">
          <BrandMark brand="visa" className="text-indigo-700" />
          <BrandMark brand="mastercard" />
          <span className="rounded bg-sky-600 px-1.5 text-xs font-black text-white">AMEX</span>
        </div>
        <p className="text-xs text-stone-500">{t('expiresIn')}</p>
      </aside>
    </div>
  );
}

'use client';

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { CheckCircle2, CreditCard, Lock } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type { Currency } from '@mercadia/contracts';
import { Link, useRouter } from '@/i18n/navigation';
import { call } from '@/lib/client';
import { money } from '@/lib/format';

interface Payment {
  id: string;
  provider: 'stripe' | 'mock';
  status: string;
  failureReason: string | null;
  clientSecret: string | null;
  publishableKey: string | null;
}

const TEST_CARDS = [
  ['4242 4242 4242 4242', 'approved'],
  ['4000 0000 0000 0002', 'declined'],
  ['4000 0000 0000 9995', 'insufficient'],
] as const;

function MockCardForm({
  orderId,
  payment,
  amount,
  onDone,
}: {
  orderId: string;
  payment: Payment;
  amount: string;
  onDone: (p: Payment) => void;
}) {
  const t = useTranslations('pay');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const [mm, yy] = String(form.get('expiry'))
      .split('/')
      .map((x) => Number(x.trim()));
    setBusy(true);
    try {
      // A retry after a decline needs a fresh intent.
      const current =
        payment.status === 'failed'
          ? await call<Payment>('/api/bff/payments/intents', { body: { orderId } })
          : payment;
      onDone(
        await call<Payment>(`/api/bff/payments/${current.id}/confirm-test`, {
          body: { number, expMonth: mm, expYear: yy, cvc: String(form.get('cvc')) },
        }),
      );
    } catch (err) {
      onDone({ ...payment, status: 'failed', failureReason: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-2xl bg-sky-50 p-4 text-sm ring-1 ring-sky-200">
        <p className="font-semibold">{t('testMode')}</p>
        <ul className="mt-2 space-y-1">
          {TEST_CARDS.map(([card, result]) => (
            <li key={card}>
              <button
                type="button"
                onClick={() => setNumber(card)}
                className="font-mono underline decoration-dotted"
              >
                {card}
              </button>{' '}
              → {t(result)}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <label className="label" htmlFor="number">
          {t('card')}
        </label>
        <input
          id="number"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="4242 4242 4242 4242"
          required
          className="field font-mono"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="expiry">
            {t('expiry')}
          </label>
          <input
            id="expiry"
            name="expiry"
            defaultValue="12/30"
            required
            pattern="\d{1,2}\s*/\s*\d{2,4}"
            className="field font-mono"
          />
        </div>
        <div>
          <label className="label" htmlFor="cvc">
            {t('cvc')}
          </label>
          <input
            id="cvc"
            name="cvc"
            defaultValue="123"
            required
            pattern="\d{3,4}"
            className="field font-mono"
          />
        </div>
      </div>
      <button disabled={busy} className="btn-accent w-full py-3">
        <Lock className="h-4 w-4" /> {busy ? t('paying') : t('pay', { amount })}
      </button>
    </form>
  );
}

function StripeForm({ amount, onDone }: { amount: string; onDone: () => void }) {
  const t = useTranslations('pay');
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;
        setBusy(true);
        const result = await stripe.confirmPayment({
          elements,
          redirect: 'if_required',
          confirmParams: { return_url: window.location.href },
        });
        if (result.error) setError(result.error.message ?? 'Error');
        else onDone();
        setBusy(false);
      }}
    >
      <PaymentElement />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button disabled={!stripe || busy} className="btn-accent w-full py-3">
        {busy ? t('paying') : t('pay', { amount })}
      </button>
      <p className="text-center text-xs text-stone-500">{t('stripeNote')}</p>
    </form>
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
  const [error, setError] = useState('');

  useEffect(() => {
    call<Payment>('/api/bff/payments/intents', { body: { orderId } }).then(setPayment, (e) =>
      setError(e.message),
    );
  }, [orderId]);

  const stripePromise = useMemo(
    () => (payment?.publishableKey ? loadStripe(payment.publishableKey) : null),
    [payment?.publishableKey],
  );

  // After Stripe confirms, the webhook marks the payment; poll until it lands.
  const waitForWebhook = async () => {
    for (let i = 0; i < 20; i++) {
      const p = await call<Payment>(`/api/bff/payments/orders/${orderId}`);
      if (p.status !== 'requires_payment') return setPayment({ ...p, clientSecret: null });
      await new Promise((r) => setTimeout(r, 1500));
    }
  };

  const succeeded = payment?.status === 'succeeded';
  useEffect(() => {
    if (succeeded) router.refresh();
  }, [succeeded, router]);

  return (
    <div className="card mx-auto max-w-lg space-y-5 p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">{t('title', { number })}</h1>
        <CreditCard className="h-6 w-6 text-stone-400" />
      </div>
      <p className="flex items-baseline justify-between">
        <span className="text-stone-500">{t('amount')}</span>
        <span className="text-2xl font-bold">{money(total, currency, locale)}</span>
      </p>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {succeeded ? (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <p className="font-semibold">{t('success')}</p>
          <Link href={`/account/orders/${orderId}`} className="btn-primary">
            {t('viewOrder')}
          </Link>
        </div>
      ) : payment ? (
        <>
          {payment.status === 'failed' && (
            <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
              {t('failed', { reason: payment.failureReason ?? '' })}
            </p>
          )}
          {payment.provider === 'stripe' && payment.clientSecret && stripePromise ? (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: payment.clientSecret,
                locale: locale === 'en' ? 'en' : 'es',
              }}
            >
              <StripeForm amount={money(total, currency, locale)} onDone={waitForWebhook} />
            </Elements>
          ) : (
            <MockCardForm
              orderId={orderId}
              payment={payment}
              amount={money(total, currency, locale)}
              onDone={setPayment}
            />
          )}
          <p className="text-center text-xs text-stone-500">{t('expiresIn')}</p>
        </>
      ) : (
        <p className="text-stone-500">…</p>
      )}
    </div>
  );
}

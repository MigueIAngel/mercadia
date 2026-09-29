'use client';

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import clsx from 'clsx';
import { Plus, Star, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { call } from '@/lib/client';
import { toast } from '@/lib/toast';
import { CardFace, expiryOf, type SavedMethod } from '../payments/CardFace';
import { TestCardForm, type CardInput } from '../payments/TestCardForm';
import { Spinner } from '../ui/Spinner';

type Setup =
  { provider: 'mock' } | { provider: 'stripe'; clientSecret: string; publishableKey: string };

function StripeSetupForm({ onSaved }: { onSaved: (m: SavedMethod) => void }) {
  const t = useTranslations('methods');
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;
        setBusy(true);
        setError('');
        const result = await stripe.confirmSetup({
          elements,
          redirect: 'if_required',
          confirmParams: { return_url: window.location.href },
        });
        if (result.error || !result.setupIntent) {
          setError(result.error?.message ?? 'Error');
          setBusy(false);
          return;
        }
        try {
          onSaved(
            await call<SavedMethod>('/api/bff/payments/methods/complete', {
              body: { setupIntentId: result.setupIntent.id },
            }),
          );
        } catch (err) {
          setError((err as Error).message);
        }
        setBusy(false);
      }}
    >
      {!ready && <div className="skeleton h-40" />}
      <PaymentElement onReady={() => setReady(true)} />
      {error && <p className="animate-shake text-sm text-rose-600">{error}</p>}
      <button disabled={!stripe || !ready || busy} className="btn-accent w-full py-3">
        {busy && <Spinner />} {t('saveCard')}
      </button>
      <p className="text-center text-xs text-stone-500">{t('stripeNote')}</p>
    </form>
  );
}

/** Saved cards: add one (Stripe SetupIntent or simulated), pick the default, remove. */
export function PaymentMethods({ initial }: { initial: SavedMethod[] }) {
  const t = useTranslations('methods');
  const [methods, setMethods] = useState(initial);
  const [adding, setAdding] = useState<Setup | 'loading' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const stripePromise = useMemo(
    () =>
      adding && adding !== 'loading' && adding.provider === 'stripe'
        ? loadStripe(adding.publishableKey)
        : null,
    [adding],
  );

  const startAdding = async () => {
    setAdding('loading');
    try {
      setAdding(await call<Setup>('/api/bff/payments/methods/setup', { body: {} }));
    } catch (err) {
      toast.error((err as Error).message);
      setAdding(null);
    }
  };

  const saved = (method: SavedMethod) => {
    setMethods((list) => [...list.filter((m) => m.id !== method.id), method]);
    setAdding(null);
    toast.success(t('saved', { last4: method.last4 }));
  };

  const saveTest = async (card: CardInput) => {
    setBusy('new');
    try {
      saved(await call<SavedMethod>('/api/bff/payments/methods/test-card', { body: card }));
    } catch (err) {
      const reason = (err as Error).message;
      toast.error(
        t.has(`reasons.${reason}`) ? t(`reasons.${reason}` as 'reasons.card_declined') : reason,
      );
    }
    setBusy(null);
  };

  const makeDefault = async (id: string) => {
    setBusy(id);
    try {
      setMethods(
        await call<SavedMethod[]>(`/api/bff/payments/methods/${id}/default`, { body: {} }),
      );
      toast.success(t('defaultChanged'));
    } catch (err) {
      toast.error((err as Error).message);
    }
    setBusy(null);
  };

  const remove = async (id: string) => {
    setBusy(id);
    try {
      await call(`/api/bff/payments/methods/${id}`, { method: 'DELETE' });
      setMethods(await call<SavedMethod[]>('/api/bff/payments/methods'));
      toast.success(t('removed'));
    } catch (err) {
      toast.error((err as Error).message);
    }
    setConfirming(null);
    setBusy(null);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        {methods.map((m, i) => (
          <div
            key={m.id}
            className={clsx(
              'group animate-fade-up space-y-3 transition-opacity',
              busy === m.id && 'opacity-60',
            )}
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="relative transition duration-300 group-hover:-translate-y-1 group-hover:rotate-[-1deg]">
              <CardFace brand={m.brand} last4={m.last4} expiry={expiryOf(m)} />
              {m.isDefault && (
                <span className="absolute top-3 left-1/2 flex -translate-x-1/2 animate-pop items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-ink shadow">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {t('default')}
                </span>
              )}
            </div>
            {confirming === m.id ? (
              <div className="flex animate-fade-in items-center justify-between gap-2 rounded-2xl bg-rose-50 p-2 pl-4 text-sm">
                <span>{t('confirmRemove')}</span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => remove(m.id)}
                    disabled={busy === m.id}
                    className="btn bg-rose-600 px-3 py-1.5 text-white hover:bg-rose-700"
                  >
                    {busy === m.id && <Spinner />} {t('remove')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="btn px-3 py-1.5 hover:bg-white"
                    aria-label={t('cancel')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              </div>
            ) : (
              <div className="flex gap-2">
                {!m.isDefault && (
                  <button
                    type="button"
                    onClick={() => makeDefault(m.id)}
                    disabled={!!busy}
                    className="btn-outline flex-1 py-2"
                  >
                    {busy === m.id ? <Spinner /> : <Star className="h-4 w-4" />} {t('makeDefault')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setConfirming(m.id)}
                  disabled={!!busy}
                  className="btn-outline py-2 text-rose-600 hover:border-rose-400"
                >
                  <Trash2 className="h-4 w-4" /> {t('remove')}
                </button>
              </div>
            )}
          </div>
        ))}

        {!adding && (
          <button
            type="button"
            onClick={startAdding}
            className="group grid aspect-[1.586] animate-fade-up place-items-center rounded-2xl border-2 border-dashed border-stone-300 text-stone-500 transition hover:border-accent-500 hover:bg-accent-50/50 hover:text-accent-600"
            style={{ animationDelay: `${methods.length * 80}ms` }}
          >
            <span className="flex flex-col items-center gap-2 font-semibold">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white shadow-sm ring-1 ring-stone-200 transition group-hover:scale-110 group-hover:rotate-90">
                <Plus className="h-6 w-6" />
              </span>
              {t('add')}
            </span>
          </button>
        )}
      </div>

      {methods.length === 0 && !adding && (
        <p className="text-center text-sm text-stone-500">{t('empty')}</p>
      )}

      {adding && (
        <div className="card relative animate-scale-in p-6">
          <button
            type="button"
            onClick={() => setAdding(null)}
            className="absolute top-4 right-4 rounded-full p-1.5 text-stone-400 hover:bg-stone-100"
            aria-label={t('cancel')}
          >
            <X className="h-5 w-5" />
          </button>
          <h3 className="mb-4 text-lg font-semibold">{t('add')}</h3>
          {adding === 'loading' ? (
            <div className="skeleton h-72" />
          ) : adding.provider === 'stripe' && stripePromise ? (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: adding.clientSecret,
                appearance: { theme: 'stripe', variables: { colorPrimary: '#f97316' } },
              }}
            >
              <StripeSetupForm onSaved={saved} />
            </Elements>
          ) : (
            <div className="mx-auto max-w-md">
              <TestCardForm submitLabel={t('saveCard')} busy={busy === 'new'} onSubmit={saveTest} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Spinner } from '../ui/Spinner';
import { brandOf, CardFace } from './CardFace';

export interface CardInput {
  number: string;
  expMonth: number;
  expYear: number;
  cvc: string;
}

const TEST_CARDS = [
  ['4242 4242 4242 4242', 'approved'],
  ['5555 5555 5555 4444', 'approved'],
  ['4000 0000 0000 0002', 'declined'],
  ['4000 0000 0000 9995', 'insufficient'],
] as const;

const groups = (value: string) =>
  value
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, '$1 ');

const expiryMask = (value: string) => {
  const d = value.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

/**
 * Card form of the simulated processor, with a live card preview that flips to show the
 * CVC. Test numbers from Stripe decide the result, and no real card is ever charged.
 */
export function TestCardForm({
  submitLabel,
  busy,
  onSubmit,
  allowSave = false,
}: {
  submitLabel: string;
  busy: boolean;
  onSubmit: (card: CardInput, save: boolean) => void;
  allowSave?: boolean;
}) {
  const t = useTranslations('pay');
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('12/30');
  const [cvc, setCvc] = useState('123');
  const [holder, setHolder] = useState('');
  const [save, setSave] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const brand = brandOf(number);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const [mm, yy] = expiry.split('/').map(Number);
        onSubmit({ number, expMonth: mm, expYear: yy, cvc }, allowSave && save);
      }}
    >
      <div className="mx-auto max-w-xs [perspective:1000px]">
        <div
          className="relative transition-transform duration-700 [transform-style:preserve-3d]"
          style={{ transform: flipped ? 'rotateY(180deg)' : 'none' }}
        >
          <div className="[backface-visibility:hidden]">
            <CardFace
              brand={brand}
              number={number}
              expiry={expiry || 'MM/AA'}
              holder={holder || t('holderPlaceholder')}
            />
          </div>
          <div className="absolute inset-0 [transform:rotateY(180deg)] [backface-visibility:hidden]">
            <div className="flex aspect-[1.586] w-full flex-col justify-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-stone-800 to-stone-600 shadow-lg">
              <span className="h-9 w-full bg-black/70" />
              <div className="flex items-center justify-end gap-2 px-5">
                <span className="h-7 flex-1 rounded bg-white/80" />
                <span className="rounded bg-white px-2 py-1 font-mono text-sm text-ink">
                  {cvc.padEnd(3, '•')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-sky-50 p-3 text-xs ring-1 ring-sky-200">
        <p className="font-semibold">{t('testMode')}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TEST_CARDS.map(([card, result]) => (
            <button
              key={card}
              type="button"
              onClick={() => setNumber(card)}
              className="rounded-full bg-white px-2.5 py-1 font-mono ring-1 ring-sky-200 transition hover:-translate-y-0.5 hover:ring-sky-400"
            >
              •••• {card.slice(-4)} <span className="font-sans text-stone-500">{t(result)}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="cc-number">
          {t('card')}
        </label>
        <input
          id="cc-number"
          value={number}
          onChange={(e) => setNumber(groups(e.target.value))}
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="4242 4242 4242 4242"
          required
          minLength={15}
          className="field font-mono tracking-wider"
        />
      </div>
      <div>
        <label className="label" htmlFor="cc-name">
          {t('holder')}
        </label>
        <input
          id="cc-name"
          value={holder}
          onChange={(e) => setHolder(e.target.value.toUpperCase())}
          autoComplete="cc-name"
          className="field uppercase"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="cc-exp">
            {t('expiry')}
          </label>
          <input
            id="cc-exp"
            value={expiry}
            onChange={(e) => setExpiry(expiryMask(e.target.value))}
            inputMode="numeric"
            autoComplete="cc-exp"
            required
            pattern="\d{2}/\d{2}"
            className="field font-mono"
          />
        </div>
        <div>
          <label className="label" htmlFor="cc-cvc">
            {t('cvc')}
          </label>
          <input
            id="cc-cvc"
            value={cvc}
            onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onFocus={() => setFlipped(true)}
            onBlur={() => setFlipped(false)}
            inputMode="numeric"
            autoComplete="cc-csc"
            required
            pattern="\d{3,4}"
            className="field font-mono"
          />
        </div>
      </div>
      {allowSave && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={save}
            onChange={(e) => setSave(e.target.checked)}
            className="h-4 w-4 accent-accent-500"
          />
          {t('saveCard')}
        </label>
      )}
      <button disabled={busy} className="btn-accent w-full py-3">
        {busy ? <Spinner /> : <Lock className="h-4 w-4" />} {submitLabel}
      </button>
    </form>
  );
}

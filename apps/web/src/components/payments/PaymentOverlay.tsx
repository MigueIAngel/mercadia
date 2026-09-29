'use client';

import { CreditCard, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type PaymentPhase =
  | { kind: 'processing' }
  | { kind: 'success'; amount: string; card?: string }
  | { kind: 'failed'; reason: string };

const CONFETTI = ['#f97316', '#fde047', '#ffffff', '#38bdf8', '#f472b6', '#a3e635'];

/**
 * Full-screen payment feedback, in the style of the big Latin American marketplaces:
 * an animated wait while the processor answers, then a green "approved" screen (or a red
 * "declined" one) that takes over the page.
 */
export function PaymentOverlay({
  phase,
  onSuccessPrimary,
  onSuccessSecondary,
  onRetry,
}: {
  phase: PaymentPhase | null;
  onSuccessPrimary: () => void;
  onSuccessSecondary: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations('pay');
  const [step, setStep] = useState(0);
  const steps = [t('steps.validating'), t('steps.bank'), t('steps.confirming')];

  useEffect(() => {
    if (phase?.kind !== 'processing') return;
    setStep(0);
    const id = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 1300);
    return () => clearInterval(id);
  }, [phase?.kind, steps.length]);

  useEffect(() => {
    if (!phase) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [phase]);

  if (!phase) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-live="assertive">
      {phase.kind === 'processing' && (
        <div className="grid h-full animate-fade-in place-items-center bg-white/95 px-6 backdrop-blur-sm">
          <div className="flex flex-col items-center text-center">
            <div className="relative grid h-36 w-36 place-items-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-accent-500/15" />
              <span className="absolute inset-3 rounded-full bg-accent-50" />
              <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full animate-spin">
                <defs>
                  <linearGradient id="pay-ring" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  stroke="url(#pay-ring)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray="200 90"
                />
              </svg>
              <CreditCard className="relative h-12 w-12 animate-[float_2.4s_ease-in-out_infinite] text-accent-600" />
            </div>
            <p className="mt-8 font-display text-3xl">{t('processing')}</p>
            <p key={step} className="mt-2 h-6 animate-fade-up text-stone-500">
              {steps[step]}
            </p>
            <div className="mt-6 flex gap-2">
              {steps.map((s, i) => (
                <span
                  key={s}
                  className={`h-1.5 rounded-full transition-all duration-500 ${i <= step ? 'w-8 bg-accent-500' : 'w-4 bg-stone-200'}`}
                />
              ))}
            </div>
            <p className="mt-10 flex items-center gap-1.5 text-xs text-stone-400">
              <Lock className="h-3.5 w-3.5" /> {t('secure')}
            </p>
          </div>
        </div>
      )}

      {phase.kind === 'success' && (
        <div className="relative grid h-full animate-[circle-reveal_0.6s_cubic-bezier(0.22,1,0.36,1)_both] place-items-center overflow-hidden bg-emerald-500 px-6 text-white">
          {Array.from({ length: 48 }, (_, i) => (
            <span
              key={i}
              className="absolute top-0 h-3 w-2 rounded-sm"
              style={{
                left: `${(i * 37) % 100}%`,
                background: CONFETTI[i % CONFETTI.length],
                animation: `confetti-fall ${2.2 + (i % 5) * 0.35}s ${0.35 + (i % 7) * 0.12}s cubic-bezier(0.25, 0.46, 0.45, 0.94) both`,
                ['--drift' as string]: `${((i * 53) % 120) - 60}px`,
                ['--spin' as string]: `${(i % 2 ? 1 : -1) * (360 + i * 20)}deg`,
              }}
            />
          ))}
          <div className="relative flex max-w-md flex-col items-center text-center">
            <svg viewBox="0 0 120 120" className="h-32 w-32">
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="white"
                strokeWidth="6"
                strokeDasharray="340"
                strokeDashoffset="340"
                style={{ animation: 'draw 0.6s 0.35s ease-out forwards' }}
              />
              <path
                d="M36 62 l16 16 l32 -34"
                fill="none"
                stroke="white"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="80"
                strokeDashoffset="80"
                style={{ animation: 'draw 0.4s 0.9s ease-out forwards' }}
              />
            </svg>
            <h2 className="mt-6 animate-[fade-up_0.5s_1s_both] font-display text-4xl">
              {t('approvedTitle')}
            </h2>
            <p className="mt-2 animate-[fade-up_0.5s_1.1s_both] text-lg text-emerald-50">
              {t('approvedText', { amount: phase.amount })}
            </p>
            {phase.card && (
              <p className="mt-1 animate-[fade-up_0.5s_1.2s_both] text-sm text-emerald-100">
                {phase.card}
              </p>
            )}
            <div className="mt-8 flex animate-[fade-up_0.5s_1.35s_both] flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={onSuccessPrimary}
                className="btn bg-white px-6 py-3 text-emerald-700 hover:bg-emerald-50"
              >
                {t('viewOrder')}
              </button>
              <button
                type="button"
                onClick={onSuccessSecondary}
                className="btn border border-white/60 px-6 py-3 text-white hover:bg-white/10"
              >
                {t('keepShopping')}
              </button>
            </div>
          </div>
        </div>
      )}

      {phase.kind === 'failed' && (
        <div className="grid h-full animate-[circle-reveal_0.5s_cubic-bezier(0.22,1,0.36,1)_both] place-items-center bg-rose-500 px-6 text-white">
          <div className="flex max-w-md flex-col items-center text-center">
            <svg viewBox="0 0 120 120" className="h-32 w-32 animate-[shake_0.45s_1s_both]">
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="white"
                strokeWidth="6"
                strokeDasharray="340"
                strokeDashoffset="340"
                style={{ animation: 'draw 0.6s 0.3s ease-out forwards' }}
              />
              <path
                d="M42 42 l36 36 M78 42 l-36 36"
                fill="none"
                stroke="white"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray="110"
                strokeDashoffset="110"
                style={{ animation: 'draw 0.45s 0.8s ease-out forwards' }}
              />
            </svg>
            <h2 className="mt-6 animate-[fade-up_0.5s_0.9s_both] font-display text-4xl">
              {t('declinedTitle')}
            </h2>
            <p className="mt-2 animate-[fade-up_0.5s_1s_both] text-lg text-rose-50">
              {t.has(`reasons.${phase.reason}`)
                ? t(`reasons.${phase.reason}` as 'reasons.card_declined')
                : t('reasons.generic')}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="btn mt-8 animate-[fade-up_0.5s_1.15s_both] bg-white px-6 py-3 text-rose-600 hover:bg-rose-50"
            >
              {t('tryAgain')}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

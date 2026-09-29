import clsx from 'clsx';

export interface SavedMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

const GRADIENTS: Record<string, string> = {
  visa: 'from-indigo-600 via-blue-600 to-sky-500',
  mastercard: 'from-stone-900 via-stone-800 to-orange-700',
  amex: 'from-teal-600 via-cyan-600 to-sky-400',
};

/** Brand from the first digits, as the user types. */
export function brandOf(number: string) {
  const n = number.replace(/\D/g, '');
  if (n.startsWith('4')) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'mastercard';
  if (/^3[47]/.test(n)) return 'amex';
  return 'card';
}

export function BrandMark({ brand, className }: { brand: string; className?: string }) {
  if (brand === 'mastercard')
    return (
      <svg viewBox="0 0 36 22" className={clsx('h-6', className)} aria-label="Mastercard">
        <circle cx="13" cy="11" r="10" fill="#eb001b" />
        <circle cx="23" cy="11" r="10" fill="#f79e1b" fillOpacity="0.9" />
      </svg>
    );
  if (brand === 'visa')
    return (
      <span
        className={clsx('font-sans text-xl font-black tracking-tight italic', className)}
        aria-label="Visa"
      >
        VISA
      </span>
    );
  if (brand === 'amex')
    return (
      <span
        className={clsx('rounded bg-white/90 px-1.5 text-xs font-black text-sky-700', className)}
        aria-label="American Express"
      >
        AMEX
      </span>
    );
  return <span className={clsx('text-sm font-bold uppercase', className)}>{brand}</span>;
}

/** A credit card drawn in CSS (brand colours, masked number and expiry). */
export function CardFace({
  brand,
  last4,
  expiry,
  holder,
  number,
  small = false,
  className,
}: {
  brand: string;
  last4?: string;
  expiry?: string;
  holder?: string;
  /** Live preview while typing: shows the digits typed so far. */
  number?: string;
  small?: boolean;
  className?: string;
}) {
  const digits = (number ?? '').replace(/\D/g, '');
  const shown =
    number !== undefined
      ? (digits.padEnd(16, '•').match(/.{1,4}/g) ?? []).join(' ')
      : `•••• •••• •••• ${last4}`;
  return (
    <div
      className={clsx(
        'relative isolate aspect-[1.586] w-full overflow-hidden rounded-2xl bg-gradient-to-br text-white shadow-lg transition-colors duration-500',
        GRADIENTS[brand] ?? 'from-stone-700 via-stone-600 to-stone-500',
        small ? 'p-2' : 'p-5',
        className,
      )}
    >
      <span className="absolute -top-10 -right-10 -z-10 h-40 w-40 rounded-full bg-white/10" />
      <span className="absolute -bottom-16 -left-8 -z-10 h-44 w-44 rounded-full bg-white/10" />
      <div className="flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <span
            className={clsx(
              'rounded-md bg-gradient-to-br from-amber-200 to-amber-400',
              small ? 'h-3 w-4 rounded-sm' : 'h-8 w-11',
            )}
          />
          <BrandMark brand={brand} className={small ? '!h-3 !text-[10px]' : ''} />
        </div>
        {small ? (
          <p className="text-right font-mono text-[10px] leading-none">{last4}</p>
        ) : (
          <>
            <p className="font-mono text-lg tracking-widest tabular-nums sm:text-xl">{shown}</p>
            <div className="flex justify-between text-xs uppercase">
              <span className="truncate opacity-80">{holder ?? ''}</span>
              <span className="font-mono">{expiry}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export const expiryOf = (m: { expMonth: number; expYear: number }) =>
  `${String(m.expMonth).padStart(2, '0')}/${String(m.expYear).slice(-2)}`;

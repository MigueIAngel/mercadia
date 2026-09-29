export const CURRENCIES = ['USD', 'COP'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Amounts are always integers in the currency's minor unit (cents). */
export interface Money {
  amount: number;
  currency: Currency;
}

/** Converts between currencies with a quoted rate (1 USD = `usdToCop` COP). */
export function convert(amount: number, from: Currency, to: Currency, usdToCop: number): number {
  if (from === to) return amount;
  return from === 'USD' ? Math.round(amount * usdToCop) : Math.round(amount / usdToCop);
}

/**
 * Prices in Colombia include IVA. Splits a tax-inclusive amount into net + tax.
 * `rate` is a fraction, e.g. 0.19.
 */
export function splitTax(grossAmount: number, rate: number): { net: number; tax: number } {
  const net = Math.round(grossAmount / (1 + rate));
  return { net, tax: grossAmount - net };
}

export function formatMoney({ amount, currency }: Money, locale = 'es-CO'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'COP' ? 0 : 2,
  }).format(amount / 100);
}

/**
 * Shopper-facing price from a USD base price. COP prices are rounded to hundreds of pesos,
 * like real Colombian price tags. Catalog (display) and orders (charging) share this rule.
 */
export function priceFromUsd(amountUsd: number, currency: Currency, usdToCop: number): number {
  const value = convert(amountUsd, 'USD', currency, usdToCop);
  return currency === 'COP' ? Math.round(value / 10000) * 10000 : value;
}

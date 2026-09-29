import { formatMoney, type Currency } from '@mercadia/contracts';

export const money = (amount: number, currency: Currency, locale: string) =>
  formatMoney({ amount, currency }, locale === 'en' ? 'en-US' : 'es-CO');

export const discountPercent = (price: number, compareAt: number | null) =>
  compareAt && compareAt > price ? Math.round((1 - price / compareAt) * 100) : 0;

export const dateTime = (value: string | Date, locale: string) =>
  new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(new Date(value));

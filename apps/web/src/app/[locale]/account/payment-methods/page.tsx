import { ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { PaymentMethods } from '@/components/account/PaymentMethods';
import type { SavedMethod } from '@/components/payments/CardFace';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { requireUser } from '@/lib/guard';

export async function generateMetadata() {
  return { title: (await getTranslations('methods'))('title') };
}

export default async function PaymentMethodsPage() {
  await requireUser('/account/payment-methods');
  const t = await getTranslations('methods');
  const methods = await api<SavedMethod[]>('/payments/methods');
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div className="animate-fade-up">
        <Link href="/account" className="text-sm text-stone-500 hover:text-ink">
          ← {t('back')}
        </Link>
        <h1 className="mt-2 font-display text-4xl">{t('title')}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-stone-500">
          <ShieldCheck className="h-4 w-4 text-emerald-600" /> {t('subtitle')}
        </p>
      </div>
      <PaymentMethods initial={methods} />
    </div>
  );
}

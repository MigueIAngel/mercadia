import { getTranslations } from 'next-intl/server';
import { ProductForm } from '@/components/seller/ProductForm';
import { api } from '@/lib/api';
import type { Category } from '@/lib/types';

export default async function NewProductPage() {
  const t = await getTranslations('seller');
  const categories = await api<Category[]>('/categories', { auth: false, revalidate: 300 });
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">{t('newProduct')}</h1>
      <ProductForm categories={categories} />
    </div>
  );
}

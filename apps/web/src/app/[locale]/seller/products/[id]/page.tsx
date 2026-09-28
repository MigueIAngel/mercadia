import { getTranslations } from 'next-intl/server';
import { ProductForm } from '@/components/seller/ProductForm';
import { api } from '@/lib/api';
import type { Category, ProductDetail } from '@/lib/types';

export default async function EditProductPage({
  params,
}: PageProps<'/[locale]/seller/products/[id]'>) {
  const { id } = await params;
  const t = await getTranslations('seller');
  const [categories, product] = await Promise.all([
    api<Category[]>('/categories', { auth: false, revalidate: 300 }),
    api<ProductDetail & { status: 'draft' | 'active' | 'archived' | 'blocked' }>(
      `/seller/products/${id}`,
    ),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">{t('editProduct')}</h1>
      <ProductForm categories={categories} product={product} />
    </div>
  );
}

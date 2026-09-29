'use client';

import { ImagePlus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { call } from '@/lib/client';
import type { Category, ProductDetail } from '@/lib/types';
import { CopywriterPanel } from './CopywriterPanel';
import { Spinner } from '@/components/ui/Spinner';

interface Row {
  sku?: string;
  options: Record<string, string>;
  stock: number;
}

export function ProductForm({
  categories,
  product,
}: {
  categories: Category[];
  product?: ProductDetail & { status?: string };
}) {
  const t = useTranslations('seller');
  const locale = useLocale() as 'es' | 'en';
  const router = useRouter();
  const [images, setImages] = useState<string[]>(product?.images ?? []);
  const [imageUrl, setImageUrl] = useState('');
  const [optionName, setOptionName] = useState(product?.options[0]?.name ?? '');
  const [optionValues, setOptionValues] = useState(product?.options[0]?.values.join(', ') ?? '');
  const [rows, setRows] = useState<Row[]>(
    product?.variants.map((v) => ({ sku: v.sku, options: v.options, stock: v.stock })) ?? [
      { options: {}, stock: 10 },
    ],
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const field = (name: string) =>
    formRef.current?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;

  const applyOption = () => {
    const values = optionValues
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (!optionName.trim() || values.length === 0)
      return setRows([{ options: {}, stock: rows[0]?.stock ?? 10 }]);
    setRows(
      values.map(
        (value) =>
          rows.find((r) => r.options[optionName] === value) ?? {
            options: { [optionName.trim()]: value },
            stock: 5,
          },
      ),
    );
  };

  const upload = async (file: File) => {
    setError('');
    try {
      const sig = await call<{
        url: string;
        apiKey: string;
        timestamp: number;
        folder: string;
        signature: string;
      }>('/api/bff/seller/uploads/signature', { method: 'POST' });
      const form = new FormData();
      form.append('file', file);
      form.append('api_key', sig.apiKey);
      form.append('timestamp', String(sig.timestamp));
      form.append('folder', sig.folder);
      form.append('signature', sig.signature);
      const res = await fetch(sig.url, { method: 'POST', body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? 'Upload failed');
      setImages((list) => [...list, body.secure_url]);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>, status: 'draft' | 'active') => {
    e.preventDefault();
    const target = e.currentTarget as HTMLFormElement | HTMLButtonElement;
    const form = new FormData(
      'form' in target && target.form ? target.form : (target as HTMLFormElement),
    );
    const currency = String(form.get('currency'));
    const toMinor = (v: FormDataEntryValue | null) => Math.round(Number(v) * 100);
    const values = optionValues
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    const body = {
      title: form.get('title'),
      description: form.get('description'),
      brand: form.get('brand') || undefined,
      category: form.get('category'),
      images,
      price: { amount: toMinor(form.get('price')), currency },
      ...(form.get('compareAt')
        ? { compareAt: { amount: toMinor(form.get('compareAt')), currency } }
        : {}),
      options: optionName.trim() && values.length ? [{ name: optionName.trim(), values }] : [],
      variants: rows,
      weightGrams: Number(form.get('weightGrams')) || undefined,
      status,
    };
    setBusy(true);
    setError('');
    try {
      if (product) await call(`/api/bff/seller/products/${product.id}`, { method: 'PATCH', body });
      else await call('/api/bff/seller/products', { body });
      router.push('/seller/products');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form ref={formRef} className="space-y-6" onSubmit={(e) => submit(e, 'active')}>
      <section className="card grid gap-4 p-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <CopywriterPanel
            getContext={() => ({
              title: field('title')?.value ?? '',
              brand: field('brand')?.value ?? '',
              category: field('category')?.value ?? '',
            })}
            onDraft={(draft) => {
              const title = field('title');
              const description = field('description');
              if (title) title.value = draft.title;
              if (description)
                description.value = [
                  draft.description,
                  draft.bullets.map((b) => `• ${b}`).join('\n'),
                ]
                  .filter(Boolean)
                  .join('\n\n');
            }}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="title">
            {t('fields.title')}
          </label>
          <input
            id="title"
            name="title"
            required
            minLength={3}
            maxLength={140}
            defaultValue={product?.title}
            className="field"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">
            {t('fields.description')}
          </label>
          <textarea
            id="description"
            name="description"
            required
            rows={5}
            defaultValue={product?.description}
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="brand">
            {t('fields.brand')}
          </label>
          <input id="brand" name="brand" defaultValue={product?.brand ?? ''} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="category">
            {t('fields.category')}
          </label>
          <select
            id="category"
            name="category"
            defaultValue={product?.category ?? categories[0]?.slug}
            className="field"
          >
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name[locale]}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="card space-y-3 p-6">
        <p className="label">{t('fields.images')}</p>
        <div className="flex flex-wrap gap-3">
          {images.map((src) => (
            <div
              key={src}
              className="relative h-24 w-24 overflow-hidden rounded-2xl bg-stone-100 ring-1 ring-stone-200"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-contain" />
              <button
                type="button"
                onClick={() => setImages((l) => l.filter((x) => x !== src))}
                className="absolute top-1 right-1 rounded-full bg-white/90 p-1"
                aria-label="remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <label className="grid h-24 w-24 cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-stone-300 text-stone-400 hover:border-ink hover:text-ink">
            <ImagePlus className="h-6 w-6" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </label>
        </div>
        <div className="flex gap-2">
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
            className="field"
          />
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              if (/^https?:\/\//.test(imageUrl)) setImages((l) => [...l, imageUrl]);
              setImageUrl('');
            }}
          >
            +
          </button>
        </div>
      </section>

      <section className="card grid gap-4 p-6 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="currency">
            {t('fields.currency')}
          </label>
          <select
            id="currency"
            name="currency"
            defaultValue={product?.currency ?? 'COP'}
            className="field"
          >
            <option value="COP">COP</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="price">
            {t('fields.price')}
          </label>
          <input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="1"
            required
            defaultValue={product ? product.price / 100 : undefined}
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="compareAt">
            {t('fields.compareAt')}
          </label>
          <input
            id="compareAt"
            name="compareAt"
            type="number"
            step="0.01"
            min="0"
            defaultValue={product?.compareAt ? product.compareAt / 100 : undefined}
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="weightGrams">
            {t('fields.weight')}
          </label>
          <input
            id="weightGrams"
            name="weightGrams"
            type="number"
            min="1"
            defaultValue={product?.specs.weightGrams ?? 500}
            className="field"
          />
        </div>
      </section>

      <section className="card space-y-4 p-6">
        <p className="font-semibold">{t('fields.variants')}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="optionName">
              {t('fields.optionName')}
            </label>
            <input
              id="optionName"
              value={optionName}
              onChange={(e) => setOptionName(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="optionValues">
              {t('fields.optionValues')}
            </label>
            <input
              id="optionValues"
              value={optionValues}
              onChange={(e) => setOptionValues(e.target.value)}
              className="field"
            />
          </div>
          <button type="button" onClick={applyOption} className="btn-outline">
            {t('fields.addOption')}
          </button>
        </div>
        <ul className="divide-y divide-stone-100">
          {rows.map((row, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="font-medium">
                {Object.values(row.options).join(' / ') || t('fields.noVariants')}
              </span>
              <label className="flex items-center gap-2">
                {t('stock')}
                <input
                  type="number"
                  min={0}
                  value={row.stock}
                  onChange={(e) =>
                    setRows((list) =>
                      list.map((r, j) => (j === i ? { ...r, stock: Number(e.target.value) } : r)),
                    )
                  }
                  className="field w-28 py-1.5"
                />
              </label>
            </li>
          ))}
        </ul>
      </section>

      {error && (
        <p className="text-sm text-rose-600" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button disabled={busy || images.length === 0} className="btn-accent">
          {busy && <Spinner />}
          {product ? t('fields.save') : t('fields.publish')}
        </button>
        {(!product || product.status === 'draft') && (
          <button
            type="button"
            disabled={busy || images.length === 0}
            className="btn-outline"
            onClick={(e) => submit(e as unknown as React.FormEvent<HTMLFormElement>, 'draft')}
          >
            {t('fields.saveDraft')}
          </button>
        )}
      </div>
    </form>
  );
}

'use client';

import { Camera, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { call } from '@/lib/client';
import { toast } from '@/lib/toast';
import { Avatar } from '../ui/Avatar';
import { Spinner } from '../ui/Spinner';

interface Signature {
  url: string;
  apiKey: string;
  folder: string;
  overwrite: string;
  public_id: string;
  timestamp: string;
  signature: string;
}

const SIZE = 512;

/** Crops the picture to a centred square and shrinks it before uploading (fast on mobile data). */
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(SIZE, side);
  canvas
    .getContext('2d')!
    .drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('image'))), 'image/jpeg', 0.9),
  );
}

/** XHR instead of fetch: it reports upload progress for the ring around the photo. */
function upload(sig: Signature, blob: Blob, onProgress: (p: number) => void) {
  const form = new FormData();
  form.append('file', blob, 'avatar.jpg');
  for (const key of ['folder', 'overwrite', 'public_id', 'timestamp', 'signature'] as const)
    form.append(key, sig[key]);
  form.append('api_key', sig.apiKey);
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', sig.url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status < 300
        ? resolve(JSON.parse(xhr.responseText).secure_url)
        : reject(new Error(JSON.parse(xhr.responseText)?.error?.message ?? 'Upload failed'));
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(form);
  });
}

export function AvatarUploader({ name, initial }: { name: string; initial: string | null }) {
  const t = useTranslations('account');
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState(initial);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const save = async (avatarUrl: string | null) => {
    await call('/api/bff/users/me', { method: 'PATCH', body: { avatarUrl } });
    setSrc(avatarUrl);
    router.refresh();
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error(t('photoType'));
    if (file.size > 10 * 1024 * 1024) return toast.error(t('photoSize'));
    setPreview(URL.createObjectURL(file));
    setProgress(0);
    try {
      const [sig, blob] = await Promise.all([
        call<Signature>('/api/bff/users/me/avatar/signature', { body: {} }),
        squareJpeg(file),
      ]);
      await save(await upload(sig, blob, setProgress));
      toast.success(t('photoSaved'));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setProgress(null);
      setPreview(null);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    setProgress(1);
    try {
      await save(null);
      toast.success(t('photoRemoved'));
    } catch (err) {
      toast.error((err as Error).message);
    }
    setProgress(null);
  };

  const busy = progress !== null;
  const circumference = 2 * Math.PI * 54;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="group relative h-28 w-28 shrink-0 rounded-full"
        aria-label={t('changePhoto')}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-28 w-28 rounded-full object-cover" />
        ) : (
          <Avatar key={src} name={name} src={src} size={112} className="animate-pop" />
        )}
        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/0 text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
          <Camera className="h-7 w-7" />
        </span>
        {busy && (
          <>
            <span className="absolute inset-0 grid place-items-center rounded-full bg-white/50">
              <Spinner className="h-6 w-6 text-accent-600" />
            </span>
            <svg viewBox="0 0 120 120" className="absolute -inset-1.5 -rotate-90">
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="var(--color-accent-500)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress)}
                className="transition-[stroke-dashoffset] duration-200"
              />
            </svg>
          </>
        )}
      </button>
      <div className="space-y-2">
        <p className="font-semibold">{t('photo')}</p>
        <p className="text-sm text-stone-500">{t('photoHint')}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="btn-outline py-2"
          >
            <Camera className="h-4 w-4" /> {src ? t('changePhoto') : t('uploadPhoto')}
          </button>
          {src && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="btn py-2 text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-4 w-4" /> {t('removePhoto')}
            </button>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/heic"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
    </div>
  );
}

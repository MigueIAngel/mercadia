'use client';

import { Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { call } from '@/lib/client';
import { Spinner } from '@/components/ui/Spinner';

export interface CopyDraft {
  title: string;
  description: string;
  bullets: string[];
  tags: string[];
  provider: 'gemini' | 'local';
}

/** "Write with AI": turns the seller's notes into a listing draft (AI service copywriter). */
export function CopywriterPanel({
  getContext,
  onDraft,
}: {
  getContext: () => { title: string; brand: string; category: string };
  onDraft: (draft: CopyDraft) => void;
}) {
  const t = useTranslations('seller.ai');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [tone, setTone] = useState('professional');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const write = async () => {
    const ctx = getContext();
    if (ctx.title.trim().length < 3) return setMessage(t('needTitle'));
    setBusy(true);
    setMessage('');
    try {
      const draft = await call<CopyDraft>('/api/bff/ai/copywriter', {
        body: {
          title: ctx.title,
          brand: ctx.brand || undefined,
          category: ctx.category,
          features: notes,
          tone,
          locale,
        },
      });
      onDraft(draft);
      setMessage(t(draft.provider === 'gemini' ? 'doneGemini' : 'doneLocal'));
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn border border-accent-100 bg-accent-50 px-4 py-2 text-sm text-accent-700 hover:border-accent-500"
      >
        <Sparkles className="h-4 w-4" /> {t('open')}
      </button>
    );

  return (
    <div className="space-y-3 rounded-2xl bg-accent-50 p-4 ring-1 ring-accent-100">
      <p className="flex items-center gap-2 font-semibold text-accent-700">
        <Sparkles className="h-4 w-4" /> {t('title')}
      </p>
      <p className="text-sm text-stone-600">{t('help')}</p>
      <label className="label" htmlFor="ai-notes">
        {t('notes')}
      </label>
      <textarea
        id="ai-notes"
        rows={3}
        maxLength={2000}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t('notesPlaceholder')}
        className="field bg-white"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          {t('tone')}
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            className="rounded-lg border border-stone-300 bg-white px-2 py-1"
          >
            {(['professional', 'friendly', 'premium'] as const).map((k) => (
              <option key={k} value={k}>
                {t(`tones.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={write}
          className="btn-accent px-4 py-2 text-sm"
        >
          {busy && <Spinner />}
          {busy ? t('writing') : t('write')}
        </button>
      </div>
      {message && <p className="text-sm text-stone-600">{message}</p>}
    </div>
  );
}

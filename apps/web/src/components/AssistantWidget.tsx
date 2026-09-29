'use client';

import { Bot, Send, Sparkles, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { Currency } from '@mercadia/contracts';
import { Link } from '@/i18n/navigation';
import { call } from '@/lib/client';
import { money } from '@/lib/format';
import type { ProductSummary } from '@/lib/types';

interface ChatEntry {
  role: 'user' | 'assistant';
  text: string;
  products?: ProductSummary[];
}

interface AssistantReply {
  reply: string;
  products: ProductSummary[];
  provider: 'gemini' | 'local';
}

const STORAGE_KEY = 'mc_assistant';

function load(): ChatEntry[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]') as ChatEntry[];
  } catch {
    return [];
  }
}

/** Floating shopping assistant (AI service), available on every page. */
export function AssistantWidget({ currency }: { currency: Currency }) {
  const t = useTranslations('assistant');
  const locale = useLocale() as 'es' | 'en';
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setEntries(load()), []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-20)));
    } catch {
      // storage unavailable (private mode): the chat still works for this page view
    }
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [entries]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const ask = async (message: string) => {
    if (!message.trim() || busy) return;
    const history = entries.slice(-10).map(({ role, text }) => ({ role, text }));
    setEntries((e) => [...e, { role: 'user', text: message }]);
    setText('');
    setBusy(true);
    try {
      const res = await call<AssistantReply>('/api/bff/ai/assistant', {
        body: { message, history, currency, locale },
      });
      setEntries((e) => [
        ...e,
        { role: 'assistant', text: res.reply, products: res.products.slice(0, 4) },
      ]);
    } catch (err) {
      const msg = (err as Error).message;
      setEntries((e) => [
        ...e,
        { role: 'assistant', text: /Too many/.test(msg) ? t('limited') : t('error') },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t('open')}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-semibold text-white shadow-xl transition hover:scale-105 sm:right-6 sm:bottom-6"
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5 text-accent-500" />}
        <span className="hidden sm:inline">{open ? t('close') : t('open')}</span>
      </button>

      {open && (
        <section
          aria-label={t('title')}
          className="fixed right-4 bottom-20 z-40 flex h-[min(620px,calc(100vh-7rem))] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-stone-200 sm:right-6 sm:bottom-24"
        >
          <header className="flex items-center gap-3 border-b border-stone-100 px-4 py-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-100 text-accent-700">
              <Bot className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="font-semibold">{t('title')}</p>
              <p className="text-xs text-stone-500">{t('subtitle')}</p>
            </div>
            {entries.length > 0 && (
              <button
                type="button"
                onClick={() => setEntries([])}
                className="text-xs text-stone-500 hover:text-ink"
              >
                {t('clear')}
              </button>
            )}
          </header>

          <div
            className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-stone-50 p-4"
            aria-live="polite"
          >
            {entries.length === 0 && (
              <div className="space-y-3">
                <p className="rounded-2xl rounded-bl-md bg-white p-3 text-sm shadow-sm">
                  {t('welcome')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(['s1', 's2', 's3', 's4'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => ask(t(`suggestions.${k}`))}
                      className="rounded-full bg-white px-3 py-1.5 text-xs ring-1 ring-stone-200 hover:ring-ink"
                    >
                      {t(`suggestions.${k}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {entries.map((entry, i) =>
              entry.role === 'user' ? (
                <p
                  key={i}
                  className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-sm text-white"
                >
                  {entry.text}
                </p>
              ) : (
                <div key={i} className="max-w-[92%] space-y-2">
                  <p className="rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-sm whitespace-pre-line shadow-sm">
                    {entry.text}
                  </p>
                  {entry.products?.map((p) => (
                    <Link
                      key={p.id}
                      href={`/p/${p.slug}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-stone-100 hover:ring-ink"
                    >
                      {p.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt="" className="h-12 w-12 rounded-xl object-contain" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.title}</span>
                        <span className="block text-xs text-stone-500">{p.store.name}</span>
                      </span>
                      <span className="text-sm font-semibold">
                        {money(p.price, p.currency, locale)}
                      </span>
                    </Link>
                  ))}
                </div>
              ),
            )}
            {busy && (
              <p
                className="flex w-fit gap-1 rounded-2xl bg-white px-4 py-3 shadow-sm"
                aria-label={t('thinking')}
              >
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="h-2 w-2 animate-bounce rounded-full bg-stone-400"
                    style={{ animationDelay: `${d * 150}ms` }}
                  />
                ))}
              </p>
            )}
            <div ref={bottom} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(text);
            }}
            className="flex gap-2 border-t border-stone-100 p-3"
          >
            <label htmlFor="assistant-input" className="sr-only">
              {t('placeholder')}
            </label>
            <input
              ref={input}
              id="assistant-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
              autoComplete="off"
              placeholder={t('placeholder')}
              className="field flex-1"
            />
            <button
              disabled={busy || !text.trim()}
              className="btn-primary px-4"
              aria-label={t('send')}
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <p className="px-4 pb-2 text-center text-[11px] text-stone-400">{t('disclaimer')}</p>
        </section>
      )}
    </>
  );
}

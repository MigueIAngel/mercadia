'use client';

import { ArrowLeft, MessageCircle, Send } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { call } from '@/lib/client';
import { useRealtime } from '@/lib/realtime';

interface Conversation {
  _id: string;
  buyerId: string;
  buyerName: string;
  storeId: string;
  storeName: string;
  productTitle: string | null;
  productImage: string | null;
  lastMessage: string;
  lastAt: string;
  unreadBuyer: number;
  unreadSeller: number;
}

interface ChatMessage {
  _id: string;
  conversationId: string;
  senderRole: 'buyer' | 'seller';
  text: string;
  createdAt: string;
}

type Side = 'buyer' | 'seller';

export function Messages({
  activeId,
  userId,
  storeId,
}: {
  activeId?: string;
  userId: string;
  /** Set for sellers: adds the "my store" inbox. */
  storeId?: string;
}) {
  const t = useTranslations('messages');
  const format = useFormatter();
  const router = useRouter();
  const [side, setSide] = useState<Side>('buyer');
  const [list, setList] = useState<Conversation[] | null>(null);
  const [thread, setThread] = useState<{
    conversation: Conversation;
    role: Side;
    messages: ChatMessage[];
  } | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement>(null);

  const loadList = useCallback(
    (as: Side) =>
      call<Conversation[]>(`/api/bff/conversations?as=${as}`).then(setList, () => setList([])),
    [],
  );

  // Open the thread and show the list for the side (buyer/seller) it belongs to.
  useEffect(() => {
    if (!activeId) {
      setThread(null);
      void loadList(side);
      return;
    }
    call<{ conversation: Conversation; role: Side; messages: ChatMessage[] }>(
      `/api/bff/conversations/${activeId}`,
    ).then(
      (res) => {
        setThread(res);
        setSide(res.role);
        void loadList(res.role);
      },
      (err: Error) => setError(err.message),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, loadList]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [thread?.messages.length]);

  useRealtime<{ conversation: Conversation; message: ChatMessage }>('message', (payload) => {
    const { conversation, message } = payload;
    const mine =
      side === 'seller' ? conversation.storeId === storeId : conversation.buyerId === userId;
    if (mine) {
      setList((l) => {
        if (!l) return l;
        const rest = l.filter((c) => c._id !== conversation._id);
        const open = conversation._id === activeId;
        return [{ ...conversation, ...(open && { unreadBuyer: 0, unreadSeller: 0 }) }, ...rest];
      });
    }
    if (conversation._id === activeId) {
      setThread((th) =>
        th && !th.messages.some((m) => m._id === message._id)
          ? { ...th, messages: [...th.messages, message] }
          : th,
      );
    }
  });

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId || !text.trim()) return;
    const body = text;
    setText('');
    try {
      const { message } = await call<{ message: ChatMessage }>(
        `/api/bff/conversations/${activeId}/messages`,
        { body: { text: body } },
      );
      setThread((th) =>
        th && !th.messages.some((m) => m._id === message._id)
          ? { ...th, messages: [...th.messages, message] }
          : th,
      );
    } catch (err) {
      setText(body);
      setError((err as Error).message);
    }
  };

  const counterpart = (c: Conversation) => (side === 'seller' ? c.buyerName : c.storeName);
  const unread = (c: Conversation) => (side === 'seller' ? c.unreadSeller : c.unreadBuyer);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-5 font-display text-3xl">{t('title')}</h1>
      <div className="card grid h-[70vh] min-h-[480px] overflow-hidden md:grid-cols-[320px_1fr]">
        <aside
          className={`flex min-h-0 flex-col border-stone-200 md:border-r ${activeId ? 'hidden md:flex' : 'flex'}`}
        >
          {storeId && (
            <div className="flex gap-1 border-b border-stone-200 p-2" role="tablist">
              {(['buyer', 'seller'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={side === s}
                  onClick={() => {
                    setSide(s);
                    setList(null);
                    void loadList(s);
                    if (activeId) router.push('/messages');
                  }}
                  className={`flex-1 rounded-xl px-3 py-1.5 text-sm font-medium ${side === s ? 'bg-ink text-white' : 'hover:bg-stone-100'}`}
                >
                  {t(s === 'buyer' ? 'asBuyer' : 'asSeller')}
                </button>
              ))}
            </div>
          )}
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {list === null && <li className="p-4 text-sm text-stone-500">…</li>}
            {list?.length === 0 && <li className="p-4 text-sm text-stone-500">{t('empty')}</li>}
            {list?.map((c) => (
              <li key={c._id}>
                <Link
                  href={`/messages/${c._id}`}
                  className={`flex gap-3 border-b border-stone-100 p-3 hover:bg-stone-50 ${c._id === activeId ? 'bg-stone-100' : ''}`}
                >
                  {c.productImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.productImage}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-xl bg-white object-cover"
                    />
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-stone-200 font-bold">
                      {counterpart(c).slice(0, 1)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">{counterpart(c)}</span>
                      <span className="shrink-0 text-xs text-stone-400">
                        {format.relativeTime(new Date(c.lastAt))}
                      </span>
                    </span>
                    {c.productTitle && (
                      <span className="block truncate text-xs text-stone-500">
                        {c.productTitle}
                      </span>
                    )}
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-stone-600">{c.lastMessage}</span>
                      {unread(c) > 0 && (
                        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-white">
                          {unread(c)}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <section className={`min-h-0 flex-col ${activeId ? 'flex' : 'hidden md:flex'}`}>
          {!thread ? (
            <div className="grid flex-1 place-items-center p-8 text-center text-stone-500">
              {error ? (
                <p className="text-rose-600">{error}</p>
              ) : (
                <p className="flex flex-col items-center gap-2">
                  <MessageCircle className="h-10 w-10 text-stone-300" />
                  {activeId ? '…' : t('pick')}
                </p>
              )}
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-stone-200 p-3">
                <Link href="/messages" className="rounded-full p-1.5 hover:bg-stone-100 md:hidden">
                  <ArrowLeft className="h-5 w-5" />
                  <span className="sr-only">{t('back')}</span>
                </Link>
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {thread.role === 'seller'
                      ? thread.conversation.buyerName
                      : thread.conversation.storeName}
                  </p>
                  {thread.conversation.productTitle && (
                    <p className="truncate text-xs text-stone-500">
                      {t('about', { product: thread.conversation.productTitle })}
                    </p>
                  )}
                </div>
              </header>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-stone-50 p-4">
                {thread.messages.map((m) => {
                  const own = m.senderRole === thread.role;
                  return (
                    <div key={m._id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                      <p
                        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-line shadow-sm ${own ? 'rounded-br-md bg-ink text-white' : 'rounded-bl-md bg-white'}`}
                      >
                        {m.text}
                        <span
                          className={`mt-0.5 block text-right text-[10px] ${own ? 'text-white/60' : 'text-stone-400'}`}
                        >
                          {format.dateTime(new Date(m.createdAt), { timeStyle: 'short' })}
                        </span>
                      </p>
                    </div>
                  );
                })}
                <div ref={bottom} />
              </div>
              <form onSubmit={send} className="flex gap-2 border-t border-stone-200 p-3">
                <label htmlFor="chat-input" className="sr-only">
                  {t('placeholder')}
                </label>
                <input
                  id="chat-input"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={2000}
                  autoComplete="off"
                  placeholder={t('placeholder')}
                  className="field flex-1"
                />
                <button disabled={!text.trim()} className="btn-primary px-4" aria-label={t('send')}>
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

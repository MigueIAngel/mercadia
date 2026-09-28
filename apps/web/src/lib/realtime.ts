'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;
let connecting: Promise<Socket | null> | null = null;

async function connect(): Promise<Socket | null> {
  const res = await fetch('/api/realtime-token', { cache: 'no-store' });
  if (!res.ok) return null;
  const { token, url, path } = (await res.json()) as { token: string; url: string; path: string };
  const s = io(url, {
    path,
    transports: ['websocket'],
    // Access tokens live 15 minutes: fetch a fresh one on every (re)connection.
    auth: (cb) => {
      fetch('/api/realtime-token', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { token }))
        .then((body: { token: string }) => cb({ token: body.token }))
        .catch(() => cb({ token }));
    },
  });
  socket = s;
  return s;
}

/** One shared Socket.IO connection per tab, opened lazily by the first subscriber. */
function shared() {
  if (socket) return Promise.resolve(socket);
  connecting ??= connect().finally(() => (connecting = null));
  return connecting;
}

/** Subscribe to a realtime event (`message`, `notification`) while the component is mounted. */
export function useRealtime<T>(event: string, handler: (payload: T) => void, enabled = true) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let current: Socket | null = null;
    const listener = (payload: T) => ref.current(payload);
    shared().then((s) => {
      if (!s || !active) return;
      current = s;
      s.on(event, listener);
    });
    return () => {
      active = false;
      current?.off(event, listener);
    };
  }, [event, enabled]);
}

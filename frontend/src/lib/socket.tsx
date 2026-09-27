'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useToast } from '@/components/Toasts';
import { useAuth } from './auth';
import { STATUS_LABELS } from './constants';
import type { PostStatusEvent } from './types';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';

type Listener = () => void;
interface LiveState {
  connected: boolean;
  /** Called whenever any post the user can see changes. Returns an unsubscribe fn. */
  onPostsChanged: (fn: Listener) => () => void;
}

const LiveContext = createContext<LiveState>({ connected: false, onPostsChanged: () => () => {} });

/** Real-time notifications over Socket.IO: toasts for status changes + refresh signals for pages. */
export function LiveProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const toast = useToast();
  const [connected, setConnected] = useState(false);
  const listeners = useRef(new Set<Listener>());

  useEffect(() => {
    if (!token || !user) return;
    const socket: Socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    const notify = () => listeners.current.forEach((fn) => fn());

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('post:status', (e: PostStatusEvent) => {
      notify();
      if (e.actorName === user.name) return; // no toast for your own actions
      toast({
        tone: e.toStatus === 'CHANGES_REQUESTED' ? 'error' : e.toStatus === 'APPROVED' || e.toStatus === 'PUBLISHED' ? 'success' : 'info',
        title: `${e.brandName}: ${e.fromStatus ? STATUS_LABELS[e.fromStatus] : 'New'} → ${STATUS_LABELS[e.toStatus]}`,
        body: `${e.actorName} · “${e.captionPreview}${e.captionPreview.length >= 80 ? '…' : ''}”`,
        href: `/posts/${e.postId}`,
      });
    });
    socket.on('post:changed', notify);

    return () => {
      socket.disconnect();
      setConnected(false);
    };
  }, [token, user, toast]);

  const onPostsChanged = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const value = useMemo(() => ({ connected, onPostsChanged }), [connected, onPostsChanged]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);

/** Re-run `fn` whenever a live update arrives. */
export function usePostsChanged(fn: Listener) {
  const { onPostsChanged } = useLive();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => onPostsChanged(() => ref.current()), [onPostsChanged]);
}

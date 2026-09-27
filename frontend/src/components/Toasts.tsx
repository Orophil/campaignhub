'use client';

import Link from 'next/link';
import { createContext, ReactNode, useCallback, useContext, useState } from 'react';

type Tone = 'info' | 'success' | 'error';
interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: Tone;
  href?: string;
}

const ToastContext = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 6000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <div className="toast-title">{t.title}</div>
            {t.body && <div className="toast-body">{t.body}</div>}
            {t.href && (
              <Link className="toast-link" href={t.href}>
                Open post →
              </Link>
            )}
            <button className="toast-close" aria-label="Dismiss" onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

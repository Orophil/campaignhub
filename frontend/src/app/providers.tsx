'use client';

import { ReactNode } from 'react';
import { ToastProvider } from '@/components/Toasts';
import { AuthProvider } from '@/lib/auth';
import { LiveProvider } from '@/lib/socket';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <LiveProvider>{children}</LiveProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { PostEditor } from '@/components/PostEditor';
import { EmptyState, ErrorState, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import type { Client } from '@/lib/types';

export default function NewPostPage() {
  const { ready } = useRequireAuth(['CREATOR']);
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    api.listClients().then(setClients).catch(setError);
  }, []);
  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  if (!ready) return <Spinner />;
  return (
    <AppShell>
      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !clients ? (
        <Spinner />
      ) : clients.length === 0 ? (
        <EmptyState title="No clients yet">Ask an admin to add a client before creating posts.</EmptyState>
      ) : (
        <PostEditor clients={clients} />
      )}
    </AppShell>
  );
}

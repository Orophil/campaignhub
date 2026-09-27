'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { PostEditor } from '@/components/PostEditor';
import { EmptyState, ErrorState, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import type { Client, Post } from '@/lib/types';

export default function EditPostPage() {
  const { id } = useParams<{ id: string }>();
  const { ready } = useRequireAuth(['CREATOR']);
  const [data, setData] = useState<{ post: Post; clients: Client[] } | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([api.getPost(id), api.listClients()])
      .then(([post, clients]) => setData({ post, clients }))
      .catch(setError);
  }, [id]);
  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  if (!ready) return <Spinner />;
  return (
    <AppShell>
      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !data ? (
        <Spinner />
      ) : !data.post.permissions.canEdit ? (
        <EmptyState title="This post can’t be edited">
          Only its creator can edit it, and only while it is a draft or has changes requested.{' '}
          <Link href={`/posts/${id}`}>Back to post</Link>
        </EmptyState>
      ) : (
        <PostEditor key={data.post.version} clients={data.clients} post={data.post} />
      )}
    </AppShell>
  );
}

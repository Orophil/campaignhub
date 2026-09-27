'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { NEEDS_DIALOG, TransitionDialog } from '@/components/TransitionDialog';
import { Avatar, ApiErrorBanner, EmptyState, ErrorState, PlatformBadge, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { PLATFORM_LABELS, PLATFORMS, STATUS_LABELS, STATUSES } from '@/lib/constants';
import { usePostsChanged } from '@/lib/socket';
import { formatIST, relativeFromNow } from '@/lib/time';
import type { Client, Platform, Post, PostStatus } from '@/lib/types';

const FILTER_KEY = 'campaignhub.boardFilters';

function loadFilters(): { clientId: string; platform: string; mine: boolean } {
  try {
    return { clientId: '', platform: '', mine: false, ...JSON.parse(localStorage.getItem(FILTER_KEY) || '{}') };
  } catch {
    return { clientId: '', platform: '', mine: false };
  }
}

export default function BoardPage() {
  const { ready, user } = useRequireAuth();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [filters, setFilters] = useState({ clientId: '', platform: '', mine: false });
  const [dragging, setDragging] = useState<Post | null>(null);
  const [overCol, setOverCol] = useState<PostStatus | null>(null);
  const [dialog, setDialog] = useState<{ post: Post; to: PostStatus } | null>(null);

  useEffect(() => setFilters(loadFilters()), []);
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
    } catch {
      /* ignore */
    }
  }, [filters]);

  const load = useCallback(() => {
    setLoadError(null);
    return api
      .listPosts({ clientId: filters.clientId || undefined, platform: (filters.platform || undefined) as Platform | undefined })
      .then(setPosts)
      .catch(setLoadError);
  }, [filters.clientId, filters.platform]);

  useEffect(() => {
    if (!ready) return;
    load();
    api.listClients().then(setClients).catch(() => {});
  }, [ready, load]);
  usePostsChanged(() => {
    if (ready) load();
  });

  const visible = useMemo(
    () => (posts ?? []).filter((p) => !filters.mine || p.createdById === user?.id),
    [posts, filters.mine, user?.id],
  );
  const byStatus = useMemo(() => {
    const map = Object.fromEntries(STATUSES.map((s) => [s, [] as Post[]])) as Record<PostStatus, Post[]>;
    for (const p of visible) map[p.status].push(p);
    return map;
  }, [visible]);

  async function drop(to: PostStatus) {
    const post = dragging;
    setDragging(null);
    setOverCol(null);
    if (!post || post.status === to) return;
    setActionError(null);
    // Moves that need a comment or a time open a dialog; everything else (including
    // invalid moves) goes straight to the API, which is the source of truth.
    if (post.permissions.transitions.includes(to) && NEEDS_DIALOG.includes(to)) {
      setDialog({ post, to });
      return;
    }
    try {
      await api.transition(post.id, { toStatus: to, version: post.version });
      await load();
    } catch (err) {
      setActionError(err);
    }
  }

  if (!ready) return <Spinner />;

  const filtered = !!(filters.clientId || filters.platform || filters.mine);

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1>Content board</h1>
          <p className="muted">
            {user?.role === 'REVIEWER'
              ? 'Posts for the clients assigned to you. Drag a card from “In review” to approve it.'
              : 'Drag cards between columns to move them through the workflow.'}
          </p>
        </div>
        <div className="filters">
          <select aria-label="Filter by client" value={filters.clientId} onChange={(e) => setFilters((f) => ({ ...f, clientId: e.target.value }))}>
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.brandName}
              </option>
            ))}
          </select>
          <select aria-label="Filter by platform" value={filters.platform} onChange={(e) => setFilters((f) => ({ ...f, platform: e.target.value }))}>
            <option value="">All platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
          {user?.role === 'CREATOR' && (
            <label className="toggle">
              <input type="checkbox" checked={filters.mine} onChange={(e) => setFilters((f) => ({ ...f, mine: e.target.checked }))} />
              <span>Only mine</span>
            </label>
          )}
          {filtered && (
            <button className="btn btn-ghost btn-sm" onClick={() => setFilters({ clientId: '', platform: '', mine: false })}>
              Clear
            </button>
          )}
        </div>
      </div>

      <ApiErrorBanner error={actionError} onReload={() => { setActionError(null); load(); }} onDismiss={() => setActionError(null)} />

      {loadError ? (
        <ErrorState error={loadError} onRetry={load} />
      ) : !posts ? (
        <Spinner label="Loading posts…" />
      ) : visible.length === 0 ? (
        <EmptyState title={filtered ? 'No posts match these filters' : 'No posts yet'}>
          {filtered ? 'Try another client or platform.' : user?.role === 'CREATOR' ? <Link href="/posts/new">Create the first post →</Link> : 'Posts will show up here once creators submit them.'}
        </EmptyState>
      ) : (
        <div className="board">
          {STATUSES.map((status) => {
            const items = byStatus[status];
            const canDropHere = !!dragging && dragging.permissions.transitions.includes(status);
            return (
              <section
                key={status}
                className={`column ${overCol === status ? (canDropHere ? 'drop-ok' : 'drop-bad') : ''} ${dragging && canDropHere ? 'drop-hint' : ''}`}
                onDragOver={(e) => {
                  if (!dragging || dragging.status === status) return;
                  e.preventDefault();
                  setOverCol(status);
                }}
                onDragLeave={() => setOverCol((c) => (c === status ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(status);
                }}
                aria-label={STATUS_LABELS[status]}
              >
                <header className="column-head">
                  <span className={`dot status-dot-${status}`} />
                  <span className="column-title">{STATUS_LABELS[status]}</span>
                  <span className="column-count">{items.length}</span>
                </header>
                <div className="column-body">
                  {items.length === 0 && <div className="column-empty">Nothing here</div>}
                  {items.map((p) => (
                    <PostCard key={p.id} post={p} onDragStart={() => setDragging(p)} onDragEnd={() => { setDragging(null); setOverCol(null); }} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {dialog && (
        <TransitionDialog
          post={dialog.post}
          toStatus={dialog.to}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            load();
          }}
        />
      )}
    </AppShell>
  );
}

function PostCard({ post, onDragStart, onDragEnd }: { post: Post; onDragStart: () => void; onDragEnd: () => void }) {
  // Every card is draggable: valid targets are highlighted, and dropping on an
  // invalid column shows the API's 400 message instead of silently doing nothing.
  return (
    <Link
      href={`/posts/${post.id}`}
      className="post-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', post.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="post-card-top">
        <PlatformBadge platform={post.platform} />
        <span className="post-card-client">{post.client.brandName}</span>
      </div>
      <p className="post-card-caption">{post.caption}</p>
      <div className="post-card-foot">
        <span className="post-card-when" title={post.scheduledAt ? formatIST(post.scheduledAt) : undefined}>
          {post.scheduledAt ? (
            <>
              🗓 {formatIST(post.scheduledAt).replace(/, \d{4}/, '')}
              <small> · {relativeFromNow(post.scheduledAt)}</small>
            </>
          ) : (
            <span className="muted">Not scheduled</span>
          )}
        </span>
        <span className="post-card-author" title={post.createdBy.name}>
          <Avatar name={post.createdBy.name} size={22} />
        </span>
      </div>
      {post.permissions.transitions.length > 0 && <span className="post-card-action-dot" title="You can act on this post" />}
    </Link>
  );
}

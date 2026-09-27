'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { PostPreview } from '@/components/PostPreview';
import { NEEDS_DIALOG, TransitionDialog } from '@/components/TransitionDialog';
import { ApiErrorBanner, Avatar, EmptyState, ErrorState, PlatformBadge, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { ACTION_LABELS, CAPTION_LIMITS, captionLength, STATUS_LABELS } from '@/lib/constants';
import { usePostsChanged } from '@/lib/socket';
import { formatIST, relativeFromNow } from '@/lib/time';
import type { AuditLog, Post, PostStatus } from '@/lib/types';

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { ready, user } = useRequireAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState<PostStatus | null>(null);
  const [dialog, setDialog] = useState<PostStatus | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    return api.getPost(id).then(setPost).catch(setLoadError);
  }, [id]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);
  usePostsChanged(() => {
    if (ready) load();
  });

  async function act(to: PostStatus) {
    if (!post) return;
    if (NEEDS_DIALOG.includes(to)) {
      setDialog(to);
      return;
    }
    setBusy(to);
    setActionError(null);
    try {
      setPost(await api.transition(post.id, { toStatus: to, version: post.version }));
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(null);
    }
  }

  if (!ready) return <Spinner />;

  return (
    <AppShell>
      <Link href="/board" className="back-link">
        ← Board
      </Link>
      {loadError ? (
        <ErrorState error={loadError} onRetry={load} />
      ) : !post ? (
        <Spinner label="Loading post…" />
      ) : (
        <div className="detail">
          <div className="detail-main">
            <div className="card">
              <div className="detail-head">
                <div className="detail-badges">
                  <StatusBadge status={post.status} />
                  <PlatformBadge platform={post.platform} />
                  <span className="muted small">v{post.version}</span>
                </div>
                <h1>{post.client.brandName}</h1>
                <dl className="facts">
                  <div>
                    <dt>Scheduled</dt>
                    <dd>
                      {formatIST(post.scheduledAt)}
                      {post.scheduledAt && <small className="muted"> · {relativeFromNow(post.scheduledAt)}</small>}
                    </dd>
                  </div>
                  <div>
                    <dt>Created by</dt>
                    <dd>{post.createdBy.name}</dd>
                  </div>
                  <div>
                    <dt>Caption</dt>
                    <dd>
                      {captionLength(post.caption).toLocaleString('en-IN')} / {CAPTION_LIMITS[post.platform].toLocaleString('en-IN')} chars
                    </dd>
                  </div>
                  <div>
                    <dt>Reviewers</dt>
                    <dd>{(post.client.reviewers ?? []).map((r) => r.name).join(', ') || '—'}</dd>
                  </div>
                </dl>
              </div>

              <ActionBar post={post} busy={busy} onAct={act} isReviewer={user?.role === 'REVIEWER'} />
              <ApiErrorBanner error={actionError} onReload={() => { setActionError(null); load(); }} onDismiss={() => setActionError(null)} />
            </div>

            <div className="card">
              <h2 className="card-title">Preview</h2>
              <PostPreview platform={post.platform} caption={post.caption} brandName={post.client.brandName} scheduledAt={post.scheduledAt} />
            </div>
          </div>

          <div className="detail-side">
            <Comments post={post} onAdded={load} />
            <Timeline logs={post.auditLogs ?? []} />
          </div>
        </div>
      )}

      {post && dialog && (
        <TransitionDialog
          post={post}
          toStatus={dialog}
          onClose={() => setDialog(null)}
          onDone={(p) => {
            setDialog(null);
            setPost(p);
          }}
        />
      )}
    </AppShell>
  );
}

function ActionBar({ post, busy, onAct, isReviewer }: { post: Post; busy: PostStatus | null; onAct: (s: PostStatus) => void; isReviewer: boolean }) {
  const { transitions, canEdit } = post.permissions;
  if (!canEdit && transitions.length === 0) {
    return <p className="muted small action-note">{noActionReason(post, isReviewer)}</p>;
  }
  return (
    <div className="action-bar">
      {canEdit && (
        <Link href={`/posts/${post.id}/edit`} className="btn">
          ✎ Edit
        </Link>
      )}
      {transitions.map((to) => (
        <button
          key={to}
          className={`btn ${to === 'CHANGES_REQUESTED' ? 'btn-danger-ghost' : 'btn-primary'}`}
          disabled={!!busy}
          onClick={() => onAct(to)}
        >
          {busy === to ? 'Working…' : to === 'IN_REVIEW' && post.status === 'CHANGES_REQUESTED' ? 'Resubmit for review' : ACTION_LABELS[to]}
        </button>
      ))}
    </div>
  );
}

function noActionReason(post: Post, isReviewer: boolean): string {
  switch (post.status) {
    case 'PUBLISHED':
      return 'This post is live. Published posts are final.';
    case 'SCHEDULED':
      return `Will be published automatically ${post.scheduledAt ? relativeFromNow(post.scheduledAt) : ''}.`;
    case 'IN_REVIEW':
      return isReviewer ? 'You can’t review your own post.' : 'Waiting for a reviewer.';
    default:
      return 'No actions available for you on this post.';
  }
}

function Comments({ post, onAdded }: { post: Post; onAdded: () => void }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const comments = post.comments ?? [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.addComment(post.id, message.trim());
      setMessage('');
      onAdded();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">
        Comments <span className="count">{comments.length}</span>
      </h2>
      {comments.length === 0 ? (
        <p className="muted small">No comments yet. Start the conversation.</p>
      ) : (
        <ul className="comments">
          {comments.map((c) => (
            <li key={c.id} className="comment">
              <Avatar name={c.author.name} />
              <div>
                <div className="comment-head">
                  <strong>{c.author.name}</strong>
                  <span className={`role-pill role-${c.author.role}`}>{c.author.role.toLowerCase()}</span>
                  <time className="muted small" title={formatIST(c.createdAt)}>
                    {relativeFromNow(c.createdAt)}
                  </time>
                </div>
                <p className="comment-body">{c.message}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="comment-form" onSubmit={submit}>
        <textarea rows={2} placeholder="Write a comment…" value={message} onChange={(e) => setMessage(e.target.value)} />
        <ApiErrorBanner error={error} onDismiss={() => setError(null)} />
        <button className="btn btn-sm btn-primary" disabled={busy || !message.trim()}>
          {busy ? 'Posting…' : 'Comment'}
        </button>
      </form>
    </section>
  );
}

function Timeline({ logs }: { logs: AuditLog[] }) {
  return (
    <section className="card">
      <h2 className="card-title">Audit timeline</h2>
      {logs.length === 0 ? (
        <EmptyState title="No history yet" />
      ) : (
        <ol className="timeline">
          {[...logs].reverse().map((l) => (
            <li key={l.id} className="timeline-item">
              <span className={`timeline-dot status-dot-${l.toStatus}`} />
              <div>
                <div>
                  <strong>{l.actor?.name ?? 'System'}</strong>{' '}
                  {l.fromStatus ? (
                    <>
                      moved it from <em>{STATUS_LABELS[l.fromStatus]}</em> to <em>{STATUS_LABELS[l.toStatus]}</em>
                    </>
                  ) : (
                    <>created it as a <em>{STATUS_LABELS[l.toStatus]}</em></>
                  )}
                </div>
                <time className="muted small">{formatIST(l.timestamp)}</time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

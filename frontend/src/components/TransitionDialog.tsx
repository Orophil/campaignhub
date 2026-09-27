'use client';

import { FormEvent, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { ACTION_LABELS, MIN_CHANGE_REQUEST_COMMENT, STATUS_LABELS } from '@/lib/constants';
import { formatIST, fromISTInputValue, toISTInputValue } from '@/lib/time';
import type { Post, PostStatus } from '@/lib/types';
import { ApiErrorBanner, Modal } from './ui';

/** Statuses that need extra input (a comment or a time) before the move. */
export const NEEDS_DIALOG: PostStatus[] = ['CHANGES_REQUESTED', 'SCHEDULED', 'APPROVED'];

export function TransitionDialog({
  post,
  toStatus,
  onClose,
  onDone,
}: {
  post: Post;
  toStatus: PostStatus;
  onClose: () => void;
  onDone: (updated: Post) => void;
}) {
  const [comment, setComment] = useState('');
  const [when, setWhen] = useState(toISTInputValue(post.scheduledAt));
  const [version, setVersion] = useState(post.version);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const minLocal = useMemo(() => toISTInputValue(new Date(Date.now() + 60_000)), []);

  const needsComment = toStatus === 'CHANGES_REQUESTED';
  const commentLen = comment.trim().length;
  const scheduledAt = fromISTInputValue(when);
  const inPast = !!scheduledAt && new Date(scheduledAt).getTime() <= Date.now();
  const valid =
    (!needsComment || commentLen >= MIN_CHANGE_REQUEST_COMMENT) && (toStatus !== 'SCHEDULED' || (!!scheduledAt && !inPast));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await api.transition(post.id, {
        toStatus,
        version,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        ...(toStatus === 'SCHEDULED' && scheduledAt ? { scheduledAt } : {}),
      });
      onDone(updated);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function reload() {
    const latest = await api.getPost(post.id);
    setVersion(latest.version);
    setError(
      latest.status !== post.status
        ? new ApiError(409, `This post is now ${STATUS_LABELS[latest.status]}. Close this dialog to see the latest state.`)
        : null,
    );
  }

  return (
    <Modal title={`${ACTION_LABELS[toStatus]}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted">
          {STATUS_LABELS[post.status]} → <strong>{STATUS_LABELS[toStatus]}</strong> · {post.client.brandName}
        </p>

        {toStatus === 'SCHEDULED' && (
          <label className="field">
            <span>Publish at (IST)</span>
            <input type="datetime-local" required value={when} min={minLocal} onChange={(e) => setWhen(e.target.value)} />
            {scheduledAt && !inPast && <span className="hint">{formatIST(scheduledAt)}</span>}
            {inPast && <span className="field-error">Scheduled time must be in the future.</span>}
          </label>
        )}

        {(needsComment || toStatus === 'APPROVED') && (
          <label className="field">
            <span className="field-row">
              <span>{needsComment ? 'What needs to change?' : 'Comment (optional)'}</span>
              {needsComment && (
                <span className={`counter ${commentLen < MIN_CHANGE_REQUEST_COMMENT ? 'warn' : ''}`}>
                  {commentLen} / min {MIN_CHANGE_REQUEST_COMMENT}
                </span>
              )}
            </span>
            <textarea
              rows={4}
              autoFocus
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={needsComment ? 'Be specific so the creator can fix it in one go…' : 'Nice work!'}
            />
          </label>
        )}

        <ApiErrorBanner error={error} onReload={reload} onDismiss={() => setError(null)} />

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className={`btn ${needsComment ? 'btn-danger' : 'btn-primary'}`} disabled={!valid || busy}>
            {busy ? 'Saving…' : ACTION_LABELS[toStatus]}
          </button>
        </div>
      </form>
    </Modal>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { CAPTION_LIMITS, captionLength, PLATFORM_LABELS, PLATFORMS } from '@/lib/constants';
import { fromISTInputValue, toISTInputValue } from '@/lib/time';
import type { Client, Platform, Post } from '@/lib/types';
import { PostPreview } from './PostPreview';
import { ApiErrorBanner, PlatformIcon, StatusBadge } from './ui';

export function PostEditor({ clients, post }: { clients: Client[]; post?: Post }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(post?.clientId ?? clients[0]?.id ?? '');
  const [platform, setPlatform] = useState<Platform>(post?.platform ?? 'INSTAGRAM');
  const [caption, setCaption] = useState(post?.caption ?? '');
  const [scheduledLocal, setScheduledLocal] = useState(toISTInputValue(post?.scheduledAt));
  const [version, setVersion] = useState(post?.version ?? 1);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const limit = CAPTION_LIMITS[platform];
  const length = captionLength(caption);
  const over = length > limit;
  const ratio = length / limit;
  const scheduledAt = fromISTInputValue(scheduledLocal);
  const inPast = !!scheduledAt && new Date(scheduledAt).getTime() <= Date.now();
  const brandName = clients.find((c) => c.id === clientId)?.brandName ?? '';
  const minLocal = useMemo(() => toISTInputValue(new Date(Date.now() + 60_000)), []);

  const canSave = !!clientId && caption.trim().length > 0 && !over && !inPast && !saving;

  async function save(e?: FormEvent, overrideVersion?: number) {
    e?.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const saved = post
        ? await api.updatePost(post.id, {
            version: overrideVersion ?? version,
            clientId,
            platform,
            caption,
            scheduledAt: scheduledAt ?? null,
          })
        : await api.createPost({ clientId, platform, caption, ...(scheduledAt ? { scheduledAt } : {}) });
      router.push(`/posts/${saved.id}`);
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  }

  async function reloadLatest() {
    if (!post) return;
    const latest = await api.getPost(post.id);
    setClientId(latest.clientId);
    setPlatform(latest.platform);
    setCaption(latest.caption);
    setScheduledLocal(toISTInputValue(latest.scheduledAt));
    setVersion(latest.version);
    setError(null);
  }

  async function keepMine() {
    const current = error instanceof ApiError ? Number(error.body.currentVersion) : NaN;
    if (!Number.isFinite(current)) return;
    setVersion(current);
    await save(undefined, current);
  }

  return (
    <form className="editor" onSubmit={save}>
      <div className="editor-form card">
        <div className="editor-title">
          <h1>{post ? 'Edit post' : 'New post'}</h1>
          {post && <StatusBadge status={post.status} />}
        </div>

        <label className="field">
          <span>Client</span>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.brandName}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="field">
          <legend>Platform</legend>
          <div className="segmented" role="radiogroup">
            {PLATFORMS.map((p) => (
              <button
                type="button"
                key={p}
                role="radio"
                aria-checked={platform === p}
                className={platform === p ? 'on' : ''}
                onClick={() => setPlatform(p)}
              >
                <PlatformIcon platform={p} size={14} /> {PLATFORM_LABELS[p]}
                <small>{CAPTION_LIMITS[p].toLocaleString('en-IN')}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span className="field-row">
            <span>Caption</span>
            <span className={`counter ${over ? 'over' : ratio > 0.9 ? 'warn' : ''}`} aria-live="polite">
              {length.toLocaleString('en-IN')} / {limit.toLocaleString('en-IN')}
            </span>
          </span>
          <textarea
            rows={8}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write something your audience will love…"
            aria-invalid={over}
          />
          <div className="meter" aria-hidden>
            <div className={`meter-fill ${over ? 'over' : ratio > 0.9 ? 'warn' : ''}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
          </div>
          {over && (
            <span className="field-error">
              {length - limit} character{length - limit === 1 ? '' : 's'} over the {PLATFORM_LABELS[platform]} limit.
            </span>
          )}
        </label>

        <label className="field">
          <span>
            Scheduled time <em className="muted">(IST, optional while drafting)</em>
          </span>
          <div className="inline">
            <input type="datetime-local" value={scheduledLocal} min={minLocal} onChange={(e) => setScheduledLocal(e.target.value)} />
            {scheduledLocal && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setScheduledLocal('')}>
                Clear
              </button>
            )}
          </div>
          {inPast && <span className="field-error">Scheduled time must be in the future.</span>}
          <span className="hint">Posts for the same client and platform must be at least 2 hours apart.</span>
        </label>

        <ApiErrorBanner
          error={error}
          onReload={post ? reloadLatest : undefined}
          onKeepMine={post ? keepMine : undefined}
          onDismiss={() => setError(null)}
        />

        <div className="form-actions">
          <Link href={post ? `/posts/${post.id}` : '/board'} className="btn btn-ghost">
            Cancel
          </Link>
          <button className="btn btn-primary" disabled={!canSave}>
            {saving ? 'Saving…' : post ? 'Save changes' : 'Create draft'}
          </button>
        </div>
      </div>

      <aside className="editor-preview">
        <div className="section-label">Preview</div>
        <PostPreview platform={platform} caption={caption} brandName={brandName} scheduledAt={scheduledAt} />
      </aside>
    </form>
  );
}

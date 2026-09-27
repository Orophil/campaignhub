'use client';

import Link from 'next/link';
import { ReactNode, useEffect } from 'react';
import { ApiError } from '@/lib/api';
import { PLATFORM_LABELS, STATUS_LABELS } from '@/lib/constants';
import { formatIST } from '@/lib/time';
import type { Platform, PostStatus } from '@/lib/types';

export function StatusBadge({ status }: { status: PostStatus }) {
  return <span className={`badge status-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span className={`badge platform platform-${platform}`}>
      <PlatformIcon platform={platform} /> {PLATFORM_LABELS[platform]}
    </span>
  );
}

export function PlatformIcon({ platform, size = 12 }: { platform: Platform; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, fill: 'currentColor' } as const;
  switch (platform) {
    case 'X':
      return (
        <svg {...common}>
          <path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.2-8.3L2 3h6.3l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z" />
        </svg>
      );
    case 'INSTAGRAM':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2.2">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
        </svg>
      );
    case 'LINKEDIN':
      return (
        <svg {...common}>
          <path d="M4 3.5A2 2 0 1 1 4 7.5a2 2 0 0 1 0-4ZM2.3 9h3.4v12H2.3V9Zm6 0h3.3v1.7h.1c.5-.9 1.6-1.9 3.4-1.9 3.6 0 4.3 2.4 4.3 5.4V21H16v-5.9c0-1.4 0-3.2-2-3.2s-2.3 1.5-2.3 3.1v6H8.3V9Z" />
        </svg>
      );
    case 'FACEBOOK':
      return (
        <svg {...common}>
          <path d="M13.5 21v-7.5H16l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.3H8v3h2.6V21h2.9Z" />
        </svg>
      );
  }
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state state-loading" role="status">
      <span className="spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state-empty">
      <div className="state-title">{title}</div>
      {children && <div className="state-body">{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div className="state state-error" role="alert">
      <div className="state-title">Couldn’t load this</div>
      <div className="state-body">{message}</div>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * Renders API errors with extra help for the cases users actually hit:
 * 409 schedule conflicts (link to the clashing post), 409 version conflicts
 * (reload / keep mine) and 400 invalid transitions.
 */
export function ApiErrorBanner({
  error,
  onReload,
  onKeepMine,
  onDismiss,
}: {
  error: unknown;
  onReload?: () => void;
  onKeepMine?: () => void;
  onDismiss?: () => void;
}) {
  if (!error) return null;
  const e = error instanceof ApiError ? error : new ApiError(0, error instanceof Error ? error.message : String(error));

  let title = 'Something went wrong';
  let message = e.message;
  let extra: ReactNode = null;
  if (e.code === 'SCHEDULE_CONFLICT') {
    title = 'Scheduling conflict (409)';
    if (e.body.conflictingScheduledAt) {
      message = `Another post for this client on the same platform is already scheduled for ${formatIST(e.body.conflictingScheduledAt)}. Posts must be at least 2 hours apart.`;
    }
    extra = (
      <Link className="banner-link" href={`/posts/${e.body.conflictingPostId}`} target="_blank">
        View the conflicting post ↗
      </Link>
    );
  } else if (e.code === 'VERSION_CONFLICT') {
    title = 'Someone else changed this post (409)';
    extra = (
      <div className="banner-actions">
        {onReload && (
          <button className="btn btn-sm" onClick={onReload}>
            Load latest version
          </button>
        )}
        {onKeepMine && (
          <button className="btn btn-sm btn-ghost" onClick={onKeepMine}>
            Keep my changes and retry
          </button>
        )}
      </div>
    );
  } else if (e.code === 'INVALID_TRANSITION') {
    title = 'That status change isn’t allowed (400)';
  } else if (e.status === 400) {
    title = 'Please fix this';
  } else if (e.status === 403) {
    title = 'Not allowed';
  } else if (e.status === 404) {
    title = 'Not found';
  } else if (e.status === 0) {
    title = 'Connection problem';
  }

  return (
    <div className={`banner ${e.status === 409 ? 'banner-warn' : 'banner-error'}`} role="alert">
      <div className="banner-main">
        <strong>{title}</strong>
        <span>{message}</span>
        {extra}
      </div>
      {onDismiss && (
        <button className="banner-close" aria-label="Dismiss" onClick={onDismiss}>
          ×
        </button>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hash} 55% 88%)`, color: `hsl(${hash} 45% 28%)` }}>
      {initials}
    </span>
  );
}

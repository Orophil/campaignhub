'use client';

import { Fragment, useState } from 'react';
import { PLATFORM_LABELS } from '@/lib/constants';
import { formatIST } from '@/lib/time';
import type { Platform } from '@/lib/types';
import { PlatformIcon } from './ui';

/** Characters shown before the platform's own "see more" fold. */
const FOLD: Partial<Record<Platform, number>> = { INSTAGRAM: 125, LINKEDIN: 210, FACEBOOK: 480 };

function RichText({ text }: { text: string }) {
  const parts = text.split(/([#@][\p{L}\p{N}_]+)/u);
  return (
    <>
      {parts.map((p, i) =>
        /^[#@][\p{L}\p{N}_]+$/u.test(p) ? (
          <span key={i} className="pv-tag">
            {p}
          </span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/** A simple mock of how the post will look on the selected platform. */
export function PostPreview({
  platform,
  caption,
  brandName,
  scheduledAt,
}: {
  platform: Platform;
  caption: string;
  brandName: string;
  scheduledAt?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const handle = '@' + (brandName || 'yourbrand').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const fold = FOLD[platform];
  const chars = Array.from(caption);
  const folded = !expanded && fold !== undefined && chars.length > fold;
  const shown = folded ? chars.slice(0, fold).join('').trimEnd() : caption;
  const when = scheduledAt ? formatIST(scheduledAt) : 'Not scheduled yet';

  return (
    <div className={`preview preview-${platform}`} aria-label={`${PLATFORM_LABELS[platform]} preview`}>
      <div className="pv-head">
        <span className="pv-avatar">{(brandName || 'B').slice(0, 1)}</span>
        <div className="pv-who">
          <span className="pv-name">{brandName || 'Your brand'}</span>
          <span className="pv-meta">
            {platform === 'X' ? handle : platform === 'LINKEDIN' ? 'Company page · ' + when : when}
          </span>
        </div>
        <span className="pv-platform">
          <PlatformIcon platform={platform} size={16} />
        </span>
      </div>

      {platform === 'INSTAGRAM' && <div className="pv-media">Image / carousel</div>}

      <div className="pv-body">
        {platform === 'INSTAGRAM' && <strong className="pv-inline-name">{handle.slice(1)} </strong>}
        {caption ? <RichText text={shown} /> : <span className="pv-placeholder">Your caption will appear here…</span>}
        {folded && (
          <button className="pv-more" onClick={() => setExpanded(true)}>
            {platform === 'INSTAGRAM' ? '… more' : '…see more'}
          </button>
        )}
      </div>

      {platform !== 'INSTAGRAM' && platform !== 'X' && <div className="pv-media pv-media-wide">Link / image</div>}

      <div className="pv-foot">
        {platform === 'X' && (
          <>
            <span>💬 0</span>
            <span>🔁 0</span>
            <span>♡ 0</span>
            <span className="pv-when">{when}</span>
          </>
        )}
        {platform === 'INSTAGRAM' && (
          <>
            <span>♡</span>
            <span>💬</span>
            <span>➤</span>
          </>
        )}
        {(platform === 'FACEBOOK' || platform === 'LINKEDIN') && (
          <>
            <span>👍 Like</span>
            <span>💬 Comment</span>
            <span>↗ Share</span>
          </>
        )}
      </div>
    </div>
  );
}

import type { Platform, PostStatus } from './types';

// Keep in sync with backend/src/common/caption-limits.ts
export const CAPTION_LIMITS: Record<Platform, number> = {
  X: 280,
  INSTAGRAM: 2200,
  LINKEDIN: 3000,
  FACEBOOK: 5000,
};

/** Counts Unicode code points, exactly like the backend (an emoji counts as 1). */
export function captionLength(caption: string): number {
  return Array.from(caption).length;
}

export const PLATFORMS: Platform[] = ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'X'];

export const PLATFORM_LABELS: Record<Platform, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  LINKEDIN: 'LinkedIn',
  X: 'X',
};

export const STATUSES: PostStatus[] = ['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'SCHEDULED', 'PUBLISHED'];

export const STATUS_LABELS: Record<PostStatus, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In review',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  SCHEDULED: 'Scheduled',
  PUBLISHED: 'Published',
};

/** Button label for moving a post *to* a status. */
export const ACTION_LABELS: Record<PostStatus, string> = {
  DRAFT: 'Move to draft',
  IN_REVIEW: 'Submit for review',
  CHANGES_REQUESTED: 'Request changes',
  APPROVED: 'Approve',
  SCHEDULED: 'Schedule',
  PUBLISHED: 'Publish',
};

export const MIN_CHANGE_REQUEST_COMMENT = 10;

import { BadRequestException, ConflictException } from '@nestjs/common';

/** Two posts for the same client + platform must be at least this far apart. */
export const MIN_SCHEDULE_GAP_MS = 2 * 60 * 60 * 1000;

export interface ScheduledSlot {
  id: string;
  scheduledAt: Date | null;
}

/**
 * Returns the first other post whose scheduled time is closer than `minGapMs`
 * to `candidate`, or null. Exactly `minGapMs` apart is allowed.
 * `others` must already be filtered to the same client and platform.
 */
export function findSchedulingConflict<T extends ScheduledSlot>(
  candidate: { id?: string; scheduledAt: Date },
  others: readonly T[],
  minGapMs: number = MIN_SCHEDULE_GAP_MS,
): T | null {
  const t = candidate.scheduledAt.getTime();
  for (const other of others) {
    if (!other.scheduledAt) continue;
    if (candidate.id && other.id === candidate.id) continue;
    if (Math.abs(other.scheduledAt.getTime() - t) < minGapMs) return other;
  }
  return null;
}

/** Throws 409 including the id of the post that is too close. */
export function assertNoSchedulingConflict(
  candidate: { id?: string; scheduledAt: Date },
  others: readonly ScheduledSlot[],
  minGapMs: number = MIN_SCHEDULE_GAP_MS,
): void {
  const conflict = findSchedulingConflict(candidate, others, minGapMs);
  if (!conflict) return;
  const gapMinutes = Math.round(Math.abs(conflict.scheduledAt!.getTime() - candidate.scheduledAt.getTime()) / 60000);
  throw new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: 'SCHEDULE_CONFLICT',
    message:
      `Another post for this client on the same platform is scheduled ${gapMinutes} minute(s) away ` +
      `(at ${conflict.scheduledAt!.toISOString()}). Posts must be at least ${minGapMs / 3600000} hours apart.`,
    conflictingPostId: conflict.id,
    conflictingScheduledAt: conflict.scheduledAt!.toISOString(),
  });
}

/** Throws 400 unless `date` is strictly in the future. */
export function assertInFuture(date: Date, now: Date = new Date()): void {
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException({ statusCode: 400, error: 'Bad Request', code: 'INVALID_DATE', message: 'Scheduled time is not a valid date.' });
  }
  if (date.getTime() <= now.getTime()) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      code: 'SCHEDULE_IN_PAST',
      message: 'Scheduled time must be in the future.',
    });
  }
}

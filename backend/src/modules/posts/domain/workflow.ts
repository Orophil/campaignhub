import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PostStatus, Role } from '../../../common/enums';

/**
 * The single source of truth for the post lifecycle.
 *
 *   DRAFT -> IN_REVIEW -> APPROVED -> SCHEDULED -> PUBLISHED
 *                 |  ^
 *                 v  |
 *          CHANGES_REQUESTED
 *
 * Anything not listed here is rejected with HTTP 400.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<PostStatus, readonly PostStatus[]>> = {
  [PostStatus.DRAFT]: [PostStatus.IN_REVIEW],
  [PostStatus.IN_REVIEW]: [PostStatus.APPROVED, PostStatus.CHANGES_REQUESTED],
  [PostStatus.CHANGES_REQUESTED]: [PostStatus.IN_REVIEW],
  [PostStatus.APPROVED]: [PostStatus.SCHEDULED],
  [PostStatus.SCHEDULED]: [PostStatus.PUBLISHED],
  [PostStatus.PUBLISHED]: [],
};

/** Statuses in which the post's creator may still edit its content. */
export const EDITABLE_STATUSES: readonly PostStatus[] = [PostStatus.DRAFT, PostStatus.CHANGES_REQUESTED];

export const MIN_CHANGE_REQUEST_COMMENT_LENGTH = 10;

export function isTransitionAllowed(from: PostStatus, to: PostStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throws 400 with a clear message when `from -> to` is not part of the workflow. */
export function assertTransitionAllowed(from: PostStatus, to: PostStatus): void {
  if (isTransitionAllowed(from, to)) return;
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  const hint = allowed.length
    ? `From ${from} a post can only move to: ${allowed.join(', ')}.`
    : `${from} is a final status; no further changes are possible.`;
  throw new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    code: 'INVALID_TRANSITION',
    message: `Invalid status transition: ${from} → ${to}. ${hint}`,
    fromStatus: from,
    toStatus: to,
    allowed,
  });
}

export interface WorkflowActor {
  id: string;
  role: Role;
  /** Client ids the actor reviews (only meaningful for REVIEWER). */
  assignedClientIds: string[];
}

export interface WorkflowPost {
  createdById: string;
  clientId: string;
  status: PostStatus;
}

function forbid(message: string, code = 'FORBIDDEN'): never {
  throw new ForbiddenException({ statusCode: 403, error: 'Forbidden', code, message });
}

export function isAssignedReviewer(actor: WorkflowActor, clientId: string): boolean {
  return actor.role === Role.REVIEWER && actor.assignedClientIds.includes(clientId);
}

/**
 * Who may perform which transition. Called after `assertTransitionAllowed`, so we
 * already know the transition itself is legal.
 */
export function assertActorMayTransition(
  actor: WorkflowActor,
  post: WorkflowPost,
  to: PostStatus,
  options: { comment?: string | null } = {},
): void {
  const isOwner = actor.id === post.createdById;

  switch (to) {
    case PostStatus.IN_REVIEW:
      if (!isOwner) forbid('Only the creator of this post can submit it for review.');
      return;

    case PostStatus.APPROVED:
    case PostStatus.CHANGES_REQUESTED: {
      // Checked first and independently of role: nobody reviews their own work.
      if (isOwner) {
        forbid(
          to === PostStatus.APPROVED ? 'You cannot approve your own post.' : 'You cannot review your own post.',
          'SELF_REVIEW',
        );
      }
      if (actor.role !== Role.REVIEWER) forbid('Only reviewers can approve posts or request changes.');
      if (!isAssignedReviewer(actor, post.clientId)) {
        forbid('You are not assigned as a reviewer for this client.', 'NOT_ASSIGNED');
      }
      if (to === PostStatus.CHANGES_REQUESTED) {
        const length = (options.comment ?? '').trim().length;
        if (length < MIN_CHANGE_REQUEST_COMMENT_LENGTH) {
          throw new BadRequestException({
            statusCode: 400,
            error: 'Bad Request',
            code: 'COMMENT_REQUIRED',
            message: `Requesting changes requires a comment of at least ${MIN_CHANGE_REQUEST_COMMENT_LENGTH} characters (got ${length}).`,
          });
        }
      }
      return;
    }

    case PostStatus.SCHEDULED:
      if (!isOwner && actor.role !== Role.ADMIN) {
        forbid('Only the creator of this post or an admin can schedule it.');
      }
      return;

    case PostStatus.PUBLISHED:
      forbid('Posts are published automatically once their scheduled time has passed.', 'SYSTEM_ONLY');

    default:
      forbid('This action is not permitted.');
  }
}

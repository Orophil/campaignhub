import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PostStatus, Role } from '../src/common/enums';
import {
  ALLOWED_TRANSITIONS,
  assertActorMayTransition,
  assertTransitionAllowed,
  isTransitionAllowed,
  WorkflowActor,
} from '../src/modules/posts/domain/workflow';

const ALL = Object.values(PostStatus);

const creator: WorkflowActor = { id: 'creator-1', role: Role.CREATOR, assignedClientIds: [] };
const otherCreator: WorkflowActor = { id: 'creator-2', role: Role.CREATOR, assignedClientIds: [] };
const reviewer: WorkflowActor = { id: 'reviewer-1', role: Role.REVIEWER, assignedClientIds: ['client-a'] };
const unassignedReviewer: WorkflowActor = { id: 'reviewer-2', role: Role.REVIEWER, assignedClientIds: ['client-b'] };
const admin: WorkflowActor = { id: 'admin-1', role: Role.ADMIN, assignedClientIds: [] };

const post = (status: PostStatus, createdById = creator.id) => ({ status, createdById, clientId: 'client-a' });

function errorOf(fn: () => void): { status: number; body: any } | null {
  try {
    fn();
    return null;
  } catch (e: any) {
    return { status: e.getStatus(), body: e.getResponse() };
  }
}

describe('status transition table', () => {
  const valid: [PostStatus, PostStatus][] = [
    [PostStatus.DRAFT, PostStatus.IN_REVIEW],
    [PostStatus.IN_REVIEW, PostStatus.APPROVED],
    [PostStatus.IN_REVIEW, PostStatus.CHANGES_REQUESTED],
    [PostStatus.CHANGES_REQUESTED, PostStatus.IN_REVIEW],
    [PostStatus.APPROVED, PostStatus.SCHEDULED],
    [PostStatus.SCHEDULED, PostStatus.PUBLISHED],
  ];

  it.each(valid)('allows %s -> %s', (from, to) => {
    expect(isTransitionAllowed(from, to)).toBe(true);
    expect(() => assertTransitionAllowed(from, to)).not.toThrow();
  });

  it('allows exactly the six documented transitions and nothing else', () => {
    const allowedPairs = ALL.flatMap((from) => ALL.filter((to) => isTransitionAllowed(from, to)).map((to) => `${from}->${to}`));
    expect(allowedPairs.sort()).toEqual(valid.map(([f, t]) => `${f}->${t}`).sort());
  });

  // Every pair not in the table – including "same status" no-ops – must be rejected.
  const invalid = ALL.flatMap((from) => ALL.map((to) => [from, to] as [PostStatus, PostStatus])).filter(
    ([from, to]) => !valid.some(([f, t]) => f === from && t === to),
  );

  it.each(invalid)('rejects %s -> %s with a 400', (from, to) => {
    const err = errorOf(() => assertTransitionAllowed(from, to));
    expect(err?.status).toBe(400);
    expect(err?.body.code).toBe('INVALID_TRANSITION');
    expect(err?.body.message).toContain(`${from} → ${to}`);
  });

  it('explains where a post can go next', () => {
    const err = errorOf(() => assertTransitionAllowed(PostStatus.DRAFT, PostStatus.APPROVED));
    expect(err?.body.message).toBe('Invalid status transition: DRAFT → APPROVED. From DRAFT a post can only move to: IN_REVIEW.');
    expect(err?.body.allowed).toEqual([PostStatus.IN_REVIEW]);
  });

  it('treats PUBLISHED as final', () => {
    expect(ALLOWED_TRANSITIONS[PostStatus.PUBLISHED]).toEqual([]);
    const err = errorOf(() => assertTransitionAllowed(PostStatus.PUBLISHED, PostStatus.DRAFT));
    expect(err?.body.message).toContain('PUBLISHED is a final status');
  });

  it('cannot skip review (DRAFT -> SCHEDULED / APPROVED -> PUBLISHED)', () => {
    expect(isTransitionAllowed(PostStatus.DRAFT, PostStatus.SCHEDULED)).toBe(false);
    expect(isTransitionAllowed(PostStatus.APPROVED, PostStatus.PUBLISHED)).toBe(false);
    expect(isTransitionAllowed(PostStatus.CHANGES_REQUESTED, PostStatus.APPROVED)).toBe(false);
  });
});

describe('who may perform a transition', () => {
  describe('submit for review', () => {
    it('lets the creator submit a draft or a reworked post', () => {
      expect(() => assertActorMayTransition(creator, post(PostStatus.DRAFT), PostStatus.IN_REVIEW)).not.toThrow();
      expect(() => assertActorMayTransition(creator, post(PostStatus.CHANGES_REQUESTED), PostStatus.IN_REVIEW)).not.toThrow();
    });

    it.each([otherCreator, reviewer, admin])('forbids $role $id from submitting someone else\'s post', (actor) => {
      expect(() => assertActorMayTransition(actor, post(PostStatus.DRAFT), PostStatus.IN_REVIEW)).toThrow(ForbiddenException);
    });
  });

  describe('approve', () => {
    it('lets an assigned reviewer approve', () => {
      expect(() => assertActorMayTransition(reviewer, post(PostStatus.IN_REVIEW), PostStatus.APPROVED)).not.toThrow();
    });

    it('never lets a user approve their own post', () => {
      // Even a reviewer who is assigned to the client and happens to be the author.
      const own = post(PostStatus.IN_REVIEW, reviewer.id);
      const err = errorOf(() => assertActorMayTransition(reviewer, own, PostStatus.APPROVED));
      expect(err?.status).toBe(403);
      expect(err?.body.code).toBe('SELF_REVIEW');
      expect(err?.body.message).toBe('You cannot approve your own post.');

      expect(() => assertActorMayTransition(creator, post(PostStatus.IN_REVIEW), PostStatus.APPROVED)).toThrow('You cannot approve your own post.');
    });

    it('forbids reviewers who are not assigned to the client', () => {
      const err = errorOf(() => assertActorMayTransition(unassignedReviewer, post(PostStatus.IN_REVIEW), PostStatus.APPROVED));
      expect(err?.status).toBe(403);
      expect(err?.body.code).toBe('NOT_ASSIGNED');
    });

    it.each([otherCreator, admin])('forbids non-reviewers ($role)', (actor) => {
      expect(() => assertActorMayTransition(actor, post(PostStatus.IN_REVIEW), PostStatus.APPROVED)).toThrow(ForbiddenException);
    });
  });

  describe('request changes', () => {
    const inReview = post(PostStatus.IN_REVIEW);

    it('requires a comment of at least 10 characters', () => {
      for (const comment of [undefined, null, '', 'too short', '    padded   ', '  Fix typo!  ']) {
        const err = errorOf(() => assertActorMayTransition(reviewer, inReview, PostStatus.CHANGES_REQUESTED, { comment }));
        expect(err?.status).toBe(400);
        expect(err?.body.code).toBe('COMMENT_REQUIRED');
      }
    });

    it('accepts exactly 10 characters (after trimming)', () => {
      expect(() =>
        assertActorMayTransition(reviewer, inReview, PostStatus.CHANGES_REQUESTED, { comment: '  Fix typos!  ' }),
      ).not.toThrow();
    });

    it('checks assignment before the comment', () => {
      const err = errorOf(() =>
        assertActorMayTransition(unassignedReviewer, inReview, PostStatus.CHANGES_REQUESTED, { comment: 'Please rewrite the hook.' }),
      );
      expect(err?.status).toBe(403);
    });

    it('does not let authors review themselves', () => {
      expect(() =>
        assertActorMayTransition(reviewer, post(PostStatus.IN_REVIEW, reviewer.id), PostStatus.CHANGES_REQUESTED, { comment: 'Long enough comment' }),
      ).toThrow('You cannot review your own post.');
    });
  });

  describe('schedule and publish', () => {
    it('lets the creator or an admin schedule an approved post', () => {
      expect(() => assertActorMayTransition(creator, post(PostStatus.APPROVED), PostStatus.SCHEDULED)).not.toThrow();
      expect(() => assertActorMayTransition(admin, post(PostStatus.APPROVED), PostStatus.SCHEDULED)).not.toThrow();
    });

    it('forbids other creators and reviewers from scheduling', () => {
      expect(() => assertActorMayTransition(otherCreator, post(PostStatus.APPROVED), PostStatus.SCHEDULED)).toThrow(ForbiddenException);
      expect(() => assertActorMayTransition(reviewer, post(PostStatus.APPROVED), PostStatus.SCHEDULED)).toThrow(ForbiddenException);
    });

    it.each([creator, reviewer, admin])('reserves publishing for the background job ($role)', (actor) => {
      const err = errorOf(() => assertActorMayTransition(actor, post(PostStatus.SCHEDULED), PostStatus.PUBLISHED));
      expect(err?.status).toBe(403);
      expect(err?.body.code).toBe('SYSTEM_ONLY');
    });
  });

  it('uses Nest HTTP exceptions so the API maps them to 400/403 automatically', () => {
    expect(() => assertTransitionAllowed(PostStatus.DRAFT, PostStatus.PUBLISHED)).toThrow(BadRequestException);
  });
});

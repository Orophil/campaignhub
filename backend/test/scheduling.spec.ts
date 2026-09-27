import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  assertInFuture,
  assertNoSchedulingConflict,
  findSchedulingConflict,
  MIN_SCHEDULE_GAP_MS,
} from '../src/modules/posts/domain/scheduling';

const at = (iso: string) => new Date(iso);
const slot = (id: string, iso: string | null) => ({ id, scheduledAt: iso ? at(iso) : null });

describe('scheduling conflict rule (same client + platform, 2 hours apart)', () => {
  const existing = [slot('p-10am', '2026-10-01T10:00:00Z')];

  it('uses a 2 hour gap', () => {
    expect(MIN_SCHEDULE_GAP_MS).toBe(2 * 60 * 60 * 1000);
  });

  it.each([
    ['same time', '2026-10-01T10:00:00Z'],
    ['1 minute later', '2026-10-01T10:01:00Z'],
    ['1h59m later', '2026-10-01T11:59:00Z'],
    ['1h59m59.999s later', '2026-10-01T11:59:59.999Z'],
    ['1 hour earlier', '2026-10-01T09:00:00Z'],
    ['1h59m earlier', '2026-10-01T08:01:00Z'],
  ])('conflicts when %s', (_label, iso) => {
    expect(findSchedulingConflict({ scheduledAt: at(iso) }, existing)?.id).toBe('p-10am');
  });

  it.each([
    ['exactly 2h later', '2026-10-01T12:00:00Z'],
    ['exactly 2h earlier', '2026-10-01T08:00:00Z'],
    ['3h later', '2026-10-01T13:00:00Z'],
    ['next day', '2026-10-02T10:00:00Z'],
  ])('does not conflict when %s', (_label, iso) => {
    expect(findSchedulingConflict({ scheduledAt: at(iso) }, existing)).toBeNull();
  });

  it('ignores the post itself when it is being rescheduled', () => {
    expect(findSchedulingConflict({ id: 'p-10am', scheduledAt: at('2026-10-01T10:30:00Z') }, existing)).toBeNull();
  });

  it('ignores unscheduled posts', () => {
    expect(findSchedulingConflict({ scheduledAt: at('2026-10-01T10:00:00Z') }, [slot('draft', null)])).toBeNull();
  });

  it('finds a conflict among several posts', () => {
    const others = [slot('a', '2026-10-01T06:00:00Z'), slot('b', '2026-10-01T14:00:00Z'), slot('c', '2026-10-01T15:30:00Z')];
    expect(findSchedulingConflict({ scheduledAt: at('2026-10-01T15:00:00Z') }, others)?.id).toBe('b');
    expect(findSchedulingConflict({ scheduledAt: at('2026-10-01T10:00:00Z') }, others)).toBeNull();
  });

  it('fits a post exactly between two others that are 4h apart', () => {
    const others = [slot('a', '2026-10-01T08:00:00Z'), slot('b', '2026-10-01T12:00:00Z')];
    expect(findSchedulingConflict({ scheduledAt: at('2026-10-01T10:00:00Z') }, others)).toBeNull();
  });

  it('respects a custom gap', () => {
    expect(findSchedulingConflict({ scheduledAt: at('2026-10-01T10:30:00Z') }, existing, 15 * 60 * 1000)).toBeNull();
  });

  it('throws 409 with the conflicting post id', () => {
    let error: ConflictException | undefined;
    try {
      assertNoSchedulingConflict({ scheduledAt: at('2026-10-01T11:00:00Z') }, existing);
    } catch (e) {
      error = e as ConflictException;
    }
    expect(error).toBeInstanceOf(ConflictException);
    expect(error!.getStatus()).toBe(409);
    expect(error!.getResponse()).toMatchObject({
      code: 'SCHEDULE_CONFLICT',
      conflictingPostId: 'p-10am',
      conflictingScheduledAt: '2026-10-01T10:00:00.000Z',
    });
    expect((error!.getResponse() as any).message).toContain('60 minute(s) away');
  });

  it('does not throw when the slot is free', () => {
    expect(() => assertNoSchedulingConflict({ scheduledAt: at('2026-10-01T12:00:00Z') }, existing)).not.toThrow();
  });
});

describe('scheduled time must be in the future', () => {
  const now = at('2026-10-01T10:00:00Z');

  it('accepts a future time', () => {
    expect(() => assertInFuture(at('2026-10-01T10:00:01Z'), now)).not.toThrow();
  });

  it.each(['2026-10-01T10:00:00Z', '2026-10-01T09:59:59Z', '2025-01-01T00:00:00Z'])('rejects %s', (iso) => {
    expect(() => assertInFuture(at(iso), now)).toThrow(BadRequestException);
    expect(() => assertInFuture(at(iso), now)).toThrow('Scheduled time must be in the future.');
  });

  it('rejects invalid dates', () => {
    expect(() => assertInFuture(new Date('not a date'), now)).toThrow('not a valid date');
  });
});

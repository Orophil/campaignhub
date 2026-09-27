import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Post, Prisma } from '@prisma/client';
import { validateCaption } from '../../common/caption-limits';
import { Platform, PostStatus, Role } from '../../common/enums';
import { PrismaService, PrismaTx } from '../../database/prisma.service';
import { AuthUser } from '../auth/auth.decorators';
import { ClientsService, flattenReviewers } from '../clients/clients.service';
import { EventsGateway } from '../events/events.gateway';
import { assertInFuture, assertNoSchedulingConflict, MIN_SCHEDULE_GAP_MS } from './domain/scheduling';
import {
  ALLOWED_TRANSITIONS,
  assertActorMayTransition,
  assertTransitionAllowed,
  EDITABLE_STATUSES,
  isAssignedReviewer,
  WorkflowActor,
} from './domain/workflow';
import { CreateCommentDto, CreatePostDto, ListPostsQuery, TransitionPostDto, UpdatePostDto } from './dto/posts.dto';

/** What the current user may do with a post; lets the UI show only allowed actions. */
export interface PostPermissions {
  canEdit: boolean;
  canComment: boolean;
  transitions: PostStatus[];
}

export type PostWithPermissions<T extends Post = Post> = T & { permissions: PostPermissions };

const LIST_INCLUDE = { client: true, createdBy: true } satisfies Prisma.PostInclude;

const DETAIL_INCLUDE = {
  client: { include: { reviewers: { include: { reviewer: true }, orderBy: { reviewer: { name: 'asc' } } } } },
  createdBy: true,
  comments: { include: { author: true }, orderBy: { createdAt: 'asc' } },
  auditLogs: { include: { actor: true }, orderBy: { timestamp: 'asc' } },
} satisfies Prisma.PostInclude;

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
    private readonly events: EventsGateway,
  ) {}

  // ---------------------------------------------------------------- reads

  async list(user: AuthUser, q: ListPostsQuery) {
    const actor = await this.toActor(user);
    const filters: Prisma.PostWhereInput[] = [];

    if (actor.role === Role.REVIEWER) {
      if (actor.assignedClientIds.length === 0) return [];
      filters.push({ clientId: { in: actor.assignedClientIds } });
    }
    if (q.clientId) filters.push({ clientId: q.clientId });
    if (q.platform) filters.push({ platform: q.platform });
    if (q.status) filters.push({ status: q.status });
    if (q.from) filters.push({ scheduledAt: { gte: new Date(q.from) } });
    if (q.to) filters.push({ scheduledAt: { lt: new Date(q.to) } });

    const posts = await this.prisma.post.findMany({
      where: { AND: filters },
      include: LIST_INCLUDE,
      orderBy: [{ scheduledAt: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }],
    });
    return posts.map((p) => this.withPermissions(p, actor));
  }

  async findOne(user: AuthUser, id: string) {
    const actor = await this.toActor(user);
    const post = await this.prisma.post.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!post) throw this.notFound();
    this.assertCanView(actor, post);
    return this.withPermissions({ ...post, client: flattenReviewers(post.client) }, actor);
  }

  // ---------------------------------------------------------------- writes

  async create(user: AuthUser, dto: CreatePostDto) {
    this.assertCaption(dto.platform, dto.caption);
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;

    const id = await this.prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({ where: { id: dto.clientId }, select: { id: true } });
      if (!client) throw new BadRequestException({ statusCode: 400, error: 'Bad Request', message: 'Client does not exist.' });
      if (scheduledAt) await this.assertSlotFree(tx, { clientId: dto.clientId, platform: dto.platform, scheduledAt });

      const post = await tx.post.create({
        data: {
          clientId: dto.clientId,
          platform: dto.platform,
          caption: dto.caption,
          scheduledAt,
          status: PostStatus.DRAFT,
          createdById: user.id,
          version: 1,
        },
      });
      await tx.auditLog.create({ data: { postId: post.id, actorId: user.id, fromStatus: null, toStatus: PostStatus.DRAFT } });
      return post.id;
    });

    const created = await this.findOne(user, id);
    this.events.emitChanged({ postId: id, clientId: created.clientId, kind: 'created' });
    return created;
  }

  async update(user: AuthUser, id: string, dto: UpdatePostDto) {
    const actor = await this.toActor(user);

    await this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findUnique({ where: { id } });
      if (!post) throw this.notFound();
      this.assertCanView(actor, post);

      if (post.createdById !== user.id) {
        throw this.forbidden('Only the creator who made this post can edit it.');
      }
      if (!EDITABLE_STATUSES.includes(post.status)) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'NOT_EDITABLE',
          message: `Posts can only be edited while ${EDITABLE_STATUSES.join(' or ')}; this post is ${post.status}.`,
        });
      }
      this.assertVersion(post, dto.version);

      const next = {
        clientId: dto.clientId ?? post.clientId,
        platform: dto.platform ?? post.platform,
        caption: dto.caption ?? post.caption,
        scheduledAt: dto.scheduledAt === undefined ? post.scheduledAt : dto.scheduledAt === null ? null : new Date(dto.scheduledAt),
      };

      if (next.clientId !== post.clientId && !(await tx.client.findUnique({ where: { id: next.clientId }, select: { id: true } }))) {
        throw new BadRequestException({ statusCode: 400, error: 'Bad Request', message: 'Client does not exist.' });
      }
      this.assertCaption(next.platform, next.caption);

      const slotChanged =
        next.scheduledAt !== null &&
        (next.scheduledAt.getTime() !== post.scheduledAt?.getTime() ||
          next.platform !== post.platform ||
          next.clientId !== post.clientId);
      if (slotChanged) {
        await this.assertSlotFree(tx, { id: post.id, clientId: next.clientId, platform: next.platform, scheduledAt: next.scheduledAt! });
      }

      await this.writeWithVersion(tx, post, dto.version, next);
    });

    const updated = await this.findOne(user, id);
    this.events.emitChanged({ postId: id, clientId: updated.clientId, kind: 'edited' });
    return updated;
  }

  async transition(user: AuthUser, id: string, dto: TransitionPostDto) {
    const actor = await this.toActor(user);
    let fromStatus!: PostStatus;

    await this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findUnique({ where: { id } });
      if (!post) throw this.notFound();
      this.assertCanView(actor, post);

      // 1. Is the move part of the workflow at all? (400)
      assertTransitionAllowed(post.status, dto.toStatus);
      // 2. May this user make it? (403, or 400 for a too-short change request comment)
      assertActorMayTransition(actor, post, dto.toStatus, { comment: dto.comment });
      // 3. Is the caller looking at the latest version? (409)
      this.assertVersion(post, dto.version);

      const changes: Prisma.PostUncheckedUpdateManyInput = { status: dto.toStatus };

      if (dto.toStatus === PostStatus.SCHEDULED) {
        const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : post.scheduledAt;
        if (!scheduledAt) {
          throw new BadRequestException({
            statusCode: 400,
            error: 'Bad Request',
            code: 'SCHEDULE_REQUIRED',
            message: 'Set a scheduled time before scheduling this post.',
          });
        }
        await this.assertSlotFree(tx, { id: post.id, clientId: post.clientId, platform: post.platform, scheduledAt });
        changes.scheduledAt = scheduledAt;
      }

      fromStatus = post.status;
      await this.writeWithVersion(tx, post, dto.version, changes);

      const comment = dto.comment?.trim();
      if (comment) await tx.comment.create({ data: { postId: post.id, authorId: user.id, message: comment } });
      await tx.auditLog.create({ data: { postId: post.id, actorId: user.id, fromStatus: post.status, toStatus: dto.toStatus } });
    });

    const updated = await this.findOne(user, id);
    this.events.emitStatusChange({
      postId: id,
      clientId: updated.clientId,
      brandName: updated.client.brandName,
      platform: updated.platform,
      captionPreview: updated.caption.slice(0, 80),
      fromStatus,
      toStatus: updated.status,
      actorName: user.name,
      at: new Date().toISOString(),
    });
    return updated;
  }

  async addComment(user: AuthUser, id: string, dto: CreateCommentDto) {
    const actor = await this.toActor(user);
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw this.notFound();
    this.assertCanView(actor, post);

    const comment = await this.prisma.comment.create({
      data: { postId: id, authorId: user.id, message: dto.message },
      include: { author: true },
    });
    this.events.emitChanged({ postId: id, clientId: post.clientId, kind: 'commented' });
    return comment;
  }

  // ---------------------------------------------------------------- helpers

  private async toActor(user: AuthUser): Promise<WorkflowActor> {
    return {
      id: user.id,
      role: user.role,
      assignedClientIds: user.role === Role.REVIEWER ? await this.clients.assignedClientIds(user.id) : [],
    };
  }

  /** Reviewers can only see posts of clients assigned to them. */
  private assertCanView(actor: WorkflowActor, post: Pick<Post, 'clientId'>) {
    if (actor.role === Role.REVIEWER && !isAssignedReviewer(actor, post.clientId)) {
      throw this.forbidden('You are not assigned as a reviewer for this client.', 'NOT_ASSIGNED');
    }
  }

  private assertCaption(platform: Platform, caption: string) {
    const error = validateCaption(platform, caption);
    if (error) throw new BadRequestException({ statusCode: 400, error: 'Bad Request', code: 'CAPTION_TOO_LONG', message: error });
  }

  private assertVersion(post: Post, version: number) {
    if (post.version !== version) throw this.versionConflict(version, post.version);
  }

  /**
   * Checks the "future" and "2 hours apart" rules. A transaction-scoped advisory
   * lock on (client, platform) serialises concurrent schedulers, so two requests
   * can't both pass the check and then insert overlapping slots.
   */
  private async assertSlotFree(
    tx: PrismaTx,
    slot: { id?: string; clientId: string; platform: Platform; scheduledAt: Date },
  ) {
    assertInFuture(slot.scheduledAt);
    // $executeRaw rather than $queryRaw: the function returns `void`, which Prisma can't deserialize.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`schedule:${slot.clientId}:${slot.platform}`}))`;

    const t = slot.scheduledAt.getTime();
    const nearby = await tx.post.findMany({
      where: {
        clientId: slot.clientId,
        platform: slot.platform,
        scheduledAt: { gt: new Date(t - MIN_SCHEDULE_GAP_MS), lt: new Date(t + MIN_SCHEDULE_GAP_MS) },
        ...(slot.id && { id: { not: slot.id } }),
      },
      select: { id: true, scheduledAt: true },
    });
    // Report the closest neighbour.
    nearby.sort((a, b) => Math.abs(a.scheduledAt!.getTime() - t) - Math.abs(b.scheduledAt!.getTime() - t));
    assertNoSchedulingConflict({ id: slot.id, scheduledAt: slot.scheduledAt }, nearby);
  }

  /**
   * The optimistic lock itself: the UPDATE only matches when the row still has the
   * version the caller read. If another request got there first, 0 rows match -> 409.
   */
  private async writeWithVersion(tx: PrismaTx, post: Post, expectedVersion: number, changes: Prisma.PostUncheckedUpdateManyInput) {
    const result = await tx.post.updateMany({
      where: { id: post.id, version: expectedVersion },
      data: { ...changes, version: { increment: 1 } },
    });
    if (!result.count) {
      const current = await tx.post.findUnique({ where: { id: post.id }, select: { version: true } });
      throw this.versionConflict(expectedVersion, current?.version ?? post.version + 1);
    }
  }

  private withPermissions<T extends Post>(post: T, actor: WorkflowActor): PostWithPermissions<T> {
    const transitions = ALLOWED_TRANSITIONS[post.status].filter((to) => {
      try {
        // A long placeholder comment so the "min 10 chars" rule doesn't hide the action.
        assertActorMayTransition(actor, post, to, { comment: 'x'.repeat(50) });
        return true;
      } catch {
        return false;
      }
    });
    return Object.assign(post, {
      permissions: {
        canEdit: post.createdById === actor.id && EDITABLE_STATUSES.includes(post.status),
        canComment: true,
        transitions,
      },
    });
  }

  private versionConflict(sent: number, current: number) {
    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: 'VERSION_CONFLICT',
      message: `This post was changed by someone else while you were working on it (you sent version ${sent}, current version is ${current}). Reload to see the latest changes.`,
      currentVersion: current,
    });
  }

  private notFound() {
    return new NotFoundException({ statusCode: 404, error: 'Not Found', message: 'Post not found.' });
  }

  private forbidden(message: string, code = 'FORBIDDEN') {
    return new ForbiddenException({ statusCode: 403, error: 'Forbidden', code, message });
  }
}

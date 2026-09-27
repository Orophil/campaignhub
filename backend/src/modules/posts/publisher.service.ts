import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PostStatus } from '../../common/enums';
import { PrismaService } from '../../database/prisma.service';
import { EventsGateway } from '../events/events.gateway';

/**
 * Background job: every minute, SCHEDULED posts whose time has passed become
 * PUBLISHED. The UPDATE is conditional on `status = SCHEDULED`, so running two
 * API instances (or overlapping ticks) can never publish a post twice.
 */
@Injectable()
export class PublisherService {
  private readonly logger = new Logger(PublisherService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'publish-due-posts' })
  async tick() {
    if (this.config.get('PUBLISHER_ENABLED', 'true') === 'false' || this.running) return;
    this.running = true;
    try {
      const count = await this.publishDue();
      if (count) this.logger.log(`Published ${count} post(s)`);
    } catch (err) {
      this.logger.error('Publisher tick failed', err as Error);
    } finally {
      this.running = false;
    }
  }

  async publishDue(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.post.findMany({
      where: { status: PostStatus.SCHEDULED, scheduledAt: { lte: now } },
      include: { client: true },
      orderBy: { scheduledAt: 'asc' },
      take: 500,
    });

    let published = 0;
    for (const post of due) {
      const done = await this.prisma.$transaction(async (tx) => {
        const res = await tx.post.updateMany({
          where: { id: post.id, status: PostStatus.SCHEDULED },
          data: { status: PostStatus.PUBLISHED, version: { increment: 1 } },
        });
        if (!res.count) return false;
        await tx.auditLog.create({
          data: { postId: post.id, actorId: null, fromStatus: PostStatus.SCHEDULED, toStatus: PostStatus.PUBLISHED },
        });
        return true;
      });
      if (!done) continue;
      published++;
      this.events.emitStatusChange({
        postId: post.id,
        clientId: post.clientId,
        brandName: post.client.brandName,
        platform: post.platform,
        captionPreview: post.caption.slice(0, 80),
        fromStatus: PostStatus.SCHEDULED,
        toStatus: PostStatus.PUBLISHED,
        actorName: 'System',
        at: new Date().toISOString(),
      });
    }
    return published;
  }
}

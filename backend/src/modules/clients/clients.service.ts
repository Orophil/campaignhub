import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Role } from '../../common/enums';
import { PrismaService } from '../../database/prisma.service';
import { AuthUser } from '../auth/auth.decorators';
import { CreateClientDto, UpdateClientDto } from './dto/clients.dto';

/** Loads a client's reviewer assignments (with the users), alphabetically. */
const WITH_REVIEWERS = {
  reviewers: { include: { reviewer: true }, orderBy: { reviewer: { name: 'asc' } } },
} satisfies Prisma.ClientInclude;

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ids of the clients a reviewer is assigned to. */
  async assignedClientIds(reviewerId: string): Promise<string[]> {
    const rows = await this.prisma.clientReviewer.findMany({ where: { reviewerId }, select: { clientId: true } });
    return rows.map((r:any) => r.clientId);
  }

  /** Reviewers only see the clients assigned to them; everyone else sees all clients. */
  async list(user: AuthUser) {
    const clients = await this.prisma.client.findMany({
      where: user.role === Role.REVIEWER ? { reviewers: { some: { reviewerId: user.id } } } : {},
      include: WITH_REVIEWERS,
      orderBy: { brandName: 'asc' },
    });
    return clients.map(flattenReviewers);
  }

  async create(dto: CreateClientDto) {
    await this.assertBrandAvailable(dto.brandName);
    const reviewerIds = await this.validReviewerIds(dto.reviewerIds ?? []);
    const client = await this.prisma.client.create({
      data: {
        brandName: dto.brandName.trim(),
        reviewers: { create: reviewerIds.map((reviewerId) => ({ reviewerId })) },
      },
      include: WITH_REVIEWERS,
    });
    return flattenReviewers(client);
  }

  async update(id: string, dto: UpdateClientDto) {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException('Client not found.');

    const data: Prisma.ClientUpdateInput = {};
    if (dto.brandName !== undefined && dto.brandName.trim() !== client.brandName) {
      await this.assertBrandAvailable(dto.brandName, id);
      data.brandName = dto.brandName.trim();
    }
    if (dto.reviewerIds !== undefined) {
      // Replace the whole assignment set.
      const reviewerIds = await this.validReviewerIds(dto.reviewerIds);
      data.reviewers = { deleteMany: {}, create: reviewerIds.map((reviewerId) => ({ reviewerId })) };
    }
    const updated = await this.prisma.client.update({ where: { id }, data, include: WITH_REVIEWERS });
    return flattenReviewers(updated);
  }

  private async assertBrandAvailable(brandName: string, exceptId?: string) {
    const existing = await this.prisma.client.findFirst({
      where: { brandName: { equals: brandName.trim(), mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'BRAND_TAKEN', message: `A client named "${brandName}" already exists.` });
    }
  }

  private async validReviewerIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const found = await this.prisma.user.findMany({ where: { id: { in: ids }, role: Role.REVIEWER }, select: { id: true } });
    const invalid = ids.filter((id) => !found.some((u) => u.id === id));
    if (invalid.length) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'INVALID_REVIEWERS',
        message: `These users do not exist or are not reviewers: ${invalid.join(', ')}`,
      });
    }
    return ids;
  }
}

/** API shape: `reviewers` is a plain list of users, not the join-table rows. */
export function flattenReviewers<T extends { reviewers: { reviewer: R }[] }, R>(client: T) {
  return { ...client, reviewers: client.reviewers.map((r) => r.reviewer) };
}

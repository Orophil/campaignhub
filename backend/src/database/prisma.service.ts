import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

const CLIENT_OPTIONS = {
  // bcrypt hashes never leave the database unless a query opts back in with
  // `omit: { passwordHash: false }` (only the login does).
  omit: { user: { passwordHash: true } },
  // Scheduling writes can wait on an advisory lock; allow more than the 5s default.
  transactionOptions: { maxWait: 10_000, timeout: 15_000 },
} satisfies Prisma.PrismaClientOptions;

/** The client inside `prisma.$transaction(async (tx) => ...)`. */
export type PrismaTx = Omit<
  PrismaService,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends' | 'onModuleInit' | 'onModuleDestroy'
>;

@Injectable()
export class PrismaService extends PrismaClient<typeof CLIENT_OPTIONS> implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super(CLIENT_OPTIONS);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

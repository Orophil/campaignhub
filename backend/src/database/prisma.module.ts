import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Makes PrismaService injectable everywhere without importing this module again. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

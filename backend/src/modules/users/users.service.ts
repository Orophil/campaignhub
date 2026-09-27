import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role } from '../../common/enums';
import { PrismaService } from '../../database/prisma.service';
import { CreateUserDto } from './dto/users.dto';

export const BCRYPT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(role?: Role) {
    return this.prisma.user.findMany({ where: role ? { role } : {}, orderBy: [{ role: 'asc' }, { name: 'asc' }] });
  }

  async create(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'EMAIL_TAKEN', message: `A user with email ${email} already exists.` });
    }
    // passwordHash is omitted from the result by PrismaService.
    return this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        role: dto.role,
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      },
    });
  }
}

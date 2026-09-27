import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/auth.decorators';
import { Role } from '../../common/enums';
import { CreateUserDto, ListUsersQuery } from './dto/users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** List users, optionally filtered by role. Admin only. */
  @Get()
  list(@Query() q: ListUsersQuery) {
    return this.users.list(q.role);
  }

  /** Create a user with a role. Admin only. */
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }
}

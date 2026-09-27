import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../auth/auth.decorators';
import { Role } from '../../common/enums';
import { AssignReviewersDto, CreateClientDto, UpdateClientDto } from './dto/clients.dto';
import { ClientsService } from './clients.service';

@ApiTags('clients')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  /** All clients (reviewers only get the clients assigned to them). */
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.clients.list(user);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateClientDto) {
    return this.clients.create(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClientDto) {
    return this.clients.update(id, dto);
  }

  /** Replace the reviewer assignments of a client. */
  @Roles(Role.ADMIN)
  @Put(':id/reviewers')
  assignReviewers(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignReviewersDto) {
    return this.clients.update(id, { reviewerIds: dto.reviewerIds });
  }
}

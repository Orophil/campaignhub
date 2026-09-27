import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../auth/auth.decorators';
import { Role } from '../../common/enums';
import { CreateCommentDto, CreatePostDto, ListPostsQuery, TransitionPostDto, UpdatePostDto } from './dto/posts.dto';
import { PostsService } from './posts.service';

@ApiTags('posts')
@ApiBearerAuth()
@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  /** List posts visible to the current user. Reviewers only see their assigned clients. */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListPostsQuery) {
    return this.posts.list(user, q);
  }

  /** Post detail with comments, audit trail and the actions the current user may take. */
  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.posts.findOne(user, id);
  }

  /** Create a DRAFT post. Creators only. */
  @Roles(Role.CREATOR)
  @Post()
  @ApiResponse({ status: 409, description: 'Scheduling conflict (includes conflictingPostId)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePostDto) {
    return this.posts.create(user, dto);
  }

  /** Edit a post. Only its creator, only while DRAFT or CHANGES_REQUESTED, and `version` must match. */
  @Roles(Role.CREATOR)
  @Patch(':id')
  @ApiResponse({ status: 409, description: 'Version mismatch (VERSION_CONFLICT) or scheduling conflict (SCHEDULE_CONFLICT)' })
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePostDto) {
    return this.posts.update(user, id, dto);
  }

  /** Move a post to another status. Invalid moves return 400 with code INVALID_TRANSITION. */
  @Post(':id/transition')
  @ApiResponse({ status: 400, description: 'Invalid transition, or change request without a 10+ character comment' })
  @ApiResponse({ status: 409, description: 'Version mismatch or scheduling conflict' })
  transition(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransitionPostDto) {
    return this.posts.transition(user, id, dto);
  }

  /** Add a comment to a post's thread. */
  @Post(':id/comments')
  addComment(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateCommentDto) {
    return this.posts.addComment(user, id, dto);
  }
}

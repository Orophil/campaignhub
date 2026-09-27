import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { Platform, PostStatus } from '../../../common/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreatePostDto {
  @IsUUID()
  clientId: string;

  @IsEnum(Platform)
  platform: Platform;

  /** Validated against the platform's limit (X 280, Instagram 2200, LinkedIn 3000, Facebook 5000). */
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Caption cannot be empty.' })
  caption: string;

  /** ISO-8601 timestamp. Must be in the future; stored in UTC. Optional while drafting. */
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'scheduledAt must be an ISO-8601 date-time.' })
  scheduledAt?: string;
}

export class UpdatePostDto {
  /** The version you last read. A mismatch returns 409. */
  @IsInt()
  @Min(1)
  version: number;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Caption cannot be empty.' })
  caption?: string;

  /** ISO-8601 timestamp, or null to clear it. */
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsISO8601({ strict: true }, { message: 'scheduledAt must be an ISO-8601 date-time.' })
  scheduledAt?: string | null;
}

export class TransitionPostDto {
  @IsEnum(PostStatus)
  toStatus: PostStatus;

  /** The version you last read. A mismatch returns 409. */
  @IsInt()
  @Min(1)
  version: number;

  /** Required (min 10 chars) when requesting changes; optional otherwise. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  /** Optional when moving to SCHEDULED; overrides the post's current scheduledAt. */
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'scheduledAt must be an ISO-8601 date-time.' })
  scheduledAt?: string;
}

export class CreateCommentDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Comment cannot be empty.' })
  @MaxLength(2000)
  message: string;
}

export class ListPostsQuery {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;

  /** Only posts scheduled at or after this instant (ISO-8601). */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Only posts scheduled before this instant (ISO-8601). */
  @IsOptional()
  @IsISO8601()
  to?: string;
}

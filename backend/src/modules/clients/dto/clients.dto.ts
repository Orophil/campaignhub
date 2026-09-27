import { ArrayUnique, IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  brandName: string;

  /** Users (role REVIEWER) who may review this client's posts. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  reviewerIds?: string[];
}

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  brandName?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  reviewerIds?: string[];
}

export class AssignReviewersDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  reviewerIds: string[];
}

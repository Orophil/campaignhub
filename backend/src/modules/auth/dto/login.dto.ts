import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  /** @example admin@campaignhub.dev */
  @IsEmail()
  email: string;

  /** @example Admin@123 */
  @IsString()
  @MinLength(1)
  password: string;
}

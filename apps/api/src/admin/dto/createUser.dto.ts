import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  EMAIL_MAX,
  normalizeName,
  PASSWORD_MAX,
  PASSWORD_MIN,
  USER_NAME_ALLOWED,
  USER_NAME_MAX,
} from '@repo/contracts';

const HIDDEN_CHARS_MESSAGE = "Contains characters that aren't allowed";
const PASSWORD_LENGTH_MESSAGE = `Use ${PASSWORD_MIN} to ${PASSWORD_MAX} characters`;

const toName = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeName(value) : value;
const toEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const isProvided = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

/**
 * class-validator runs decorators bottom-up and stopAtFirstError keeps the
 * first failure, so IsString sits last in each stack (same as UpdateProfileDto).
 */
export class CreateUserDto {
  @Transform(toName)
  @Matches(USER_NAME_ALLOWED, { message: HIDDEN_CHARS_MESSAGE })
  @MaxLength(USER_NAME_MAX, {
    message: `First name must be ${USER_NAME_MAX} characters or fewer`,
  })
  @MinLength(1, { message: 'Enter a first name' })
  @IsString({ message: 'Enter a first name' })
  firstName: string;

  @ValidateIf(isProvided)
  @Transform(toName)
  @Matches(USER_NAME_ALLOWED, { message: HIDDEN_CHARS_MESSAGE })
  @MaxLength(USER_NAME_MAX, {
    message: `Last name must be ${USER_NAME_MAX} characters or fewer`,
  })
  @IsString({ message: 'Last name must be text' })
  lastName?: string;

  @Transform(toName)
  @Matches(USER_NAME_ALLOWED, { message: HIDDEN_CHARS_MESSAGE })
  @MaxLength(USER_NAME_MAX, {
    message: `Display name must be ${USER_NAME_MAX} characters or fewer`,
  })
  @MinLength(1, { message: 'Enter a display name' })
  @IsString({ message: 'Enter a display name' })
  displayName: string;

  @Transform(toEmail)
  @MaxLength(EMAIL_MAX, { message: 'Enter a valid email' })
  @IsEmail({}, { message: 'Enter a valid email' })
  @IsString({ message: 'Enter a valid email' })
  email: string;

  @Length(PASSWORD_MIN, PASSWORD_MAX, { message: PASSWORD_LENGTH_MESSAGE })
  @IsString({ message: PASSWORD_LENGTH_MESSAGE })
  password: string;
}

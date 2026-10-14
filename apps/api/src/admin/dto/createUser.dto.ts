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
import { validationMessage } from '../../common/validation.js';

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
  @Matches(USER_NAME_ALLOWED, {
    message: validationMessage('users:errors.hiddenChars'),
  })
  @MaxLength(USER_NAME_MAX, {
    message: validationMessage('users:errors.firstNameTooLong', {
      max: USER_NAME_MAX,
    }),
  })
  @MinLength(1, { message: validationMessage('users:errors.firstNameRequired') })
  @IsString({ message: validationMessage('users:errors.firstNameRequired') })
  firstName: string;

  @ValidateIf(isProvided)
  @Transform(toName)
  @Matches(USER_NAME_ALLOWED, {
    message: validationMessage('users:errors.hiddenChars'),
  })
  @MaxLength(USER_NAME_MAX, {
    message: validationMessage('users:errors.lastNameTooLong', {
      max: USER_NAME_MAX,
    }),
  })
  @IsString({ message: validationMessage('users:errors.lastNameText') })
  lastName?: string;

  @Transform(toName)
  @Matches(USER_NAME_ALLOWED, {
    message: validationMessage('users:errors.hiddenChars'),
  })
  @MaxLength(USER_NAME_MAX, {
    message: validationMessage('users:errors.displayNameTooLong', {
      max: USER_NAME_MAX,
    }),
  })
  @MinLength(1, {
    message: validationMessage('users:errors.displayNameRequired'),
  })
  @IsString({ message: validationMessage('users:errors.displayNameRequired') })
  displayName: string;

  @Transform(toEmail)
  @MaxLength(EMAIL_MAX, { message: validationMessage('users:errors.emailValid') })
  @IsEmail({}, { message: validationMessage('users:errors.emailValid') })
  @IsString({ message: validationMessage('users:errors.emailValid') })
  email: string;

  @Length(PASSWORD_MIN, PASSWORD_MAX, {
    message: validationMessage('users:errors.passwordLength', {
      min: PASSWORD_MIN,
      max: PASSWORD_MAX,
    }),
  })
  @IsString({
    message: validationMessage('users:errors.passwordLength', {
      min: PASSWORD_MIN,
      max: PASSWORD_MAX,
    }),
  })
  password: string;
}

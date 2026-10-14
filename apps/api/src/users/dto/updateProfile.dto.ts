import { Transform } from 'class-transformer';
import {
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  USER_NAME_ALLOWED,
  USER_NAME_MAX,
  normalizeName as normalizeNameContract,
} from '@repo/contracts';
import { validationMessage } from '../../common/validation.js';

/** NFC first: macOS Vietnamese input may send decomposed forms of the same name. */
const normalizeName = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeNameContract(value) : value;

const isProvided = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

/**
 * Every field is optional: the client sends only what changed. class-validator
 * runs decorators bottom-up and stopAtFirstError keeps the first failure, so
 * IsString sits last in each stack and its message wins for non-strings.
 */
export class UpdateProfileDto {
  @ValidateIf(isProvided)
  @Transform(normalizeName)
  @Matches(USER_NAME_ALLOWED, {
    message: validationMessage('users:errors.hiddenChars'),
  })
  @MaxLength(USER_NAME_MAX, {
    message: validationMessage('users:errors.firstNameTooLong', {
      max: USER_NAME_MAX,
    }),
  })
  @MinLength(1, { message: validationMessage('users:errors.enterYourFirstName') })
  @IsString({ message: validationMessage('users:errors.enterYourFirstName') })
  firstName?: string;

  @ValidateIf(isProvided)
  @Transform(normalizeName)
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

  @ValidateIf(isProvided)
  @Transform(normalizeName)
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
  displayName?: string;
}

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

const HIDDEN_CHARS_MESSAGE = "Contains characters that aren't allowed";

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
  @Matches(USER_NAME_ALLOWED, { message: HIDDEN_CHARS_MESSAGE })
  @MaxLength(USER_NAME_MAX, {
    message: `First name must be ${USER_NAME_MAX} characters or fewer`,
  })
  @MinLength(1, { message: 'Enter your first name' })
  @IsString({ message: 'Enter your first name' })
  firstName?: string;

  @ValidateIf(isProvided)
  @Transform(normalizeName)
  @Matches(USER_NAME_ALLOWED, { message: HIDDEN_CHARS_MESSAGE })
  @MaxLength(USER_NAME_MAX, {
    message: `Last name must be ${USER_NAME_MAX} characters or fewer`,
  })
  @IsString({ message: 'Last name must be text' })
  lastName?: string;

  @ValidateIf(isProvided)
  @Transform(normalizeName)
  @Matches(USER_NAME_ALLOWED, { message: HIDDEN_CHARS_MESSAGE })
  @MaxLength(USER_NAME_MAX, {
    message: `Display name must be ${USER_NAME_MAX} characters or fewer`,
  })
  @MinLength(1, { message: 'Enter a display name' })
  @IsString({ message: 'Enter a display name' })
  displayName?: string;
}

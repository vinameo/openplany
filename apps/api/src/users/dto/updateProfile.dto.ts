import { Transform } from 'class-transformer';
import {
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

// Control (Cc) and invisible format (Cf) characters, zero-width spaces included.
const NO_HIDDEN_CHARS = /^[^\p{Cc}\p{Cf}]*$/u;
const HIDDEN_CHARS_MESSAGE = "Contains characters that aren't allowed";
const MAX_NAME_LENGTH = 50;

/** NFC first: macOS Vietnamese input may send decomposed forms of the same name. */
const normalizeName = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.normalize('NFC').trim() : value;

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
  @Matches(NO_HIDDEN_CHARS, { message: HIDDEN_CHARS_MESSAGE })
  @MaxLength(MAX_NAME_LENGTH, {
    message: `First name must be ${MAX_NAME_LENGTH} characters or fewer`,
  })
  @MinLength(1, { message: 'Enter your first name' })
  @IsString({ message: 'Enter your first name' })
  firstName?: string;

  @ValidateIf(isProvided)
  @Transform(normalizeName)
  @Matches(NO_HIDDEN_CHARS, { message: HIDDEN_CHARS_MESSAGE })
  @MaxLength(MAX_NAME_LENGTH, {
    message: `Last name must be ${MAX_NAME_LENGTH} characters or fewer`,
  })
  @IsString({ message: 'Last name must be text' })
  lastName?: string;

  @ValidateIf(isProvided)
  @Transform(normalizeName)
  @Matches(NO_HIDDEN_CHARS, { message: HIDDEN_CHARS_MESSAGE })
  @MaxLength(MAX_NAME_LENGTH, {
    message: `Display name must be ${MAX_NAME_LENGTH} characters or fewer`,
  })
  @MinLength(1, { message: 'Enter a display name' })
  @IsString({ message: 'Enter a display name' })
  displayName?: string;
}

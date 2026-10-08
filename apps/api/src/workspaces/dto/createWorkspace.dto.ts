import {
  NO_HIDDEN_CHARS,
  NO_URL,
  normalizeWorkspaceName,
  ORGANIZATION_SIZES,
  RESERVED_WORKSPACE_SLUG_LIST,
  WORKSPACE_NAME_MAX,
  WORKSPACE_NAME_MESSAGES,
  WORKSPACE_SLUG_MAX,
  WORKSPACE_SLUG_MIN,
  WORKSPACE_SLUG_PATTERN,
  type OrganizationSize,
} from '@repo/contracts';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotIn,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const normalizeName = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeWorkspaceName(value) : value;

export class CreateWorkspaceDto {
  @Transform(normalizeName)
  @Matches(NO_URL, { message: WORKSPACE_NAME_MESSAGES.url })
  @Matches(NO_HIDDEN_CHARS, {
    message: WORKSPACE_NAME_MESSAGES.hiddenChars,
  })
  @MaxLength(WORKSPACE_NAME_MAX, {
    message: WORKSPACE_NAME_MESSAGES.tooLong,
  })
  @MinLength(1, { message: WORKSPACE_NAME_MESSAGES.required })
  @IsString({ message: WORKSPACE_NAME_MESSAGES.required })
  name: string;

  @IsNotIn(RESERVED_WORKSPACE_SLUG_LIST, {
    message: 'This URL is reserved. Choose another one.',
  })
  @Matches(WORKSPACE_SLUG_PATTERN, {
    message:
      "URL can use only lowercase letters, numbers, and single hyphens, and can't start or end with a hyphen",
  })
  @Length(WORKSPACE_SLUG_MIN, WORKSPACE_SLUG_MAX, {
    message: `URL must be between ${WORKSPACE_SLUG_MIN} and ${WORKSPACE_SLUG_MAX} characters`,
  })
  @IsString({ message: 'Enter a workspace URL' })
  slug: string;

  @IsIn(ORGANIZATION_SIZES, {
    message: 'Select how many people will use this workspace',
  })
  organizationSize: OrganizationSize;
}


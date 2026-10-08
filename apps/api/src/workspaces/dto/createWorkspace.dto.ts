import {
  NO_HIDDEN_CHARS,
  NO_URL,
  ORGANIZATION_SIZES,
  RESERVED_WORKSPACE_SLUG_LIST,
  WORKSPACE_NAME_MAX,
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
  typeof value === 'string' ? value.normalize('NFC').trim() : value;

export class CreateWorkspaceDto {
  @Transform(normalizeName)
  @Matches(NO_URL, { message: 'Workspace name cannot contain a URL' })
  @Matches(NO_HIDDEN_CHARS, {
    message: "Contains characters that aren't allowed",
  })
  @MaxLength(WORKSPACE_NAME_MAX, {
    message: `Workspace name must be ${WORKSPACE_NAME_MAX} characters or fewer`,
  })
  @MinLength(1, { message: 'Enter a workspace name' })
  @IsString({ message: 'Enter a workspace name' })
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


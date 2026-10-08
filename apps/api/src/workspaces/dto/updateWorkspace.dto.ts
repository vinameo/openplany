import {
  NO_HIDDEN_CHARS,
  NO_URL,
  normalizeWorkspaceName,
  ORGANIZATION_SIZES,
  type OrganizationSize,
  WORKSPACE_NAME_MAX,
  WORKSPACE_NAME_MESSAGES,
  WORKSPACE_TIMEZONES,
} from '@repo/contracts';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const normalizeName = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeWorkspaceName(value) : value;

const isProvided = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class UpdateWorkspaceDto {
  @ValidateIf(isProvided)
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
  name?: string;

  @ValidateIf(isProvided)
  @IsIn(ORGANIZATION_SIZES, { message: 'Select a company size' })
  organizationSize?: OrganizationSize;

  @ValidateIf(isProvided)
  @IsIn(WORKSPACE_TIMEZONES, { message: 'Select a valid timezone' })
  timezone?: string;
}


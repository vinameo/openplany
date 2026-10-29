import {
  NO_HIDDEN_CHARS,
  NO_URL,
  normalizeWorkspaceName,
  ORGANIZATION_SIZES,
  type OrganizationSize,
  WORKSPACE_NAME_MAX,
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
import { validationMessage } from '../../common/validation.js';

const normalizeName = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeWorkspaceName(value) : value;

const isProvided = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class UpdateWorkspaceDto {
  @ValidateIf(isProvided)
  @Transform(normalizeName)
  @Matches(NO_URL, {
    message: validationMessage('workspace:errors.nameUrl'),
  })
  @Matches(NO_HIDDEN_CHARS, {
    message: validationMessage('workspace:errors.nameHiddenChars'),
  })
  @MaxLength(WORKSPACE_NAME_MAX, {
    message: validationMessage('workspace:errors.nameTooLong', {
      max: WORKSPACE_NAME_MAX,
    }),
  })
  @MinLength(1, {
    message: validationMessage('workspace:errors.nameRequired'),
  })
  @IsString({
    message: validationMessage('workspace:errors.nameRequired'),
  })
  name?: string;

  @ValidateIf(isProvided)
  @IsIn(ORGANIZATION_SIZES, {
    message: validationMessage('workspace:errors.orgSizeSelect'),
  })
  organizationSize?: OrganizationSize;

  @ValidateIf(isProvided)
  @IsIn(WORKSPACE_TIMEZONES, {
    message: validationMessage('project:errors.timezoneInvalid'),
  })
  timezone?: string;
}

import {
  NO_HIDDEN_CHARS,
  NO_URL,
  normalizeWorkspaceName,
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
import { validationMessage } from '../../common/validation.js';

const normalizeName = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeWorkspaceName(value) : value;

export class CreateWorkspaceDto {
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
  name: string;

  @IsNotIn(RESERVED_WORKSPACE_SLUG_LIST, {
    message: validationMessage('workspace:errors.slugReserved'),
  })
  @Matches(WORKSPACE_SLUG_PATTERN, {
    message: validationMessage('workspace:errors.slugPattern'),
  })
  @Length(WORKSPACE_SLUG_MIN, WORKSPACE_SLUG_MAX, {
    message: validationMessage('workspace:errors.slugLength', {
      min: WORKSPACE_SLUG_MIN,
      max: WORKSPACE_SLUG_MAX,
    }),
  })
  @IsString({
    message: validationMessage('workspace:errors.slugRequired'),
  })
  slug: string;

  @IsIn(ORGANIZATION_SIZES, {
    message: validationMessage('workspace:errors.orgSizeRequired'),
  })
  organizationSize: OrganizationSize;
}


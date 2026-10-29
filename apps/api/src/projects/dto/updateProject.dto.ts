import { Type, Transform } from 'class-transformer';
import {
  IsIn,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  NO_HIDDEN_CHARS,
  normalizeProjectName,
  PROJECT_COVER_KEYS,
  PROJECT_DESCRIPTION_ALLOWED_CHARS,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
  WORKSPACE_TIMEZONES,
  type ProjectCoverKey,
  type UpdateProjectRequest,
} from '@repo/contracts';
import { validationMessage } from '../../common/validation.js';
import { ProjectIconDto } from './createProject.dto.js';

const isProvided = (_o: unknown, v: unknown) => v !== undefined;
const isSetTimezone = (_o: unknown, v: unknown) =>
  v !== undefined && v !== null;

export class UpdateProjectDto implements UpdateProjectRequest {
  @ValidateIf(isProvided)
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeProjectName(value) : value,
  )
  @Matches(NO_HIDDEN_CHARS, {
    message: validationMessage('project:errors.hiddenChars'),
  })
  @MaxLength(PROJECT_NAME_MAX, {
    message: validationMessage('project:errors.nameTooLong', {
      max: PROJECT_NAME_MAX,
    }),
  })
  @MinLength(1, { message: validationMessage('project:errors.nameRequired') })
  @IsString({ message: validationMessage('project:errors.nameRequired') })
  name?: string;

  @ValidateIf(isProvided)
  @Matches(PROJECT_DESCRIPTION_ALLOWED_CHARS, {
    message: validationMessage('project:errors.hiddenChars'),
  })
  @MaxLength(PROJECT_DESCRIPTION_MAX, {
    message: validationMessage('project:errors.descriptionTooLong', {
      max: PROJECT_DESCRIPTION_MAX,
    }),
  })
  @IsString({
    message: validationMessage('project:errors.descriptionTooLong', {
      max: PROJECT_DESCRIPTION_MAX,
    }),
  })
  description?: string;

  @ValidateIf(isProvided)
  @ValidateNested()
  @Type(() => ProjectIconDto)
  @IsObject({ message: validationMessage('project:errors.iconRequired') })
  icon?: ProjectIconDto;

  @ValidateIf(isProvided)
  @IsIn(PROJECT_COVER_KEYS, {
    message: validationMessage('project:errors.coverRequired'),
  })
  coverKey?: ProjectCoverKey;

  /** null = follow workspace timezone (RQ D6). */
  @ValidateIf(isSetTimezone)
  @IsIn(WORKSPACE_TIMEZONES, {
    message: validationMessage('project:errors.timezoneInvalid'),
  })
  timezone?: string | null;
}

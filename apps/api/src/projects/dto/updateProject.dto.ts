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
  PROJECT_FIELD_MESSAGES,
  PROJECT_NAME_MAX,
  TIMEZONE_MESSAGES,
  WORKSPACE_TIMEZONES,
  type ProjectCoverKey,
  type UpdateProjectRequest,
} from '@repo/contracts';
import { ProjectIconDto } from './createProject.dto.js';

const isProvided = (_o: unknown, v: unknown) => v !== undefined;
const isSetTimezone = (_o: unknown, v: unknown) => v !== undefined && v !== null;

export class UpdateProjectDto implements UpdateProjectRequest {
  @ValidateIf(isProvided)
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeProjectName(value) : value,
  )
  @Matches(NO_HIDDEN_CHARS, { message: PROJECT_FIELD_MESSAGES.hiddenChars })
  @MaxLength(PROJECT_NAME_MAX, { message: PROJECT_FIELD_MESSAGES.nameTooLong })
  @MinLength(1, { message: PROJECT_FIELD_MESSAGES.nameRequired })
  @IsString({ message: PROJECT_FIELD_MESSAGES.nameRequired })
  name?: string;

  @ValidateIf(isProvided)
  @Matches(PROJECT_DESCRIPTION_ALLOWED_CHARS, {
    message: PROJECT_FIELD_MESSAGES.hiddenChars,
  })
  @MaxLength(PROJECT_DESCRIPTION_MAX, {
    message: PROJECT_FIELD_MESSAGES.descriptionTooLong,
  })
  @IsString({ message: PROJECT_FIELD_MESSAGES.descriptionTooLong })
  description?: string;

  @ValidateIf(isProvided)
  @ValidateNested()
  @Type(() => ProjectIconDto)
  @IsObject({ message: PROJECT_FIELD_MESSAGES.iconRequired })
  icon?: ProjectIconDto;

  @ValidateIf(isProvided)
  @IsIn(PROJECT_COVER_KEYS, { message: PROJECT_FIELD_MESSAGES.coverRequired })
  coverKey?: ProjectCoverKey;

  /** null = follow workspace timezone (RQ D6). */
  @ValidateIf(isSetTimezone)
  @IsIn(WORKSPACE_TIMEZONES, { message: TIMEZONE_MESSAGES.invalid })
  timezone?: string | null;
}

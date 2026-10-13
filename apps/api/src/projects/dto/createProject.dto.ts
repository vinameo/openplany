import { Type, Transform } from 'class-transformer';
import {
  IsDefined,
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
  PROJECT_ICON_COLOR_PATTERN,
  PROJECT_ICON_NAMES,
  PROJECT_IDENTIFIER_PATTERN,
  PROJECT_NAME_MAX,
  type CreateProjectRequest,
  type ProjectCoverKey,
  type ProjectIcon,
  type ProjectIconName,
} from '@repo/contracts';

export class ProjectIconDto implements ProjectIcon {
  @IsIn(PROJECT_ICON_NAMES, { message: PROJECT_FIELD_MESSAGES.iconRequired })
  name!: ProjectIconName;

  @Matches(PROJECT_ICON_COLOR_PATTERN, {
    message: PROJECT_FIELD_MESSAGES.iconColorInvalid,
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  color!: string;
}

const isProvided = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class CreateProjectDto implements CreateProjectRequest {
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeProjectName(value) : value,
  )
  @Matches(NO_HIDDEN_CHARS, {
    message: PROJECT_FIELD_MESSAGES.hiddenChars,
  })
  @MaxLength(PROJECT_NAME_MAX, {
    message: PROJECT_FIELD_MESSAGES.nameTooLong,
  })
  @MinLength(1, { message: PROJECT_FIELD_MESSAGES.nameRequired })
  @IsString({ message: PROJECT_FIELD_MESSAGES.nameRequired })
  name!: string;

  @Matches(PROJECT_IDENTIFIER_PATTERN, {
    message: 'Use 1–5 capital letters or digits, starting with a letter',
  })
  @IsString()
  identifier!: string;

  @ValidateIf(isProvided)
  // NUL and other control characters would fail the INSERT (text columns reject 0x00).
  @Matches(PROJECT_DESCRIPTION_ALLOWED_CHARS, {
    message: PROJECT_FIELD_MESSAGES.hiddenChars,
  })
  @MaxLength(PROJECT_DESCRIPTION_MAX, {
    message: PROJECT_FIELD_MESSAGES.descriptionTooLong,
  })
  @IsString({ message: PROJECT_FIELD_MESSAGES.descriptionTooLong })
  description?: string;

  // @ValidateNested skips undefined and walks arrays element by element, so the
  // shape itself must be checked: a missing icon or `icon: []` is a 400, not a 500.
  @ValidateNested()
  @Type(() => ProjectIconDto)
  @IsObject({ message: PROJECT_FIELD_MESSAGES.iconRequired })
  @IsDefined({ message: PROJECT_FIELD_MESSAGES.iconRequired })
  icon!: ProjectIconDto;

  @IsIn(PROJECT_COVER_KEYS, { message: PROJECT_FIELD_MESSAGES.coverRequired })
  coverKey!: ProjectCoverKey;
}

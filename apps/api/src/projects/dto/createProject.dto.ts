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
  PROJECT_ICON_COLOR_PATTERN,
  PROJECT_ICON_NAMES,
  PROJECT_IDENTIFIER_PATTERN,
  PROJECT_NAME_MAX,
  type CreateProjectRequest,
  type ProjectCoverKey,
  type ProjectIcon,
  type ProjectIconName,
} from '@repo/contracts';
import { validationMessage } from '../../common/validation.js';

export class ProjectIconDto implements ProjectIcon {
  @IsIn(PROJECT_ICON_NAMES, {
    message: validationMessage('project:errors.iconRequired'),
  })
  name!: ProjectIconName;

  @Matches(PROJECT_ICON_COLOR_PATTERN, {
    message: validationMessage('project:errors.iconColorInvalid'),
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
    message: validationMessage('project:errors.hiddenChars'),
  })
  @MaxLength(PROJECT_NAME_MAX, {
    message: validationMessage('project:errors.nameTooLong', {
      max: PROJECT_NAME_MAX,
    }),
  })
  @MinLength(1, { message: validationMessage('project:errors.nameRequired') })
  @IsString({ message: validationMessage('project:errors.nameRequired') })
  name!: string;

  @Matches(PROJECT_IDENTIFIER_PATTERN, {
    message: validationMessage('project:errors.identifierPattern'),
  })
  @IsString()
  identifier!: string;

  @ValidateIf(isProvided)
  // NUL and other control characters would fail the INSERT (text columns reject 0x00).
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

  // @ValidateNested skips undefined and walks arrays element by element, so the
  // shape itself must be checked: a missing icon or `icon: []` is a 400, not a 500.
  @ValidateNested()
  @Type(() => ProjectIconDto)
  @IsObject({ message: validationMessage('project:errors.iconRequired') })
  @IsDefined({ message: validationMessage('project:errors.iconRequired') })
  icon!: ProjectIconDto;

  @IsIn(PROJECT_COVER_KEYS, {
    message: validationMessage('project:errors.coverRequired'),
  })
  coverKey!: ProjectCoverKey;
}

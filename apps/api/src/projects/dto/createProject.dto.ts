import { Type, Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  NO_HIDDEN_CHARS,
  normalizeProjectName,
  PROJECT_COVER_KEYS,
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

export class ProjectIconDto implements ProjectIcon {
  @IsIn(PROJECT_ICON_NAMES, { message: 'Choose an icon' })
  name!: ProjectIconName;

  @Matches(PROJECT_ICON_COLOR_PATTERN, { message: 'Use a color like #1A2B3C' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  color!: string;
}

export class CreateProjectDto implements CreateProjectRequest {
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeProjectName(value) : value,
  )
  @IsString()
  @Matches(NO_HIDDEN_CHARS, {
    message: "Contains characters that aren't allowed",
  })
  @Length(1, PROJECT_NAME_MAX, {
    message: `Enter a project name (up to ${PROJECT_NAME_MAX} characters)`,
  })
  name!: string;

  @IsString()
  @Matches(PROJECT_IDENTIFIER_PATTERN, {
    message: 'Use 1–5 capital letters or digits, starting with a letter',
  })
  identifier!: string;

  @IsOptional()
  @IsString()
  @MaxLength(PROJECT_DESCRIPTION_MAX, {
    message: `Keep the description under ${PROJECT_DESCRIPTION_MAX} characters`,
  })
  description?: string;

  @ValidateNested()
  @Type(() => ProjectIconDto)
  icon!: ProjectIconDto;

  @IsIn(PROJECT_COVER_KEYS, { message: 'Choose a cover' })
  coverKey!: ProjectCoverKey;
}

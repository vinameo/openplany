import type {
  ProjectCoverKey,
  ProjectIconName,
  ProjectListItem,
  UpdateProjectRequest,
} from "@repo/contracts";

export const FOLLOW_WORKSPACE_TIMEZONE = "workspace";

export interface ProjectSettingsValues extends Record<string, unknown> {
  name: string;
  description: string;
  iconName: ProjectIconName;
  iconColor: string;
  coverKey: ProjectCoverKey;
  timezone: string;
}

export const PROJECT_SETTINGS_FIELDS = [
  "name",
  "description",
  "iconName",
  "iconColor",
  "coverKey",
  "timezone",
] as const;

export function toProjectSettingsValues(
  project: ProjectListItem,
): ProjectSettingsValues {
  return {
    name: project.name,
    description: project.description,
    iconName: project.icon.name as ProjectIconName,
    iconColor: project.icon.color,
    coverKey: project.coverKey as ProjectCoverKey,
    timezone:
      project.timezone === null
        ? FOLLOW_WORKSPACE_TIMEZONE
        : project.timezone,
  };
}


export function toUpdateProjectRequest(
  changes: Partial<ProjectSettingsValues>,
  current: ProjectSettingsValues,
): UpdateProjectRequest {
  const req: UpdateProjectRequest = {};

  if (changes.name !== undefined) {
    req.name = changes.name;
  }
  if (changes.description !== undefined) {
    req.description = changes.description;
  }
  if (changes.iconName !== undefined || changes.iconColor !== undefined) {
    req.icon = {
      name: (changes.iconName ?? current.iconName) as ProjectIconName,
      color: (changes.iconColor ?? current.iconColor) as string,
    };
  }
  if (changes.coverKey !== undefined) {
    req.coverKey = changes.coverKey as ProjectCoverKey;
  }
  if (changes.timezone !== undefined) {
    req.timezone =
      changes.timezone === FOLLOW_WORKSPACE_TIMEZONE
        ? null
        : changes.timezone;
  }

  return req;
}

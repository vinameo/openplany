import type { EnforcedProjectPermission, MessageKey } from "@repo/contracts";
import type {
  SettingsGroup,
  SettingsSection,
} from "../../settings/settingsNavigation";
import { SettingsIcon, UsersIcon } from "../../workspaces/icons";

export const PROJECT_SETTINGS_GROUPS = [
  { key: "general", labelKey: "project:settings.groups.general" },
] as const satisfies readonly SettingsGroup[];

export type ProjectSettingsGroup =
  (typeof PROJECT_SETTINGS_GROUPS)[number]["key"];

export interface ProjectSettingsSection
  extends SettingsSection<EnforcedProjectPermission> {
  key: string;
  group: ProjectSettingsGroup;
  label?: string;
  labelKey?: MessageKey;
  viewPermission?: EnforcedProjectPermission;
  comingSoon?: true;
}

export const PROJECT_SETTINGS_SECTIONS: readonly ProjectSettingsSection[] = [
  {
    key: "general",
    group: "general",
    labelKey: "project:settings.sections.general",
    icon: SettingsIcon,
    viewPermission: "project.settings.view",
  },
  {
    key: "members",
    group: "general",
    labelKey: "project:settings.sections.members",
    icon: UsersIcon,
    viewPermission: "project.members.view",
  },
];

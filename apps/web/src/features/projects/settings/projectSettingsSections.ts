import type { EnforcedProjectPermission } from "@repo/contracts";
import type {
  SettingsGroup,
  SettingsSection,
} from "../../settings/settingsNavigation";
import { SettingsIcon, UsersIcon } from "../../workspaces/icons";

export const PROJECT_SETTINGS_GROUPS = [
  { key: "general", label: "General" },
] as const satisfies readonly SettingsGroup[];

export type ProjectSettingsGroup =
  (typeof PROJECT_SETTINGS_GROUPS)[number]["key"];

export interface ProjectSettingsSection
  extends SettingsSection<EnforcedProjectPermission> {
  key: string;
  group: ProjectSettingsGroup;
  label: string;
  viewPermission?: EnforcedProjectPermission;
  comingSoon?: true;
}

export const PROJECT_SETTINGS_SECTIONS: readonly ProjectSettingsSection[] = [
  {
    key: "general",
    group: "general",
    label: "General",
    icon: SettingsIcon,
    viewPermission: "project.settings.view",
  },
  {
    key: "members",
    group: "general",
    label: "Members",
    icon: UsersIcon,
    comingSoon: true,
  },
];

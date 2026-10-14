import type { ComponentType, SVGProps } from "react";
import type { EnforcedWorkspacePermission, MessageKey } from "@repo/contracts";
import { BuildingIcon, UsersIcon } from "../icons";
import type {
  SettingsGroup,
  SettingsSection,
} from "../../settings/settingsNavigation";

export const WORKSPACE_SETTINGS_GROUPS = [
  { key: "administration", labelKey: "workspace:settings.groups.administration" },
] as const satisfies readonly SettingsGroup[];

export type WorkspaceSettingsGroup =
  (typeof WORKSPACE_SETTINGS_GROUPS)[number]["key"];

export interface WorkspaceSettingsSection
  extends SettingsSection<EnforcedWorkspacePermission> {
  key: string;
  group: WorkspaceSettingsGroup;
  label?: string;
  labelKey?: MessageKey;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  viewPermission?: EnforcedWorkspacePermission;
}

export const WORKSPACE_SETTINGS_SECTIONS: readonly WorkspaceSettingsSection[] = [
  {
    key: "general",
    group: "administration",
    labelKey: "workspace:settings.sections.general",
    icon: BuildingIcon,
  },
  {
    key: "members",
    group: "administration",
    labelKey: "workspace:settings.sections.members",
    icon: UsersIcon,
    viewPermission: "workspace.members.view",
  },
];

/** Sections this member may open, in display order. */
export function visibleSettingsSections(
  permissions: readonly EnforcedWorkspacePermission[],
  sections: readonly WorkspaceSettingsSection[] = WORKSPACE_SETTINGS_SECTIONS,
): WorkspaceSettingsSection[] {
  return sections.filter(
    (s) => !s.viewPermission || permissions.includes(s.viewPermission),
  );
}

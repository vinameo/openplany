import type { ComponentType, SVGProps } from "react";
import type { EnforcedWorkspacePermission } from "@repo/contracts";
import { BuildingIcon } from "../icons";

export const WORKSPACE_SETTINGS_GROUPS = [
  { key: "administration", label: "Administration" },
] as const;

export type WorkspaceSettingsGroup =
  (typeof WORKSPACE_SETTINGS_GROUPS)[number]["key"];

export interface WorkspaceSettingsSection {
  key: string;
  group: WorkspaceSettingsGroup;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  viewPermission?: EnforcedWorkspacePermission;
}

export const WORKSPACE_SETTINGS_SECTIONS: readonly WorkspaceSettingsSection[] = [
  {
    key: "general",
    group: "administration",
    label: "General",
    icon: BuildingIcon,
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


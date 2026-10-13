import { useCurrentWorkspace } from "../../currentWorkspace/useCurrentWorkspace";
import {
  buildSettingsNavigation,
  type SettingsNavigationGroup,
} from "../../../settings/settingsNavigation";
import { useSettingsSectionKey } from "../../../settings/settingsSectionHandle";
import {
  WORKSPACE_SETTINGS_GROUPS,
  WORKSPACE_SETTINGS_SECTIONS,
  type WorkspaceSettingsGroup,
  type WorkspaceSettingsSection,
} from "../settingsSections";

export type { SettingsNavigationGroup };

export interface UseSettingsNavigationOptions {
  sections?: readonly WorkspaceSettingsSection[];
  groups?: readonly { key: WorkspaceSettingsGroup; label: string }[];
}

export function useSettingsNavigation(options?: UseSettingsNavigationOptions): {
  groups: SettingsNavigationGroup[];
  activeKey: string | null;
} {
  const { workspace } = useCurrentWorkspace();
  const sections = options?.sections ?? WORKSPACE_SETTINGS_SECTIONS;
  const groupsConfig = options?.groups ?? WORKSPACE_SETTINGS_GROUPS;
  const activeKey = useSettingsSectionKey();

  return buildSettingsNavigation({
    sections,
    groups: groupsConfig,
    permissions: workspace.permissions,
    activeKey,
  });
}

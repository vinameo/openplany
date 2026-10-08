import { useMemo } from "react";
import { useMatch } from "react-router";
import { useCurrentWorkspace } from "../../currentWorkspace/useCurrentWorkspace";
import {
  WORKSPACE_SETTINGS_GROUPS,
  WORKSPACE_SETTINGS_SECTIONS,
  visibleSettingsSections,
  type WorkspaceSettingsGroup,
  type WorkspaceSettingsSection,
} from "../settingsSections";

export interface SettingsNavigationGroup {
  key: WorkspaceSettingsGroup;
  label: string;
  sections: WorkspaceSettingsSection[];
}

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

  const matchExact = useMatch("/:workspaceSlug/settings/:section");
  const matchWildcard = useMatch("/:workspaceSlug/settings/:section/*");
  const sectionParam =
    matchExact?.params.section ?? matchWildcard?.params.section ?? null;

  const visible = useMemo(
    () => visibleSettingsSections(workspace.permissions, sections),
    [workspace.permissions, sections],
  );

  const groups = useMemo(() => {
    const groupKeySet = new Set(groupsConfig.map((g) => g.key));

    // Validate that every visible section belongs to a known group
    for (const section of visible) {
      if (!groupKeySet.has(section.group)) {
        throw new Error(
          `Section "${section.key}" belongs to unknown group "${section.group}"`,
        );
      }
    }

    const result: SettingsNavigationGroup[] = [];

    for (const group of groupsConfig) {
      const groupSections = visible.filter((s) => s.group === group.key);
      if (groupSections.length > 0) {
        result.push({
          key: group.key,
          label: group.label,
          sections: groupSections,
        });
      }
    }

    return result;
  }, [groupsConfig, visible]);

  const activeKey = useMemo(() => {
    if (!sectionParam) return null;
    const exists = visible.some((s) => s.key === sectionParam);
    return exists ? sectionParam : null;
  }, [sectionParam, visible]);

  return { groups, activeKey };
}


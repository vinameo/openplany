import { useCurrentWorkspace } from "../../currentWorkspace/useCurrentWorkspace";
import { workspacePath, workspaceSettingsPath } from "../../workspacePaths";
import { SettingsMobileNavFrame } from "../../../settings/SettingsMobileNavFrame";
import type {
  WorkspaceSettingsGroup,
  WorkspaceSettingsSection,
} from "../settingsSections";
import { useSettingsNavigation } from "./useSettingsNavigation";

interface SettingsMobileNavProps {
  sections?: readonly WorkspaceSettingsSection[];
  groups?: readonly { key: WorkspaceSettingsGroup; label: string }[];
}

export function SettingsMobileNav({
  sections,
  groups,
}: SettingsMobileNavProps) {
  const { workspace } = useCurrentWorkspace();
  const nav = useSettingsNavigation({ sections, groups });

  return (
    <SettingsMobileNavFrame
      heading="Workspace settings"
      backTo={workspacePath(workspace.slug)}
      backLabel="Back to workspace"
      groups={nav.groups}
      activeKey={nav.activeKey}
      pathFor={(key) => workspaceSettingsPath(workspace.slug, key)}
    />
  );
}

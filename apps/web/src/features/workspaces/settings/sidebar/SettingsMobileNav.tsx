import type { MessageKey } from "@repo/contracts";
import { useTranslation } from "react-i18next";
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
  groups?: readonly {
    key: WorkspaceSettingsGroup;
    label?: string;
    labelKey?: MessageKey;
  }[];
}

export function SettingsMobileNav({
  sections,
  groups,
}: SettingsMobileNavProps) {
  const { t } = useTranslation();
  const { workspace } = useCurrentWorkspace();
  const nav = useSettingsNavigation({ sections, groups });

  return (
    <SettingsMobileNavFrame
      heading={t("workspace:settings.sidebar.heading")}
      backTo={workspacePath(workspace.slug)}
      backLabel={t("workspace:settings.sidebar.backLabel")}
      groups={nav.groups}
      activeKey={nav.activeKey}
      pathFor={(key) => workspaceSettingsPath(workspace.slug, key)}
    />
  );
}

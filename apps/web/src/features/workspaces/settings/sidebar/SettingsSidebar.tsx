import { Text } from "@mantine/core";
import { WORKSPACE_ROLE_LABELS, type MessageKey } from "@repo/contracts";
import { useTranslation } from "react-i18next";
import { useCurrentWorkspace } from "../../currentWorkspace/useCurrentWorkspace";
import { WorkspaceAvatar } from "../../WorkspaceAvatar";
import { workspacePath, workspaceSettingsPath } from "../../workspacePaths";
import { SettingsSidebarFrame } from "../../../settings/SettingsSidebarFrame";
import type {
  WorkspaceSettingsGroup,
  WorkspaceSettingsSection,
} from "../settingsSections";
import classes from "./SettingsSidebar.module.css";
import { useSettingsNavigation } from "./useSettingsNavigation";

interface SettingsSidebarProps {
  sections?: readonly WorkspaceSettingsSection[];
  groups?: readonly {
    key: WorkspaceSettingsGroup;
    label?: string;
    labelKey?: MessageKey;
  }[];
}

export function SettingsSidebar({ sections, groups }: SettingsSidebarProps) {
  const { t } = useTranslation();
  const { workspace } = useCurrentWorkspace();
  const nav = useSettingsNavigation({ sections, groups });

  const card = (
    <div className={classes.workspaceCard}>
      <WorkspaceAvatar
        name={workspace.name}
        backgroundColor={workspace.backgroundColor}
        size={30}
      />
      <div className={classes.workspaceInfo}>
        <Text className={classes.workspaceName} title={workspace.name}>
          {workspace.name}
        </Text>
        <Text className={classes.workspaceRole}>
          {WORKSPACE_ROLE_LABELS[workspace.role]}
        </Text>
      </div>
    </div>
  );

  return (
    <SettingsSidebarFrame
      navLabel={t("workspace:settings.sidebar.navLabel")}
      heading={t("workspace:settings.sidebar.heading")}
      backTo={workspacePath(workspace.slug)}
      backLabel={t("workspace:settings.sidebar.backLabel")}
      card={card}
      groups={nav.groups}
      activeKey={nav.activeKey}
      pathFor={(key) => workspaceSettingsPath(workspace.slug, key)}
    />
  );
}

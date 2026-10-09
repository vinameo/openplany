import { ActionIcon, Box, ScrollArea, Text } from "@mantine/core";
import { Link } from "react-router";
import { WORKSPACE_ROLE_LABELS } from "@repo/contracts";
import { useCurrentWorkspace } from "../../currentWorkspace/useCurrentWorkspace";
import { ArrowLeftIcon } from "../../icons";
import { WorkspaceAvatar } from "../../WorkspaceAvatar";
import type {
  WorkspaceSettingsGroup,
  WorkspaceSettingsSection,
} from "../settingsSections";
import { SettingsNavGroups } from "./SettingsNavGroups";
import classes from "./SettingsSidebar.module.css";
import { useSettingsNavigation } from "./useSettingsNavigation";

interface SettingsSidebarProps {
  sections?: readonly WorkspaceSettingsSection[];
  groups?: readonly { key: WorkspaceSettingsGroup; label: string }[];
}

export function SettingsSidebar({ sections, groups }: SettingsSidebarProps) {
  const { workspace } = useCurrentWorkspace();
  const nav = useSettingsNavigation({ sections, groups });

  return (
    <Box
      component="nav"
      aria-label="Workspace settings"
      className={classes.nav}
      visibleFrom="sm"
    >
      <div className={classes.headerRow}>
        <ActionIcon
          component={Link}
          to={`/${workspace.slug}`}
          variant="subtle"
          color="gray"
          size="md"
          aria-label="Back to workspace"
        >
          <ArrowLeftIcon width={18} height={18} />
        </ActionIcon>
        <Text component="h1" className={classes.heading}>
          Workspace settings
        </Text>
      </div>

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

      <ScrollArea
        type="hover"
        scrollbarSize={6}
        className={classes.scrollArea}
      >
        <div className={classes.scrollContent}>
          <SettingsNavGroups
            groups={nav.groups}
            activeKey={nav.activeKey}
          />
        </div>
      </ScrollArea>
    </Box>
  );
}


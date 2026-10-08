import { ActionIcon, Box, Select, Text } from "@mantine/core";
import { Link, useNavigate } from "react-router";
import { useCurrentWorkspace } from "../../currentWorkspace/useCurrentWorkspace";
import { ArrowLeftIcon } from "../../icons";
import type {
  WorkspaceSettingsGroup,
  WorkspaceSettingsSection,
} from "../settingsSections";
import classes from "./SettingsSidebar.module.css";
import { useSettingsNavigation } from "./useSettingsNavigation";

interface SettingsMobileNavProps {
  sections?: readonly WorkspaceSettingsSection[];
  groups?: readonly { key: WorkspaceSettingsGroup; label: string }[];
}

export function SettingsMobileNav({
  sections,
  groups,
}: SettingsMobileNavProps) {
  const navigate = useNavigate();
  const { workspace } = useCurrentWorkspace();
  const nav = useSettingsNavigation({ sections, groups });

  const selectData = nav.groups.map((group) => ({
    group: group.label,
    items: group.sections.map((section) => ({
      value: section.key,
      label: section.label,
    })),
  }));

  return (
    <Box className={classes.mobileNav} hiddenFrom="sm">
      <div className={classes.mobileHeader}>
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

      <Select
        aria-label="Settings section"
        data={selectData}
        value={nav.activeKey}
        placeholder="Choose a section"
        allowDeselect={false}
        searchable={false}
        checkIconPosition="right"
        onChange={(val) => {
          if (val) {
            navigate(`/${workspace.slug}/settings/${val}`);
          }
        }}
      />
    </Box>
  );
}


import { NavLink } from "@mantine/core";
import { Link } from "react-router";
import { useCurrentWorkspace } from "../../currentWorkspace/useCurrentWorkspace";
import type { WorkspaceSettingsSection } from "../settingsSections";
import classes from "./SettingsSidebar.module.css";
import { workspaceSettingsPath } from "../../workspacePaths";

interface SettingsNavItemProps {
  section: WorkspaceSettingsSection;
  isActive: boolean;
}

export function SettingsNavItem({ section, isActive }: SettingsNavItemProps) {
  const { workspace } = useCurrentWorkspace();
  const Icon = section.icon;

  return (
    <li>
      <NavLink
        component={Link}
        to={workspaceSettingsPath(workspace.slug, section.key)}
        label={section.label}
        leftSection={<Icon width={16} height={16} />}
        active={isActive}
        color="gray"
        variant="light"
        aria-current={isActive ? "page" : undefined}
        title={section.label}
        className={classes.navItem}
      />
    </li>
  );
}


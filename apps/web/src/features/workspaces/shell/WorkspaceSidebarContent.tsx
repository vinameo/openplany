import { ScrollArea, Text } from "@mantine/core";
import { useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { useCurrentWorkspace } from "../currentWorkspace/useCurrentWorkspace";
import { HomeIcon, SettingsIcon } from "../icons";
import { workspacePath, workspaceSettingsPath } from "../workspacePaths";
import { NewWorkItemButton } from "./NewWorkItemButton";
import { SidebarCollapseButton } from "./SidebarCollapseButton";
import { SidebarNavItem } from "./SidebarNavItem";
import classes from "./sidebarContent.module.css";

export function WorkspaceSidebarContent() {
  const { t } = useTranslation();
  const { workspace } = useCurrentWorkspace();
  const { pathname } = useLocation();

  const homePath = workspacePath(workspace.slug);
  const isHome = pathname.replace(/\/+$/, "") === homePath;

  return (
    <>
      <div className={classes.headerRow}>
        <Text className={classes.heading}>
          {t("workspace:shell.workspaceHeading")}
        </Text>
        <SidebarCollapseButton />
      </div>

      <ScrollArea type="hover" scrollbarSize={6} className={classes.scrollArea}>
        <div className={classes.scrollContent}>
          <NewWorkItemButton />

          <ul role="list" className={classes.navList}>
            <li>
              <SidebarNavItem
                label={t("workspace:shell.home")}
                icon={<HomeIcon width={16} height={16} />}
                to={homePath}
                active={isHome}
              />
            </li>
            <li>
              <SidebarNavItem
                label={t("workspace:shell.settings")}
                icon={<SettingsIcon width={16} height={16} />}
                to={workspaceSettingsPath(workspace.slug)}
              />
            </li>
          </ul>
        </div>
      </ScrollArea>
    </>
  );
}

import type { ReactNode } from "react";
import { ActionIcon, Group, ScrollArea, Text } from "@mantine/core";
import {
  IconAdjustmentsHorizontal,
  IconFileText,
  IconFlag,
  IconStack2,
} from "@tabler/icons-react";
import { useLocation, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { MessageKey } from "@repo/contracts";
import { ComingSoonHint } from "../../layout/ComingSoonHint";
import { useCurrentWorkspace } from "../../workspaces/currentWorkspace/useCurrentWorkspace";
import { HomeIcon, SettingsIcon } from "../../workspaces/icons";
import { NewWorkItemButton } from "../../workspaces/shell/NewWorkItemButton";
import { SidebarCollapseButton } from "../../workspaces/shell/SidebarCollapseButton";
import { SidebarNavItem } from "../../workspaces/shell/SidebarNavItem";
import classes from "../../workspaces/shell/sidebarContent.module.css";
import { projectPath, projectSettingsPath } from "../projectPaths";
import { useCurrentProject } from "./currentProjectContext";

interface ProjectNavItem {
  key: string;
  labelKey: MessageKey;
  icon: ReactNode;
  /** Path below the Project home ("" is the Project home); absent until the page exists (RQ D4, BA FC-20). */
  subPath?: string;
}

const PROJECT_NAV_ITEMS: readonly ProjectNavItem[] = [
  { key: "home", labelKey: "workspace:shell.home", icon: <HomeIcon width={16} height={16} />, subPath: "" },
  { key: "workItems", labelKey: "project:sidebar.workItems", icon: <IconStack2 size={16} stroke={1.75} /> },
  { key: "milestones", labelKey: "project:sidebar.milestones", icon: <IconFlag size={16} stroke={1.75} /> },
  { key: "pages", labelKey: "project:sidebar.pages", icon: <IconFileText size={16} stroke={1.75} /> },
  { key: "settings", labelKey: "common:actions.settings", icon: <SettingsIcon width={16} height={16} /> },
];

export function ProjectSidebarContent() {
  const { t } = useTranslation();
  const { workspace } = useCurrentWorkspace();
  const { projectIdentifier = "" } = useParams();
  const { project } = useCurrentProject();
  const { pathname } = useLocation();

  const homePath = projectPath(workspace.slug, projectIdentifier);
  const settingsPath = projectSettingsPath(workspace.slug, projectIdentifier);
  const currentPath = pathname.replace(/\/+$/, "");

  const showSettings =
    project === null || project.permissions.includes("project.settings.view");

  const visibleItems = PROJECT_NAV_ITEMS.filter(
    (item) => item.key !== "settings" || showSettings,
  );

  return (
    <>
      <div className={classes.headerRow}>
        <Text className={classes.heading}>{t("project:title")}</Text>
        <Group gap={4} wrap="nowrap">
          <ComingSoonHint>
            {(trigger) => (
              <ActionIcon
                variant="subtle"
                color="gray"
                size="md"
                aria-label={t("project:sidebar.optionsAriaLabel")}
                onClick={(e) => {
                  trigger.onClick(e);
                  e.preventDefault();
                }}
              >
                <IconAdjustmentsHorizontal size={18} stroke={1.75} />
              </ActionIcon>
            )}
          </ComingSoonHint>
          <SidebarCollapseButton />
        </Group>
      </div>

      <ScrollArea
        type="hover"
        scrollbarSize={6}
        className={classes.scrollArea}
      >
        <div className={classes.scrollContent}>
          <NewWorkItemButton />

          <ul role="list" className={classes.navList}>
            {visibleItems.map((item) => {
              const to =
                item.key === "settings"
                  ? settingsPath
                  : item.subPath === undefined
                    ? undefined
                    : `${homePath}${item.subPath}`;
              const active =
                to !== undefined &&
                (currentPath === to ||
                  (item.key === "settings" &&
                    currentPath.startsWith(`${settingsPath}/`)));
              return (
                <li key={item.key}>
                  <SidebarNavItem
                    label={t(item.labelKey)}
                    icon={item.icon}
                    to={to}
                    active={active}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      </ScrollArea>
    </>
  );
}


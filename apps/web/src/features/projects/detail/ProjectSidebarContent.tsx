import type { ReactNode } from "react";
import { ActionIcon, Group, ScrollArea, Text } from "@mantine/core";
import {
  IconAdjustmentsHorizontal,
  IconFileText,
  IconFlag,
  IconStack2,
} from "@tabler/icons-react";
import { useLocation, useParams } from "react-router";
import { ComingSoonHint } from "../../layout/ComingSoonHint";
import { useCurrentWorkspace } from "../../workspaces/currentWorkspace/useCurrentWorkspace";
import { HomeIcon, SettingsIcon } from "../../workspaces/icons";
import { NewWorkItemButton } from "../../workspaces/shell/NewWorkItemButton";
import { SidebarCollapseButton } from "../../workspaces/shell/SidebarCollapseButton";
import { SidebarNavItem } from "../../workspaces/shell/SidebarNavItem";
import classes from "../../workspaces/shell/sidebarContent.module.css";
import { projectPath } from "../projectPaths";

interface ProjectNavItem {
  label: string;
  icon: ReactNode;
  /** Path below the Project home ("" is the Project home); absent until the page exists (RQ D4, BA FC-20). */
  subPath?: string;
}

const PROJECT_NAV_ITEMS: readonly ProjectNavItem[] = [
  { label: "Home", icon: <HomeIcon width={16} height={16} />, subPath: "" },
  { label: "Work items", icon: <IconStack2 size={16} stroke={1.75} /> },
  { label: "Milestones", icon: <IconFlag size={16} stroke={1.75} /> },
  { label: "Pages", icon: <IconFileText size={16} stroke={1.75} /> },
  { label: "Settings", icon: <SettingsIcon width={16} height={16} /> },
];

export function ProjectSidebarContent() {
  const { workspace } = useCurrentWorkspace();
  const { projectIdentifier = "" } = useParams();
  const { pathname } = useLocation();

  const homePath = projectPath(workspace.slug, projectIdentifier);
  const currentPath = pathname.replace(/\/+$/, "");

  return (
    <>
      <div className={classes.headerRow}>
        <Text className={classes.heading}>Project</Text>
        <Group gap={4} wrap="nowrap">
          <ComingSoonHint>
            {(trigger) => (
              <ActionIcon
                variant="subtle"
                color="gray"
                size="md"
                aria-label="Project options"
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
            {PROJECT_NAV_ITEMS.map((item) => {
              const to =
                item.subPath === undefined
                  ? undefined
                  : `${homePath}${item.subPath}`;
              return (
                <li key={item.label}>
                  <SidebarNavItem
                    label={item.label}
                    icon={item.icon}
                    to={to}
                    active={to !== undefined && currentPath === to}
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

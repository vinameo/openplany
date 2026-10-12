import {
  ActionIcon,
  Button,
  Group,
  NavLink,
  ScrollArea,
  Text,
} from "@mantine/core";
import {
  IconAdjustmentsHorizontal,
  IconFileText,
  IconFlag,
  IconStack2,
} from "@tabler/icons-react";
import { Link, useLocation, useParams } from "react-router";
import { ComingSoonHint } from "../../layout/ComingSoonHint";
import { useCurrentWorkspace } from "../../workspaces/currentWorkspace/useCurrentWorkspace";
import {
  HomeIcon,
  SettingsIcon,
  SquarePenIcon,
} from "../../workspaces/icons";
import { SidebarCollapseButton } from "../../workspaces/shell/SidebarCollapseButton";
import classes from "../../workspaces/shell/sidebarContent.module.css";
import { projectPath } from "../projectPaths";

export function ProjectSidebarContent() {
  const { workspace } = useCurrentWorkspace();
  const { projectIdentifier = "" } = useParams();
  const { pathname } = useLocation();

  const homePath = projectPath(workspace.slug, projectIdentifier);
  const isHome = pathname.replace(/\/+$/, "") === homePath;

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
          <ComingSoonHint>
            {(trigger) => (
              <Button
                variant="default"
                fullWidth
                justify="flex-start"
                leftSection={<SquarePenIcon width={16} height={16} />}
                data-disabled
                aria-disabled="true"
                onClick={(e) => {
                  trigger.onClick(e);
                  e.preventDefault();
                }}
                className={classes.newWorkItemBtn}
              >
                New work item
              </Button>
            )}
          </ComingSoonHint>

          <ul role="list" className={classes.navList}>
            <li>
              <NavLink
                component={Link}
                to={homePath}
                label="Home"
                leftSection={<HomeIcon width={16} height={16} />}
                active={isHome}
                color="gray"
                variant="light"
                aria-current={isHome ? "page" : undefined}
                title="Home"
                className={classes.navItem}
              />
            </li>
            <li>
              <ComingSoonHint>
                {(trigger) => (
                  <NavLink
                    component="button"
                    type="button"
                    label="Work items"
                    leftSection={<IconStack2 size={16} stroke={1.75} />}
                    aria-disabled="true"
                    color="gray"
                    variant="light"
                    title="Work items"
                    className={classes.navItem}
                    onClick={(e) => {
                      trigger.onClick(e);
                      e.preventDefault();
                    }}
                  />
                )}
              </ComingSoonHint>
            </li>
            <li>
              <ComingSoonHint>
                {(trigger) => (
                  <NavLink
                    component="button"
                    type="button"
                    label="Milestones"
                    leftSection={<IconFlag size={16} stroke={1.75} />}
                    aria-disabled="true"
                    color="gray"
                    variant="light"
                    title="Milestones"
                    className={classes.navItem}
                    onClick={(e) => {
                      trigger.onClick(e);
                      e.preventDefault();
                    }}
                  />
                )}
              </ComingSoonHint>
            </li>
            <li>
              <ComingSoonHint>
                {(trigger) => (
                  <NavLink
                    component="button"
                    type="button"
                    label="Pages"
                    leftSection={<IconFileText size={16} stroke={1.75} />}
                    aria-disabled="true"
                    color="gray"
                    variant="light"
                    title="Pages"
                    className={classes.navItem}
                    onClick={(e) => {
                      trigger.onClick(e);
                      e.preventDefault();
                    }}
                  />
                )}
              </ComingSoonHint>
            </li>
            <li>
              <ComingSoonHint>
                {(trigger) => (
                  <NavLink
                    component="button"
                    type="button"
                    label="Settings"
                    leftSection={<SettingsIcon width={16} height={16} />}
                    aria-disabled="true"
                    color="gray"
                    variant="light"
                    title="Settings"
                    className={classes.navItem}
                    onClick={(e) => {
                      trigger.onClick(e);
                      e.preventDefault();
                    }}
                  />
                )}
              </ComingSoonHint>
            </li>
          </ul>
        </div>
      </ScrollArea>
    </>
  );
}

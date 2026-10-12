import { Button, NavLink, ScrollArea, Text } from "@mantine/core";
import { Link, useLocation } from "react-router";
import { ComingSoonHint } from "../../layout/ComingSoonHint";
import { useCurrentWorkspace } from "../currentWorkspace/useCurrentWorkspace";
import {
  HomeIcon,
  SettingsIcon,
  SquarePenIcon,
} from "../icons";
import { SidebarCollapseButton } from "./SidebarCollapseButton";
import classes from "./sidebarContent.module.css";

export function WorkspaceSidebarContent() {
  const { workspace } = useCurrentWorkspace();
  const { pathname } = useLocation();

  const isHome = pathname.replace(/\/+$/, "") === `/${workspace.slug}`;

  return (
    <>
      <div className={classes.headerRow}>
        <Text className={classes.heading}>Workspace</Text>
        <SidebarCollapseButton />
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
                to={`/${workspace.slug}`}
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
              <NavLink
                component={Link}
                to={`/${workspace.slug}/settings`}
                label="Settings"
                leftSection={<SettingsIcon width={16} height={16} />}
                active={false}
                color="gray"
                variant="light"
                title="Settings"
                className={classes.navItem}
              />
            </li>
          </ul>
        </div>
      </ScrollArea>
    </>
  );
}

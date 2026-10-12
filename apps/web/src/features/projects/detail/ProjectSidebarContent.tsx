import { NavLink, ScrollArea, Text } from "@mantine/core";
import { Link, useLocation, useParams } from "react-router";
import { useCurrentWorkspace } from "../../workspaces/currentWorkspace/useCurrentWorkspace";
import { HomeIcon } from "../../workspaces/icons";
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
        <SidebarCollapseButton />
      </div>

      <ScrollArea
        type="hover"
        scrollbarSize={6}
        className={classes.scrollArea}
      >
        <div className={classes.scrollContent}>
          <ul role="list" className={classes.navList}>
            <li>
              <NavLink
                component={Link}
                to={homePath}
                label="Home"
                leftSection={<HomeIcon width={16} height={16} />}
                active={isHome}
                aria-current={isHome ? "page" : undefined}
                color="gray"
                className={classes.navLink}
              />
            </li>
          </ul>
        </div>
      </ScrollArea>
    </>
  );
}

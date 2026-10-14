import { Anchor, Breadcrumbs, Skeleton, Text } from "@mantine/core";
import { Link } from "react-router";
import { t } from "i18next";
import { useCurrentWorkspace } from "../../workspaces/currentWorkspace/useCurrentWorkspace";
import { useWorkspaceSidebar } from "../../workspaces/shell/useWorkspaceSidebar";
import { SidebarExpandButton } from "../../workspaces/shell/SidebarExpandButton";
import { ProjectIcon } from "../ProjectIcon";
import { projectPath } from "../projectPaths";
import { useCurrentProject } from "./currentProjectContext";
import { useProjectPageMeta } from "./projectPageHandle";
import headerClasses from "../../workspaces/shell/pageHeader.module.css";
import classes from "./ProjectPageHeader.module.css";
import { workspacePath } from "../../workspaces/workspacePaths";

export function ProjectPageHeader() {
  const { workspace } = useCurrentWorkspace();
  const { project } = useCurrentProject();
  const { mode } = useWorkspaceSidebar();
  const pageMeta = useProjectPageMeta();
  const pageTitle = pageMeta?.titleKey
    ? t(pageMeta.titleKey)
    : pageMeta?.title;

  return (
    <header className={headerClasses.pageHeader}>
      <div className={headerClasses.titleGroup}>
        <SidebarExpandButton />
        <nav aria-label="Breadcrumb" className={classes.breadcrumbNav}>
          <Breadcrumbs
            separator="›"
            separatorMargin={6}
            classNames={{ root: classes.breadcrumbs }}
          >
            {mode === "desktop" && (
              <Anchor
                component={Link}
                to={workspacePath(workspace.slug)}
                className={classes.breadcrumbLink}
                title={workspace.name}
                underline="hover"
                c="inherit"
              >
                {workspace.name}
              </Anchor>
            )}

            {project ? (
              <Anchor
                component={Link}
                to={projectPath(workspace.slug, project.identifier)}
                className={classes.breadcrumbLink}
                title={project.name}
                underline="hover"
                c="inherit"
              >
                <ProjectIcon icon={project.icon} size={16} />
                <span className={classes.breadcrumbProjectName}>
                  {project.name}
                </span>
              </Anchor>
            ) : (
              <Skeleton
                height={14}
                width={120}
                aria-label="Loading project"
              />
            )}

            <Text
              aria-current="page"
              className={classes.breadcrumbItem}
              title={pageTitle}
              fw={500}
            >
              {pageTitle}
            </Text>
          </Breadcrumbs>
        </nav>
      </div>
      <div />
    </header>
  );
}

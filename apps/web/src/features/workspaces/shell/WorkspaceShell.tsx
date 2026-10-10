import { useRef } from "react";
import { Drawer } from "@mantine/core";
import { Outlet } from "react-router";
import { useScrollTopOnNavigate } from "./useScrollTopOnNavigate";
import { useWorkspaceSidebarState } from "./useWorkspaceSidebarState";
import { WorkspacePageHeader } from "./WorkspacePageHeader";
import { WorkspaceSidebarContent } from "./WorkspaceSidebarContent";
import { WorkspaceSidebarContext } from "./workspaceSidebarContext";
import classes from "./WorkspaceShell.module.css";

export function WorkspaceShell() {
  const sidebar = useWorkspaceSidebarState();
  const mainRef = useRef<HTMLElement>(null);
  useScrollTopOnNavigate(mainRef);

  if (sidebar.mode === "mobile") {
    return (
      <WorkspaceSidebarContext.Provider value={sidebar}>
        <div className={classes.column}>
          <WorkspacePageHeader />
          <main ref={mainRef} className={classes.main}>
            <Outlet />
          </main>
        </div>
        <Drawer.Root
          opened={sidebar.isOpen}
          onClose={sidebar.close}
          position="left"
          size="var(--app-sidebar-width)"
          classNames={{
            inner: classes.drawerInner,
            overlay: classes.drawerOverlay,
            body: classes.drawerBody,
          }}
        >
          <Drawer.Overlay />
          <Drawer.Content
            aria-label="Workspace"
            id={sidebar.sidebarId}
          >
            <WorkspaceSidebarContent />
          </Drawer.Content>
        </Drawer.Root>
      </WorkspaceSidebarContext.Provider>
    );
  }

  const isCollapsed = !sidebar.isOpen;

  return (
    <WorkspaceSidebarContext.Provider value={sidebar}>
      <div
        className={classes.shell}
        data-collapsed={isCollapsed ? "true" : undefined}
      >
        <nav
          aria-label="Workspace"
          id={sidebar.sidebarId}
          className={classes.sidebar}
          inert={isCollapsed}
          aria-hidden={isCollapsed || undefined}
        >
          <WorkspaceSidebarContent />
        </nav>
        <div className={classes.column}>
          <WorkspacePageHeader />
          <main ref={mainRef} className={classes.main}>
            <Outlet />
          </main>
        </div>
      </div>
    </WorkspaceSidebarContext.Provider>
  );
}

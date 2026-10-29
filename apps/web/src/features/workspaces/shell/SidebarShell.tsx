import { useRef, type ReactNode } from "react";
import { Drawer } from "@mantine/core";
import { useScrollTopOnNavigate } from "./useScrollTopOnNavigate";
import { useWorkspaceSidebarState } from "./useWorkspaceSidebarState";
import { WorkspaceSidebarContext } from "./workspaceSidebarContext";
import classes from "./WorkspaceShell.module.css";

export interface SidebarShellProps {
  /** aria-label của nav (máy tính) và Drawer.Content (điện thoại). */
  navLabel: string;
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
}

export function SidebarShell({
  navLabel,
  sidebar,
  header,
  children,
}: SidebarShellProps) {
  const sidebarState = useWorkspaceSidebarState();
  const mainRef = useRef<HTMLElement>(null);
  useScrollTopOnNavigate(mainRef);

  if (sidebarState.mode === "mobile") {
    return (
      <WorkspaceSidebarContext.Provider value={sidebarState}>
        <div className={classes.column}>
          {header}
          <main ref={mainRef} className={classes.main}>
            {children}
          </main>
        </div>
        <Drawer.Root
          opened={sidebarState.isOpen}
          onClose={sidebarState.close}
          position="left"
          size="var(--app-sidebar-width)"
          classNames={{
            inner: classes.drawerInner,
            overlay: classes.drawerOverlay,
            body: classes.drawerBody,
          }}
        >
          <Drawer.Overlay />
          <Drawer.Content aria-label={navLabel} id={sidebarState.sidebarId}>
            {sidebar}
          </Drawer.Content>
        </Drawer.Root>
      </WorkspaceSidebarContext.Provider>
    );
  }

  const isCollapsed = !sidebarState.isOpen;

  return (
    <WorkspaceSidebarContext.Provider value={sidebarState}>
      <div
        className={classes.shell}
        data-collapsed={isCollapsed ? "true" : undefined}
      >
        <nav
          aria-label={navLabel}
          id={sidebarState.sidebarId}
          className={classes.sidebar}
          inert={isCollapsed}
          aria-hidden={isCollapsed || undefined}
        >
          {sidebar}
        </nav>
        <div className={classes.column}>
          {header}
          <main ref={mainRef} className={classes.main}>
            {children}
          </main>
        </div>
      </div>
    </WorkspaceSidebarContext.Provider>
  );
}

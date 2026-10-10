import { ActionIcon, Text, Tooltip } from "@mantine/core";
import { PanelLeftIcon } from "../icons";
import { useWorkspaceSidebar } from "./useWorkspaceSidebar";
import { useWorkspacePageMeta } from "./workspacePageHandle";
import classes from "./WorkspacePageHeader.module.css";

export function WorkspacePageHeader() {
  const meta = useWorkspacePageMeta();
  const { mode, isOpen, open, sidebarId, expandButtonRef } =
    useWorkspaceSidebar();
  const Icon = meta?.icon;

  const showExpandButton = !isOpen || mode === "mobile";
  const label = mode === "mobile" ? "Open sidebar" : "Expand sidebar";

  return (
    <header className={classes.pageHeader}>
      <div className={classes.titleGroup}>
        {showExpandButton && (
          <Tooltip label={label} withArrow position="right">
            <ActionIcon
              ref={expandButtonRef}
              variant="subtle"
              color="gray"
              size="md"
              aria-label={label}
              aria-expanded={isOpen}
              aria-controls={sidebarId}
              onClick={open}
            >
              <PanelLeftIcon width={18} height={18} />
            </ActionIcon>
          </Tooltip>
        )}
        {Icon && <Icon width={18} height={18} />}
        {meta?.title && <Text className={classes.title}>{meta.title}</Text>}
      </div>
      <div className={classes.actions} />
    </header>
  );
}

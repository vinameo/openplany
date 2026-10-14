import { ActionIcon, Tooltip } from "@mantine/core";
import { t } from "i18next";
import { PanelLeftIcon } from "../icons";
import { useWorkspaceSidebar } from "./useWorkspaceSidebar";

export function SidebarExpandButton() {
  const { mode, isOpen, open, sidebarId, expandButtonRef } =
    useWorkspaceSidebar();

  const showExpandButton = !isOpen || mode === "mobile";
  const label =
    mode === "mobile"
      ? t("workspace:shell.openSidebar")
      : t("workspace:shell.expandSidebar");

  if (!showExpandButton) {
    return null;
  }

  return (
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
  );
}

import { ActionIcon, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { PanelLeftIcon } from "../icons";
import { useWorkspaceSidebar } from "./useWorkspaceSidebar";

export function SidebarCollapseButton() {
  const { t } = useTranslation();
  const { mode, isOpen, close, sidebarId, collapseButtonRef } =
    useWorkspaceSidebar();
  const label =
    mode === "mobile"
      ? t("workspace:shell.closeSidebar")
      : t("workspace:shell.collapseSidebar");

  return (
    <Tooltip label={label} withArrow position="right">
      <ActionIcon
        ref={collapseButtonRef}
        variant="subtle"
        color="gray"
        size="md"
        aria-label={label}
        aria-expanded={isOpen}
        aria-controls={sidebarId}
        onClick={close}
      >
        <PanelLeftIcon width={18} height={18} />
      </ActionIcon>
    </Tooltip>
  );
}

import type { ReactNode } from "react";
import { Button, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ComingSoonHint } from "../../layout/ComingSoonHint";
import { SquarePenIcon } from "../icons";
import classes from "./sidebarContent.module.css";

export interface NewWorkItemButtonProps {
  onClick?: () => void;
  disabledHint?: ReactNode;
}

/**
 * "New work item" button in the sidebar.
 * Presentation component:
 * - Active with onClick when authorized
 * - Disabled with tooltip when disabledHint is non-empty
 * - Disabled without tooltip when disabledHint is empty string
 * - Falls back to ComingSoonHint when neither prop is provided (e.g. in workspace sidebar)
 */
export function NewWorkItemButton({
  onClick,
  disabledHint,
}: NewWorkItemButtonProps = {}) {
  const { t } = useTranslation();

  if (onClick && !disabledHint) {
    return (
      <Button
        variant="default"
        fullWidth
        justify="flex-start"
        leftSection={<SquarePenIcon width={16} height={16} />}
        onClick={onClick}
        className={classes.newWorkItemBtn}
      >
        {t("workspace:shell.newWorkItem")}
      </Button>
    );
  }

  if (disabledHint !== undefined) {
    const disabledButton = (
      <Button
        variant="default"
        fullWidth
        justify="flex-start"
        leftSection={<SquarePenIcon width={16} height={16} />}
        data-disabled
        aria-disabled="true"
        onClick={(e) => {
          e.preventDefault();
        }}
        className={classes.newWorkItemBtn}
      >
        {t("workspace:shell.newWorkItem")}
      </Button>
    );

    if (disabledHint) {
      return (
        <Tooltip label={disabledHint} withArrow position="right">
          {disabledButton}
        </Tooltip>
      );
    }

    return disabledButton;
  }

  return (
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
          {t("workspace:shell.newWorkItem")}
        </Button>
      )}
    </ComingSoonHint>
  );
}

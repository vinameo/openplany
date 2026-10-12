import { Button } from "@mantine/core";
import { ComingSoonHint } from "../../layout/ComingSoonHint";
import { SquarePenIcon } from "../icons";
import classes from "./sidebarContent.module.css";

/** "New work item" at the top of every sidebar; not built yet. */
export function NewWorkItemButton() {
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
          New work item
        </Button>
      )}
    </ComingSoonHint>
  );
}

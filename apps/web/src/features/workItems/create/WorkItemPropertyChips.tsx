import { Button } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ComingSoonHint } from "../../layout/ComingSoonHint";
import {
  AddParentIcon,
  AssigneeIcon,
  CalendarDueIcon,
  CalendarIcon,
  PriorityIcon,
  StateIcon,
  TagIcon,
} from "./icons";
import classes from "./WorkItemPropertyChips.module.css";

export function WorkItemPropertyChips() {
  const { t } = useTranslation();

  const chips = [
    {
      id: "state",
      label: t("workItem:properties.state"),
      icon: <StateIcon />,
    },
    {
      id: "priority",
      label: t("workItem:properties.priority"),
      icon: <PriorityIcon />,
    },
    {
      id: "assignees",
      label: t("workItem:properties.assignees"),
      icon: <AssigneeIcon />,
    },
    {
      id: "labels",
      label: t("workItem:properties.labels"),
      icon: <TagIcon />,
    },
    {
      id: "startDate",
      label: t("workItem:properties.startDate"),
      icon: <CalendarIcon />,
    },
    {
      id: "dueDate",
      label: t("workItem:properties.dueDate"),
      icon: <CalendarDueIcon />,
    },
    {
      id: "addParent",
      label: t("workItem:properties.addParent"),
      icon: <AddParentIcon />,
    },
  ];

  return (
    <div className={classes.chipsRow}>
      {chips.map((chip) => (
        <ComingSoonHint key={chip.id}>
          {(trigger) => (
            <Button
              type="button"
              variant="default"
              size="xs"
              radius="sm"
              leftSection={chip.icon}
              onClick={trigger.onClick}
              aria-disabled="true"
              tabIndex={0}
              className={classes.chipButton}
            >
              {chip.label}
            </Button>
          )}
        </ComingSoonHint>
      ))}
    </div>
  );
}

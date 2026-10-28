import { Button } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { ProjectListItem } from "@repo/contracts";
import { ComingSoonHint } from "../../layout/ComingSoonHint";
import { StatePicker } from "../../states/StatePicker";
import {
  AddParentIcon,
  AssigneeIcon,
  CalendarDueIcon,
  CalendarIcon,
  PriorityIcon,
  TagIcon,
} from "./icons";
import classes from "./WorkItemPropertyChips.module.css";

export interface WorkItemPropertyChipsProps {
  slug: string;
  project: ProjectListItem;
  selectedStateId: string | null;
  onSelectState: (stateId: string) => void;
  disabled?: boolean;
}

export function WorkItemPropertyChips({
  slug,
  project,
  selectedStateId,
  onSelectState,
  disabled = false,
}: WorkItemPropertyChipsProps) {
  const { t } = useTranslation();

  const otherChips = [
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
      <StatePicker
        slug={slug}
        project={project}
        value={selectedStateId}
        onChange={onSelectState}
        disabled={disabled}
      />
      {otherChips.map((chip) => (
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

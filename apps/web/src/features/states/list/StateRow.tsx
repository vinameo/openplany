import { ActionIcon, Badge, Menu } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { StateLevel, StateResponse } from "@repo/contracts";
import { StateGroupIcon } from "../StateGroupIcon";
import classes from "./stateList.module.css";

export interface StateRowProps {
  state: StateResponse;
  ownLevel: StateLevel;
  canManage: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function StateRow({
  state,
  ownLevel,
  canManage,
  onEdit,
  onDelete,
}: StateRowProps) {
  const { t } = useTranslation();

  const isOwnLevel = state.level === ownLevel;

  return (
    <li className={classes.stateRow} role="listitem">
      <div className={classes.stateRowLeft}>
        <StateGroupIcon group={state.group} color={state.color} size={16} />
        <span className={classes.stateName}>{state.name}</span>

        {state.level === "default" && (
          <Badge
            size="xs"
            color="gray"
            variant="default"
            className={classes.levelBadge}
          >
            {t("state:levels.default")}
          </Badge>
        )}

        {state.level === "workspace" && ownLevel === "project" && (
          <Badge
            size="xs"
            color="gray"
            variant="default"
            className={classes.levelBadge}
          >
            {t("state:levels.workspace")}
          </Badge>
        )}
      </div>

      <div className={classes.stateRowRight}>
        {canManage && state.workItemCount !== undefined && (
          <span className={classes.workItemCount}>
            {t("state:list.workItemCount", { count: state.workItemCount })}
          </span>
        )}

        {canManage && isOwnLevel && (
          <Menu position="bottom-end" shadow="md" width={140}>
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={t("state:list.actionsFor", { name: state.name })}
                data-testid={"state-menu-" + state.id}
              >
                <svg
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                  <circle cx="19" cy="12" r="1.5" fill="currentColor" />
                  <circle cx="5" cy="12" r="1.5" fill="currentColor" />
                </svg>
              </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown>
              {onEdit && (
                <Menu.Item onClick={onEdit} data-testid="state-menu-edit">
                  {t("state:menu.edit")}
                </Menu.Item>
              )}
              {onDelete && (
                <Menu.Item
                  color="red"
                  onClick={onDelete}
                  data-testid="state-menu-delete"
                >
                  {t("state:menu.delete")}
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        )}
      </div>
    </li>
  );
}

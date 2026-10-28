import type { ReactNode } from "react";
import { Button, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type {
  MessageKey,
  StateGroup,
  StateLevel,
  StateResponse,
} from "@repo/contracts";
import { PlusIcon } from "../../workspaces/icons";
import { StateRow } from "./StateRow";
import classes from "./stateList.module.css";

export interface StateListGroupProps {
  group: StateGroup;
  states: StateResponse[];
  ownLevel: StateLevel;
  canManage: boolean;
  isLimitReached: boolean;
  limitTooltip?: string;
  isCreatingHere: boolean;
  editingStateId: string | null;
  createFormSlot?: ReactNode;
  editFormSlot?: ReactNode;
  onStartCreate: () => void;
  onStartEdit: (state: StateResponse) => void;
  onDelete?: (state: StateResponse) => void;
}

export function StateListGroup({
  group,
  states,
  ownLevel,
  canManage,
  isLimitReached,
  limitTooltip,
  isCreatingHere,
  editingStateId,
  createFormSlot,
  editFormSlot,
  onStartCreate,
  onStartEdit,
  onDelete,
}: StateListGroupProps) {
  const { t } = useTranslation();
  const headingId = "state-group-heading-" + group;
  const groupLabelKey = ("state:groups." + group) as MessageKey;

  const addButton = (
    <Button
      variant="subtle"
      size="xs"
      disabled={isLimitReached}
      onClick={onStartCreate}
      leftSection={<PlusIcon width={12} height={12} />}
      data-testid={"add-state-btn-" + group}
    >
      {t("state:list.addState")}
    </Button>
  );

  return (
    <section className={classes.groupSection} aria-labelledby={headingId}>
      <div className={classes.groupHeader}>
        <h3 id={headingId} className={classes.groupTitle}>
          {t(groupLabelKey)}
        </h3>

        {canManage && (
          <div>
            {isLimitReached ? (
              <Tooltip label={limitTooltip} withArrow multiline>
                <span tabIndex={0} style={{ display: "inline-block" }}>
                  {addButton}
                </span>
              </Tooltip>
            ) : (
              addButton
            )}
          </div>
        )}
      </div>

      <ul className={classes.groupList} role="list">
        {isCreatingHere && createFormSlot}

        {states.map((state) => {
          if (editingStateId === state.id) {
            return editFormSlot;
          }

          return (
            <StateRow
              key={state.id}
              state={state}
              ownLevel={ownLevel}
              canManage={canManage}
              onEdit={() => onStartEdit(state)}
              onDelete={onDelete ? () => onDelete(state) : undefined}
            />
          );
        })}
      </ul>
    </section>
  );
}

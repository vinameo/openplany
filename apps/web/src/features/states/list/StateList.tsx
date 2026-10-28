import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_STATE_COLOR,
  STATE_GROUPS,
  type CreateStateRequest,
  type StateGroup,
  type StateLevel,
  type StateResponse,
  type UpdateStateRequest,
} from "@repo/contracts";
import { StateListGroup } from "./StateListGroup";
import { StateRowForm, type StateRowFormValues } from "./StateRowForm";
import classes from "./stateList.module.css";

export interface StateListProps {
  states: StateResponse[];
  ownLevel: StateLevel;
  canManage: boolean;
  ownCount: number;
  ownMax: number;
  onCreate: (data: CreateStateRequest) => Promise<void>;
  onUpdate: (stateId: string, data: UpdateStateRequest) => Promise<void>;
  onDelete?: (state: StateResponse) => void;
  inheritedNote?: ReactNode;
  description?: ReactNode;
  countLabel?: string;
  serverAlert?: ReactNode;
  isSaving?: boolean;
  serverFieldError?: string;
}

type ActiveForm =
  | { type: "create"; group: StateGroup }
  | { type: "edit"; state: StateResponse }
  | null;

export function StateList({
  states,
  ownLevel,
  canManage,
  ownCount,
  ownMax,
  onCreate,
  onUpdate,
  onDelete,
  inheritedNote,
  description,
  countLabel,
  serverAlert,
  isSaving = false,
  serverFieldError,
}: StateListProps) {
  const { t } = useTranslation();
  const [activeForm, setActiveForm] = useState<ActiveForm>(null);

  const isLimitReached = ownCount >= ownMax;
  const limitTooltip = t("state:list.limitReached", { max: ownMax });

  const statesByGroup = useMemo(() => {
    const map = new Map<StateGroup, StateResponse[]>();
    for (const group of STATE_GROUPS) {
      map.set(group, []);
    }
    for (const state of states) {
      const list = map.get(state.group);
      if (list) {
        list.push(state);
      }
    }
    return map;
  }, [states]);

  const handleStartCreate = (group: StateGroup) => {
    setActiveForm({ type: "create", group });
  };

  const handleStartEdit = (state: StateResponse) => {
    setActiveForm({ type: "edit", state });
  };

  const handleCloseForm = () => {
    setActiveForm(null);
  };

  const handleCreateSubmit = async (values: StateRowFormValues) => {
    await onCreate({
      name: values.name,
      group: values.group,
      color: values.color,
    });
    setActiveForm(null);
  };

  const handleEditSubmit = async (values: StateRowFormValues) => {
    if (activeForm?.type !== "edit") return;
    const currentState = activeForm.state;
    const patch: UpdateStateRequest = {};
    if (values.name !== currentState.name) patch.name = values.name;
    if (values.group !== currentState.group) patch.group = values.group;
    if (values.color !== currentState.color) patch.color = values.color;

    await onUpdate(currentState.id, patch);
    setActiveForm(null);
  };

  return (
    <div className={classes.container}>
      <div className={classes.header}>
        <div className={classes.headerTop}>
          <div className={classes.description}>
            {description ??
              (ownLevel === "project"
                ? t("state:page.projectDescription")
                : t("state:page.workspaceDescription"))}
          </div>

          <div className={classes.countText}>
            {countLabel ??
              (ownLevel === "project"
                ? t("state:page.projectCount", { count: ownCount, max: ownMax })
                : t("state:page.workspaceCount", {
                    count: ownCount,
                    max: ownMax,
                  }))}
          </div>
        </div>

        {inheritedNote && (
          <div className={classes.inheritedNote}>{inheritedNote}</div>
        )}
      </div>

      {serverAlert}

      {STATE_GROUPS.map((group) => {
        const groupStates = statesByGroup.get(group) ?? [];
        const isCreatingHere =
          activeForm?.type === "create" && activeForm.group === group;
        const editingStateId =
          activeForm?.type === "edit" && activeForm.state.group === group
            ? activeForm.state.id
            : null;

        const createFormSlot = isCreatingHere ? (
          <StateRowForm
            key="create-form"
            mode="create"
            initialValues={{
              name: "",
              group,
              color: DEFAULT_STATE_COLOR,
            }}
            isSaving={isSaving}
            serverFieldError={serverFieldError}
            onSubmit={handleCreateSubmit}
            onCancel={handleCloseForm}
          />
        ) : undefined;

        const editFormSlot =
          activeForm?.type === "edit" ? (
            <StateRowForm
              key={"edit-form-" + activeForm.state.id}
              mode="edit"
              initialValues={{
                name: activeForm.state.name,
                group: activeForm.state.group,
                color: activeForm.state.color,
              }}
              isSaving={isSaving}
              serverFieldError={serverFieldError}
              onSubmit={handleEditSubmit}
              onCancel={handleCloseForm}
            />
          ) : undefined;

        return (
          <StateListGroup
            key={group}
            group={group}
            states={groupStates}
            ownLevel={ownLevel}
            canManage={canManage}
            isLimitReached={isLimitReached}
            limitTooltip={limitTooltip}
            isCreatingHere={isCreatingHere}
            editingStateId={editingStateId}
            createFormSlot={createFormSlot}
            editFormSlot={editFormSlot}
            onStartCreate={() => handleStartCreate(group)}
            onStartEdit={handleStartEdit}
            onDelete={onDelete}
          />
        );
      })}
    </div>
  );
}

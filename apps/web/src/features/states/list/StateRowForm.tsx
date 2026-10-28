import { useState, type FormEvent } from "react";
import { Button, Select, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  STATE_GROUPS,
  stateNameProblem,
  type StateGroup,
} from "@repo/contracts";
import { translateRef } from "../../../i18n/language";
import { DiscardChangesFooter } from "../../layout/DiscardChangesFooter";
import { useDiscardGuard } from "../../layout/useDiscardGuard";
import { StateColorPicker } from "../StateColorPicker";
import classes from "./stateList.module.css";

export interface StateRowFormValues {
  name: string;
  group: StateGroup;
  color: string;
}

export interface StateRowFormProps {
  mode: "create" | "edit";
  initialValues: StateRowFormValues;
  isSaving?: boolean;
  serverFieldError?: string;
  onSubmit: (values: StateRowFormValues) => Promise<void>;
  onCancel: () => void;
}

export function StateRowForm({
  mode,
  initialValues,
  isSaving = false,
  serverFieldError,
  onSubmit,
  onCancel,
}: StateRowFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialValues.name);
  const [group, setGroup] = useState<StateGroup>(initialValues.group);
  const [color, setColor] = useState(initialValues.color);
  const [touched, setTouched] = useState(false);

  const problem = stateNameProblem(name);
  const nameError =
    serverFieldError ??
    (touched && problem ? translateRef(t, problem) : undefined);

  const hasChanges =
    mode === "create"
      ? name.trim().length > 0 || color !== initialValues.color
      : name !== initialValues.name ||
        group !== initialValues.group ||
        color !== initialValues.color;

  const { isConfirmingDiscard, keepEditingRef, requestClose, cancelDiscard } =
    useDiscardGuard({
      hasChanges,
      isSaving,
      onDiscard: onCancel,
    });

  const canSubmit =
    !isSaving &&
    !problem &&
    (mode === "create" ? name.trim().length > 0 : hasChanges);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      await onSubmit({ name, group, color });
    } catch {
      // Keep form open on error
    }
  };

  const groupOptions = STATE_GROUPS.map((g) => ({
    value: g,
    label: t(`state:groups.${g}`),
  }));

  if (isConfirmingDiscard) {
    return (
      <div className={classes.formRow}>
        <DiscardChangesFooter
          keepEditingRef={keepEditingRef}
          onKeepEditing={cancelDiscard}
          onDiscard={onCancel}
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={classes.formRow}>
      <div className={classes.formContent}>
        <div className={classes.formFieldsDesktop}>
          <div className={classes.formNameField}>
            <TextInput
              placeholder={t("state:form.name")}
              value={name}
              onChange={(e) => {
                setName(e.currentTarget.value);
                setTouched(true);
              }}
              onBlur={() => setTouched(true)}
              error={nameError}
              disabled={isSaving}
              autoFocus
              data-testid="state-name-input"
            />
          </div>

          {mode === "edit" && (
            <div className={classes.formGroupField}>
              <Select
                data={groupOptions}
                value={group}
                onChange={(val) => {
                  if (val && STATE_GROUPS.includes(val as StateGroup)) {
                    setGroup(val as StateGroup);
                  }
                }}
                disabled={isSaving}
                aria-label={t("state:form.group")}
                data-testid="state-group-select"
              />
            </div>
          )}

          <div className={classes.formColorField}>
            <StateColorPicker
              value={color}
              onChange={setColor}
              disabled={isSaving}
            />
          </div>
        </div>

        <div className={classes.formActions}>
          <Button
            type="button"
            variant="default"
            size="xs"
            disabled={isSaving}
            onClick={requestClose}
          >
            {t("state:form.cancel")}
          </Button>
          <Button
            type="submit"
            color="blue"
            size="xs"
            loading={isSaving}
            disabled={!canSubmit}
            data-testid="state-form-save"
          >
            {t("state:form.save")}
          </Button>
        </div>
      </div>
    </form>
  );
}

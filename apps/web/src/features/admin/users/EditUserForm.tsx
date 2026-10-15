import { useEffect, useRef, type ReactNode } from "react";
import { Alert, Button, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { EditUserFormState } from "./useEditUserForm";
import { DisplayNameField, UserNameFields } from "./form/UserNameFields";
import { EmailField } from "./form/EmailField";
import classes from "./CreateUserForm.module.css";

export interface EditUserFormProps {
  state: EditUserFormState;
  onCancel?: () => void;
  onReload: () => void;
  isReloading?: boolean;
  footer?: ReactNode;
}

export function EditUserForm({
  state,
  onCancel,
  onReload,
  isReloading,
  footer,
}: EditUserFormProps) {
  const { t } = useTranslation();
  const {
    form,
    isSubmitting,
    isConflict,
    submitError,
    hasChanges,
    handleSubmit,
  } = state;
  const reloadButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isConflict) {
      reloadButtonRef.current?.focus();
    }
  }, [isConflict]);

  return (
    <div className={classes.container}>
      <form
        onSubmit={handleSubmit}
        noValidate
        autoComplete="off"
        className={classes.form}
      >
        <UserNameFields form={form} readOnly={isSubmitting} autoFocus />

        <div className={classes.row}>
          <DisplayNameField form={form} readOnly={isSubmitting} />
          <EmailField form={form} readOnly={isSubmitting} />
        </div>

        {isConflict && (
          <Alert color="red" title={t("common:error")} role="alert">
            <Text size="sm" mb="xs">
              {t("admin:users.errors.changedSinceLoaded")}
            </Text>
            <Button
              ref={reloadButtonRef}
              variant="default"
              size="xs"
              onClick={onReload}
              loading={isReloading}
            >
              {t("admin:users.edit.reload")}
            </Button>
          </Alert>
        )}

        {submitError && (
          <Alert color="red" title={t("common:error")} role="alert">
            {submitError}
          </Alert>
        )}

        {footer ?? (
          <div className={classes.actions}>
            <Button
              type="submit"
              variant="filled"
              loading={isSubmitting}
              disabled={!hasChanges || !form.isValid()}
            >
              {t("common:actions.saveChanges")}
            </Button>

            {onCancel && (
              <Button
                type="button"
                variant="default"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                {t("common:actions.cancel")}
              </Button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}

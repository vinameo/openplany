import type { FormEvent, ReactNode, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Alert, PasswordInput, Stack, VisuallyHidden } from "@mantine/core";
import { NewPasswordFields } from "../../passwords/NewPasswordFields";
import type { ChangeMyPasswordFormState } from "./useChangeMyPasswordForm";

export interface ChangeMyPasswordFormProps {
  state: ChangeMyPasswordFormState;
  email: string;
  footer: ReactNode;
  currentPasswordInputRef?: RefObject<HTMLInputElement | null>;
}

/** Form fields for changing my password. Knows nothing about modal or page wrapper. */
export function ChangeMyPasswordForm({
  state,
  email,
  footer,
  currentPasswordInputRef,
}: ChangeMyPasswordFormProps) {
  const { t } = useTranslation();
  const { form, isSubmitting, submitError, handleSubmit } = state;

  return (
    <form
      onSubmit={(e: FormEvent<HTMLFormElement>) => void handleSubmit(e)}
      noValidate
    >
      {/* Tells password managers which account the new password belongs to. */}
      <VisuallyHidden>
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={email}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
        />
      </VisuallyHidden>
      <Stack gap="md">
        <PasswordInput
          ref={currentPasswordInputRef}
          label={t("profile:password.currentPassword")}
          withAsterisk
          autoComplete="current-password"
          data-autofocus
          data-1p-ignore
          data-lpignore="true"
          readOnly={isSubmitting}
          visibilityToggleButtonProps={{
            "aria-label": t("users:form.showPassword"),
          }}
          {...form.getInputProps("currentPassword")}
          key={form.key("currentPassword")}
        />

        <NewPasswordFields
          passwordProps={form.getInputProps("newPassword")}
          confirmProps={form.getInputProps("confirmPassword")}
          passwordLabel={t("profile:password.newPassword")}
          confirmLabel={t("profile:password.confirmNewPassword")}
          readOnly={isSubmitting}
        />

        {submitError !== null && (
          <Alert color="red" variant="light" role="alert">
            {submitError}
          </Alert>
        )}

        {footer}
      </Stack>
    </form>
  );
}

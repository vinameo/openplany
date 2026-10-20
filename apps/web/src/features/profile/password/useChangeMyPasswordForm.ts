import { useState, type FormEvent } from "react";
import { useForm, type UseFormReturnType } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/useAuth";
import {
  validateConfirmPassword,
  validatePassword,
  validatePasswordNotCurrent,
} from "../../passwords/passwordValidation";
import { profileApi } from "../api/profileApi";
import { resolveMyPasswordError } from "./myPasswordErrors";

export interface ChangeMyPasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface UseChangeMyPasswordFormOptions {
  email: string;
  onSuccess: () => void;
  onUnauthenticated?: () => void;
  focusCurrentPassword?: () => void;
}

export interface ChangeMyPasswordFormState {
  form: UseFormReturnType<ChangeMyPasswordValues>;
  isSubmitting: boolean;
  submitError: string | null;
  hasChanges: boolean;
  handleSubmit: (event?: FormEvent<HTMLFormElement>) => Promise<void>;
}

export function useChangeMyPasswordForm({
  email,
  onSuccess,
  onUnauthenticated,
  focusCurrentPassword,
}: UseChangeMyPasswordFormOptions): ChangeMyPasswordFormState {
  const { t } = useTranslation();
  const { replaceSession, recheckSession } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<ChangeMyPasswordValues>({
    mode: "controlled",
    initialValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    validateInputOnBlur: true,
    validate: {
      currentPassword: (val) =>
        val === "" ? t("users:errors.currentPasswordRequired") : null,
      newPassword: (val, values) =>
        validatePassword(val, email) ??
        validatePasswordNotCurrent(val, values.currentPassword),
      confirmPassword: (val, values) =>
        validateConfirmPassword(val, values.newPassword),
    },
    onValuesChange: (values, previous) => {
      if (values.newPassword !== previous.newPassword) {
        if (values.confirmPassword !== "") {
          form.validateField("confirmPassword");
        }
        if (
          Boolean(form.errors.confirmPassword) &&
          values.confirmPassword === values.newPassword
        ) {
          form.clearFieldError("confirmPassword");
        }
      }

      if (values.confirmPassword !== previous.confirmPassword) {
        if (
          Boolean(form.errors.confirmPassword) &&
          values.confirmPassword === values.newPassword
        ) {
          form.clearFieldError("confirmPassword");
        }
      }

      if (
        values.currentPassword !== previous.currentPassword &&
        values.newPassword !== ""
      ) {
        form.validateField("newPassword");
      }
    },
  });

  const hasChanges =
    form.values.currentPassword !== "" ||
    form.values.newPassword !== "" ||
    form.values.confirmPassword !== "";

  async function handleSubmit(
    event?: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event?.preventDefault();
    setSubmitError(null);

    const validation = form.validate();
    if (validation.hasErrors) {
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await profileApi.changePassword({
        currentPassword: form.values.currentPassword,
        newPassword: form.values.newPassword,
      });

      replaceSession(session);
      notifications.show({
        message: t("profile:password.changed"),
      });
      onSuccess();
    } catch (error: unknown) {
      setIsSubmitting(false);
      const resolution = resolveMyPasswordError(error, t);
      switch (resolution.kind) {
        case "unauthenticated": {
          const outcome = await recheckSession();
          if (outcome === "kept") {
            setSubmitError(t("profile:password.errors.failed"));
          } else {
            onUnauthenticated?.();
          }
          return;
        }
        case "fieldErrors": {
          if (resolution.fieldErrors.currentPassword) {
            form.setFieldError(
              "currentPassword",
              resolution.fieldErrors.currentPassword,
            );
          }
          if (resolution.fieldErrors.newPassword) {
            form.setFieldError(
              "newPassword",
              resolution.fieldErrors.newPassword,
            );
          }
          if (resolution.submitError) {
            setSubmitError(resolution.submitError);
          }
          if (resolution.focusField === "currentPassword") {
            focusCurrentPassword?.();
          }
          return;
        }
        case "submitError":
          setSubmitError(resolution.submitError);
          return;
      }
    }
  }

  return {
    form,
    isSubmitting,
    submitError,
    hasChanges,
    handleSubmit,
  };
}

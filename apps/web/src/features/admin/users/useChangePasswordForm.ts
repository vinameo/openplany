import { useState, type FormEvent } from "react";
import { useForm, type UseFormReturnType } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import type { AdminUserResponse } from "@repo/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { authApi } from "../../auth/api/authApi";
import { useAuth } from "../../auth/useAuth";
import { parseAdminUserError } from "./adminUserErrors";
import {
  adminUserKeys,
  invalidateAdminUserLists,
} from "./api/adminUserQueries";
import { adminUsersApi } from "./api/adminUsersApi";
import {
  adminUserLabel,
  hasChangePasswordChanges,
  validateChangePasswordField,
  type ChangePasswordValues,
} from "./userFieldValidation";

export interface UseChangePasswordFormOptions {
  targetUser: AdminUserResponse;
  onSuccess: () => void;
  onClose: () => void;
}

export interface ChangePasswordFormState {
  form: UseFormReturnType<ChangePasswordValues>;
  isSubmitting: boolean;
  submitError: string | null;
  hasChanges: boolean;
  handleSubmit: (event?: FormEvent<HTMLFormElement>) => void;
}

export function useChangePasswordForm({
  targetUser,
  onSuccess,
  onClose,
}: UseChangePasswordFormOptions): ChangePasswordFormState {
  const { t } = useTranslation();
  const { updateUser, expireSession } = useAuth();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<ChangePasswordValues>({
    mode: "controlled",
    initialValues: {
      password: "",
      confirmPassword: "",
    },
    validateInputOnBlur: true,
    validate: {
      password: (_val, values) =>
        validateChangePasswordField("password", values, targetUser.email),
      confirmPassword: (_val, values) =>
        validateChangePasswordField(
          "confirmPassword",
          values,
          targetUser.email,
        ),
    },
    onValuesChange: (values, previous) => {
      if (values.password !== previous.password) {
        if (values.confirmPassword !== "") {
          form.validateField("confirmPassword");
        }
        if (
          Boolean(form.errors.confirmPassword) &&
          values.confirmPassword === values.password
        ) {
          form.clearFieldError("confirmPassword");
        }
      }

      if (values.confirmPassword !== previous.confirmPassword) {
        if (
          Boolean(form.errors.confirmPassword) &&
          values.confirmPassword === values.password
        ) {
          form.clearFieldError("confirmPassword");
        }
      }
    },
  });

  const hasChanges = hasChangePasswordChanges(form.values);

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setSubmitError(null);

    const validation = form.validate();
    if (validation.hasErrors) {
      return;
    }

    setIsSubmitting(true);
    try {
      await adminUsersApi.changePassword(targetUser.id, {
        password: form.values.password,
      });

      notifications.show({
        message: t("admin:users.password.changed", {
          name: adminUserLabel(targetUser),
        }),
      });

      queryClient.invalidateQueries({
        queryKey: adminUserKeys.detail(targetUser.id),
      });

      onSuccess();
      onClose();
    } catch (error: unknown) {
      setIsSubmitting(false);

      const action = parseAdminUserError(error, "password");
      switch (action.type) {
        case "expireSession":
          expireSession();
          return;

        case "cannotChangeOwnPassword":
          setSubmitError(action.message);
          return;

        case "forbidden":
          setSubmitError(action.message);
          if (action.refreshSession) {
            try {
              const session = await authApi.getSession();
              if (session !== null) {
                updateUser(session.user);
              } else {
                expireSession();
              }
            } catch (sessionError) {
              console.warn("Session refresh after 403 failed", sessionError);
            }
          }
          return;

        case "rateLimit":
          setSubmitError(action.message);
          return;

        case "userNotFound":
          notifications.show({
            color: "red",
            message: action.message,
          });
          queryClient.removeQueries({
            queryKey: adminUserKeys.detail(targetUser.id),
          });
          invalidateAdminUserLists(queryClient);
          onClose();
          return;

        case "validation": {
          const fieldEntries = Object.entries(action.fields);
          if (fieldEntries.length > 0) {
            let handled = false;
            for (const [key, msg] of fieldEntries) {
              if (key === "password" && typeof msg === "string") {
                form.setFieldError("password", msg);
                handled = true;
              }
            }
            if (!handled) {
              setSubmitError(action.message ?? t("common:error"));
            }
          } else {
            setSubmitError(action.message ?? t("common:error"));
          }
          return;
        }

        case "general":
        default:
          setSubmitError(
            "message" in action && action.message
              ? action.message
              : t("admin:users.errors.passwordFailed"),
          );
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

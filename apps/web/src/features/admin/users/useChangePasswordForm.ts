import { useState, type FormEvent } from "react";
import { useForm, type UseFormReturnType } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import type {
  AdminUserResponse,
  ChangeUserPasswordRequest,
} from "@repo/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { parseAdminUserError } from "./adminUserErrors";
import { adminUserKeys } from "./api/adminUserQueries";
import { adminUsersApi } from "./api/adminUsersApi";
import { useAdminUserErrorRecovery } from "./useAdminUserErrorRecovery";
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
  /** Show "Your password": the target is an instance admin, or the API asked (API B7). */
  needsActorPassword: boolean;
  handleSubmit: (event?: FormEvent<HTMLFormElement>) => void;
}

export function useChangePasswordForm({
  targetUser,
  onSuccess,
  onClose,
}: UseChangePasswordFormOptions): ChangePasswordFormState {
  const { t } = useTranslation();
  const recovery = useAdminUserErrorRecovery();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The list row can be stale (promoted since): the API's
  // REAUTHENTICATION_REQUIRED reveals the field too.
  const [actorPasswordRequested, setActorPasswordRequested] = useState(false);
  const needsActorPassword =
    targetUser.isInstanceAdmin || actorPasswordRequested;

  const form = useForm<ChangePasswordValues>({
    mode: "controlled",
    initialValues: {
      password: "",
      confirmPassword: "",
      actorPassword: "",
    },
    validateInputOnBlur: true,
    validate: {
      password: (_val, values) =>
        validateChangePasswordField(
          "password",
          values,
          targetUser.email,
          needsActorPassword,
        ),
      confirmPassword: (_val, values) =>
        validateChangePasswordField(
          "confirmPassword",
          values,
          targetUser.email,
          needsActorPassword,
        ),
      actorPassword: (_val, values) =>
        validateChangePasswordField(
          "actorPassword",
          values,
          targetUser.email,
          needsActorPassword,
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
      const request: ChangeUserPasswordRequest = {
        password: form.values.password,
        ...(needsActorPassword && { actorPassword: form.values.actorPassword }),
      };
      await adminUsersApi.changePassword(targetUser.id, request);

      notifications.show({
        message: t("admin:users.password.changed", {
          name: adminUserLabel(targetUser),
        }),
      });

      void queryClient.invalidateQueries({
        queryKey: adminUserKeys.detail(targetUser.id),
      });

      onSuccess();
      onClose();
    } catch (error: unknown) {
      setIsSubmitting(false);

      const action = parseAdminUserError(error, "password");
      switch (action.type) {
        case "expireSession":
          recovery.expireSession();
          return;

        case "reauthentication":
          setActorPasswordRequested(true);
          form.setFieldError("actorPassword", action.message);
          return;

        case "forbidden":
          setSubmitError(action.message);
          await recovery.refreshSessionAfterForbidden();
          return;

        case "userNotFound":
          recovery.forgetMissingUser(targetUser.id, action.message);
          onClose();
          return;

        case "validation": {
          const { password, actorPassword } = action.fields;
          if (password !== undefined) form.setFieldError("password", password);
          if (actorPassword !== undefined) {
            form.setFieldError("actorPassword", actorPassword);
          }
          if (password === undefined && actorPassword === undefined) {
            setSubmitError(action.message ?? t("common:error"));
          }
          return;
        }

        case "cannotChangeOwnPassword":
        case "rateLimit":
        case "general":
          setSubmitError(action.message);
          return;

        case "emailAlreadyExists":
        case "conflictReload":
          setSubmitError(t("admin:users.errors.passwordFailed"));
          return;
      }
    }
  }

  return {
    form,
    isSubmitting,
    submitError,
    hasChanges,
    needsActorPassword,
    handleSubmit,
  };
}

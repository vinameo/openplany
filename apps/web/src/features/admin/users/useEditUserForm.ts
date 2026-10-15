import { useState, type FormEvent } from "react";
import { useForm, type UseFormReturnType } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import type { AdminUserResponse } from "@repo/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { parseAdminUserError } from "./adminUserErrors";
import { authApi } from "../../auth/api/authApi";
import { useAuth } from "../../auth/useAuth";
import { adminUsersApi } from "./api/adminUsersApi";
import {
  adminUserKeys,
  invalidateAdminUserLists,
  replaceAdminUserInCache,
} from "./api/adminUserQueries";
import {
  adminUserLabel,
  buildUpdateAdminUserPayload,
  hasEditUserChanges,
  type EditUserField,
  type EditUserValues,
  validateEditUserField,
} from "./userFieldValidation";

export interface UseEditUserFormOptions {
  loadedUser: AdminUserResponse;
  onSaved: (user: AdminUserResponse) => void;
  onClose: () => void;
}

export interface EditUserFormState {
  form: UseFormReturnType<EditUserValues>;
  loadedUser: AdminUserResponse;
  isSubmitting: boolean;
  isConflict: boolean;
  submitError: string | null;
  hasChanges: boolean;
  handleSubmit: (event?: FormEvent<HTMLFormElement>) => Promise<void>;
  handleReload: (freshUser: AdminUserResponse) => void;
  clearConflict: () => void;
}

export function useEditUserForm({
  loadedUser: initialLoadedUser,
  onSaved,
  onClose,
}: UseEditUserFormOptions): EditUserFormState {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { state: authState, updateUser, expireSession } = useAuth();
  const [loadedUser, setLoadedUser] = useState<AdminUserResponse>(initialLoadedUser);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConflict, setIsConflict] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<EditUserValues>({
    mode: "controlled",
    initialValues: {
      firstName: initialLoadedUser.firstName,
      lastName: initialLoadedUser.lastName ?? "",
      displayName: initialLoadedUser.displayName,
      email: initialLoadedUser.email,
    },
    validateInputOnBlur: true,
    validate: {
      firstName: (_val, values) =>
        validateEditUserField("firstName", values, loadedUser),
      lastName: (_val, values) =>
        validateEditUserField("lastName", values, loadedUser),
      displayName: (_val, values) =>
        validateEditUserField("displayName", values, loadedUser),
      email: (_val, values) =>
        validateEditUserField("email", values, loadedUser),
    },
  });

  const hasChanges = hasEditUserChanges(form.values, loadedUser);

  async function handleSubmit(event?: FormEvent<HTMLFormElement>): Promise<void> {
    if (event) {
      event.preventDefault();
    }
    if (isSubmitting || !hasChanges) return;

    setSubmitError(null);
    setIsConflict(false);
    const validation = form.validate();
    if (validation.hasErrors) return;

    setIsSubmitting(true);
    try {
      const payload = buildUpdateAdminUserPayload(form.values, loadedUser);
      const updated = await adminUsersApi.update(loadedUser.id, payload);

      replaceAdminUserInCache(queryClient, updated);

      if (
        authState.status === "authenticated" &&
        updated.id === authState.session.user.id
      ) {
        const emailChanged = Boolean(
          payload.email &&
            payload.email !== loadedUser.email.trim().toLowerCase(),
        );
        updateUser({
          ...authState.session.user,
          firstName: updated.firstName,
          lastName: updated.lastName,
          displayName: updated.displayName,
          email: updated.email,
          isEmailVerified: emailChanged
            ? false
            : authState.session.user.isEmailVerified,
        });
      }

      notifications.show({
        color: "green",
        message: t("admin:users.edit.saved", {
          name: adminUserLabel(updated),
        }),
      });

      onSaved(updated);
      onClose();
    } catch (error: unknown) {
      setIsSubmitting(false);

      const action = parseAdminUserError(error, "update");
      switch (action.type) {
        case "expireSession":
          expireSession();
          return;

        case "conflictReload":
          setIsConflict(true);
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

        case "emailAlreadyExists":
          form.setFieldError(
            "email",
            action.message ?? t("users:errors.emailTaken"),
          );
          return;

        case "userNotFound":
          notifications.show({
            color: "red",
            message: action.message,
          });
          queryClient.removeQueries({
            queryKey: adminUserKeys.detail(loadedUser.id),
          });
          invalidateAdminUserLists(queryClient);
          onClose();
          return;

        case "validation": {
          const fieldEntries = Object.entries(action.fields);
          if (fieldEntries.length > 0) {
            const knownFields: EditUserField[] = [
              "firstName",
              "lastName",
              "displayName",
              "email",
            ];
            for (const [key, msg] of fieldEntries) {
              if (knownFields.includes(key as EditUserField)) {
                form.setFieldError(key, msg);
              } else {
                setSubmitError(msg);
              }
            }
          } else {
            setSubmitError(action.message ?? t("admin:users.errors.updateFailed"));
          }
          return;
        }

        case "rateLimit":
        case "cannotChangeOwnPassword":
        case "general":
          setSubmitError(action.message);
          return;
      }
    }
  }

  function handleReload(freshUser: AdminUserResponse) {
    setLoadedUser(freshUser);
    form.setValues({
      firstName: freshUser.firstName,
      lastName: freshUser.lastName ?? "",
      displayName: freshUser.displayName,
      email: freshUser.email,
    });
    form.resetDirty();
    replaceAdminUserInCache(queryClient, freshUser);
    setIsConflict(false);
    setSubmitError(null);
  }

  function clearConflict() {
    setIsConflict(false);
  }

  return {
    form,
    loadedUser,
    isSubmitting,
    isConflict,
    submitError,
    hasChanges,
    handleSubmit,
    handleReload,
    clearConflict,
  };
}

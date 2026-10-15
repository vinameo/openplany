import { useRef, useState, type FormEvent } from "react";
import { useForm, type UseFormReturnType } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  fullName,
  normalizeName,
  type CreateUserRequest,
} from "@repo/contracts";
import { useTranslation } from "react-i18next";
import { parseAdminUserError } from "./adminUserErrors";
import { authApi } from "../../auth/api/authApi";
import { useAuth } from "../../auth/useAuth";
import {
  adminUsersApi,
  GENERIC_CREATE_USER_ERROR_KEY,
} from "./api/adminUsersApi";
import {
  type CreateUserField,
  type CreateUserValues,
  validateCreateUserField,
} from "./userFieldValidation";

interface UseCreateUserFormOptions {
  /** Called after the user was created and the toast was shown. */
  onCreated: () => void;
}

export interface CreateUserFormState {
  form: UseFormReturnType<CreateUserValues>;
  isSubmitting: boolean;
  submitError: string | null;
  handleSubmit: (event?: FormEvent<HTMLFormElement>) => void;
}

export function useCreateUserForm({
  onCreated,
}: UseCreateUserFormOptions): CreateUserFormState {
  const { t } = useTranslation();
  const { updateUser, expireSession } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const displayNameTouched = useRef(false);

  const form = useForm<CreateUserValues>({
    mode: "controlled",
    initialValues: {
      firstName: "",
      lastName: "",
      displayName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    validateInputOnBlur: true,
    validate: {
      firstName: (_val, values) => validateCreateUserField("firstName", values),
      lastName: (_val, values) => validateCreateUserField("lastName", values),
      displayName: (_val, values) =>
        validateCreateUserField("displayName", values),
      email: (_val, values) => validateCreateUserField("email", values),
      password: (_val, values) => validateCreateUserField("password", values),
      confirmPassword: (_val, values) =>
        validateCreateUserField("confirmPassword", values),
    },
    onValuesChange: (values, previous) => {
      // Display name autofill & touched detection
      if (values.displayName !== previous.displayName) {
        const expected = fullName(previous.firstName, previous.lastName);
        if (values.displayName !== expected) {
          displayNameTouched.current = normalizeName(values.displayName) !== "";
        }
      }
      const namesChanged =
        values.firstName !== previous.firstName ||
        values.lastName !== previous.lastName;
      if (namesChanged && !displayNameTouched.current) {
        form.setFieldValue(
          "displayName",
          fullName(values.firstName, values.lastName),
        );
      }

      // Password cross-revalidation
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

      // Email -> password cross-revalidation
      if (values.email !== previous.email && values.password !== "") {
        form.validateField("password");
      }
    },
  });

  async function handleSubmit(
    event?: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    if (event) {
      event.preventDefault();
    }
    if (isSubmitting) return;

    setSubmitError(null);
    const validation = form.validate();
    if (validation.hasErrors) return;

    setIsSubmitting(true);
    try {
      const request: CreateUserRequest = {
        firstName: normalizeName(form.values.firstName),
        displayName: normalizeName(form.values.displayName),
        email: form.values.email.trim().toLowerCase(),
        password: form.values.password,
        ...(normalizeName(form.values.lastName) !== "" && {
          lastName: normalizeName(form.values.lastName),
        }),
      };

      const created = await adminUsersApi.createUser(request);
      notifications.show({
        color: "green",
        title: t("admin:users.notifications.createdTitle"),
        message: t("admin:users.notifications.createdMessage", {
          displayName: created.displayName,
          email: created.email,
        }),
      });
      onCreated();
    } catch (error: unknown) {
      setIsSubmitting(false);

      const action = parseAdminUserError(error, "create");
      switch (action.type) {
        case "expireSession":
          expireSession();
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

        case "validation": {
          const fieldEntries = Object.entries(action.fields);
          if (fieldEntries.length > 0) {
            const knownFields: CreateUserField[] = [
              "firstName",
              "lastName",
              "displayName",
              "email",
              "password",
              "confirmPassword",
            ];
            for (const [key, msg] of fieldEntries) {
              if (knownFields.includes(key as CreateUserField)) {
                form.setFieldError(key, msg);
              } else {
                setSubmitError(msg);
              }
            }
          } else {
            setSubmitError(action.message ?? t(GENERIC_CREATE_USER_ERROR_KEY));
          }
          return;
        }

        case "rateLimit":
          setSubmitError(action.message);
          return;

        case "userNotFound":
        case "cannotChangeOwnPassword":
        case "general":
          setSubmitError(action.message);
          return;

        case "conflictReload":
          return;
      }
    }
  }

  return {
    form,
    isSubmitting,
    submitError,
    handleSubmit,
  };
}

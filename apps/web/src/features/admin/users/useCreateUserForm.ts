import { useRef, useState, type FormEvent } from "react";
import { useForm, type UseFormReturnType } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  fullName,
  normalizeName,
  type CreateUserRequest,
} from "@repo/contracts";
import { ApiRequestError } from "../../../lib/apiClient";
import { authApi } from "../../auth/api/authApi";
import { useAuth } from "../../auth/useAuth";
import { adminUsersApi, GENERIC_CREATE_USER_ERROR } from "./api/adminUsersApi";
import {
  type CreateUserField,
  type CreateUserValues,
  validateCreateUserField,
} from "./createUserValidation";

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
        title: "User created",
        message: `${created.displayName} can now sign in with ${created.email}.`,
      });
      onCreated();
    } catch (error: unknown) {
      setIsSubmitting(false);

      if (error instanceof ApiRequestError) {
        if (error.status === 400 && error.code === "VALIDATION_ERROR") {
          const fieldEntries = Object.entries(error.fields);
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
            setSubmitError(error.message);
          }
          return;
        }

        if (error.status === 409 && error.code === "EMAIL_ALREADY_EXISTS") {
          form.setFieldError("email", error.fields.email ?? error.message);
          return;
        }

        if (error.status === 403 && error.code === "FORBIDDEN") {
          setSubmitError("You no longer have permission to create users.");
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
          return;
        }

        if (error.status === 403 && error.code === "PASSWORD_RESET_REQUIRED") {
          expireSession();
          return;
        }

        if (error.status === 401 && error.code === "UNAUTHENTICATED") {
          expireSession();
          return;
        }

        if (error.status === 429 && error.code === "TOO_MANY_ATTEMPTS") {
          const minutes = Math.ceil((error.retryAfterSeconds ?? 60) / 60);
          setSubmitError(
            `Too many users created. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
          );
          return;
        }

        setSubmitError(error.message || GENERIC_CREATE_USER_ERROR);
        return;
      }

      console.error("Create user failed", error);
      setSubmitError(GENERIC_CREATE_USER_ERROR);
    }
  }

  return {
    form,
    isSubmitting,
    submitError,
    handleSubmit,
  };
}


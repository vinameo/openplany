import { ApiRequestError, retryAfterMinutes } from "../../../lib/apiClient";

export type MyPasswordErrorResolution =
  | { kind: "unauthenticated" }
  | {
      kind: "fieldErrors";
      fieldErrors: Partial<Record<"currentPassword" | "newPassword", string>>;
      submitError?: string;
      focusField?: "currentPassword" | "newPassword";
    }
  | { kind: "submitError"; submitError: string };

export function resolveMyPasswordError(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): MyPasswordErrorResolution {
  if (error instanceof ApiRequestError) {
    if (error.status === 401 || error.code === "UNAUTHENTICATED") {
      return { kind: "unauthenticated" };
    }

    if (error.code === "CURRENT_PASSWORD_INCORRECT") {
      return {
        kind: "fieldErrors",
        fieldErrors: {
          currentPassword: t("users:errors.currentPasswordIncorrect"),
        },
        focusField: "currentPassword",
      };
    }

    if (error.code === "VALIDATION_ERROR" && error.fields) {
      const fieldErrors: Partial<
        Record<"currentPassword" | "newPassword", string>
      > = {};
      let hasUnknownField = false;

      for (const [key, message] of Object.entries(error.fields)) {
        if (key === "currentPassword" || key === "newPassword") {
          fieldErrors[key] = message;
        } else {
          hasUnknownField = true;
        }
      }

      const focusField = fieldErrors.currentPassword
        ? "currentPassword"
        : fieldErrors.newPassword
          ? "newPassword"
          : undefined;

      const submitError = hasUnknownField
        ? t("profile:password.errors.failed")
        : undefined;

      if (Object.keys(fieldErrors).length > 0) {
        return {
          kind: "fieldErrors",
          fieldErrors,
          submitError,
          focusField,
        };
      }

      return {
        kind: "submitError",
        submitError: submitError ?? t("profile:password.errors.failed"),
      };
    }

    if (error.code === "TOO_MANY_PASSWORD_ATTEMPTS") {
      return {
        kind: "submitError",
        submitError: t("users:errors.tooManyPasswordAttempts", {
          count: retryAfterMinutes(error.retryAfterSeconds),
        }),
      };
    }

    if (error.code === "TOO_MANY_PASSWORD_CHANGES") {
      return {
        kind: "submitError",
        submitError: t("users:errors.tooManyPasswordChanges", {
          count: retryAfterMinutes(error.retryAfterSeconds),
        }),
      };
    }

    if (error.code === "PASSWORD_CHANGED_ELSEWHERE") {
      return {
        kind: "submitError",
        submitError: t("users:errors.passwordChangedElsewhere"),
      };
    }
  }

  console.error("Change password request failed", error);
  return {
    kind: "submitError",
    submitError: t("profile:password.errors.failed"),
  };
}

import { ApiRequestError } from "../../../lib/apiClient";
import { translate } from "../../../i18n/index.js";

export type AdminUserErrorContext =
  "list" | "detail" | "create" | "update" | "password";

export type AdminUserAction =
  | { type: "expireSession" }
  | {
      type: "forbidden";
      message: string;
      refreshSession: boolean;
    }
  | {
      type: "validation";
      fields: Record<string, string>;
      message?: string;
    }
  | {
      type: "emailAlreadyExists";
      field: "email";
      message?: string;
    }
  | {
      type: "rateLimit";
      message: string;
      retryAfterSeconds: number;
    }
  | {
      type: "userNotFound";
      message: string;
    }
  | {
      type: "conflictReload";
    }
  | {
      type: "cannotChangeOwnPassword";
      message: string;
    }
  | {
      type: "general";
      message: string;
    };

function fallbackMessageForContext(): string {
  // Currently covers 'create'; other contexts will provide specific keys in tickets 03-06.
  return translate("admin:users.errors.createFailed");
}

/**
 * Classifies an error into an actionable result for admin user operations (RQ INV-14).
 * Always selects messages by error code and fields, never inspecting error.message.
 */
export function parseAdminUserError(
  error: unknown,
  context: AdminUserErrorContext,
): AdminUserAction {
  if (error instanceof ApiRequestError) {
    if (
      error.code === "UNAUTHENTICATED" ||
      error.code === "PASSWORD_RESET_REQUIRED" ||
      error.status === 401
    ) {
      return { type: "expireSession" };
    }

    if (error.code === "FORBIDDEN" || error.status === 403) {
      if (error.code === "CANNOT_CHANGE_OWN_PASSWORD") {
        return {
          type: "cannotChangeOwnPassword",
          message: translate("admin:users.errors.noPermission"),
        };
      }
      const message =
        context === "create"
          ? translate("admin:users.errors.noPermission")
          : translate("admin:users.errors.noPermission");
      return {
        type: "forbidden",
        message,
        refreshSession: true,
      };
    }

    if (error.code === "TOO_MANY_ATTEMPTS" || error.status === 429) {
      const retryAfterSeconds = error.retryAfterSeconds ?? 60;
      const minutes = Math.ceil(retryAfterSeconds / 60);
      return {
        type: "rateLimit",
        message: translate("admin:users.errors.tooManyUsers", {
          count: minutes,
        }),
        retryAfterSeconds,
      };
    }

    if (error.code === "VALIDATION_ERROR" || error.status === 400) {
      return {
        type: "validation",
        fields: error.fields ?? {},
        message: translate("common:error"),
      };
    }

    if (
      error.code === "EMAIL_ALREADY_EXISTS" ||
      (error.status === 409 && error.fields?.email)
    ) {
      return {
        type: "emailAlreadyExists",
        field: "email",
        message: error.fields?.email ?? translate("users:errors.emailTaken"),
      };
    }

    if (error.code === "USER_NOT_FOUND" || error.status === 404) {
      return {
        type: "userNotFound",
        message: translate("admin:users.errors.createFailed"),
      };
    }

    if (error.code === "USER_CHANGED_SINCE_LOADED") {
      return {
        type: "conflictReload",
      };
    }

    return {
      type: "general",
      message: fallbackMessageForContext(),
    };
  }

  return {
    type: "general",
    message: fallbackMessageForContext(),
  };
}

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

function fallbackMessageForContext(context: AdminUserErrorContext): string {
  switch (context) {
    case "list":
      return translate("admin:users.errors.loadFailed");
    case "detail":
      return translate("admin:users.errors.loadUserFailed");
    case "update":
      return translate("admin:users.errors.updateFailed");
    case "password":
      return translate("admin:users.errors.passwordFailed");
    case "create":
    default:
      return translate("admin:users.errors.createFailed");
  }
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
          message: translate("admin:users.errors.cannotChangeOwnPassword"),
        };
      }
      const message =
        context === "create"
          ? translate("admin:users.errors.noPermission")
          : translate("admin:users.errors.noPermissionManage");
      return {
        type: "forbidden",
        message,
        refreshSession: true,
      };
    }

    if (error.code === "TOO_MANY_ATTEMPTS" || error.status === 429) {
      const retryAfterSeconds = error.retryAfterSeconds ?? 60;
      const minutes = Math.ceil(retryAfterSeconds / 60);

      let message: string;
      if (context === "create") {
        message = translate("admin:users.errors.tooManyUsers", {
          count: minutes,
        });
      } else if (context === "list" || context === "detail") {
        message = translate("admin:errors.tooManyRequests");
      } else {
        message = translate("admin:errors.tooManyUserChanges");
      }

      return {
        type: "rateLimit",
        message,
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
        message: translate("admin:users.errors.userNotFound"),
      };
    }

    if (error.code === "USER_CHANGED_SINCE_LOADED") {
      return {
        type: "conflictReload",
      };
    }

    return {
      type: "general",
      message: fallbackMessageForContext(context),
    };
  }

  return {
    type: "general",
    message: fallbackMessageForContext(context),
  };
}

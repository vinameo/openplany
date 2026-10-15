import { ApiRequestError } from "../../../lib/apiClient";
import { translate } from "../../../i18n/index.js";

export type AdminUserErrorContext =
  "list" | "detail" | "create" | "update" | "password";

export type AdminUserAction =
  | { type: "expireSession" }
  | {
      /** Also refresh the session: the route sends a demoted admin away (WEB B2.1). */
      type: "forbidden";
      message: string;
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
      /** Step-up for an instance admin target (API B7): show the actor password field. */
      type: "reauthentication";
      reason: "required" | "failed";
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

/** WEB B2.7: one sentence per limiter, with the minutes to wait. */
function rateLimitMessage(
  code: string,
  context: AdminUserErrorContext,
  minutes: number,
): string {
  if (code === "TOO_MANY_REAUTH_ATTEMPTS") {
    return translate("admin:users.errors.tooManyReauthAttempts", {
      count: minutes,
    });
  }
  switch (context) {
    case "create":
      return translate("admin:users.errors.tooManyUsers", { count: minutes });
    case "list":
    case "detail":
      return translate("admin:errors.tooManyRequests", { count: minutes });
    case "update":
    case "password":
      return translate("admin:errors.tooManyUserChanges", { count: minutes });
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

    if (error.code === "REAUTHENTICATION_REQUIRED") {
      return {
        type: "reauthentication",
        reason: "required",
        message: translate("admin:users.errors.reauthenticationRequired"),
      };
    }
    if (error.code === "REAUTHENTICATION_FAILED") {
      return {
        type: "reauthentication",
        reason: "failed",
        message: translate("admin:users.errors.reauthenticationFailed"),
      };
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
      return { type: "forbidden", message };
    }

    if (error.status === 429) {
      const retryAfterSeconds = error.retryAfterSeconds ?? 60;
      return {
        type: "rateLimit",
        message: rateLimitMessage(
          error.code,
          context,
          Math.max(1, Math.ceil(retryAfterSeconds / 60)),
        ),
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

import { PROJECT_STATES_MAX, WORKSPACE_STATES_MAX } from "@repo/contracts";
import { ApiRequestError, retryAfterMinutes } from "../../lib/apiClient";

export interface StateErrorResult {
  message?: string;
  fieldErrors?: Record<string, string>;
  isNameTaken?: boolean;
  isNotFound?: boolean;
  isGroupChangeUnconfirmed?: boolean;
  unconfirmedCount?: number;
  isReplacementRequired?: boolean;
  isReplacementInvalid?: boolean;
  isPermissionLost?: boolean;
}

export function parseStateError(
  err: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): StateErrorResult {
  if (err instanceof ApiRequestError) {
    switch (err.code) {
      case "VALIDATION_ERROR": {
        // The row form shows only `name`; any other field (or the class-level
        // "nothing to update" error, keyed '') goes to the page alert, already
        // translated by the API.
        const { name, ...others } = err.fields;
        const hasOthers = Object.keys(others).length > 0;
        return {
          ...(name !== undefined && { fieldErrors: { name } }),
          ...((name === undefined || hasOthers) && { message: err.message }),
        };
      }

      case "STATE_NAME_TAKEN":
        return {
          fieldErrors: { name: t("state:errors.nameTaken") },
          isNameTaken: true,
        };

      case "STATE_NAME_TAKEN_IN_PROJECTS": {
        const count = err.count ?? 1;
        return {
          fieldErrors: {
            name: t("state:errors.nameTakenInProjects", { count }),
          },
        };
      }

      case "STATE_GROUP_CHANGE_UNCONFIRMED":
        return {
          isGroupChangeUnconfirmed: true,
          unconfirmedCount: err.count ?? 0,
        };

      case "PROJECT_STATE_LIMIT_REACHED":
        return {
          message: t("state:errors.projectLimitReached", {
            max: PROJECT_STATES_MAX,
          }),
        };

      case "WORKSPACE_STATE_LIMIT_REACHED":
        return {
          message: t("state:errors.workspaceLimitReached", {
            max: WORKSPACE_STATES_MAX,
          }),
        };

      case "STATE_NOT_FOUND":
        return {
          message: t("state:errors.notFound"),
          isNotFound: true,
        };

      case "STATE_REPLACEMENT_REQUIRED":
        return {
          message: t("state:errors.replacementRequired"),
          isReplacementRequired: true,
        };

      case "STATE_REPLACEMENT_INVALID":
        return {
          message: t("state:errors.replacementInvalid"),
          isReplacementInvalid: true,
        };

      case "TOO_MANY_ATTEMPTS": {
        const count = retryAfterMinutes(err.retryAfterSeconds);
        return {
          message: t("state:errors.tooManyChanges", { count }),
        };
      }

      case "FORBIDDEN":
        return {
          message: t("settings:messages.permissionLost"),
          isPermissionLost: true,
        };

      default:
        return {
          message: t("state:errors.generic"),
        };
    }
  }

  return {
    message: t("state:errors.generic"),
  };
}

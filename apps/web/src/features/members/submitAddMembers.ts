import { notifications } from "@mantine/notifications";
import { translate } from "../../i18n/language";
import { ApiRequestError } from "../../lib/apiClient";
import type { SubmitOutcome } from "./AddMembersModalFrame";
import { mapFieldErrors } from "./addMembersRows";
import {
  addedMembersMessage,
  tooManyAttemptsMessage,
} from "./membersMessages";

export interface SubmitAddMembersOptions<
  Res extends { members: readonly unknown[] },
> {
  /** Sends the batch. */
  send: () => Promise<Res>;
  /** Index of each request row → id of the modal row it came from. */
  rowIdByIndex: readonly string[];
  /** Runs after a successful add. A failure here is logged; the add stands. */
  afterAdded?: (res: Res) => Promise<void> | void;
  /**
   * Runs after 403 (the actor lost the right to add) or 404 (the workspace or
   * project is gone), so the page stops offering what it no longer allows.
   * A failure here is logged; the modal still closes.
   */
  refreshAfterLostAccess: () => Promise<void> | void;
  /** Prefix of the log lines, e.g. `project.members.add`. */
  logContext: string;
}

/**
 * Sends one add-members batch and turns the result into what the modal shows.
 * Never rejects: every failure becomes a toast, an alert or row errors.
 */
export async function submitAddMembers<
  Res extends { members: readonly unknown[] },
>({
  send,
  rowIdByIndex,
  afterAdded,
  refreshAfterLostAccess,
  logContext,
}: SubmitAddMembersOptions<Res>): Promise<SubmitOutcome> {
  let res: Res;
  try {
    res = await send();
  } catch (err: unknown) {
    return failureOutcome(
      err,
      rowIdByIndex,
      refreshAfterLostAccess,
      logContext,
    );
  }

  notifications.show({ message: addedMembersMessage(res.members.length) });
  if (afterAdded) {
    await runLogged(() => afterAdded(res), `${logContext}.after_added_failed`);
  }
  return { kind: "done" };
}

async function failureOutcome(
  err: unknown,
  rowIdByIndex: readonly string[],
  refreshAfterLostAccess: () => Promise<void> | void,
  logContext: string,
): Promise<SubmitOutcome> {
  if (!(err instanceof ApiRequestError)) {
    console.error(`${logContext}.failed`, err);
    return { kind: "alert", message: translate("errors:genericError") };
  }

  if (err.status === 403 || err.status === 404) {
    if (err.status === 403) {
      notifications.show({
        color: "red",
        message:
          err.code === "ROLE_NOT_ALLOWED"
            ? translate("members:errors.roleNotAllowed")
            : translate("members:errors.notAllowed"),
      });
    }
    await runLogged(refreshAfterLostAccess, `${logContext}.refresh_failed`);
    return { kind: "done" };
  }

  if (err.status === 429) {
    return {
      kind: "alert",
      message: tooManyAttemptsMessage(err.retryAfterSeconds ?? null),
    };
  }

  if (err.status === 409 || err.status === 400) {
    const rowErrors = mapFieldErrors(err.fields, rowIdByIndex);
    if (Object.keys(rowErrors).length > 0) {
      return { kind: "rowErrors", byRowId: rowErrors };
    }
    return { kind: "alert", message: translate("members:errors.checkFields") };
  }

  return { kind: "alert", message: translate("errors:genericError") };
}

async function runLogged(
  task: () => Promise<void> | void,
  logLine: string,
): Promise<void> {
  try {
    await task();
  } catch (err: unknown) {
    console.error(logLine, err);
  }
}

import { notifications } from "@mantine/notifications";
import { MEMBER_MESSAGES } from "@repo/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../lib/apiClient";
import { SOMETHING_WENT_WRONG } from "./membersMessages";
import { submitAddMembers } from "./submitAddMembers";

vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn() },
}));

const ROW_IDS = ["row-a", "row-b"];

function rejectWith(
  status: number,
  body: Partial<{
    code: string;
    message: string;
    fields: Record<string, string>;
  }> = {},
) {
  return () =>
    Promise.reject(
      new ApiRequestError(status, {
        code: body.code ?? "ERROR",
        message: body.message ?? "Server text",
        fields: body.fields,
      }),
    );
}

describe("submitAddMembers", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    vi.mocked(notifications.show).mockClear();
  });

  it("shows the added count and runs afterAdded on success", async () => {
    const afterAdded = vi.fn();
    const outcome = await submitAddMembers({
      send: () => Promise.resolve({ members: [{}, {}] }),
      rowIdByIndex: ROW_IDS,
      afterAdded,
      refreshAfterLostAccess: vi.fn(),
      logContext: "test.add",
    });

    expect(outcome).toEqual({ kind: "done" });
    expect(notifications.show).toHaveBeenCalledWith({
      message: "Added 2 members",
    });
    expect(afterAdded).toHaveBeenCalledTimes(1);
  });

  it("still closes after a successful add when afterAdded rejects, and logs it", async () => {
    const outcome = await submitAddMembers({
      send: () => Promise.resolve({ members: [{}] }),
      rowIdByIndex: ROW_IDS,
      afterAdded: () => Promise.reject(new Error("reload failed")),
      refreshAfterLostAccess: vi.fn(),
      logContext: "test.add",
    });

    expect(outcome).toEqual({ kind: "done" });
    expect(consoleError).toHaveBeenCalledWith(
      "test.add.after_added_failed",
      expect.any(Error),
    );
  });

  it("closes on 403 with the contracts message even when the refresh rejects", async () => {
    const refresh = vi.fn(() => Promise.reject(new Error("network down")));
    const outcome = await submitAddMembers({
      send: rejectWith(403, { message: "Access denied" }),
      rowIdByIndex: ROW_IDS,
      refreshAfterLostAccess: refresh,
      logContext: "test.add",
    });

    expect(outcome).toEqual({ kind: "done" });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(notifications.show).toHaveBeenCalledWith({
      color: "red",
      message: MEMBER_MESSAGES.notAllowed,
    });
    expect(consoleError).toHaveBeenCalledWith(
      "test.add.refresh_failed",
      expect.any(Error),
    );
  });

  it("keeps the roleNotAllowed message on 403", async () => {
    await submitAddMembers({
      send: rejectWith(403, {
        code: "ROLE_NOT_ALLOWED",
        message: MEMBER_MESSAGES.roleNotAllowed,
      }),
      rowIdByIndex: ROW_IDS,
      refreshAfterLostAccess: vi.fn(),
      logContext: "test.add",
    });

    expect(notifications.show).toHaveBeenCalledWith({
      color: "red",
      message: MEMBER_MESSAGES.roleNotAllowed,
    });
  });

  it("refreshes and closes without a toast on 404", async () => {
    const refresh = vi.fn();
    const outcome = await submitAddMembers({
      send: rejectWith(404),
      rowIdByIndex: ROW_IDS,
      refreshAfterLostAccess: refresh,
      logContext: "test.add",
    });

    expect(outcome).toEqual({ kind: "done" });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("maps member row fields to row errors and ignores the server message", async () => {
    const outcome = await submitAddMembers({
      send: rejectWith(409, {
        fields: { "members.1.userId": "Already a member of this project" },
      }),
      rowIdByIndex: ROW_IDS,
      refreshAfterLostAccess: vi.fn(),
      logContext: "test.add",
    });

    expect(outcome).toEqual({
      kind: "rowErrors",
      byRowId: { "row-b": "Already a member of this project" },
    });
  });

  it("shows checkFields when 400 fields match no row", async () => {
    const outcome = await submitAddMembers({
      send: rejectWith(400, { message: "Server text", fields: { other: "x" } }),
      rowIdByIndex: ROW_IDS,
      refreshAfterLostAccess: vi.fn(),
      logContext: "test.add",
    });

    expect(outcome).toEqual({
      kind: "alert",
      message: MEMBER_MESSAGES.checkFields,
    });
  });

  it("shows the retry delay on 429", async () => {
    const outcome = await submitAddMembers({
      send: () =>
        Promise.reject(
          new ApiRequestError(429, {
            code: "RATE_LIMITED",
            message: "x",
            retryAfterSeconds: 30,
          }),
        ),
      rowIdByIndex: ROW_IDS,
      refreshAfterLostAccess: vi.fn(),
      logContext: "test.add",
    });

    expect(outcome).toEqual({
      kind: "alert",
      message: "Too many attempts. Try again in 30 seconds.",
    });
  });

  it("logs and shows a generic alert for a non-API failure", async () => {
    const outcome = await submitAddMembers({
      send: () => Promise.reject(new TypeError("Failed to fetch")),
      rowIdByIndex: ROW_IDS,
      refreshAfterLostAccess: vi.fn(),
      logContext: "test.add",
    });

    expect(outcome).toEqual({ kind: "alert", message: SOMETHING_WENT_WRONG });
    expect(consoleError).toHaveBeenCalledWith(
      "test.add.failed",
      expect.any(TypeError),
    );
  });
});
